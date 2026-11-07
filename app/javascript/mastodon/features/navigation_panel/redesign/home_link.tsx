import { useCallback } from 'react';

import { FormattedMessage } from 'react-intl';

import { HouseIcon, MagicWandIcon } from '@phosphor-icons/react';

import { expandHomeTimeline } from '@/mastodon/actions/timelines';
import { isRankedHomeEnabled } from '@/mastodon/selectors/settings';
import { useAppDispatch, useAppSelector } from '@/mastodon/store';

/**
 * The home link reads "For you" while the ranked feed is on, and clicking it
 * re-ranks the feed with fresh posts.
 */
export const useHomeLink = () => {
  const dispatch = useAppDispatch();
  const ranked = useAppSelector(isRankedHomeEnabled);

  const onClick = useCallback(() => {
    if (ranked) {
      void dispatch(expandHomeTimeline({ forceRefresh: true }));
    }
  }, [dispatch, ranked]);

  return {
    iconComponent: ranked ? MagicWandIcon : HouseIcon,
    label: ranked ? (
      <FormattedMessage id='column.for_you' defaultMessage='For you' />
    ) : (
      <FormattedMessage id='tabs_bar.home' defaultMessage='Home' />
    ),
    onClick,
  };
};
