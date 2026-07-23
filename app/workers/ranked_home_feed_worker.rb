# frozen_string_literal: true

# Computes a viewer's ranked home timeline off the web request path and caches
# it, so opening or refreshing the feed only reads the cache. Enqueued
# (throttled) by RankedHomeFeed on refresh; the lock collapses a burst of
# refreshes into one running recompute per account and discovery mode.
class RankedHomeFeedWorker
  include Sidekiq::Worker
  include DatabaseHelper

  sidekiq_options queue: 'pull', retry: 0, lock: :until_executed, lock_ttl: 5.minutes.to_i

  def perform(account_id, discover)
    with_primary do
      @account = Account.find(account_id)
    end

    with_read_replica do
      RankedHomeFeed.new(@account, discover: discover).recompute!
    end
  rescue ActiveRecord::RecordNotFound
    true
  end
end
