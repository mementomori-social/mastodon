# frozen_string_literal: true

class ForYouFeed < Feed
  def initialize(account)
    @account = account
    super(:for_you, account.id)
  end

  def get(limit, max_id = nil, since_id = nil, min_id = nil)
    # Return empty if feed is being regenerated
    return Status.none if regenerating?

    # Get base statuses from redis
    statuses = super(limit, max_id, since_id, min_id)

    # Apply Fedialgo ranking
    FedialgoRankingService.new(@account).rank_statuses(statuses)
  end

  def regenerating?
    redis.exists?("account:#{@account.id}:for_you_regeneration")
  end
end
