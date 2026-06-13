import { useEffect } from 'react';

import { FormattedMessage } from 'react-intl';

import { Link } from 'react-router-dom';

import { fetchStatus } from 'mastodon/actions/statuses';
import { Avatar } from 'mastodon/components/avatar';
import { DisplayName } from 'mastodon/components/display_name';
import { useAppDispatch, useAppSelector } from 'mastodon/store';

// Shows the parent post above a reply in the timeline (issue #25888), so a
// reply has context without opening the thread. Only the immediate ancestor
// is rendered; if it is itself a reply, a dashed link points to the rest of
// the thread. Lightweight and never renders its own ancestor, so it cannot
// recurse.
export const ReplyAncestor: React.FC<{ statusId: string }> = ({ statusId }) => {
  const dispatch = useAppDispatch();
  const ancestor = useAppSelector((state) => state.statuses.get(statusId));
  const accountId = ancestor?.get('account') as string | undefined;
  const account = useAppSelector((state) =>
    accountId ? state.accounts.get(accountId) : undefined,
  );

  useEffect(() => {
    if (!ancestor) {
      dispatch(fetchStatus(statusId, { alsoFetchContext: false }));
    }
  }, [dispatch, statusId, ancestor]);

  if (!ancestor || !account) {
    return null;
  }

  const acct = account.get('acct');
  const contentHtml = ancestor.get('contentHtml') as string;
  const hasParent = !!ancestor.get('in_reply_to_id');

  return (
    <div className='reply-ancestor'>
      {hasParent && (
        <Link to={`/@${acct}/${statusId}`} className='reply-ancestor__earlier'>
          <FormattedMessage
            id='status.show_earlier_in_thread'
            defaultMessage='Show earlier posts'
          />
        </Link>
      )}

      <Link to={`/@${acct}/${statusId}`} className='reply-ancestor__post'>
        <div className='reply-ancestor__header'>
          <Avatar account={account} size={20} />
          <DisplayName account={account} />
        </div>

        <div
          className='reply-ancestor__content translate'
          // Content is sanitized server side, same as StatusContent renders it
          dangerouslySetInnerHTML={{ __html: contentHtml }}
        />
      </Link>

      <div className='reply-ancestor__connector' />
    </div>
  );
};
