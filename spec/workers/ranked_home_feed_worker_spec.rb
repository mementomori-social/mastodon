# frozen_string_literal: true

require 'rails_helper'

RSpec.describe RankedHomeFeedWorker do
  let(:account) { Fabricate(:account) }

  describe '#perform' do
    it 'recomputes the ranking for the account' do
      feed = instance_double(RankedHomeFeed, recompute!: [])
      allow(RankedHomeFeed).to receive(:new).and_return(feed)

      subject.perform(account.id, false)

      expect(RankedHomeFeed).to have_received(:new).with(account, discover: false, languages: nil)
      expect(feed).to have_received(:recompute!)
    end

    it 'passes the discovery flag through' do
      feed = instance_double(RankedHomeFeed, recompute!: [])
      allow(RankedHomeFeed).to receive(:new).and_return(feed)

      subject.perform(account.id, true)

      expect(RankedHomeFeed).to have_received(:new).with(account, discover: true, languages: nil)
    end

    it 'does nothing when the account no longer exists' do
      expect { subject.perform(-1, false) }.to_not raise_error
    end
  end

  describe 'end to end' do
    it 'fills the cache so the feed serves the ranking without recomputing' do
      viewer = Fabricate(:account)
      author = Fabricate(:account)
      viewer.follow!(author)
      status = Fabricate(:status, account: author)
      Fabricate(:status_stat, status: status, favourites_count: 7)
      FeedManager.instance.push_to_home(viewer, status, update: false)

      described_class.new.perform(viewer.id, false)

      expect(Rails.cache.read("ranked_home_feed:ids:#{viewer.id}:0")).to include(status.id)
      expect(RankedHomeFeed.new(viewer).get(20)).to eq [status]
    end
  end
end
