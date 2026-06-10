# frozen_string_literal: true

# Re-orders the most recent window of a home feed by an engagement,
# affinity and recency score instead of strict reverse-chronology.
# Read-only: the underlying Redis feed is never modified.
class RankedHomeFeed < HomeFeed
  # How many of the most recent home feed entries are scored and re-ordered
  WINDOW_SIZE = 400

  REBLOG_WEIGHT    = 3.0
  REPLY_WEIGHT     = 2.0
  FAVOURITE_WEIGHT = 1.0

  # How far back the viewer's own interactions count towards author affinity
  AFFINITY_PERIOD = 30.days

  # A status loses half of its score every HALF_LIFE_HOURS after feed insertion
  HALF_LIFE_HOURS = 6.0

  AFFINITY_CACHE_TTL = 15.minutes

  # How many top candidates may get their remote reply trees backfilled per request
  REPLY_BACKFILL_LIMIT = 25

  # Out-of-network candidates pulled from trending statuses when discovery is on
  DISCOVER_CANDIDATES = 40

  # One discovered status is interleaved after every DISCOVER_INTERVAL followed statuses
  DISCOVER_INTERVAL = 4

  def initialize(account, discover: false)
    @discover = discover

    super(account)
  end

  def get(limit, offset = 0)
    limit  = limit.to_i
    offset = offset.to_i

    statuses = scored_statuses
    statuses = interleave_discovered(statuses) if @discover

    backfill_replies!(statuses) if offset.zero?

    statuses[offset, limit] || []
  end

  private

  # Replies only federate to instances subscribed to their authors, so counts
  # on remote posts lag; ask the origin instance for the full reply tree. The
  # worker no-ops within Status::FETCH_REPLIES_COOLDOWN_MINUTES, same as when
  # opening a thread, so repeated feed loads do not re-crawl.
  def backfill_replies!(statuses)
    statuses.take(REPLY_BACKFILL_LIMIT).select(&:should_fetch_replies?).each do |status|
      ActivityPub::FetchAllRepliesWorker.perform_async(status.id)
    end
  end

  # Blends trending statuses (already quality-ranked, block/mute-filtered and
  # language-preferring) into the feed at a fixed interval
  def interleave_discovered(statuses)
    seen_ids   = statuses.to_set(&:id)
    discovered = discovered_statuses.reject { |status| seen_ids.include?(status.id) }

    return statuses if discovered.empty?

    result = []

    statuses.each_with_index do |status, index|
      result << status
      result << discovered.shift if ((index + 1) % DISCOVER_INTERVAL).zero? && !discovered.empty?
    end

    result.concat(discovered)
  end

  def discovered_statuses
    Trends.statuses.query.allowed.filtered_for(@account).limit(DISCOVER_CANDIDATES).to_a
  end

  def scored_statuses
    entries  = window_entries
    statuses = Status.where(id: entries.keys).includes(:account, :status_stat).index_by(&:id)
    affinity = affinity_map

    scored = entries.filter_map do |status_id, inserted_at|
      status = statuses[status_id]
      next if status.nil?

      [status, score(status, inserted_at, affinity[status.account_id])]
    end

    scored.sort_by { |status, score| [-score, -status.id] }.map(&:first)
  end

  # Maps status id to feed insertion time. The zset score is the snowflake id
  # of the feed entry (the reblog wrapper for boosts), so it encodes when the
  # status arrived in the feed rather than when it was originally created.
  def window_entries
    redis.zrevrange(key, 0, WINDOW_SIZE - 1, with_scores: true).to_h do |member, score|
      [member.to_i, Mastodon::Snowflake.to_time(score.to_i)]
    end
  end

  def score(status, inserted_at, affinity_count)
    # Remote statuses carry the origin instance's counts as untrusted counts;
    # prefer them so federated posts are scored on what the user actually sees
    engagement = (REBLOG_WEIGHT * (status.untrusted_reblogs_count || status.reblogs_count)) +
                 (REPLY_WEIGHT * status.replies_count) +
                 (FAVOURITE_WEIGHT * (status.untrusted_favourites_count || status.favourites_count))

    age_in_hours = [(Time.now.utc - inserted_at) / 1.hour, 0.0].max
    decay        = 2.0**(-age_in_hours / HALF_LIFE_HOURS)

    (1.0 + engagement) * (1.0 + Math.log(1.0 + affinity_count.to_i)) * decay
  end

  # Maps author account id to the number of times the viewer favourited,
  # boosted or replied to that author within AFFINITY_PERIOD
  def affinity_map
    Rails.cache.fetch("ranked_home_feed:affinity:#{@account.id}", expires_in: AFFINITY_CACHE_TTL) do
      since = AFFINITY_PERIOD.ago

      favourites = Favourite.where(account_id: @account.id, created_at: since..)
        .joins(:status)
        .group('statuses.account_id')
        .count

      reblogs = Status.where(account_id: @account.id, created_at: since..)
        .where.not(reblog_of_id: nil)
        .joins('INNER JOIN statuses AS reblog_targets ON reblog_targets.id = statuses.reblog_of_id')
        .reorder(nil)
        .group('reblog_targets.account_id')
        .count

      replies = Status.where(account_id: @account.id, created_at: since..)
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
