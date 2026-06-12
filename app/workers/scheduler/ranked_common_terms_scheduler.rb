# frozen_string_literal: true

# Maintains the instance wide set of the most common words in recent posts,
# used by the ranked feed to ignore filler words without any hardcoded,
# language specific stopword lists: whatever languages an instance speaks,
# their most frequent words rise to the top of this sample and get excluded.
class Scheduler::RankedCommonTermsScheduler
  include Sidekiq::Worker
  include Redisable

  sidekiq_options retry: 0, lock: :until_executed, lock_ttl: 30.minutes.to_i

  SAMPLE_SIZE = 20_000
  BATCH_SIZE  = 2_000
  KEEP_TERMS  = 500

  def perform
    document_frequency = Hash.new(0)
    sampled            = 0
    max_id             = nil
    since_id           = Mastodon::Snowflake.id_at(7.days.ago, with_random: false)

    while sampled < SAMPLE_SIZE
      batch = Status.where(id: since_id..)
        .where(max_id ? ['statuses.id < ?', max_id] : '1=1')
        .reorder(id: :desc)
        .limit(BATCH_SIZE)
        .pluck(:id, :text, :local, :uri)

      break if batch.empty?

      batch.each do |_id, text, local, uri|
        InterestTerms.tokenize(text, local || uri.nil?).each { |term| document_frequency[term] += 1 }
      end

      sampled += batch.size
      max_id   = batch.last.first
    end

    common = document_frequency.sort_by { |_, count| -count }.take(KEEP_TERMS).map(&:first)

    return if common.empty?

    redis.multi do |transaction|
      transaction.del(InterestTerms::COMMON_TERMS_KEY)
      transaction.sadd(InterestTerms::COMMON_TERMS_KEY, common)
    end
  end
end
