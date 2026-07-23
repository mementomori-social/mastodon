# frozen_string_literal: true

require 'rails_helper'

RSpec.describe RankedHomeFeedWorker do
  let(:account) { Fabricate(:account) }

  describe '#perform' do
    it 'recomputes the ranking for the account' do
      feed = instance_double(RankedHomeFeed, recompute!: [])
      allow(RankedHomeFeed).to receive(:new).and_return(feed)

      subject.perform(account.id, false)

      expect(RankedHomeFeed).to have_received(:new).with(account, discover: false)
      expect(feed).to have_received(:recompute!)
    end

    it 'passes the discovery flag through' do
      feed = instance_double(RankedHomeFeed, recompute!: [])
      allow(RankedHomeFeed).to receive(:new).and_return(feed)

      subject.perform(account.id, true)

      expect(RankedHomeFeed).to have_received(:new).with(account, discover: true)
    end

    it 'does nothing when the account no longer exists' do
      expect { subject.perform(-1, false) }.to_not raise_error
    end
  end
end
