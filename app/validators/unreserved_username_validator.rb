# frozen_string_literal: true

class UnreservedUsernameValidator < ActiveModel::Validator
  # Bot signups rotate IPs and email domains faster than either can be blocked,
  # so the username shape is the only durable signal. Comma-separated regexes.
  BLOCKED_PATTERNS = ENV.fetch('BLOCKED_USERNAME_PATTERNS', '').split(',').filter_map do |pattern|
    pattern = pattern.strip
    next if pattern.empty?

    begin
      Regexp.new(pattern, Regexp::IGNORECASE)
    rescue RegexpError => e
      Rails.logger.warn("Ignoring invalid BLOCKED_USERNAME_PATTERNS entry #{pattern.inspect}: #{e.message}")
      nil
    end
  end.freeze

  def validate(account)
    @username = account.username

    return if @username.blank?

    account.errors.add(:username, :reserved) if reserved_username?
  end

  private

  def reserved_username?
    pam_username_reserved? || settings_username_reserved? || pattern_reserved?
  end

  def pattern_reserved?
    BLOCKED_PATTERNS.any? { |pattern| pattern.match?(@username) }
  end

  def pam_username_reserved?
    pam_controlled? && pam_reserves_username?
  end

  def pam_controlled?
    Devise.pam_authentication && Devise.pam_controlled_service
  end

  def pam_reserves_username?
    Rpam2.account(Devise.pam_controlled_service, @username)
  end

  def settings_username_reserved?
    UsernameBlock.matches?(@username, allow_with_approval: false)
  end
end
