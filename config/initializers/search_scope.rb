# frozen_string_literal: true

Rails.application.configure do
  # STATUS_SEARCH_SCOPE was previously known as SEARCH_SCOPE and only covered statuses.
  config.x.status_search_scope = case
  when (ENV['STATUS_SEARCH_SCOPE'] || ENV['SEARCH_SCOPE']) == 'discoverable'
    :discoverable
  when (ENV['STATUS_SEARCH_SCOPE'] || ENV['SEARCH_SCOPE']) == 'public'
    :public
  when (ENV['STATUS_SEARCH_SCOPE'] || ENV['SEARCH_SCOPE']) == 'public_or_unlisted'
    :public_or_unlisted
  else
    :classic
  end

  config.x.account_search_scope = case
  when ENV['ACCOUNT_SEARCH_SCOPE'] == 'all'
    :all
  when ENV['ACCOUNT_SEARCH_SCOPE'] == 'discoverable'
    :discoverable
  else
    :classic
  end
end
