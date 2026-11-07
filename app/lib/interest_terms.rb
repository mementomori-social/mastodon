# frozen_string_literal: true

# Tokenizes status text into interest terms for the ranked feed, with no
# language specific assumptions: any script, no stopword lists. Common words
# are filtered against an instance wide set maintained from a sample of
# recent posts, so every language self-calibrates from local usage.
class InterestTerms
  # Unicode letters and marks, at least 3 characters, allowing digits,
  # apostrophes and hyphens inside a word
  TOKEN_PATTERN = /[\p{L}\p{M}][\p{L}\p{M}\p{N}'-]{2,}/

  # Cap per post so a single long post cannot flood a profile
  MAX_TERMS_PER_STATUS = 50

  COMMON_TERMS_KEY = 'ranked_home_feed:common_terms'

  class << self
    def tokenize(text, local)
      return [] if text.blank?

      PlainTextFormatter.new(text, local)
        .to_s
        .downcase
        .scan(TOKEN_PATTERN)
        .uniq
        .take(MAX_TERMS_PER_STATUS)
    end
  end
end
