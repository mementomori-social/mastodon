import { useCallback } from 'react';

import { FormattedMessage } from 'react-intl';

import type { Map as ImmutableMap } from 'immutable';

import { SlidersHorizontalIcon } from '@phosphor-icons/react';

import { openModal } from '@/mastodon/actions/modal';
import { ColumnSettingsMenu } from '@/mastodon/components/column_header';
import {
  MenuItem,
  MenuItemCheckbox,
  MenuItemDivider,
} from '@/mastodon/components/menu';
import type { MenuItemCheckboxChangeHandler } from '@/mastodon/components/menu/items';
import { useAppSelector, useAppDispatch } from 'mastodon/store';

import { changeSetting } from '../../../actions/settings';
import { clearTimeline, expandHomeTimeline } from '../../../actions/timelines';

export const HomeColumnSettings: React.FC<{
  children?: React.ReactNode;
}> = ({ children }) => {
  const dispatch = useAppDispatch();

  const settings = useAppSelector((state) =>
    state.settings.get('home'),
  ) as ImmutableMap<string, unknown>;
  const onChange = useCallback<MenuItemCheckboxChangeHandler>(
    ({ value, checked }) => {
      dispatch(changeSetting(['home', 'shows', value], checked));
    },
    [dispatch],
  );

  const onRankedChange = useCallback<MenuItemCheckboxChangeHandler>(
    ({ value, checked }) => {
      dispatch(changeSetting(['home', value], checked));
      dispatch(clearTimeline('home'));
      void dispatch(expandHomeTimeline({ forceRefresh: true }));
    },
    [dispatch],
  );
  const onLanguagesClick = useCallback(() => {
    dispatch(openModal({ modalType: 'RANKED_LANGUAGES', modalProps: {} }));
  }, [dispatch]);

  const ranked = !!settings.get('ranked');
  const rankedDiscover = !!settings.get('rankedDiscover');
  const showBoosts = settings.getIn(['shows', 'reblog']) as boolean;
  const showQuotes = settings.getIn(['shows', 'quote']) as boolean;
  const showReplies = settings.getIn(['shows', 'reply']) as boolean;

  return (
    <ColumnSettingsMenu
      icon={SlidersHorizontalIcon}
      label={
        <FormattedMessage
          id='column.home_settings'
          defaultMessage='Home Settings'
        />
      }
    >
      {/* The ranked feed surfaces boosted posts directly, so these display
          filters only apply to the chronological feed */}
      {!ranked && (
        <>
          <MenuItemCheckbox
            value='reblog'
            checked={showBoosts}
            onChange={onChange}
            keepMenuOpenOnClick
          >
            <FormattedMessage
              id='home.column_settings.show_reblogs'
              defaultMessage='Show boosts'
            />
          </MenuItemCheckbox>
          <MenuItemCheckbox
            value='quote'
            checked={showQuotes}
            onChange={onChange}
            keepMenuOpenOnClick
          >
            <FormattedMessage
              id='home.column_settings.show_quotes'
              defaultMessage='Show quotes'
            />
          </MenuItemCheckbox>
          <MenuItemCheckbox
            value='reply'
            checked={showReplies}
            onChange={onChange}
            keepMenuOpenOnClick
          >
            <FormattedMessage
              id='home.column_settings.show_replies'
              defaultMessage='Show replies'
            />
          </MenuItemCheckbox>
        </>
      )}
      {!ranked && <MenuItemDivider />}
      <MenuItemCheckbox
        value='ranked'
        checked={ranked}
        onChange={onRankedChange}
        keepMenuOpenOnClick
      >
        <FormattedMessage
          id='home.column_settings.ranked'
          defaultMessage='For you feed (experimental)'
        />
      </MenuItemCheckbox>
      {ranked && (
        <>
          <MenuItemCheckbox
            value='rankedDiscover'
            checked={rankedDiscover}
            onChange={onRankedChange}
            keepMenuOpenOnClick
          >
            <FormattedMessage
              id='home.column_settings.ranked_discover'
              defaultMessage="Include posts from people you don't follow (experimental)"
            />
          </MenuItemCheckbox>
          <MenuItem onClick={onLanguagesClick}>
            <FormattedMessage
              id='home.column_settings.ranked_languages'
              defaultMessage='Filter languages'
            />
          </MenuItem>
        </>
      )}
      {children}
    </ColumnSettingsMenu>
  );
};
