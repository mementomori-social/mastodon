# frozen_string_literal: true

class Api::V1::AlgorithmPreferencesController < Api::BaseController
  before_action :require_user!

  def show
    @preferences = current_account.algorithm_preference
    render json: @preferences
  end

  def update
    @preferences = current_account.algorithm_preference || current_account.build_algorithm_preference
    @preferences.update!(preference_params)

    # Trigger feed recalculation
    RegenerateForYouFeedWorker.perform_async(current_account.id)

    render json: @preferences
  end

  private

  def preference_params
    params.permit(:boost_weight, :reply_weight, :media_weight, :favorite_weight)
  end
end
