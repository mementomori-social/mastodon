import { useCallback } from 'react';

import { useIntl, defineMessages } from 'react-intl';

import { PlusIcon } from '@phosphor-icons/react';

import { useIdentity } from '@/mastodon/identity_context';
import { openModal } from 'mastodon/actions/modal';
import { me, showFollowBadges } from 'mastodon/initial_state';
import { useAppDispatch, useAppSelector } from 'mastodon/store';

import classes from './avatar_follow_badge.module.scss';

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
    !showFollowBadges ||
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
      className={classes.badge}
      title={intl.formatMessage(messages.follow)}
      aria-label={intl.formatMessage(messages.follow)}
      onClick={handleClick}
    >
      <PlusIcon weight='bold' aria-hidden />
    </button>
  );
};
