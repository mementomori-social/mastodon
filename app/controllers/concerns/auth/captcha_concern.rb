# frozen_string_literal: true

module Auth::CaptchaConcern
  extend ActiveSupport::Concern

  include Hcaptcha::Adapters::ViewMethods

  CAPTCHA_DIRECTIVES = %w(
    connect_src
    frame_src
    script_src
    style_src
  ).freeze

  CAPTCHA_SOURCES_BY_PROVIDER = {
    'hcaptcha' => %w(
      https://*.hcaptcha.com
      https://hcaptcha.com
    ).freeze,
    'turnstile' => %w(
      https://challenges.cloudflare.com
    ).freeze,
  }.freeze

  TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'
  TURNSTILE_SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js'

  included do
    helper_method :render_captcha
    helper_method :captcha_provider
    helper_method :captcha_required?
  end

  def captcha_provider
    provider = Rails.configuration.x.captcha.provider.to_s.downcase
    provider == 'turnstile' ? 'turnstile' : 'hcaptcha'
  end

  def captcha_available?
    Rails.configuration.x.captcha.secret_key.present? && Rails.configuration.x.captcha.site_key.present?
  end

  def captcha_enabled?
    captcha_available? && Setting.captcha_enabled
  end

  def captcha_user_bypass?
    false
  end

  def captcha_required?
    captcha_enabled? && !captcha_user_bypass?
  end

  def check_captcha!
    return true unless captcha_required?

    if verify_captcha
      true
    else
      if block_given?
        message = consume_captcha_error
        yield message
      end

      false
    end
  end

  def extend_csp_for_captcha!
    return unless captcha_required? && request.content_security_policy.present?

    request.content_security_policy = captcha_adjusted_policy
  end

  def render_captcha
    return unless captcha_required?

    captcha_provider == 'turnstile' ? turnstile_tags : hcaptcha_tags
  end

  private

  def verify_captcha
    captcha_provider == 'turnstile' ? verify_turnstile : verify_hcaptcha
  end

  def verify_turnstile
    token = params['cf-turnstile-response'].presence
    return false if token.blank?

    response = HTTP.timeout(connect: 5, read: 5).post(
      TURNSTILE_VERIFY_URL,
      form: {
        secret: Rails.configuration.x.captcha.secret_key,
        response: token,
        remoteip: request.remote_ip,
      }
    )

    return false unless response.status.success?

    body = Oj.load(response.to_s, symbol_keys: true) || {}
    return true if body[:success]

    flash[:turnstile_error] = I18n.t('auth.captcha_confirmation.error_html', message: Array(body[:'error-codes']).join(', ').presence || I18n.t('auth.captcha_confirmation.error_unknown'))
    false
  rescue HTTP::Error, OpenSSL::SSL::SSLError, Oj::ParseError => e
    Rails.logger.warn("Turnstile verification failed: #{e.class} #{e.message}")
    flash[:turnstile_error] = I18n.t('auth.captcha_confirmation.error_unknown')
    false
  end

  def consume_captcha_error
    key = captcha_provider == 'turnstile' ? :turnstile_error : :hcaptcha_error
    message = flash[key]
    flash.delete(key)
    message
  end

  def captcha_adjusted_policy
    request.content_security_policy.clone.tap do |policy|
      populate_captcha_policy(policy)
    end
  end

  def populate_captcha_policy(policy)
    sources = CAPTCHA_SOURCES_BY_PROVIDER.fetch(captcha_provider, [])

    CAPTCHA_DIRECTIVES.each do |directive|
      values = policy.send(directive)

      sources.each do |source|
        values << source unless values.include?(source) || values.include?('https:')
      end

      policy.send(directive, *values)
    end
  end

  def turnstile_tags
    site_key = ERB::Util.html_escape(Rails.configuration.x.captcha.site_key.to_s)
    (
      %(<script src="#{TURNSTILE_SCRIPT_URL}" async defer></script>) +
      %(<div class="cf-turnstile" data-sitekey="#{site_key}"></div>)
    ).html_safe
  end
end
