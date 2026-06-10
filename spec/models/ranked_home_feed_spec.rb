# frozen_string_literal: true

require 'rails_helper'

RSpec.describe RankedHomeFeed do
  subject { described_class.new(viewer) }

  let(:viewer) { Fabricate(:account) }
  let(:bob)    { Fabricate(:account) }
  let(:ana)    { Fabricate(:account) }

  def push(status)
    FeedManager.instance.push_to_home(viewer, status, update: false)
  end

  describe '#get' do
    context 'when the feed is empty' do
      it 'returns an empty array' do
        expect(subject.get(20)).to eq []
      end
    end

    context 'with statuses of different engagement' do
      let(:plain_status)   { Fabricate(:status, account: ana) }
      let(:popular_status) { Fabricate(:status, account: bob) }

      before do
        Fabricate(:status_stat, status: popular_status, favourites_count: 10, reblogs_count: 3, replies_count: 2)
        push(plain_status)
        push(popular_status)
      end

      it 'returns the more engaged status first' do
        expect(subject.get(20)).to eq [popular_status, plain_status]
      end

      it 'slices with limit and offset' do
        expect(subject.get(1)).to eq [popular_status]
        expect(subject.get(1, 1)).to eq [plain_status]
        expect(subject.get(1, 5)).to eq []
      end
    end

    context 'with equal engagement but different author affinity' do
      let(:bob_status) { Fabricate(:status, account: bob) }
      let(:ana_status) { Fabricate(:status, account: ana) }

      before do
        3.times { Fabricate(:favourite, account: viewer, status: Fabricate(:status, account: ana)) }
        push(bob_status)
        push(ana_status)
      end

      it 'ranks the favoured author first' do
        expect(subject.get(20)).to eq [ana_status, bob_status]
      end
    end

    context 'with an old popular status and a fresh plain one' do
      let(:old_popular)  { Fabricate(:status, account: bob, id: Mastodon::Snowflake.id_at(2.days.ago)) }
      let(:fresh_status) { Fabricate(:status, account: ana) }

      before do
        Fabricate(:status_stat, status: old_popular, favourites_count: 10, reblogs_count: 0, replies_count: 0)
        push(old_popular)
        push(fresh_status)
      end

      it 'lets recency decay outweigh stale engagement' do
        expect(subject.get(20)).to eq [fresh_status, old_popular]
      end
    end

    context 'when a feed entry no longer exists in the database' do
      let(:status) { Fabricate(:status, account: bob) }

      before do
        push(status)
        status.delete
      end

      it 'skips the missing status' do
        expect(subject.get(20)).to eq []
      end
    end
  end
end
