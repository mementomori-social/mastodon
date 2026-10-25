# frozen_string_literal: true

# Downloads a link card image again when the first try failed, for example
# GitHub answering 429 with a 15 minute Retry-After.
class PreviewCardImageRetryWorker
  include Sidekiq::Worker

  DELAY = 15.minutes
  ATTEMPTS = 3

  sidekiq_options queue: 'pull', retry: 0, lock: :until_executed, lock_ttl: 2.hours.to_i

  def perform(card_id, image_url, attempt = 1)
    card = PreviewCard.find_by(id: card_id)
    return if card.nil? || card.image_file_name.present?

    card.image_remote_url = image_url
    card.save_with_optional_image!

    if card.image_file_name.present?
      card.statuses.reorder(nil).find_each { |status| Rails.cache.delete(status) }
    elsif attempt < ATTEMPTS
      self.class.perform_in(DELAY * (attempt + 1), card_id, image_url, attempt + 1)
    end
  end
end
