# frozen_string_literal: true

class FedialgoRankingService < BaseService
  def initialize(account)
    @account = account
  end

  def rank_statuses(statuses)
    preferences = @account.algorithm_preference || AlgorithmPreference.new

    fedialgo = Fedialgo::Client.new(
      account_id: @account.id,
      weights: {
        boost: preferences.boost_weight,
        reply: preferences.reply_weight,
        media: preferences.media_weight,
        favorite: preferences.favorite_weight
      }
    )

    fedialgo.rank_statuses(statuses)
  end
end
