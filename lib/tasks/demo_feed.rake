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
end
