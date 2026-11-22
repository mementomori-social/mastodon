# frozen_string_literal: true

namespace :mementomods do
  desc 'Move users on removed themes to the Mastodon 5 themes (DRY_RUN=false to write)'
  task migrate_themes: :environment do
    # Mastodon 4 theme => [Mastodon 5 theme, colour scheme, contrast], nil keeps the user's value
    migrations = {
      'mastodon-bird-ui-auto' => ['default', nil, nil],
      'default-change-to-stars' => ['default', nil, nil],
      'mastodon-bird-ui-dark' => ['default', 'dark', nil],
      'mastodon-bird-ui-light' => ['default', 'light', nil],
      'mastodon-bird-ui-contrast' => %w(default dark high),
      'mastodon-bird-ui-stars' => ['default', 'dark', nil],
      'mastodon-bird-ui-auto-stars' => ['default', nil, nil],
      'mastodon-bird-ui-light-stars' => ['default', 'light', nil],
      'mastodon-bird-ui-dark-change-to-stars' => ['default', 'dark', nil],
      'hide-finnish' => ['default', 'dark', nil],
      'hide-finnish-change-to-stars' => ['default', 'dark', nil],
      'hide-translate-links' => ['default', 'dark', nil],
      'mastodon-bird-ui-light-hide-finnish' => ['default', 'light', nil],
      'mastodon-bird-ui-light-hide-finnish-change-to-stars' => ['default', 'light', nil],
      'mastodon-bird-ui-light-hide-translate-links' => ['default', 'light', nil],
      'mastodon-bird-ui-accessible-hide-finnish' => ['mastodon-bird-ui-accessible', nil, nil],
      'system' => ['default', 'auto', nil],
      'mastodon-light' => ['mastodon-dark', 'light', nil],
      'contrast' => %w(mastodon-dark dark high),
    }.freeze

    dry_run = ENV['DRY_RUN'] != 'false'
    counts = Hash.new(0)

    # The raw table, so the settings JSON is written as is
    users = Class.new(ApplicationRecord) { self.table_name = 'users' }

    users.where.not(settings: nil).find_each do |user|
      settings = JSON.parse(user.attributes_before_type_cast['settings'])
      migration = migrations[settings['theme']]
      next if migration.nil?

      counts[settings['theme']] += 1
      theme, color_scheme, contrast = migration
      settings['theme'] = theme
      settings['web.color_scheme'] = color_scheme unless color_scheme.nil?
      settings['web.contrast'] = contrast unless contrast.nil?

      user.update_column('settings', JSON.generate(settings)) unless dry_run
    end

    counts.sort.each { |old_theme, count| puts "#{old_theme}: #{count}" }
    puts dry_run ? 'Dry run, nothing written. Run again with DRY_RUN=false.' : "Migrated #{counts.values.sum} users."
  end
end
