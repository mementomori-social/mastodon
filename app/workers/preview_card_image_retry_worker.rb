# frozen_string_literal: true

# Downloads a link card image again when the first try hit a temporary error,
# for example GitHub answering 429 with a 15 minute Retry-After.
class PreviewCardImageRetryWorker
  include Sidekiq::Worker

  DELAYS = [15.seconds, 1.minute, 5.minutes, 15.minutes, 30.minutes, 45.minutes].freeze
  ATTEMPTS = DELAYS.size

  sidekiq_options queue: 'pull', retry: 0, lock: :until_executed, lock_ttl: 2.hours.to_i

  def perform(card_id, image_url, attempt = 1)
    card = PreviewCard.find_by(id: card_id)
    return if card.nil? || card.image_file_name.present?

    card.image_remote_url = image_url
    card.save_with_optional_image!

    if card.image_file_name.present?
      card.statuses.reorder(nil).find_each { |status| Rails.cache.delete(status) }
    elsif card.image_download_retryable? && attempt < ATTEMPTS
      self.class.perform_in(DELAYS[attempt], card_id, image_url, attempt + 1)
    end
  end
end
