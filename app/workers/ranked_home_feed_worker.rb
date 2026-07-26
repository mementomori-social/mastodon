# frozen_string_literal: true

# Computes a viewer's ranked home timeline off the web request path and caches
# it, so opening or refreshing the feed only reads the cache. Enqueued by
# RankedHomeFeed on a warm refresh; that enqueue is throttled to once per account
# per window (a Redis key with a short TTL), which handles de-duplication on its
# own. No sidekiq-unique-jobs lock: a lock that outlived a failed run (for
# example a deploy where the class was not loaded yet) could wedge shut and stop
# the worker from ever running again, which is exactly the failure to avoid.
class RankedHomeFeedWorker
  include Sidekiq::Worker
  include DatabaseHelper

  sidekiq_options queue: 'pull', retry: 0

  # languages defaults to nil so jobs enqueued by an older revision, which pass
  # only two arguments, keep working across a deploy
  def perform(account_id, discover, languages = nil)
    with_primary do
      @account = Account.find(account_id)
    end

    with_read_replica do
      RankedHomeFeed.new(@account, discover: discover, languages: languages).recompute!
    end
  rescue ActiveRecord::RecordNotFound
    true
  end
end
