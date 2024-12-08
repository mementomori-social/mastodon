# frozen_string_literal: true

class AlgorithmPreference < ApplicationRecord
  belongs_to :account

  validates :boost_weight, numericality: { greater_than_or_equal_to: 0, less_than_or_equal_to: 1 }
  validates :reply_weight, numericality: { greater_than_or_equal_to: 0, less_than_or_equal_to: 1 }
  validates :media_weight, numericality: { greater_than_or_equal_to: 0, less_than_or_equal_to: 1 }
  validates :favorite_weight, numericality: { greater_than_or_equal_to: 0, less_than_or_equal_to: 1 }
end
