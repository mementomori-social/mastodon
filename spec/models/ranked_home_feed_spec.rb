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

    context 'with a boost of a highly engaged status' do
      let(:tim)            { Fabricate(:account) }
      let(:popular_status) { Fabricate(:status, account: tim) }
      let(:boost)          { Fabricate(:status, account: bob, reblog: popular_status) }
      let(:plain_status)   { Fabricate(:status, account: ana) }

      before do
        Fabricate(:status_stat, status: popular_status, favourites_count: 10, reblogs_count: 3, replies_count: 2)
        push(boost)
        push(plain_status)
      end

      it 'surfaces the boosted status itself ranked by its engagement' do
        expect(subject.get(20)).to eq [popular_status, plain_status]
      end
    end

    context 'with own posts and boosts in the feed' do
      let(:tim)         { Fabricate(:account) }
      let(:tims_status) { Fabricate(:status, account: tim) }
      let(:own_status)  { Fabricate(:status, account: viewer) }
      let(:own_boost)   { Fabricate(:status, account: viewer, reblog: tims_status) }
      let(:bob_status)  { Fabricate(:status, account: bob) }

      before do
        push(own_status)
        push(own_boost)
        push(bob_status)
      end

      it 'excludes the viewer posts and boosts' do
        expect(subject.get(20)).to eq [bob_status]
      end
    end

    context 'with a remote status whose engagement is only known to its origin instance' do
      let(:remote_account) { Fabricate(:account, domain: 'example.com') }
      let(:remote_status)  { Fabricate(:status, account: remote_account, uri: 'https://example.com/statuses/1') }
      let(:local_status)   { Fabricate(:status, account: ana) }

      before do
        Fabricate(
          :status_stat,
          status: remote_status,
          favourites_count: 0,
          reblogs_count: 0,
          replies_count: 0,
          untrusted_favourites_count: 50,
          untrusted_reblogs_count: 10
        )
        push(remote_status)
        push(local_status)
      end

      it 'scores the remote status on its origin instance counts' do
        expect(subject.get(20)).to eq [remote_status, local_status]
      end
    end

    context 'when posts have already been served to the viewer' do
      let(:popular_status) { Fabricate(:status, account: bob) }
      let(:plain_status)   { Fabricate(:status, account: ana) }

      before do
        Fabricate(:status_stat, status: popular_status, favourites_count: 10, reblogs_count: 3, replies_count: 2)
        push(popular_status)
        push(plain_status)
      end

      it 'ranks served posts behind unseen ones on the next computation' do
        expect(subject.get(1)).to eq [popular_status]

        Rails.cache.clear

        expect(subject.get(2)).to eq [plain_status, popular_status]
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

    context 'with a remote status eligible for reply backfill' do
      let(:remote_account) { Fabricate(:account, domain: 'example.com') }
      let(:remote_status)  { Fabricate(:status, account: remote_account, uri: 'https://example.com/statuses/2', created_at: 1.hour.ago) }
      let(:local_status)   { Fabricate(:status, account: bob) }

      before do
        push(remote_status)
        push(local_status)
      end

      it 'enqueues a reply backfill for the remote status only on the first page' do
        subject.get(20)

        expect(ActivityPub::FetchAllRepliesWorker).to have_enqueued_sidekiq_job(remote_status.id)
        expect(ActivityPub::FetchAllRepliesWorker).to_not have_enqueued_sidekiq_job(local_status.id)
      end

      it 'does not enqueue backfills for later pages' do
        subject.get(20, 20)

        expect(ActivityPub::FetchAllRepliesWorker).to_not have_enqueued_sidekiq_job(remote_status.id)
      end
    end

    context 'with discovery enabled' do
      subject { described_class.new(viewer, discover: true) }

      let(:followed_statuses) { Array.new(4) { Fabricate(:status, account: bob) } }
      let(:trending_status)   { Fabricate(:status, account: ana) }

      before do
        followed_statuses.each { |status| push(status) }
        Fabricate(:status_trend, status: trending_status, account: ana, allowed: true, rank: 1, score: 10.0)
      end

      it 'interleaves trending statuses into the feed' do
        results = subject.get(20)

        expect(results).to include(trending_status)
        expect(results.first).to_not eq trending_status
      end

      it 'does not duplicate statuses already in the feed' do
        push(trending_status)

        expect(subject.get(20).count { |status| status.id == trending_status.id }).to eq 1
      end
    end
  end
end
