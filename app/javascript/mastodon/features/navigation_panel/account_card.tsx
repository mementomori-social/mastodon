import { FormattedMessage } from 'react-intl';

import { DotsThreeIcon } from '@phosphor-icons/react';

import { Avatar } from '@/mastodon/components/avatar';
import { IconButton } from '@/mastodon/components/button';
import { DisplayName } from '@/mastodon/components/display_name';
import { useAccountHandle } from '@/mastodon/components/display_name/default';
import { LockupLink, LockupWrapper } from '@/mastodon/components/lockup';
import { Menu, MenuList, MenuTrigger } from '@/mastodon/components/menu';
import { useAccount } from '@/mastodon/hooks/useAccount';
import { useIdentity } from '@/mastodon/identity_context';

import { AccountMenuItems } from './account_menu_items';
import classes from './account_menu_items.module.scss';

export const AccountCard: React.FC = () => {
  const { accountId } = useIdentity();
  const account = useAccount(accountId);
  const handle = useAccountHandle(account);

  if (!accountId) {
    return null;
  }

  return (
    <LockupWrapper
      icon={<Avatar account={account} size={32} />}
      sideContent={
        <Menu type='navigation'>
          <MenuTrigger
            as={IconButton}
            icon={DotsThreeIcon}
            size='sm'
            variant='ghost'
          >
            <FormattedMessage id='tabs_bar.account' defaultMessage='Account' />
          </MenuTrigger>
          <MenuList placement='top' offset={12} strategy='fixed' minWidth={220}>
            <AccountMenuItems />
          </MenuList>
        </Menu>
      }
      className={classes.root}
    >
      <LockupLink
        to={`/@${account?.acct}`}
        subtitle={<span className={classes.profileMenuSubtitle}>{handle}</span>}
        className={classes.accountLink}
      >
        <DisplayName variant='simple' account={account} />
      </LockupLink>
    </LockupWrapper>
  );
};
