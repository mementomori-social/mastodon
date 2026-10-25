import { useCallback, useEffect } from 'react';

import { defineMessages, useIntl } from 'react-intl';

import { Link } from 'react-router-dom';

import { fetchAccount, followAccount } from 'mastodon/actions/accounts';
import { AccountBio } from 'mastodon/components/account_bio';
import { Avatar } from 'mastodon/components/avatar';
import { Button } from 'mastodon/components/button';
import { FollowersCounter } from 'mastodon/components/counters';
import { DisplayName } from 'mastodon/components/display_name';
import { LoadingIndicator } from 'mastodon/components/loading_indicator';
import {
  ModalShell,
  ModalTitle,
} from 'mastodon/components/modal_shell/redesign';
import { ShortNumber } from 'mastodon/components/short_number';
import { useAppDispatch, useAppSelector } from 'mastodon/store';

import type { BaseConfirmationModalProps } from './confirmation_modal';
import classes from './follow.module.scss';

const messages = defineMessages({
  follow: { id: 'account.follow', defaultMessage: 'Follow' },
  followRequest: {
    id: 'account.follow_request',
    defaultMessage: 'Request to follow',
  },
});

export const ConfirmFollowModal: React.FC<
  {
    accountId: string;
  } & BaseConfirmationModalProps
> = ({ accountId, onClose }) => {
  const intl = useIntl();
  const dispatch = useAppDispatch();
  const account = useAppSelector((state) => state.accounts.get(accountId));

  useEffect(() => {
    if (!account) {
      dispatch(fetchAccount(accountId));
    }
  }, [dispatch, accountId, account]);

  const handleFollow = useCallback(() => {
    onClose();
    dispatch(followAccount(accountId));
  }, [dispatch, accountId, onClose]);

  // Locked accounts approve followers by hand, so say it is a request
  const followLabel = account?.locked
    ? messages.followRequest
    : messages.follow;

  return (
    <ModalShell maxWidth={380} aria-label={intl.formatMessage(followLabel)}>
      {account ? (
        <>
          <ModalTitle onClose={onClose} noFocus>
            <Link
              to={`/@${account.acct}`}
              className={classes.names}
              onClick={onClose}
            >
              <Avatar account={account} size={64} />
              <DisplayName account={account} />
            </Link>
          </ModalTitle>

          <AccountBio accountId={account.id} className={classes.bio} />

          <div className={classes.numbers}>
            <ShortNumber
              value={account.followers_count}
              renderer={FollowersCounter}
            />
          </div>

          <Button variant='solid' color='accent' onClick={handleFollow}>
            {intl.formatMessage(followLabel)}
          </Button>
        </>
      ) : (
        <LoadingIndicator />
      )}
    </ModalShell>
  );
};
