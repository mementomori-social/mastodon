import { useCallback } from 'react';

import { useIntl, defineMessages } from 'react-intl';

import { useIdentity } from '@/mastodon/identity_context';
import AddIcon from '@/material-icons/400-24px/add.svg?react';
import { openModal } from 'mastodon/actions/modal';
import { Icon } from 'mastodon/components/icon';
import { me } from 'mastodon/initial_state';
import { useAppDispatch, useAppSelector } from 'mastodon/store';

const messages = defineMessages({
  follow: { id: 'account.follow', defaultMessage: 'Follow' },
});

export const AvatarFollowBadge: React.FC<{ accountId?: string }> = ({
  accountId,
}) => {
  const intl = useIntl();
  const dispatch = useAppDispatch();
  const { signedIn } = useIdentity();
  const relationship = useAppSelector((state) =>
    accountId ? state.relationships.get(accountId) : undefined,
  );

  const handleClick = useCallback(
    (event: React.MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();

      if (accountId) {
        dispatch(
          openModal({
            modalType: 'CONFIRM_FOLLOW',
            modalProps: { accountId },
          }),
        );
      }
    },
    [dispatch, accountId],
  );

  if (
    !signedIn ||
    !accountId ||
    accountId === me ||
    !relationship ||
    relationship.following ||
    relationship.requested ||
    relationship.blocking ||
    relationship.blocked_by
  ) {
    return null;
  }

  return (
    <button
      type='button'
      className='avatar-follow-badge'
      title={intl.formatMessage(messages.follow)}
      aria-label={intl.formatMessage(messages.follow)}
      onClick={handleClick}
    >
      <Icon id='' icon={AddIcon} />
    </button>
  );
};
