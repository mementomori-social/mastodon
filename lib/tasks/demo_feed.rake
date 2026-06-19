# frozen_string_literal: true

namespace :demo_feed do
  desc 'Seed synthetic accounts, posts and engagement to test the ranked home feed (refuses to run in production)'
  task seed: :environment do
    abort 'demo_feed:seed refuses to run in production' if Rails.env.production?

    demo_password = SecureRandom.hex(8)

    viewer_user = User.find_by(email: 'demo_viewer@localhost')

    if viewer_user
      viewer_user.update!(password: demo_password)
    else
      viewer_user = User.create!(
        email: 'demo_viewer@localhost',
        password: demo_password,
        confirmed_at: Time.now.utc,
        approved: true,
        agreement: true,
        bypass_registration_checks: true,
        account_attributes: { username: 'demo_viewer' }
      )
    end

    # Instances in approval mode override approved at creation time
    viewer_user.approve! unless viewer_user.approved?

    viewer = viewer_user.account

    authors = (1..5).map do |i|
      Account.find_by(username: "demo_author_#{i}", domain: nil) || Account.create!(username: "demo_author_#{i}")
    end

    lurkers = (1..10).map do |i|
      Account.find_by(username: "demo_lurker_#{i}", domain: nil) || Account.create!(username: "demo_lurker_#{i}")
    end

    authors.each { |author| viewer.follow!(author) unless viewer.following?(author) }

    puts 'Creating posts with varying engagement...'

    statuses = authors.flat_map do |author|
      (1..4).map do |n|
        PostStatusService.new.call(author, text: "Demo post #{n} from #{author.username}")
      end
    end

    statuses.each do |status|
      lurkers.sample(rand(0..lurkers.size)).each do |lurker|
        FavouriteService.new.call(lurker, status)
      end

      lurkers.sample(rand(0..3)).each do |lurker|
        ReblogService.new.call(lurker, status)
      end

      lurkers.sample(rand(0..2)).each do |lurker|
        PostStatusService.new.call(lurker, text: "Reply to #{status.id}", thread: status)
      end
    end

    # Make the viewer interact with the first author so affinity is visible
    authors.first.statuses.where(reblog_of_id: nil).find_each do |status|
      FavouriteService.new.call(viewer, status)
    end

    puts 'Rebuilding home feed...'
    PrecomputeFeedService.new.call(viewer)

    token = Doorkeeper::AccessToken.find_or_create_by!(resource_owner_id: viewer_user.id, scopes: 'read', revoked_at: nil)

    puts <<~INSTRUCTIONS

      Seeded #{statuses.size} posts from #{authors.size} authors for @demo_viewer.

      Web login: demo_viewer@localhost / #{demo_password}

      Chronological: curl -s -H 'Authorization: Bearer #{token.token}' 'http://localhost:3000/api/v1/timelines/home?limit=40'
      Ranked:        curl -s -H 'Authorization: Bearer #{token.token}' 'http://localhost:3000/api/v1/timelines/home?ranked=true&limit=40'

      The ranked response should lead with high-engagement posts and posts from demo_author_1 (affinity).
    INSTRUCTIONS
  end

  desc 'Continuously post and engage as demo accounts to test live behaviour (refuses to run in production)'
  task live: :environment do
    abort 'demo_feed:live refuses to run in production' if Rails.env.production?

    duration = (ENV['DURATION'] || 1800).to_i

    authors = Account.where(domain: nil, username: (1..5).map { |i| "demo_author_#{i}" }).to_a
    lurkers = Account.where(domain: nil, username: (1..10).map { |i| "demo_lurker_#{i}" }).to_a

    abort 'No demo accounts found, run demo_feed:seed first' if authors.empty?

    finish_at = Time.now.utc + duration
    count = 0

    puts "Posting as demo authors every few seconds for #{duration / 60} minutes, Ctrl+C to stop."

    while Time.now.utc < finish_at
      author = authors.sample
      status = PostStatusService.new.call(author, text: "Live post #{count + 1} from #{author.username} at #{Time.now.utc.strftime('%H:%M:%S')}")
      count += 1

      lurkers.sample(rand(0..4)).each { |lurker| FavouriteService.new.call(lurker, status) }
      lurkers.sample(rand(0..2)).each { |lurker| ReblogService.new.call(lurker, status) }

      puts "#{Time.now.utc.strftime('%H:%M:%S')} #{author.username} posted, #{count} total"
      sleep rand(3..8)
    end

    puts "Posted #{count} statuses."
  end

  desc 'Import real public posts from a live instance into the demo feed (refuses to run in production)'
  task import: :environment do
    abort 'demo_feed:import refuses to run in production' if Rails.env.production?

    source = ENV['SOURCE'] || 'https://mementomori.social'
    count  = (ENV['COUNT'] || 60).to_i
    watch  = ENV['WATCH'] == '1'
    push   = ENV['PUSH'] != '0'
    token  = ENV.fetch('ACCESS_TOKEN', nil)

    viewer_user = User.find_by(email: 'demo_viewer@localhost')
    abort 'No demo viewer found, run demo_feed:seed first' if viewer_user.nil?

    viewer = viewer_user.account

    client = HTTP.headers('User-Agent' => 'demo-feed-import')
    client = client.auth("Bearer #{token}") if token

    fetch_page = lambda do |params|
      res = client.get("#{source}/api/v1/timelines/public", params: { local: ENV['LOCAL'] != '0', limit: 40 }.merge(params))
      abort "#{source} returned #{res.status}" unless res.status.success?

      JSON.parse(res.body.to_s)
    end

    import_status = lambda do |payload|
      status = Status.find_by(uri: payload['uri']) || ActivityPub::FetchRemoteStatusService.new.call(payload['uri'])
      return nil if status.nil?

      # Carry over the engagement the source instance has seen so ranking has real data
      status.status_stat.update(
        favourites_count: payload['favourites_count'].to_i,
        reblogs_count: payload['reblogs_count'].to_i,
        replies_count: payload['replies_count'].to_i
      )

      FeedManager.instance.push_to_home(viewer, status, update: true) if push
      puts "#{Time.now.utc.strftime('%H:%M:%S')} imported #{payload['account']['acct']} favs:#{payload['favourites_count']} boosts:#{payload['reblogs_count']}"
      status
    rescue HTTP::Error, OpenSSL::SSL::SSLError, ActiveRecord::RecordInvalid, Mastodon::ValidationError, Mastodon::UnexpectedResponseError => e
      puts "skipped #{payload['uri']}: #{e.class}"
      nil
    end

    imported  = 0
    max_id    = nil
    newest_id = nil

    while imported < count
      page = fetch_page.call(max_id ? { max_id: max_id } : {})
      break if page.empty?

      newest_id ||= page.first['id']

      page.each do |payload|
        break if imported >= count

        imported += 1 if import_status.call(payload)
      end

      max_id = page.last['id']
    end

    puts "Imported #{imported} posts from #{source}."

    if watch
      puts 'Watching for new posts every 20 seconds, Ctrl+C to stop.'

      since_id = newest_id

      loop do
        sleep 20

        page = fetch_page.call(since_id ? { since_id: since_id } : {})
        next if page.empty?

        since_id = page.first['id']
        page.reverse_each { |payload| import_status.call(payload) }
      end
    end
  end

  desc 'Mark the most engaged recent statuses as trending so discovery has candidates (refuses to run in production)'
  task trendify: :environment do
    abort 'demo_feed:trendify refuses to run in production' if Rails.env.production?

    statuses = Status.where(reblog_of_id: nil, in_reply_to_id: nil, visibility: :public)
      .where(created_at: 3.days.ago..)
      .joins(:status_stat)
      .reorder(Arel.sql('status_stats.untrusted_favourites_count + status_stats.untrusted_reblogs_count DESC NULLS LAST'))
      .limit(30)
      .to_a

    statuses.each_with_index do |status, index|
      StatusTrend.upsert(
        {
          status_id: status.id,
          account_id: status.account_id,
          score: (statuses.size - index).to_f,
          rank: index,
          allowed: true,
          language: status.language,
        },
        unique_by: :status_id
      )
    end

    puts "Marked #{statuses.size} statuses as trending."
  end
end
