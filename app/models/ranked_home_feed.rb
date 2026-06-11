# frozen_string_literal: true

# Re-orders the most recent window of a home feed by an engagement,
# affinity and recency score instead of strict reverse-chronology.
# Read-only: the underlying Redis feed is never modified.
#
# Scoring runs over plucked rows (no model instantiation) and the ranked id
# list is cached briefly per user, so only the returned page is hydrated.
class RankedHomeFeed < HomeFeed
  # How many of the most recent home feed entries are scored and re-ordered
  WINDOW_SIZE = (ENV.fetch('RANKED_HOME_WINDOW', nil) || FeedManager::MAX_ITEMS).to_i

  REBLOG_WEIGHT    = ENV.fetch('RANKED_REBLOG_WEIGHT', '3.0').to_f
  REPLY_WEIGHT     = ENV.fetch('RANKED_REPLY_WEIGHT', '2.0').to_f
  FAVOURITE_WEIGHT = ENV.fetch('RANKED_FAVOURITE_WEIGHT', '1.0').to_f

  # How far back the viewer's own interactions count towards author affinity
  AFFINITY_PERIOD = 30.days

  # Cap on how many recent favourites are scanned for affinity; favourites
  # have no created_at index, so the (account_id, id) index plus a limit
  # keeps the query fast for very active accounts
  AFFINITY_RECENT_FAVOURITES = ENV.fetch('RANKED_AFFINITY_RECENT_FAVOURITES', '2000').to_i

  # A status loses half of its score every HALF_LIFE_HOURS after feed insertion
  HALF_LIFE_HOURS = ENV.fetch('RANKED_HALF_LIFE_HOURS', '6.0').to_f

  AFFINITY_CACHE_TTL = 15.minutes

  # How long the computed ranking is reused between requests; keeps offset
  # pagination consistent while scrolling and caps the cost per user
  RANKING_CACHE_TTL = ENV.fetch('RANKED_CACHE_TTL_SECONDS', '60').to_i.seconds

  # How many top candidates may get their remote reply trees backfilled per request
  REPLY_BACKFILL_LIMIT = ENV.fetch('RANKED_REPLY_BACKFILL_LIMIT', '50').to_i

  # Out-of-network candidates pulled from trending statuses when discovery is on
  DISCOVER_CANDIDATES = ENV.fetch('RANKED_DISCOVER_CANDIDATES', '100').to_i

  # One discovered status is interleaved after every DISCOVER_INTERVAL followed statuses
  DISCOVER_INTERVAL = ENV.fetch('RANKED_DISCOVER_INTERVAL', '3').to_i

  # Random score multiplier range applied per ranking computation so the
  # order reshuffles a little on every refresh instead of freezing in place
  JITTER = ENV.fetch('RANKED_JITTER', '0.1').to_f

  def initialize(account, discover: false)
    @discover = discover

    super(account)
  end

  def get(limit, offset = 0)
    limit  = limit.to_i
    offset = offset.to_i

    ranked_ids = cached_ranked_ids

    backfill_replies!(ranked_ids) if offset.zero?

    page_ids = ranked_ids[offset, limit] || []
    statuses = Status.where(id: page_ids).index_by(&:id)

    page_ids.filter_map { |id| statuses[id] }
  end

  private

  def cached_ranked_ids
    Rails.cache.fetch("ranked_home_feed:ids:#{@account.id}:#{@discover ? 1 : 0}", expires_in: RANKING_CACHE_TTL) do
      ids = scored_status_ids
      ids = interleave_discovered(ids) if @discover
      ids
    end
  end

  def scored_status_ids
    entries  = window_entries
    affinity = affinity_map
    now      = Time.now.utc

    # Boosts sit in the feed as wrapper statuses with no engagement of their
    # own, so engagement and remoteness are read from the boosted target
    rows = Status.where(id: entries.keys)
      .joins('INNER JOIN statuses AS targets ON targets.id = COALESCE(statuses.reblog_of_id, statuses.id)')
      .joins('LEFT JOIN status_stats ON status_stats.status_id = targets.id')
      .pluck(
        'statuses.id', 'statuses.account_id', 'targets.id', 'targets.local', 'targets.uri',
        'status_stats.reblogs_count', 'status_stats.replies_count', 'status_stats.favourites_count',
        'status_stats.untrusted_reblogs_count', 'status_stats.untrusted_favourites_count'
      )

    scored = rows.filter_map do |id, account_id, target_id, local, uri, reblogs, replies, favourites, untrusted_reblogs, untrusted_favourites|
      # A recommendation feed should not recommend the viewer's own posts or boosts
      next if account_id == @account.id

      # Remote statuses carry the origin instance's counts as untrusted counts;
      # prefer them so federated posts are scored on what the user actually sees
      remote      = !(local || uri.nil?)
      boost_count = remote ? (untrusted_reblogs || reblogs).to_i : reblogs.to_i
      fav_count   = remote ? (untrusted_favourites || favourites).to_i : favourites.to_i

      engagement = (REBLOG_WEIGHT * boost_count) +
                   (REPLY_WEIGHT * replies.to_i) +
                   (FAVOURITE_WEIGHT * fav_count)

      age_in_hours = [(now - entries[id]) / 1.hour, 0.0].max
      decay        = 2.0**(-age_in_hours / HALF_LIFE_HOURS)
      jitter       = 1.0 + (JITTER * rand)

      # Boosts are scored on their target and surface the target itself, so
      # the feed shows the post rather than an "x boosted" wrapper
      [target_id, (1.0 + engagement) * (1.0 + Math.log(1.0 + affinity[account_id].to_i)) * decay * jitter]
    end

    scored.sort_by { |id, score| [-score, -id] }.map(&:first).uniq
  end

  # Maps status id to feed insertion time. The zset score is the snowflake id
  # of the feed entry (the reblog wrapper for boosts), so it encodes when the
  # status arrived in the feed rather than when it was originally created.
  def window_entries
    redis.zrevrange(key, 0, WINDOW_SIZE - 1, with_scores: true).to_h do |member, score|
      [member.to_i, Mastodon::Snowflake.to_time(score.to_i)]
    end
  end

  # Replies only federate to instances subscribed to their authors, so counts
  # on remote posts lag; ask the origin instance for the full reply tree. The
  # worker no-ops within Status::FETCH_REPLIES_COOLDOWN_MINUTES, same as when
  # opening a thread, so repeated feed loads do not re-crawl.
  def backfill_replies!(ranked_ids)
    target_ids = Status.where(id: ranked_ids.take(REPLY_BACKFILL_LIMIT)).pluck(Arel.sql('COALESCE(reblog_of_id, id)'))

    Status.where(id: target_ids).should_fetch_replies.pluck(:id).each do |id|
      ActivityPub::FetchAllRepliesWorker.perform_async(id)
    end
  end

  # Blends trending statuses (already quality-ranked, block/mute-filtered and
  # language-preferring) into the feed at a fixed interval
  def interleave_discovered(ranked_ids)
    seen       = ranked_ids.to_set
    discovered = discovered_status_ids.reject { |id| seen.include?(id) }

    return ranked_ids if discovered.empty?

    result = []

    ranked_ids.each_with_index do |id, index|
      result << id
      result << discovered.shift if ((index + 1) % DISCOVER_INTERVAL).zero? && !discovered.empty?
    end

    result.concat(discovered)
  end

  def discovered_status_ids
    Trends.statuses.query.allowed.filtered_for(@account).limit(DISCOVER_CANDIDATES).map(&:id)
  end

  # Maps author account id to the number of times the viewer favourited,
  # boosted or replied to that author within AFFINITY_PERIOD
  def affinity_map
    Rails.cache.fetch("ranked_home_feed:affinity:#{@account.id}", expires_in: AFFINITY_CACHE_TTL) do
      # Status ids are snowflakes, so an id range uses the (account_id, id)
      # index where a created_at filter would scan the whole account history
      since_id = Mastodon::Snowflake.id_at(AFFINITY_PERIOD.ago, with_random: false)

      recent_favourite_ids = Favourite.where(account_id: @account.id)
        .order(id: :desc)
        .limit(AFFINITY_RECENT_FAVOURITES)
        .pluck(:id)

      favourites = Favourite.where(id: recent_favourite_ids)
        .joins(:status)
        .group('statuses.account_id')
        .count

      reblogs = Status.where(account_id: @account.id)
        .where(id: since_id..)
        .where.not(reblog_of_id: nil)
        .joins('INNER JOIN statuses AS reblog_targets ON reblog_targets.id = statuses.reblog_of_id')
        .reorder(nil)
        .group('reblog_targets.account_id')
        .count

      replies = Status.where(account_id: @account.id)
        .where(id: since_id..)
        .where.not(in_reply_to_account_id: nil)
        .reorder(nil)
        .group(:in_reply_to_account_id)
        .count

      [favourites, reblogs, replies].each_with_object(Hash.new(0)) do |counts, merged|
        counts.each { |account_id, count| merged[account_id] += count }
      end
    end
  end
end
