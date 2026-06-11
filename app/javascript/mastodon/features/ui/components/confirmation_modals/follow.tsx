import { useCallback, useEffect } from 'react';

import { defineMessages, FormattedMessage, useIntl } from 'react-intl';

import { Link } from 'react-router-dom';

import { fetchAccount, followAccount } from 'mastodon/actions/accounts';
import { AccountBio } from 'mastodon/components/account_bio';
import { Avatar } from 'mastodon/components/avatar';
import { FollowersCounter } from 'mastodon/components/counters';
import { DisplayName } from 'mastodon/components/display_name';
import { ShortNumber } from 'mastodon/components/short_number';
import { domain } from 'mastodon/initial_state';
import { useAppDispatch, useAppSelector } from 'mastodon/store';

import type { BaseConfirmationModalProps } from './confirmation_modal';
import { ConfirmationModal } from './confirmation_modal';

const messages = defineMessages({
  followConfirm: {
    id: 'account.follow',
    defaultMessage: 'Follow',
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

  const onConfirm = useCallback(() => {
    dispatch(followAccount(accountId));
  }, [dispatch, accountId]);

  return (
    <ConfirmationModal
      title={
        <FormattedMessage
          id='confirmations.follow.title'
          defaultMessage='Follow {name}?'
          values={{ name: `@${account?.acct}` }}
        />
      }
      confirm={intl.formatMessage(messages.followConfirm)}
      onConfirm={onConfirm}
      onClose={onClose}
    >
      {account && (
        <div className='follow-confirmation-card'>
          <Link
            to={`/@${account.acct}`}
            className='follow-confirmation-card__name'
            onClick={onClose}
          >
            <Avatar account={account} size={64} />
            <DisplayName account={account} localDomain={domain} />
          </Link>

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
        </div>
      )}
    </ConfirmationModal>
  );
};
