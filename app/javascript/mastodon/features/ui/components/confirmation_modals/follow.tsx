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
import { ModalShell, ModalShellBody } from 'mastodon/components/modal_shell';
import { ShortNumber } from 'mastodon/components/short_number';
import { domain } from 'mastodon/initial_state';
import { useAppDispatch, useAppSelector } from 'mastodon/store';

import type { BaseConfirmationModalProps } from './confirmation_modal';

const messages = defineMessages({
  follow: { id: 'account.follow', defaultMessage: 'Follow' },
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

  const handleSubmit = useCallback(
    (event: React.FormEvent) => {
      event.preventDefault();
      onClose();
      dispatch(followAccount(accountId));
    },
    [dispatch, accountId, onClose],
  );

  return (
    <ModalShell
      className='follow-confirmation-modal'
      onSubmit={handleSubmit}
      aria-label={intl.formatMessage(messages.follow)}
    >
      <ModalShellBody className='follow-confirmation-card'>
        {account ? (
          <>
            <div className='follow-confirmation-card__header'>
              <Link
                to={`/@${account.acct}`}
                className='follow-confirmation-card__names'
                onClick={onClose}
              >
                <DisplayName account={account} localDomain={domain} />
              </Link>

              <Avatar account={account} size={64} />
            </div>

            <AccountBio
              accountId={account.id}
              className='follow-confirmation-card__bio'
            />

            <div className='follow-confirmation-card__numbers'>
              <ShortNumber
                value={account.followers_count}
                renderer={FollowersCounter}
              />
            </div>

            <Button
              type='submit'
              className='follow-confirmation-card__button'
              onClick={handleSubmit}
            >
              {intl.formatMessage(messages.follow)}
            </Button>
          </>
        ) : (
          <LoadingIndicator />
        )}
      </ModalShellBody>
    </ModalShell>
  );
};
