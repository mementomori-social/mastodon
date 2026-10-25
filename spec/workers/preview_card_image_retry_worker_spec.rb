# frozen_string_literal: true

require 'rails_helper'

RSpec.describe PreviewCardImageRetryWorker do
  let(:worker) { described_class.new }
  let(:image_url) { 'https://example.com/card.png' }
  let!(:preview_card) { Fabricate(:preview_card, image: nil) }

  describe '#perform' do
    it 'downloads the image when it is available again' do
      stub_request(:get, image_url).to_return(request_fixture('avatar.txt'))

      expect { worker.perform(preview_card.id, image_url) }
        .to change { preview_card.reload.image_file_name }.from(nil)

      expect(described_class).to_not have_enqueued_sidekiq_job
    end

    it 'schedules another try while the image is still rate limited' do
      stub_request(:get, image_url).to_return(status: 429)

      worker.perform(preview_card.id, image_url)

      expect(preview_card.reload.image_file_name).to be_nil
      expect(described_class).to have_enqueued_sidekiq_job(preview_card.id, image_url, 2)
    end

    it 'stops after the last try' do
      stub_request(:get, image_url).to_return(status: 429)

      worker.perform(preview_card.id, image_url, described_class::ATTEMPTS)

      expect(described_class).to_not have_enqueued_sidekiq_job
    end
  end
end
