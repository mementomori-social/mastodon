import React from 'react';
import PropTypes from 'prop-types';

export default class PreferenceSlider extends React.PureComponent {
  static propTypes = {
    label: PropTypes.string.isRequired,
    value: PropTypes.number.isRequired,
    onChange: PropTypes.func.isRequired,
  };

  render() {
    const { label, value, onChange } = this.props;

    return (
      <div className='setting-toggle'>
        <label className='setting-toggle__label'>
          {label}
        </label>
        <div className='setting-toggle__slider'>
          <input
            type='range'
            min='0'
            max='1'
            step='0.1'
            value={value}
            onChange={e => onChange(parseFloat(e.target.value))}
          />
          <span className='setting-toggle__value'>
            {(value * 100).toFixed(0)}%
          </span>
        </div>
      </div>
    );
  }
}
