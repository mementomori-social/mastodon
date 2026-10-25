import { useCallback } from 'react';

import { FormattedMessage } from 'react-intl';

import { changeSetting } from 'mastodon/actions/settings';
import { clearTimeline, expandHomeTimeline } from 'mastodon/actions/timelines';
import { Button } from 'mastodon/components/button';
import { isRankedDiscoverEnabled } from 'mastodon/selectors/settings';
import { useAppDispatch, useAppSelector } from 'mastodon/store';

import classes from './ranked_feed_end.module.scss';

export const RankedFeedEnd: React.FC = () => {
  const dispatch = useAppDispatch();
  const discoverEnabled = useAppSelector(isRankedDiscoverEnabled);

  const handleEnableDiscover = useCallback(() => {
    dispatch(changeSetting(['home', 'rankedDiscover'], true));
    dispatch(clearTimeline('home'));
    void dispatch(expandHomeTimeline({ forceRefresh: true }));
  }, [dispatch]);

  return (
    <div className={classes.root}>
      <FormattedMessage
        id='home.ranked_feed_end'
        defaultMessage="You're all caught up for now"
        tagName='p'
      />

      {!discoverEnabled && (
        <Button variant='solid' onClick={handleEnableDiscover}>
          <FormattedMessage
            id='home.ranked_feed_end.enable_discover'
            defaultMessage="Show posts from people you don't follow"
          />
        </Button>
      )}
    </div>
  );
};
