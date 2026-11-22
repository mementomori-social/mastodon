# frozen_string_literal: true

require 'rails_helper'

RSpec.describe 'Settings preferences other page' do
  let(:user) { Fabricate :user }

  before { sign_in user }

  it 'Views and updates user prefs' do
    visit settings_preferences_other_path

    expect(page)
      .to have_private_cache_control

    within('.user_chosen_languages') do
      check language_field(:es)
      check language_field(:fr)
    end

    within('.user_settings_web\\.hide_translate_languages') do
      check language_field(:fi)
      check language_field(:sv)
    end

    expect { save_changes }
      .to change { user.reload.chosen_languages }.to(%w(es fr))
      .and change { user.reload.settings['web.hide_translate_languages'] }.from([]).to(%w(fi sv))
    expect(page)
      .to have_title(I18n.t('settings.preferences'))
  end

  def save_changes
    within('form') { click_on submit_button }
  end

  def language_field(key)
    LanguagesHelper::SUPPORTED_LOCALES[key].last
  end
end
