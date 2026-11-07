import { useRouteMatch } from 'react-router';

import { Search } from '@/mastodon/components/search';
import { useIdentity } from '@/mastodon/identity_context';
import { includeMultiColumnPaths } from '@/mastodon/utils/react_router';

import { FooterLinks } from './footer_links';
import classes from './styles.module.scss';
import { TrendingTags } from './trending_tags';
import { WhoToFollow } from './who_to_follow';

/**
 * Don't display the search on editing flows and the search page,
 * which has its own search field.
 */
const ROUTES_WITHOUT_SEARCH_BAR = includeMultiColumnPaths([
  '/search',
  '/start',
  '/start/profile',
  '/profile/edit',
  '/lists/new',
  '/lists/:id/edit',
  '/collections/new',
  '/collections/:id/edit',
  '/collections/:id/edit/details',
]);

/**
 * Editing flows keep the sidebar quiet; everywhere else shows trends and
 * suggestions.
 */
const ROUTES_WITHOUT_DISCOVERY = includeMultiColumnPaths([
  '/start',
  '/start/profile',
  '/profile/edit',
  '/lists/new',
  '/lists/:id/edit',
  '/collections/new',
  '/collections/:id/edit',
  '/collections/:id/edit/details',
]);

export const DiscoveryPanel: React.FC = () => {
  const { signedIn } = useIdentity();

  const isRouteWithSearchBar = !useRouteMatch({
    path: ROUTES_WITHOUT_SEARCH_BAR,
    exact: true,
  });
  const isRouteWithDiscovery = !useRouteMatch({
    path: ROUTES_WITHOUT_DISCOVERY,
    exact: true,
  });

  return (
    <div className={classes.root}>
      {isRouteWithSearchBar && <Search singleColumn context='sidebar' />}

      {isRouteWithDiscovery && <TrendingTags />}
      {signedIn && isRouteWithDiscovery && <WhoToFollow />}

      <footer className={classes.footer}>
        <FooterLinks context='search' />
      </footer>
    </div>
  );
};
