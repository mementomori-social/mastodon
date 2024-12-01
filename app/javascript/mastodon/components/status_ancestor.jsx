import PropTypes from 'prop-types';
import { useEffect } from 'react';

import { FormattedMessage } from 'react-intl';

import { Link } from 'react-router-dom';

import { useSelector, useDispatch } from 'react-redux';

import { fetchStatus } from 'mastodon/actions/statuses';
import { Avatar } from 'mastodon/components/avatar';
import { DisplayName } from 'mastodon/components/display_name';
import { RelativeTimestamp } from 'mastodon/components/relative_timestamp';
import { StatusContent } from 'mastodon/components/status_content';
import { VisibilityIcon } from 'mastodon/components/visibility_icon';

export const StatusAncestor = ({ statusId }) => {
  const dispatch = useDispatch();
  const status = useSelector(state => state.getIn(['statuses', statusId]));
  const account = useSelector(state => state.getIn(['accounts', status?.get('account')]));
  const firstAncestorId = useSelector(state => state.getIn(['contexts', statusId, 'ancestors', 0]));
  const ancestorsCount = useSelector(state => state.getIn(['contexts', statusId, 'ancestors'])?.size || 0);
  const hasIntermediaryPosts = ancestorsCount > 1;

  useEffect(() => {
    if (statusId && !status) {
      dispatch(fetchStatus(statusId));
    }
    if (firstAncestorId && !status) {
      dispatch(fetchStatus(firstAncestorId));
    }
  }, [statusId, firstAncestorId, status, dispatch]);

  if (!status || !account) {
    return null;
  }

  const renderAncestorPost = (id, acc) => (
    <Link to={`/@${acc.get('acct')}/${id}`} className='status__ancestor__content'>
      <div className='status__ancestor__header'>
        <Avatar account={acc} size={24} className='status__ancestor__avatar' />
        <DisplayName account={acc} />
        <span className='status__ancestor__time'>
          <span className='status__visibility-icon'><VisibilityIcon visibility={status.get('visibility')} /></span>
          <RelativeTimestamp timestamp={status.get('created_at')} />
        </span>
      </div>

      <StatusContent
        status={status}
        className='status__ancestor__text'
        collapsed
      />
    </Link>
  );

  return (
    <div className='status__ancestor-wrapper'>
      {firstAncestorId && firstAncestorId !== statusId && (
        <div className='status__ancestor'>
          <div className='status__ancestor__line' />
          {renderAncestorPost(firstAncestorId, account)}
        </div>
      )}

      {hasIntermediaryPosts && (
        <div className='status__ancestor__more'>
          <div className='status__ancestor__line' />
          <Link to={`/@${account.get('acct')}/${statusId}`} className='status__ancestor__more-link'>
            <FormattedMessage id='status.show_more_replies' defaultMessage='Show more replies' />
          </Link>
        </div>
      )}

      <div className='status__ancestor'>
        <div className='status__ancestor__line' />
        {renderAncestorPost(statusId, account)}
      </div>
    </div>
  );
};

StatusAncestor.propTypes = {
  statusId: PropTypes.string.isRequired,
};
