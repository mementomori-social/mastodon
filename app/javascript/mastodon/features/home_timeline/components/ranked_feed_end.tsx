import { useCallback } from 'react';

import { FormattedMessage } from 'react-intl';

import { changeSetting } from 'mastodon/actions/settings';
import { clearTimeline, expandHomeTimeline } from 'mastodon/actions/timelines';
import { Button } from 'mastodon/components/button';
import { isRankedDiscoverEnabled } from 'mastodon/selectors/settings';
import { useAppDispatch, useAppSelector } from 'mastodon/store';

export const RankedFeedEnd: React.FC = () => {
  const dispatch = useAppDispatch();
  const discoverEnabled = useAppSelector(isRankedDiscoverEnabled);

  const handleEnableDiscover = useCallback(() => {
    dispatch(changeSetting(['home', 'rankedDiscover'], true));
    dispatch(clearTimeline('home'));
    dispatch(expandHomeTimeline());
  }, [dispatch]);

  return (
    <div className='ranked-feed-end'>
      <FormattedMessage
        id='home.ranked_feed_end'
        defaultMessage="You're all caught up for now"
        tagName='p'
      />

      {!discoverEnabled && (
        <Button onClick={handleEnableDiscover}>
          <FormattedMessage
            id='home.ranked_feed_end.enable_discover'
            defaultMessage="Show posts from people you don't follow"
          />
        </Button>
      )}
    </div>
  );
};
