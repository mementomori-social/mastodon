# frozen_string_literal: true

require 'rails_helper'

RSpec.describe Scheduler::RankedCommonTermsScheduler do
  subject { described_class.new }

  describe '#perform' do
    before do
      5.times { |i| Fabricate(:status, text: "yhteinen sana numero#{i}") }
    end

    it 'stores the most common recent words for any language' do
      subject.perform

      common = subject.send(:redis).smembers(InterestTerms::COMMON_TERMS_KEY)

      expect(common).to include('yhteinen', 'sana')
    end

    it 'ignores private posts when sampling' do
      Fabricate(:status, text: 'salainensanayksilollinen', visibility: :private)

      subject.perform

      common = subject.send(:redis).smembers(InterestTerms::COMMON_TERMS_KEY)

      expect(common).to_not include('salainensanayksilollinen')
    end
  end
end
