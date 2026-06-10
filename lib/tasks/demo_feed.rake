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
end
