import { useEffect } from 'react';

import { FormattedMessage } from 'react-intl';

import { Link } from 'react-router-dom';

import type { List as ImmutableList, Map as ImmutableMap } from 'immutable';

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
    <section className={classes.root}>
      <h2 className={classes.heading}>
        <Link to='/explore/tags'>
          <FormattedMessage
            id='trends.trending_now'
            defaultMessage='Trending now'
          />
        </Link>
      </h2>

      {tags.take(VISIBLE_TAGS).map((tag) => (
        <Hashtag key={tag.get('name') as string} hashtag={tag} />
      ))}
    </section>
  );
};
