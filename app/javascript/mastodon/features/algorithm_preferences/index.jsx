import PropTypes from 'prop-types';
import React from 'react';

import { defineMessages, injectIntl } from 'react-intl';

import { connect } from 'react-redux';

import Column from 'mastodon/components/column';
import { ColumnHeader } from 'mastodon/components/column_header';

import { updateAlgorithmPreferences } from '../../actions/algorithm_preferences';

import PreferenceSlider from './components/preference_slider';

const messages = defineMessages({
  title: { id: 'column.algorithm_preferences', defaultMessage: 'For You Feed Preferences' },
  save: { id: 'algorithm_preferences.save', defaultMessage: 'Save Changes' },
  boost_weight: { id: 'algorithm_preferences.boost_weight', defaultMessage: 'Boost Weight' },
  reply_weight: { id: 'algorithm_preferences.reply_weight', defaultMessage: 'Reply Weight' },
  media_weight: { id: 'algorithm_preferences.media_weight', defaultMessage: 'Media Weight' },
  favorite_weight: { id: 'algorithm_preferences.favorite_weight', defaultMessage: 'Favorite Weight' },
});

class AlgorithmPreferences extends React.PureComponent {
  static propTypes = {
    // eslint-disable-next-line no-undef
    intl: PropTypes.object.isRequired,
    // eslint-disable-next-line no-undef
    dispatch: PropTypes.func.isRequired,
    // eslint-disable-next-line no-undef
    preferences: PropTypes.object,
  };

  handleChange = (key, value) => {
    const { dispatch } = this.props;
    dispatch(updateAlgorithmPreferences({ [key]: value }));
  };

  handleBoostWeightChange = (value) => {
    this.handleChange('boost_weight', value);
  };

  handleReplyWeightChange = (value) => {
    this.handleChange('reply_weight', value);
  };

  handleMediaWeightChange = (value) => {
    this.handleChange('media_weight', value);
  };

  handleFavoriteWeightChange = (value) => {
    this.handleChange('favorite_weight', value);
  };

  render() {
    const { intl, preferences } = this.props;

    return (
      <Column>
        <ColumnHeader
          icon='sliders'
          title={intl.formatMessage(messages.title)}
        />
        <div className='scrollable'>
          <div className='column-settings'>
            <PreferenceSlider
              label={intl.formatMessage(messages.boost_weight)}
              value={preferences.get('boost_weight')}
              onChange={this.handleBoostWeightChange}
            />
            <PreferenceSlider
              label={intl.formatMessage(messages.reply_weight)}
              value={preferences.get('reply_weight')}
              onChange={this.handleReplyWeightChange}
            />
            <PreferenceSlider
              label={intl.formatMessage(messages.media_weight)}
              value={preferences.get('media_weight')}
              onChange={this.handleMediaWeightChange}
            />
            <PreferenceSlider
              label={intl.formatMessage(messages.favorite_weight)}
              value={preferences.get('favorite_weight')}
              onChange={this.handleFavoriteWeightChange}
            />
          </div>
        </div>
      </Column>
    );
  }
}

const mapStateToProps = state => ({
  preferences: state.getIn(['algorithm_preferences']),
});

export default connect(mapStateToProps)(injectIntl(AlgorithmPreferences));
