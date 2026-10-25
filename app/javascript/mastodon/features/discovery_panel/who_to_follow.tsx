import { useEffect } from 'react';

import { FormattedMessage } from 'react-intl';

import { ListSection } from '@/mastodon/features/navigation_panel/redesign/list_section';
import { NavigationLink } from '@/mastodon/features/navigation_panel/redesign/navigation_link';
import { fetchSuggestions } from 'mastodon/actions/suggestions';
import { Avatar } from 'mastodon/components/avatar';
import { useAccountHandle } from 'mastodon/components/display_name/default';
import { DisplayNameSimple } from 'mastodon/components/display_name/simple';
import { FollowButton } from 'mastodon/components/follow_button';
import { LockupLink, LockupWrapper } from 'mastodon/components/lockup';
import { useAccount } from 'mastodon/hooks/useAccount';
import { domain } from 'mastodon/initial_state';
import { useAppDispatch, useAppSelector } from 'mastodon/store';

import classes from './panel.module.scss';

const VISIBLE_SUGGESTIONS = 3;
const REFERENCE = 'sidebar_suggestions';

const SuggestedAccount: React.FC<{ accountId: string }> = ({ accountId }) => {
  const account = useAccount(accountId);
  const handle = useAccountHandle(account, domain);

  if (!account) {
    return null;
  }

  return (
    <li>
      <LockupWrapper
        className={classes.item}
        icon={<Avatar account={account} size={40} />}
        sideContent={
          <FollowButton
            accountId={accountId}
            labelLength='short'
            reference={REFERENCE}
          />
        }
      >
        <LockupLink
          to={{
            pathname: `/@${account.acct}`,
            state: { reference: REFERENCE },
          }}
          data-hover-card-account={accountId}
          data-hover-card-reference={REFERENCE}
          subtitle={handle}
        >
          <DisplayNameSimple account={account} />
        </LockupLink>
      </LockupWrapper>
    </li>
  );
};

export const WhoToFollow: React.FC = () => {
  const dispatch = useAppDispatch();
  const suggestions = useAppSelector((state) => state.suggestions.items);

  useEffect(() => {
    void dispatch(fetchSuggestions());
  }, [dispatch]);

  if (suggestions.length === 0) {
    return null;
  }

  return (
    <ul className={classes.root}>
      <ListSection
        id='who-to-follow'
        title={
          <FormattedMessage
            id='follow_suggestions.who_to_follow'
            defaultMessage='Who to follow'
          />
        }
      >
        {suggestions.slice(0, VISIBLE_SUGGESTIONS).map((suggestion) => (
          <SuggestedAccount
            key={suggestion.account_id}
            accountId={suggestion.account_id}
          />
        ))}
        <NavigationLink key='view-all' to='/explore/suggestions'>
          <FormattedMessage
            id='follow_suggestions.view_all'
            defaultMessage='View all'
          />
        </NavigationLink>
      </ListSection>
    </ul>
  );
};
