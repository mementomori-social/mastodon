import { useEffect } from 'react';

import { FormattedMessage } from 'react-intl';

import type { List as ImmutableList, Map as ImmutableMap } from 'immutable';

import { ListSection } from '@/mastodon/features/navigation_panel/redesign/list_section';
import { NavigationLink } from '@/mastodon/features/navigation_panel/redesign/navigation_link';
import { fetchTrendingHashtags } from 'mastodon/actions/trends';
import { ImmutableHashtag as Hashtag } from 'mastodon/components/hashtag';
import { showTrends } from 'mastodon/initial_state';
import { useAppDispatch, useAppSelector } from 'mastodon/store';

import classes from './panel.module.scss';

const VISIBLE_TAGS = 4;
const REFRESH_INTERVAL_MS = 15 * 60 * 1000;

export const TrendingTags: React.FC = () => {
  const dispatch = useAppDispatch();
  const tags = useAppSelector(
    (state) =>
      state.trends.getIn(['tags', 'items']) as ImmutableList<
        ImmutableMap<string, unknown>
      >,
  );

  useEffect(() => {
    if (!showTrends) {
      return;
    }

    dispatch(fetchTrendingHashtags());

    const refreshInterval = setInterval(() => {
      dispatch(fetchTrendingHashtags());
    }, REFRESH_INTERVAL_MS);

    return () => {
      clearInterval(refreshInterval);
    };
  }, [dispatch]);

  if (!showTrends || tags.isEmpty()) {
    return null;
  }

  return (
    <ul className={classes.root}>
      <ListSection
        id='trending-hashtags'
        title={
          <FormattedMessage
            id='trends.trending_now'
            defaultMessage='Trending now'
          />
        }
      >
        {tags.take(VISIBLE_TAGS).map((tag) => (
          <li key={tag.get('name') as string} className={classes.tag}>
            <Hashtag hashtag={tag} />
          </li>
        ))}
        <NavigationLink key='view-all' to='/explore/tags'>
          <span className={classes.more}>
            <FormattedMessage
              id='tabs_bar.followed_tags_view_all'
              defaultMessage='View all'
            />
          </span>
        </NavigationLink>
      </ListSection>
    </ul>
  );
};
