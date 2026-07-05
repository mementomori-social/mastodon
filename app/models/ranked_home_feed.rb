# frozen_string_literal: true

require 'benchmark'

# Re-orders the most recent window of a home feed by an engagement,
# affinity and recency score instead of strict reverse-chronology.
# The underlying Redis feed is never modified; the only state written is a
# per-user set of already served status ids used to keep refreshes fresh.
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

  # Posts with no engagement yet must be at least this old before they are
  # eligible, so brand new posts get time to gather signal first
  MIN_AGE_MINUTES = ENV.fetch('RANKED_MIN_AGE_MINUTES', '15').to_i

  # Replies do not surface as themselves; they heat up the post they reply to.
  # A post outside the feed window is pulled in (discovery only) once the
  # combined heat of its repliers, weighted by viewer affinity, reaches this.
  DISCUSSION_MIN_HEAT = ENV.fetch('RANKED_DISCUSSION_MIN_HEAT', '2.0').to_f

  AFFINITY_CACHE_TTL = 15.minutes

  # Hashtags on posts the viewer favourited, boosted or replied to form an
  # interest profile; posts carrying those tags score higher
  INTEREST_WEIGHT = ENV.fetch('RANKED_INTEREST_WEIGHT', '0.5').to_f

  # Cap on how many recent interactions feed the interest profile, and how
  # long the profile is reused; interests drift slowly, so this stays cheap
  # even with very large accounts and instances
  INTEREST_SAMPLE    = ENV.fetch('RANKED_INTEREST_SAMPLE', '1000').to_i
  INTEREST_CACHE_TTL = ENV.fetch('RANKED_INTEREST_CACHE_MINUTES', '60').to_i.minutes

  # Term sets are per status and shared by every user on the instance, so
  # each post is tokenized once
  TERMS_TTL = 2.days

  # Cap on how many distinct words a profile keeps
  INTEREST_PROFILE_TERMS = ENV.fetch('RANKED_INTEREST_PROFILE_TERMS', '100').to_i

  # A refresh (offset 0) always recomputes the ranking so each one surfaces
  # posts not seen before; the cached copy only keeps offset pagination
  # consistent while the user scrolls
  RANKING_CACHE_TTL = ENV.fetch('RANKED_CACHE_TTL_SECONDS', '60').to_i.seconds

  # How many top candidates may get their remote reply trees backfilled per request
  REPLY_BACKFILL_LIMIT = ENV.fetch('RANKED_REPLY_BACKFILL_LIMIT', '50').to_i

  # Out-of-network candidates pulled from trending statuses when discovery is on
  DISCOVER_CANDIDATES = ENV.fetch('RANKED_DISCOVER_CANDIDATES', '100').to_i

  # One discovered status is interleaved after every DISCOVER_INTERVAL followed statuses
  DISCOVER_INTERVAL = ENV.fetch('RANKED_DISCOVER_INTERVAL', '3').to_i

  # How deep a single page may look into the trending pool when scrolling
  # past the ranked window
  DISCOVERY_TAIL_FETCH = ENV.fetch('RANKED_DISCOVERY_TAIL_FETCH', '500').to_i

  # Random score multiplier range applied per ranking computation so the
  # order reshuffles a little on every refresh instead of freezing in place
  JITTER = ENV.fetch('RANKED_JITTER', '0.1').to_f

  # How long served posts are remembered; within this window they always rank
  # behind everything not yet seen, so refreshes surface new content first
  SEEN_TTL = 2.days

  # Wider in-network candidate pass (see network_candidate_entries). Disable
  # instantly without a deploy via RANKED_NETWORK_CANDIDATES=false.
  NETWORK_CANDIDATES_ENABLED = ENV.fetch('RANKED_NETWORK_CANDIDATES', 'true') != 'false'
  NETWORK_WINDOW_HOURS       = ENV.fetch('RANKED_NETWORK_WINDOW_HOURS', '48').to_f
  NETWORK_CANDIDATE_LIMIT    = ENV.fetch('RANKED_NETWORK_CANDIDATE_LIMIT', '400').to_i
  NETWORK_MIN_ENGAGEMENT     = ENV.fetch('RANKED_NETWORK_MIN_ENGAGEMENT', '1').to_i

  # Skip the wider pass for accounts following more than this; the IN-list query
  # gets expensive past it and they still get the full Redis window
  NETWORK_MAX_FOLLOWS = ENV.fetch('RANKED_NETWORK_MAX_FOLLOWS', '10000').to_i

  NETWORK_ENGAGEMENT_SUM = 'COALESCE(status_stats.reblogs_count, 0) + ' \
                           'COALESCE(status_stats.replies_count, 0) + ' \
                           'COALESCE(status_stats.favourites_count, 0)'

  def initialize(account, discover: false)
    @discover = discover

    super(account)
  end

  def get(limit, offset = 0)
    limit  = limit.to_i
    offset = offset.to_i

    ranked_ids = offset.zero? ? refreshed_ranked_ids : cached_ranked_ids

    backfill_replies!(ranked_ids) if offset.zero?

    # A refresh serves the top of the ranking; scrolling serves the next
    # batch that has not been served yet. The seen set is the cursor, so
    # pagination cannot drift when the ranking is recomputed mid scroll.
    page_ids =
      if offset.zero?
        ranked_ids.take(limit)
      else
        seen = seen_ids
        ranked_ids.reject { |id| seen.include?(id) }.take(limit)
      end

    page_ids += discovery_tail_ids(limit - page_ids.size, ranked_ids) if @discover && page_ids.size < limit

    statuses = Status.where(id: page_ids).index_by(&:id)

    mark_seen!(page_ids)

    page_ids.filter_map { |id| statuses[id] }
  end

  private

  def refreshed_ranked_ids
    ids = compute_ranked_ids
    Rails.cache.write(ranking_cache_key, ids, expires_in: RANKING_CACHE_TTL)
    ids
  end

  def cached_ranked_ids
    Rails.cache.fetch(ranking_cache_key, expires_in: RANKING_CACHE_TTL) { compute_ranked_ids }
  end

  def ranking_cache_key
    "ranked_home_feed:ids:#{@account.id}:#{@discover ? 1 : 0}"
  end

  def compute_ranked_ids
    timings = {}
    result  = nil

    timings[:affinity]  = Benchmark.realtime { affinity_map }
    timings[:interests] = Benchmark.realtime { interest_map }
    timings[:network]   = Benchmark.realtime { @network_entries = network_candidate_entries }
    timings[:scoring]   = Benchmark.realtime { result = scored_status_ids }
    timings[:discover] = Benchmark.realtime { result = interleave_discovered(result) } if @discover

    Rails.logger.info do
      phases = timings.map { |phase, seconds| "#{phase}=#{(seconds * 1000).round}ms" }.join(' ')
      "RankedHomeFeed compute account=#{@account.id} #{phases}"
    end

    result
  end

  def scored_status_ids
    # The Redis window covers only the freshest feed entries; the network pass
    # adds higher-traction posts from follows that have scrolled out of it.
    # Window entries win on overlap so their feed-insertion time keeps driving
    # decay there.
    entries   = (@network_entries || network_candidate_entries).merge(window_entries)
    affinity  = affinity_map
    interests = interest_map
    seen      = seen_ids
    now       = Time.now.utc

    # Boosts sit in the feed as wrapper statuses with no engagement of their
    # own, so engagement and remoteness are read from the boosted target
    rows = Status.where(id: entries.keys)
      .joins('INNER JOIN statuses AS targets ON targets.id = COALESCE(statuses.reblog_of_id, statuses.id)')
      .joins('LEFT JOIN status_stats ON status_stats.status_id = targets.id')
      .pluck(
        'statuses.id', 'statuses.account_id', 'targets.id', 'targets.local', 'targets.uri', 'targets.visibility',
        'targets.in_reply_to_id',
        'status_stats.reblogs_count', 'status_stats.replies_count', 'status_stats.favourites_count',
        'status_stats.untrusted_reblogs_count', 'status_stats.untrusted_favourites_count',
        'targets.account_id'
      )

    direct_visibility = Status.visibilities[:direct]
    candidate_ids     = rows.pluck(2).uniq
    status_tags       = interests.empty? ? {} : tags_for(candidate_ids)
    status_words      = interests.empty? ? {} : terms_for(candidate_ids)

    # Replies heat up the post they reply to instead of appearing themselves;
    # a reply from an author the viewer interacts with carries more heat
    reply_heat = Hash.new(0.0)

    rows.each do |_id, account_id, _target_id, _local, _uri, visibility, in_reply_to_id, *|
      next if in_reply_to_id.nil? || visibility == direct_visibility

      reply_heat[in_reply_to_id] += 1.0 + Math.log(1.0 + affinity[account_id].to_i)
    end

    scored = rows.filter_map do |id, account_id, target_id, local, uri, visibility, in_reply_to_id, reblogs, replies, favourites, untrusted_reblogs, untrusted_favourites, target_account_id|
      # A recommendation feed should not recommend the viewer's own posts or
      # boosts, nor a boost of one of the viewer's own posts (where the booster
      # differs but the boosted post's author is the viewer)
      next if account_id == @account.id || target_account_id == @account.id

      # Private mentions belong to the conversations view, not a ranked feed
      next if visibility == direct_visibility

      # Replies only contribute heat; the discussed post is what surfaces
      next unless in_reply_to_id.nil?

      # Remote statuses carry the origin instance's counts as untrusted counts;
      # prefer them so federated posts are scored on what the user actually sees
      remote      = !(local || uri.nil?)
      boost_count = remote ? (untrusted_reblogs || reblogs).to_i : reblogs.to_i
      fav_count   = remote ? (untrusted_favourites || favourites).to_i : favourites.to_i

      engagement = (REBLOG_WEIGHT * boost_count) +
                   (REPLY_WEIGHT * replies.to_i) +
                   (FAVOURITE_WEIGHT * fav_count) +
                   (REPLY_WEIGHT * reply_heat[target_id])

      next if engagement.zero? && entries[id] > now - MIN_AGE_MINUTES.minutes

      age_in_hours = [(now - entries[id]) / 1.hour, 0.0].max
      decay        = 2.0**(-age_in_hours / HALF_LIFE_HOURS)
      jitter       = 1.0 + (JITTER * rand)
      interest     = (status_tags[target_id] || []).sum { |tag_id| interests["t:#{tag_id}"].to_i } +
                     (status_words[target_id] || []).sum { |term| interests["w:#{term}"].to_i }

      # Boosts are scored on their target and surface the target itself, so
      # the feed shows the post rather than an "x boosted" wrapper
      [target_id,
       (1.0 + engagement) *
         (1.0 + Math.log(1.0 + affinity[account_id].to_i)) *
         (1.0 + (INTEREST_WEIGHT * Math.log(1.0 + interest))) *
         decay * jitter]
    end

    # Pulling discussed posts from outside the window can surface authors the
    # viewer does not follow, so it is gated behind the discovery toggle
    scored += discussed_parents(reply_heat, scored.map(&:first), affinity, now) if @discover

    unseen, already_seen = scored.partition { |id, _| seen.exclude?(id) }

    # Already served posts go behind everything new, so the feed reads fresh
    # on every recompute and repeats only once new content runs out
    (rank(unseen) + rank(already_seen)).uniq
  end

  def rank(scored)
    scored.sort_by { |id, score| [-score, -id] }.map(&:first)
  end

  # Posts outside the feed window whose discussion is hot right now, pulled
  # into the candidate pool; public posts only, blocks and mutes respected
  def discussed_parents(reply_heat, scored_ids, affinity, now)
    hot           = reply_heat.select { |_, heat| heat >= DISCUSSION_MIN_HEAT }
    candidate_ids = hot.keys - scored_ids

    return [] if candidate_ids.empty?

    # Only thread roots are pulled in; a reply must never surface out of
    # context, so a discussed mid-thread reply is skipped rather than shown
    rows = Status.where(id: candidate_ids, visibility: %i(public unlisted), in_reply_to_id: nil)
      .not_excluded_by_account(@account)
      .not_domain_blocked_by_account(@account)
      .left_joins(:status_stat)
      .pluck(
        'statuses.id', 'statuses.account_id', 'statuses.local', 'statuses.uri',
        'status_stats.reblogs_count', 'status_stats.replies_count', 'status_stats.favourites_count',
        'status_stats.untrusted_reblogs_count', 'status_stats.untrusted_favourites_count'
      )

    rows.filter_map do |id, account_id, local, uri, reblogs, replies, favourites, untrusted_reblogs, untrusted_favourites|
      next if account_id == @account.id

      remote      = !(local || uri.nil?)
      boost_count = remote ? (untrusted_reblogs || reblogs).to_i : reblogs.to_i
      fav_count   = remote ? (untrusted_favourites || favourites).to_i : favourites.to_i

      engagement = (REBLOG_WEIGHT * boost_count) +
                   (REPLY_WEIGHT * replies.to_i) +
                   (FAVOURITE_WEIGHT * fav_count) +
                   (REPLY_WEIGHT * hot[id])

      age_in_hours = [(now - Mastodon::Snowflake.to_time(id)) / 1.hour, 0.0].max
      decay        = 2.0**(-age_in_hours / HALF_LIFE_HOURS)
      jitter       = 1.0 + (JITTER * rand)

      [id, (1.0 + engagement) * (1.0 + Math.log(1.0 + affinity[account_id].to_i)) * decay * jitter]
    end
  end

  # Maps status id to feed insertion time. The zset score is the snowflake id
  # of the feed entry (the reblog wrapper for boosts), so it encodes when the
  # status arrived in the feed rather than when it was originally created.
  def window_entries
    redis.zrevrange(key, 0, WINDOW_SIZE - 1, with_scores: true).to_h do |member, score|
      [member.to_i, Mastodon::Snowflake.to_time(score.to_i)]
    end
  end

  # CHALLENGE: window_entries only scores the newest WINDOW_SIZE (default 400)
  # entries of the Redis home feed. On an account following many active people
  # that window can span only a few hours, so a followed-author post that
  # gathered engagement over a day or two but has since scrolled past entry 400
  # is never even a candidate, regardless of how well it matches affinity or
  # interest. Decay compounds it: it is measured from feed-insertion time, so an
  # in-window post that arrived two days ago already sits at 2^(-48h/HALF_LIFE)
  # of its score (~1/256 at the 6h default) no matter how it is doing now.
  #
  # SOLUTION: a second candidate source, merged into `entries` and run through
  # the exact same scorer - it must still out-score the window on
  # engagement x affinity x interest x decay, so this only widens the pool, it
  # never forces a post in. It selects ORIGINAL posts (boosts already arrive via
  # the Redis window), public or unlisted, authored by accounts the viewer
  # follows, created within the last NETWORK_WINDOW_HOURS (default 48h; bounded
  # by snowflake id range so it uses the (account_id, id) index). The INNER join
  # to status_stats means only posts that have a stats row - boosted, replied or
  # favourited at least once, a small fraction of all posts - are considered;
  # they are ordered by reblogs + replies + favourites and capped at
  # NETWORK_CANDIDATE_LIMIT (default 400). Each id is keyed by
  # status_stats.updated_at (bumped on every count change, so roughly the time
  # of last engagement) rather than feed-insertion or creation time, so the
  # scorer's decay keeps a still-surging older post alive and lets a quiet one
  # fade. window_entries wins on overlap, so genuinely-fresh posts keep their
  # feed-insertion timing.
  #
  # COST / SAFETY: a single indexed account_id + id-range query, inner-joined to
  # status_stats, capped, and computed at most once per account per
  # RANKING_CACHE_TTL (it shares the ranking cache). It returns {} - a silent
  # fallback to the Redis window - when disabled via RANKED_NETWORK_CANDIDATES,
  # when the viewer follows more than NETWORK_MAX_FOLLOWS, or on any error. No
  # writes, no schema change. Logged as the :network phase of the compute line.
  def network_candidate_entries
    return {} unless NETWORK_CANDIDATES_ENABLED

    followed = followed_account_ids
    return {} if followed.empty? || followed.size > NETWORK_MAX_FOLLOWS

    since_id = Mastodon::Snowflake.id_at(NETWORK_WINDOW_HOURS.hours.ago, with_random: false)

    Status.where(account_id: followed, reblog_of_id: nil, visibility: %i(public unlisted))
      .where(id: since_id..)
      .joins(:status_stat)
      .where("#{NETWORK_ENGAGEMENT_SUM} >= ?", NETWORK_MIN_ENGAGEMENT)
      .reorder(Arel.sql("#{NETWORK_ENGAGEMENT_SUM} DESC"))
      .limit(NETWORK_CANDIDATE_LIMIT)
      .pluck('statuses.id', Arel.sql('COALESCE(status_stats.updated_at, statuses.created_at)'))
      .to_h
  rescue => e
    Rails.logger.warn("RankedHomeFeed network candidates failed account=#{@account.id}: #{e.class}: #{e.message}")
    {}
  end

  # The viewer's followed account ids, cached briefly; the wider candidate query
  # needs them and they change slowly
  def followed_account_ids
    Rails.cache.fetch("ranked_home_feed:following:#{@account.id}", expires_in: AFFINITY_CACHE_TTL) do
      @account.following_ids
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

  def seen_key
    "ranked_home_feed:seen:#{@account.id}"
  end

  def seen_ids
    redis.smembers(seen_key).to_set(&:to_i)
  end

  def mark_seen!(status_ids)
    return if status_ids.empty?

    redis.pipelined do |pipeline|
      pipeline.sadd(seen_key, status_ids)
      pipeline.expire(seen_key, SEEN_TTL.to_i)
    end
  end

  def discovered_status_ids
    seen = seen_ids

    Trends.statuses.query.allowed.filtered_for(@account)
      .limit(DISCOVER_CANDIDATES * 2)
      .filter_map { |status| status.id unless status.account_id == @account.id }
      .reject { |id| seen.include?(id) }
      .take(DISCOVER_CANDIDATES)
  end

  # Once the ranked window is exhausted, deeper scrolling continues through
  # the trending pool. Served posts are marked seen, so filtering by the seen
  # set paginates by itself: every page serves the next unseen batch and the
  # feed only ends when the pool is genuinely exhausted.
  def discovery_tail_ids(needed, ranked_ids)
    seen    = seen_ids
    exclude = ranked_ids.to_set

    Trends.statuses.query.allowed.filtered_for(@account)
      .limit(DISCOVERY_TAIL_FETCH)
      .filter_map { |status| status.id unless status.account_id == @account.id }
      .reject { |id| exclude.include?(id) || seen.include?(id) }
      .take(needed)
  end

  # Maps interest keys to how often the viewer favourited, boosted or
  # replied to posts carrying them within AFFINITY_PERIOD. Keys are
  # "t:<tag id>" for hashtags (taken from all posts, since tagging is the
  # author labeling the post for discovery) and "w:<term>" for words, taken
  # ONLY from posts whose authors opted into search indexing.
  def interest_map
    Rails.cache.fetch("ranked_home_feed:interests:#{@account.id}", expires_in: INTEREST_CACHE_TTL) do
      since_id = Mastodon::Snowflake.id_at(AFFINITY_PERIOD.ago, with_random: false)

      favourited_ids = Favourite.where(account_id: @account.id)
        .order(id: :desc)
        .limit(AFFINITY_RECENT_FAVOURITES)
        .pluck(:status_id)

      interacted_ids = Status.where(account_id: @account.id)
        .where(id: since_id..)
        .reorder(nil)
        .pluck(:reblog_of_id, :in_reply_to_id)
        .flatten

      status_ids = (favourited_ids + interacted_ids).compact.uniq.take(INTEREST_SAMPLE)

      # Built only from public posts the viewer engaged with, matching the
      # word tier; the profile is per user and never shared
      profile = Status.where(id: status_ids).distributable_visibility.joins(:tags).reorder(nil).group('tags.id').count
        .transform_keys { |tag_id| "t:#{tag_id}" }

      word_counts = Hash.new(0)
      terms_for(status_ids).each_value do |terms|
        terms.each { |term| word_counts[term] += 1 }
      end

      word_counts.sort_by { |_, count| -count }.take(INTEREST_PROFILE_TERMS).each do |term, count|
        profile["w:#{term}"] = count
      end

      profile
    end
  end

  # Maps status id to its cached set of significant terms. Term sets are
  # computed once per status and shared instance wide; posts by authors who
  # have not opted into search indexing always have an empty term set.
  def terms_for(status_ids)
    keys   = status_ids.index_by { |id| "ranked_home_feed:terms:#{id}" }
    cached = Rails.cache.read_multi(*keys.keys)

    missing_ids = keys.filter_map { |key, id| id unless cached.key?(key) }

    if missing_ids.any?
      common   = common_terms
      computed = missing_ids.index_with { [] }

      # Only public posts from authors who opted into search indexing are
      # tokenized; the indexable flag covers public content only, so private
      # and followers only posts are never analyzed
      Status.where(id: missing_ids)
        .distributable_visibility
        .joins(:account)
        .pluck(:id, :text, :local, :uri, 'accounts.indexable')
        .each do |id, text, local, uri, indexable|
          next unless indexable

          computed[id] = InterestTerms.tokenize(text, local || uri.nil?).reject { |term| common.include?(term) }
        end

      Rails.cache.write_multi(computed.transform_keys { |id| "ranked_home_feed:terms:#{id}" }, expires_in: TERMS_TTL)
      cached = cached.merge(computed.transform_keys { |id| "ranked_home_feed:terms:#{id}" })
    end

    cached.transform_keys { |key| keys[key] }
  end

  # Instance wide set of the most common words in recent posts, maintained
  # by Scheduler::RankedCommonTermsScheduler; works for any language because
  # it is derived from local usage instead of hardcoded lists
  def common_terms
    redis.smembers(InterestTerms::COMMON_TERMS_KEY).to_set
  end

  # Maps status id to the ids of the hashtags it carries
  def tags_for(status_ids)
    Status.where(id: status_ids)
      .joins(:tags)
      .reorder(nil)
      .pluck(:id, 'tags.id')
      .group_by(&:first)
      .transform_values { |pairs| pairs.map(&:last) }
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
