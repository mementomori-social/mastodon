# frozen_string_literal: true

# Deterministic demo data for mementomori.test: years of posts, a follow graph,
# engagement and notifications, safe to publish. See dev/README.md.
namespace :mementomori do
  desc 'Seed a fresh development database with realistic demo data (SCALE=small|default|large)'
  task seed: :environment do
    abort 'Development only.' unless Rails.env.development?
    abort 'Already seeded. Reset first: bin/mementomori-dev reset' if Account.exists?(username: 'demo', domain: nil)

    MementomoriSeed.new(ENV.fetch('SCALE', 'default')).run
  end
end

class MementomoriSeed
  SEED = 20_261_008
  PASSWORD = 'mementomori'
  YEARS = 3
  BATCH = 5_000


  SCALES = {
    'small' => { local: 30, remote: 10, statuses: 4_000, media: 60, follows: 25 },
    'default' => { local: 150, remote: 50, statuses: 40_000, media: 400, follows: 60 },
    'large' => { local: 400, remote: 150, statuses: 200_000, media: 1_000, follows: 120 },
  }.freeze

  REMOTE_DOMAINS = %w(social.example kirahvi.example toot.example metalli.example retro.example).freeze

  TAGS = %w(
    mastodon fediverse caturday photography coffee running finland helsinki tampere
    metal gaming linux webdev accessibility music nowplaying retrocomputing books
    kahvi sauna kirjat koodaus valokuvaus luonto ruoka juoksu talvi syksy
  ).freeze

  EN_TEMPLATES = [
    ->(f) { "Just finished #{f.book}. #{f.opinion}" },
    ->(f) { "Today's soundtrack: #{f.band}. #{f.opinion} #nowplaying" },
    ->(f) { "Made #{f.dish} for dinner. #{f.opinion}" },
    ->(f) { "Hot take: #{f.hacker}" },
    ->(f) { "Anyone else think #{f.movie} is underrated? #{f.opinion}" },
    ->(f) { "Morning run done, #{f.km} km in the rain. #running" },
    ->(f) { "Coffee number #{f.small} today and it's not even noon. #coffee" },
    ->(f) { "Reminder that #{f.advice}" },
    ->(f) { "Spent the whole evening debugging and the fix was one line. #{f.tech}" },
    ->(f) { "New blog post about #{f.topic}: #{f.link}" },
    ->(f) { "#{f.quote}" },
    ->(f) { "The cat has decided my keyboard is a bed. #caturday" },
    ->(f) { "Finally got my old #{f.retro} running again. #retrocomputing" },
    ->(f) { "Please add alt text to your images, it takes ten seconds. #accessibility" },
    ->(f) { "Weekend plans: #{f.plan}." },
    ->(f) { "Is it just me or has #{f.topic} gotten way more complicated lately?" },
  ].freeze

  FI_TEMPLATES = [
    ->(f) { "Luin juuri loppuun kirjan #{f.book}. #{f.mielipide} #kirjat" },
    ->(f) { "Aamulenkki tehty, #{f.km} km. Sade ei haitannut. #juoksu" },
    ->(f) { "Kahvia jo #{f.small} kuppia ja kello on vasta kymmenen. #kahvi" },
    ->(f) { "Saunan jälkeen järveen. Parempaa ei ole. #sauna" },
    ->(f) { "Tänään #{f.city}ssa satoi taas koko päivän. #{f.mielipide}" },
    ->(f) { "Tein ruoaksi #{f.ruoka}. #{f.mielipide} #ruoka" },
    ->(f) { "Koodasin koko illan ja korjaus oli lopulta yksi rivi. #koodaus" },
    ->(f) { "Syksyn värit #{f.city}ssa on aivan uskomattomat. #syksy #valokuvaus" },
    ->(f) { "Ensimmäinen lumi! #{f.mielipide} #talvi" },
    ->(f) { "Kuuntelen nyt #{f.band}. #nowplaying" },
    ->(f) { "Muistakaa kuvailla kuvanne, se vie kymmenen sekuntia. #accessibility" },
    ->(f) { "Viikonlopun suunnitelma: mökki, sauna ja hyvä kirja." },
    ->(f) { "Kirjoitin blogiin aiheesta #{f.topic}: #{f.link}" },
  ].freeze

  MEDIA_ALTS = [
    'A sunset over a calm lake, orange sky reflected in the water',
    'Autumn leaves on a forest path',
    'A cup of coffee on a wooden table next to a book',
    'A cat sleeping on a laptop keyboard',
    'Snow-covered pine trees under a pale winter sun',
    'An old home computer with a green screen',
    'Järvimaisema iltaruskossa, laituri etualalla',
    'Kuurainen niitty aamuauringossa',
  ].freeze

  # Template variables, all drawn from the shared seeded Faker random.
  class Filler
    OPINIONS = ['Highly recommended.', 'Not sure how I feel about it.', 'Ten out of ten.', 'Could have been better.', 'Absolutely loved it.'].freeze
    MIELIPITEET = ['Suosittelen!', 'Ei ollut ihan minun juttuni.', 'Aivan mahtava.', 'Ihan ok.', 'Tätä lisää!'].freeze
    RUOAT = %w(karjalanpiirakoita lohikeittoa makaroonilaatikkoa pannukakkua hernekeittoa kanttarellikastiketta).freeze
    CITIES = %w(Helsinki Tampere Turku Oulu Jyväskylä Kuopio Lahti Rovaniemi).freeze
    RETRO = ['Amiga 500', 'Commodore 64', 'ZX Spectrum', 'Atari ST', 'MSX'].freeze
    TOPICS = %w(Rust accessibility CSS self-hosting PostgreSQL federation photography typography).freeze
    PLANS = ['hiking, sauna and a good book', 'nothing at all', 'finally fixing the bike', 'board games with friends'].freeze

    def initialize(rng)
      @rng = rng
    end

    def book = Faker::Book.title
    def band = Faker::Music.band
    def dish = Faker::Food.dish
    def hacker = Faker::Hacker.say_something_smart
    def movie = Faker::Movie.title
    def quote = Faker::Quote.jack_handey
    def advice = Faker::Quote.matz.downcase
    def tech = '#webdev #linux'
    def opinion = OPINIONS.sample(random: @rng)
    def mielipide = MIELIPITEET.sample(random: @rng)
    def ruoka = RUOAT.sample(random: @rng)
    def city = CITIES.sample(random: @rng)
    def retro = RETRO.sample(random: @rng)
    def topic = TOPICS.sample(random: @rng)
    def plan = PLANS.sample(random: @rng)
    def km = @rng.rand(3..21)
    def small = @rng.rand(2..6)
    def link = "https://example.com/#{Faker::Internet.slug}"
  end

  def initialize(scale)
    @scale = SCALES.fetch(scale) { abort "Unknown SCALE #{scale}, use #{SCALES.keys.join('|')}" }
    @rng = Random.new(SEED)
    Faker::Config.random = Random.new(SEED)
    @filler = Filler.new(@rng)
    @now = Time.now.utc.beginning_of_hour
    @start = @now - YEARS.years
    @seq = 0
  end

  def run
    log "Seeding #{@scale.inspect}"
    ActiveRecord::Base.transaction do
      create_accounts
      create_follows
      create_statuses
      create_engagement
      create_polls_edits_pins
      create_notifications
      create_personal_data
      recount
    end
    attach_media
    build_feeds
    log "Done. Log in at https://#{Rails.configuration.x.web_domain} as demo@#{email_domain} / #{PASSWORD}"
  end

  private

  def log(message)
    puts "[mementomori:seed] #{message}"
  end

  # Time-ordered, collision-free ids in Mastodon's snowflake format.
  def snowflake(time)
    @seq += 1
    ((time.to_f * 1000).to_i << 16) | (@seq & 0xffff)
  end

  def group_span
    Notification::MAXIMUM_GROUP_SPAN_HOURS.hours.to_i
  end

  def pareto(alpha = 1.5)
    (1.0 - @rng.rand)**(-1.0 / alpha)
  end

  def weighted_pick(items, weights)
    target = @rng.rand * weights.sum
    items.each_with_index do |item, i|
      target -= weights[i]
      return item if target <= 0
    end
    items.last
  end

  def email_domain
    Rails.configuration.x.local_domain.sub(/:\d+\z/, '')
  end

  def insert(model, rows)
    rows.each_slice(BATCH) { |slice| model.insert_all!(slice) }
    model.connection.reset_pk_sequence!(model.table_name) unless model.columns_hash['id']&.default_function&.start_with?('timestamp_id')
  end

  def next_id(model)
    (model.maximum(:id) || 0) + 1
  end

  # --- accounts --------------------------------------------------------------

  def create_accounts
    owner = UserRole.find_by(name: 'Owner')
    moderator = UserRole.find_by(name: 'Moderator')
    @accounts = []

    fixed = [
      ['admin', 'Admin', owner],
      ['moderator', 'Moderaattori', moderator],
      ['demo', 'Demo User', nil],
    ]
    fixed.each { |username, name, role| @accounts << local_account(username, name, role, @start) }

    (@scale[:local] - fixed.size).times do |i|
      finnish = @rng.rand < 0.5
      name = Faker::Base.with_locale(finnish ? 'fi' : 'en') { Faker::Name.name }
      username = "#{name.parameterize(separator: '_')[0, 24]}_#{i}"
      joined = @start + (@rng.rand**2 * YEARS * 0.8).years
      account = local_account(username, name, nil, joined, finnish:)
      @accounts << account
    end

    @scale[:remote].times do |i|
      name = Faker::Name.name
      @accounts << remote_account("#{name.parameterize(separator: '_')[0, 24]}_#{i}", name, REMOTE_DOMAINS[i % REMOTE_DOMAINS.size])
    end

    @locals = @accounts.select(&:local?)
    @demo = @accounts.find { |a| a.username == 'demo' }
    @weight = @accounts.to_h { |a| [a.id, pareto] }
    @weight[@demo.id] = 3.0
    @finnish = @accounts.to_h { |a| [a.id, a.note.include?('Suomesta')] }
    log "#{@locals.size} local and #{@accounts.size - @locals.size} remote accounts"
  end

  def local_account(username, name, role, joined, finnish: false)
    account = Account.new(
      id: snowflake(joined), username:, display_name: name, created_at: joined,
      note: finnish ? "Suomesta. #{Faker::Hobby.activity}, kahvi ja kirjat." : "#{Faker::Hobby.activity}, #{Faker::Hobby.activity.downcase} and coffee.",
      fields: [{ name: 'Pronouns', value: %w(they/them she/her he/him).sample(random: @rng) }],
      locked: @rng.rand < 0.08, actor_type: @rng.rand < 0.03 ? 'Service' : 'Person',
      discoverable: true, indexable: true
    )
    account.save!
    User.create!(
      account:, email: "#{username}@#{email_domain}", password: PASSWORD, agreement: true,
      confirmed_at: joined, approved: true, role:, locale: finnish ? 'fi' : 'en',
      current_sign_in_at: @now, created_at: joined
    )
    account
  end

  def remote_account(username, name, domain)
    Account.create!(
      id: snowflake(@start), username:, domain:, display_name: name, note: Faker::Hobby.activity,
      uri: "https://#{domain}/users/#{username}", url: "https://#{domain}/@#{username}",
      inbox_url: "https://#{domain}/users/#{username}/inbox", shared_inbox_url: "https://#{domain}/inbox",
      followers_url: "https://#{domain}/users/#{username}/followers", protocol: :activitypub,
      last_webfingered_at: @now, created_at: @start, discoverable: true, indexable: true
    )
  end

  # --- graph -----------------------------------------------------------------

  def create_follows
    @following = Hash.new { |h, k| h[k] = Set.new }
    rows = []
    request_rows = []
    id = next_id(Follow)

    @locals.each do |follower|
      count = follower == @demo ? [120, @accounts.size - 1].min : [(@scale[:follows] * pareto(2)).to_i, @accounts.size - 1].min
      candidates = @accounts - [follower]
      targets = Set.new
      targets << weighted_pick(candidates, candidates.map { |a| @weight[a.id] }) while targets.size < count

      targets.each do |target|
        at = [follower.created_at, target.created_at].max + @rng.rand(1..60).days
        at = @now - 1.day if at > @now
        if target.locked? && @rng.rand < 0.15
          request_rows << { account_id: follower.id, target_account_id: target.id, created_at: at, updated_at: at }
          next
        end
        @following[follower.id] << target.id
        rows << { id:, account_id: follower.id, target_account_id: target.id, created_at: at, updated_at: at, uri: "#{ActivityPub::TagManager.instance.uri_for(follower)}#follows/#{id}" }
        id += 1
      end
    end

    @follower_ids = Hash.new { |h, k| h[k] = [] }
    @following.each { |from, tos| tos.each { |to| @follower_ids[to] << from } }
    @follow_rows = rows
    insert(Follow, rows)
    insert(FollowRequest, request_rows) if request_rows.any?
    log "#{rows.size} follows, #{request_rows.size} follow requests"
  end

  # --- statuses --------------------------------------------------------------

  def status_times
    # Activity grows over the years and follows a daily rhythm.
    Array.new(@scale[:statuses]) do
      day = @start + (@rng.rand**0.6 * YEARS).years
      hour = [7, 9, 12, 12, 13, 17, 19, 20, 21, 22, 23].sample(random: @rng)
      day.beginning_of_day + hour.hours + @rng.rand(3600).seconds
    end.select { |t| t < @now }.sort
  end

  def compose_text(account)
    templates = @finnish[account.id] ? FI_TEMPLATES : EN_TEMPLATES
    text = templates.sample(random: @rng).call(@filler)
    text += " ##{TAGS.sample(random: @rng)}" if @rng.rand < 0.25
    text
  end

  def create_statuses
    @statuses = []
    @mentions = []
    @tag_links = []
    @quotes = []
    @conversation_seq = next_id(Conversation)
    conversations = []
    recent = []
    mention_id = next_id(Mention)

    status_times.each do |at|
      author = weighted_pick(*active_authors(at))
      roll = @rng.rand
      parent = recent.sample(random: @rng) if recent.any?

      if parent && roll < 0.12 && parent[:visibility] <= 1 && parent[:account_id] != author.id && parent[:reblog_of_id].nil?
        add_status(author, at, reblog_of: parent)
        next
      end

      reply_to = parent if parent && roll < 0.42 && parent[:reblog_of_id].nil? && parent[:visibility] <= 2
      visibility = weighted_pick([0, 1, 2, 3], [70, 15, 12, 3])
      visibility = reply_to[:visibility] if reply_to && reply_to[:visibility] > visibility
      text = compose_text(author)

      if reply_to
        parent_author = account_by_id(reply_to[:account_id])
        text = "@#{parent_author.pretty_acct} #{text}"
      end

      if visibility == 3
        partner = @locals.sample(random: @rng)
        text = "@#{partner.pretty_acct} #{text}" unless partner == author
      end

      conversation_id = reply_to ? reply_to[:conversation_id] : (@conversation_seq += 1)
      conversations << { id: conversation_id, created_at: at, updated_at: at } unless reply_to

      status = add_status(
        author, at, text:, visibility:, conversation_id:,
        reply_to:, spoiler: @rng.rand < 0.07 ? ['Spoilers', 'Food', 'Politics', 'Ruokaa', 'Pitkä teksti'].sample(random: @rng) : ''
      )

      text.scan(/@(\w+)(?:@([\w.-]+))?/).uniq.each do |username, domain|
        target = @accounts.find { |a| a.username == username && a.domain == domain }
        next unless target

        @mentions << { id: mention_id, status_id: status[:id], account_id: target.id, created_at: at, updated_at: at, silent: false }
        mention_id += 1
      end

      text.scan(/#(\w+)/).flatten.uniq.each { |name| @tag_links << [status[:id], name.downcase, at] }

      if !reply_to && visibility.zero? && @rng.rand < 0.02 && recent.any?
        quoted = recent.find { |s| s[:visibility].zero? && s[:reblog_of_id].nil? && s[:account_id] != author.id }
        @quotes << { id: snowflake(at), account_id: author.id, status_id: status[:id], quoted_status_id: quoted[:id], quoted_account_id: quoted[:account_id], state: Quote.states[:accepted], created_at: at, updated_at: at } if quoted
      end

      recent << status
      recent.shift if recent.size > 300
    end

    insert(Conversation, conversations)
    insert(Status, @statuses)
    insert(Mention, @mentions)
    insert(Quote, @quotes) if @quotes.any?
    create_tags
    log "#{@statuses.size} statuses, #{@mentions.size} mentions, #{@quotes.size} quotes"
  end

  def active_authors(at)
    @active_cache ||= {}
    key = at.to_date
    @active_cache[key] ||= begin
      list = @accounts.select { |a| a.created_at <= at }
      [list, list.map { |a| @weight[a.id] }]
    end
  end

  def account_by_id(id)
    @account_index ||= @accounts.index_by(&:id)
    @account_index[id]
  end

  def add_status(author, at, text: '', visibility: 0, conversation_id: nil, reply_to: nil, reblog_of: nil, spoiler: '')
    id = snowflake(at)
    model = Status.new(id:, account: author, local: author.local?, reblog_of_id: reblog_of&.dig(:id))
    uri = author.local? ? ActivityPub::TagManager.instance.uri_for(model) : "https://#{author.domain}/users/#{author.username}/statuses/#{id}"
    url = author.local? ? ActivityPub::TagManager.instance.url_for(model) : "https://#{author.domain}/@#{author.username}/#{id}"

    row = {
      id:, account_id: author.id, text:, created_at: at, updated_at: at, local: author.local?,
      visibility: reblog_of ? 0 : visibility, conversation_id: reblog_of ? reblog_of[:conversation_id] : conversation_id,
      in_reply_to_id: reply_to&.dig(:id), in_reply_to_account_id: reply_to&.dig(:account_id), reply: !reply_to.nil?,
      reblog_of_id: reblog_of&.dig(:id), spoiler_text: spoiler, sensitive: spoiler.present?,
      language: @finnish[author.id] ? 'fi' : 'en', uri:, url: reblog_of ? nil : url
    }
    @statuses << row
    row
  end

  def create_tags
    names = @tag_links.map { |_, name, _| name }.uniq
    tags = Tag.find_or_create_by_names(names).index_by(&:name)
    @tag_links.map { |status_id, name, _| "(#{status_id}, #{tags.fetch(name).id})" }.uniq.each_slice(BATCH) do |values|
      Status.connection.execute("INSERT INTO statuses_tags (status_id, tag_id) VALUES #{values.join(',')}")
    end
    @tag_links.group_by { |_, name, _| name }.each { |name, links| tags[name].update_columns(last_status_at: links.map(&:last).max, usable: true, listable: true) }
  end

  # --- engagement ------------------------------------------------------------

  def create_engagement
    @favourites = []
    @bookmarks = []
    fav_id = next_id(Favourite)
    originals = @statuses.select { |s| s[:reblog_of_id].nil? && s[:visibility] <= 2 }

    originals.each do |status|
      audience = @follower_ids[status[:account_id]].map { |id| account_by_id(id) }.select(&:local?)
      audience = @locals if status[:visibility] <= 1 && audience.size < 5
      next if audience.empty?

      count = [(pareto(1.2) * @weight[status[:account_id]]).to_i, audience.size].min
      audience.sample(count, random: @rng).each do |fan|
        next if fan.id == status[:account_id]

        at = status[:created_at] + (pareto(1) * 600).seconds
        at = @now if at > @now
        @favourites << { id: fav_id, account_id: fan.id, status_id: status[:id], created_at: at, updated_at: at }
        fav_id += 1
      end
    end

    originals.sample([originals.size / 40, 400].min, random: @rng).each do |status|
      @bookmarks << { account_id: @demo.id, status_id: status[:id], created_at: status[:created_at], updated_at: status[:created_at] }
    end

    insert(Favourite, @favourites)
    insert(Bookmark, @bookmarks)
    log "#{@favourites.size} favourites, #{@bookmarks.size} bookmarks"
  end

  def create_polls_edits_pins
    polls = []
    edits = []
    poll_id = next_id(Poll)
    local_originals = @statuses.select { |s| s[:local] && s[:reblog_of_id].nil? && s[:visibility].zero? && !s[:reply] }

    local_originals.sample(@statuses.size / 80, random: @rng).each do |status|
      options = [['Kahvi', 'Tee', 'Molemmat'], ['Yes', 'No', 'Show results'], ['Linux', 'macOS', 'Windows', 'Other']].sample(random: @rng)
      tallies = options.map { @rng.rand(0..40) }
      expires = status[:created_at] + [1, 3, 7].sample(random: @rng).days
      polls << {
        id: poll_id, account_id: status[:account_id], status_id: status[:id], options:, cached_tallies: tallies,
        votes_count: tallies.sum, voters_count: tallies.sum, expires_at: expires, created_at: status[:created_at], updated_at: status[:created_at]
      }
      status[:poll_id] = poll_id
      status[:text] = 'Which one?' if status[:text].length > 200
      poll_id += 1
    end

    local_originals.sample(@statuses.size / 100, random: @rng).each do |status|
      edited_at = status[:created_at] + @rng.rand(60..3600).seconds
      edits << { status_id: status[:id], account_id: status[:account_id], text: status[:text], spoiler_text: '', created_at: status[:created_at], updated_at: status[:created_at] }
      status[:text] = "#{status[:text]} (edit: typo)"
      status[:edited_at] = edited_at
      edits << { status_id: status[:id], account_id: status[:account_id], text: status[:text], spoiler_text: '', created_at: edited_at, updated_at: edited_at }
    end

    insert(Poll, polls)
    insert(StatusEdit, edits)
    @statuses.select { |s| s[:poll_id] || s[:edited_at] }.each do |s|
      Status.where(id: s[:id]).update_all(poll_id: s[:poll_id], edited_at: s[:edited_at], text: s[:text])
    end

    pins = @locals.flat_map do |account|
      local_originals.select { |s| s[:account_id] == account.id }.last(2).map { |s| { account_id: account.id, status_id: s[:id], created_at: @now, updated_at: @now } }
    end
    insert(StatusPin, pins)
    log "#{polls.size} polls, #{edits.size / 2} edited statuses, #{pins.size} pins"
  end

  # --- notifications -----------------------------------------------------------

  def notification(type, activity_type, activity_id, recipient_id, from_id, at, status_id: nil)
    return if recipient_id == from_id || !account_by_id(recipient_id).local?

    group_key = ("#{[type, status_id].compact.join('-')}-#{at.to_i / group_span * group_span / 1.hour.to_i}" if %w(favourite reblog follow).include?(type))
    { account_id: recipient_id, from_account_id: from_id, activity_type:, activity_id:, type:, group_key:, created_at: at, updated_at: at }
  end

  def create_notifications
    by_id = @statuses.index_by { |s| s[:id] }
    rows = []
    @favourites.each { |f| rows << notification('favourite', 'Favourite', f[:id], by_id[f[:status_id]][:account_id], f[:account_id], f[:created_at], status_id: f[:status_id]) }
    @statuses.each { |s| rows << notification('reblog', 'Status', s[:id], by_id[s[:reblog_of_id]][:account_id], s[:account_id], s[:created_at], status_id: s[:reblog_of_id]) if s[:reblog_of_id] }
    @mentions.each { |m| rows << notification('mention', 'Mention', m[:id], m[:account_id], by_id[m[:status_id]][:account_id], m[:created_at]) }
    @follow_rows.each { |f| rows << notification('follow', 'Follow', f[:id], f[:target_account_id], f[:account_id], f[:created_at]) }
    @quotes.each { |q| rows << notification('quote', 'Quote', q[:id], q[:quoted_account_id], q[:account_id], q[:created_at]) }
    rows.compact!
    insert(Notification, rows)
    log "#{rows.size} notifications"
  end

  # --- the demo user's own data ---------------------------------------------

  def create_personal_data
    followed = @following[@demo.id].to_a.map { |id| account_by_id(id) }
    [%w(Friends 12), %w(Tech 10), %w(Suomi 8)].each do |title, size|
      list = List.create!(account: @demo, title:)
      followed.sample(size.to_i, random: @rng).each do |account|
        follow = Follow.find_by(account: @demo, target_account: account)
        ListAccount.create!(list:, account:, follow:)
      end
    end

    filter = CustomFilter.create!(account: @demo, phrase: 'Spoilers', context: %w(home public), action: :warn)
    filter.keywords.create!(keyword: 'spoiler')
    %w(caturday photography sauna linux).each { |name| TagFollow.create!(account: @demo, tag: Tag.find_or_create_by_names(name).first) }

    strangers = @accounts - followed - [@demo]
    Mute.create!(account: @demo, target_account: strangers.sample(random: @rng))
    Block.create!(account: @demo, target_account: strangers.sample(random: @rng))

    3.times do |i|
      target = @locals.sample(random: @rng)
      Report.create!(account: @demo, target_account: target, comment: ['Spam', 'Harassment in replies', 'Wrong content warning'][i], category: %i(spam other other)[i], status_ids: Status.where(account: target).limit(2).pluck(:id))
    end
  end

  def recount
    log 'Counting stats'
    Status.connection.execute(<<~SQL.squish)
      INSERT INTO status_stats (status_id, replies_count, reblogs_count, favourites_count, quotes_count, created_at, updated_at)
      SELECT s.id,
        (SELECT count(*) FROM statuses r WHERE r.in_reply_to_id = s.id AND r.visibility <> 3),
        (SELECT count(*) FROM statuses b WHERE b.reblog_of_id = s.id),
        (SELECT count(*) FROM favourites f WHERE f.status_id = s.id),
        (SELECT count(*) FROM quotes q WHERE q.quoted_status_id = s.id AND q.state = #{Quote.states[:accepted]}),
        now(), now()
      FROM statuses s WHERE s.reblog_of_id IS NULL
      ON CONFLICT (status_id) DO UPDATE SET replies_count = EXCLUDED.replies_count, reblogs_count = EXCLUDED.reblogs_count,
        favourites_count = EXCLUDED.favourites_count, quotes_count = EXCLUDED.quotes_count
    SQL
    Status.connection.execute(<<~SQL.squish)
      INSERT INTO account_stats (account_id, statuses_count, following_count, followers_count, last_status_at, created_at, updated_at)
      SELECT a.id,
        (SELECT count(*) FROM statuses s WHERE s.account_id = a.id AND s.visibility <> 3),
        (SELECT count(*) FROM follows f WHERE f.account_id = a.id),
        (SELECT count(*) FROM follows f WHERE f.target_account_id = a.id),
        (SELECT max(created_at) FROM statuses s WHERE s.account_id = a.id),
        now(), now()
      FROM accounts a WHERE a.id > 0
      ON CONFLICT (account_id) DO UPDATE SET statuses_count = EXCLUDED.statuses_count, following_count = EXCLUDED.following_count,
        followers_count = EXCLUDED.followers_count, last_status_at = EXCLUDED.last_status_at
    SQL
  end

  # --- media and feeds (after commit) --------------------------------------------

  def gradient(path, width, height)
    from = Array.new(3) { @rng.rand(40..220) }
    to = Array.new(3) { @rng.rand(40..220) }
    xyz = Vips::Image.xyz(width, height)
    t = (xyz[0] + xyz[1]) / (width + height).to_f
    image = (t * to.zip(from).map { |a, b| a - b }) + from
    image.cast(:uchar).write_to_file(path)
  end

  def attach_media
    dir = Rails.root.join('tmp', 'mementomori-seed')
    FileUtils.mkdir_p(dir)

    log 'Generating avatars and headers'
    @accounts.each_with_index do |account, i|
      avatar = dir.join("avatar-#{i}.png")
      header = dir.join("header-#{i}.png")
      gradient(avatar.to_s, 400, 400)
      gradient(header.to_s, 1500, 500)
      account.update!(avatar: File.open(avatar), header: File.open(header))
    end

    log 'Generating post images'
    candidates = Status.where(reblog_of_id: nil, poll_id: nil).where(visibility: [0, 1]).order(:id).pluck(:id, :account_id)
    candidates.sample(@scale[:media], random: @rng).each_with_index do |(status_id, account_id), i|
      path = dir.join("media-#{i % 40}.png")
      gradient(path.to_s, 1200, 800) unless File.exist?(path)
      media = MediaAttachment.create!(account_id:, status_id:, file: File.open(path), description: MEDIA_ALTS.sample(random: @rng))
      Status.where(id: status_id).update_all(ordered_media_attachment_ids: [media.id], sensitive: @rng.rand < 0.05)
    end
    FileUtils.rm_rf(dir)
  end

  def build_feeds
    log 'Building home feeds'
    Account.local.joins(:user).find_each { |account| PrecomputeFeedService.new.call(account) }
  end
end
