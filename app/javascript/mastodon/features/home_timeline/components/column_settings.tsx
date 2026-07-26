/* eslint-disable @typescript-eslint/no-unsafe-call,
                  @typescript-eslint/no-unsafe-return,
                  @typescript-eslint/no-unsafe-assignment,
                  @typescript-eslint/no-unsafe-member-access
                  -- the settings store is not yet typed */
import { useCallback, useMemo } from 'react';

import { FormattedMessage, defineMessages, useIntl } from 'react-intl';

import type { CSSObjectWithLabel } from 'react-select';
import { NonceProvider } from 'react-select';
import AsyncSelect from 'react-select/async';

import { languages as preloadedLanguages } from 'mastodon/initial_state';
import { useAppSelector, useAppDispatch } from 'mastodon/store';

import { changeSetting } from '../../../actions/settings';
import { clearTimeline, expandHomeTimeline } from '../../../actions/timelines';
import SettingToggle from '../../notifications/components/setting_toggle';

const messages = defineMessages({
  languagePlaceholder: {
    id: 'home.column_settings.ranked_languages.placeholder',
    defaultMessage: 'Enter languages…',
  },
  languageNoOptions: {
    id: 'home.column_settings.ranked_languages.no_options_message',
    defaultMessage: 'No languages found',
  },
});

interface LanguageOption {
  value: string;
  label: string;
}

export const ColumnSettings: React.FC = () => {
  const settings = useAppSelector((state) => state.settings.get('home'));
  const intl = useIntl();

  const dispatch = useAppDispatch();
  const onChange = useCallback(
    (key: string[], checked: boolean) => {
      dispatch(changeSetting(['home', ...key], checked));
    },
    [dispatch],
  );

  const onRankedChange = useCallback(
    (key: string[], checked: boolean) => {
      dispatch(changeSetting(['home', ...key], checked));
      dispatch(clearTimeline('home'));
      dispatch(expandHomeTimeline({ forceRefresh: true }));
    },
    [dispatch],
  );

  const rankedEnabled = Boolean(settings.get('ranked'));

  const languageOptions = useMemo<LanguageOption[]>(
    () =>
      (preloadedLanguages ?? []).map(([code, localizedName, englishName]) => ({
        value: code,
        label:
          localizedName === englishName
            ? localizedName
            : `${localizedName} (${englishName})`,
      })),
    [],
  );

  const selectedLanguages = useMemo<LanguageOption[]>(() => {
    const stored = settings.get('rankedLanguages');
    // The setting is a plain array right after a change, and an Immutable List
    // once it has been rehydrated from the saved web settings
    const codes = (stored?.toJS ? stored.toJS() : (stored ?? [])) as string[];

    return codes.map(
      (code) =>
        languageOptions.find((option) => option.value === code) ?? {
          value: code,
          label: code,
        },
    );
  }, [settings, languageOptions]);

  const onLanguagesChange = useCallback(
    (value: readonly LanguageOption[]) => {
      dispatch(
        changeSetting(
          ['home', 'rankedLanguages'],
          value.map((option) => option.value),
        ),
      );
      dispatch(clearTimeline('home'));
      dispatch(expandHomeTimeline({ forceRefresh: true }));
    },
    [dispatch],
  );

  // Same type-to-autocomplete behaviour as the hashtag column settings: nothing
  // is listed until you type. The whole language list is already in the page,
  // so this filters locally instead of hitting the API.
  const loadLanguageOptions = useCallback(
    (input: string) => {
      const query = input.trim().toLowerCase();

      if (!query) {
        return Promise.resolve([]);
      }

      return Promise.resolve(
        languageOptions
          .filter(
            (option) =>
              option.label.toLowerCase().includes(query) ||
              option.value.toLowerCase().startsWith(query),
          )
          .slice(0, 20),
      );
    },
    [languageOptions],
  );

  const noLanguageOptionsMessage = useCallback(
    () => intl.formatMessage(messages.languageNoOptions),
    [intl],
  );

  return (
    <div className='column-settings'>
      <section>
        <div className='column-settings__row'>
          {/* The display filters only apply to the chronological feed; the
              ranked feed surfaces boosted posts directly so they cannot be
              filtered client side */}
          {!rankedEnabled && (
            <>
              <SettingToggle
                prefix='home_timeline'
                settings={settings}
                settingPath={['shows', 'reblog']}
                onChange={onChange}
                label={
                  <FormattedMessage
                    id='home.column_settings.show_reblogs'
                    defaultMessage='Show boosts'
                  />
                }
              />

              <SettingToggle
                prefix='home_timeline'
                settings={settings}
                settingPath={['shows', 'quote']}
                onChange={onChange}
                label={
                  <FormattedMessage
                    id='home.column_settings.show_quotes'
                    defaultMessage='Show quotes'
                  />
                }
              />

              <SettingToggle
                prefix='home_timeline'
                settings={settings}
                settingPath={['shows', 'reply']}
                onChange={onChange}
                label={
                  <FormattedMessage
                    id='home.column_settings.show_replies'
                    defaultMessage='Show replies'
                  />
                }
              />
            </>
          )}

          <SettingToggle
            prefix='home_timeline'
            settings={settings}
            settingPath={['ranked']}
            onChange={onRankedChange}
            label={
              <FormattedMessage
                id='home.column_settings.ranked'
                defaultMessage='Ranked order (experimental)'
              />
            }
          />

          {rankedEnabled && (
            <SettingToggle
              prefix='home_timeline'
              settings={settings}
              settingPath={['rankedDiscover']}
              onChange={onRankedChange}
              label={
                <FormattedMessage
                  id='home.column_settings.ranked_discover'
                  defaultMessage="Include posts from people you don't follow (experimental)"
                />
              }
            />
          )}
        </div>

        {/* The .column-settings__hashtags wrapper is what carries every
            .column-select style in the theme, so the select has to sit inside
            it exactly like the hashtag column settings do, or it renders as an
            unstyled white box */}
        {rankedEnabled && (
          <div className='column-settings__hashtags'>
            <div className='column-settings__row'>
              <span className='column-settings__section'>
                <FormattedMessage
                  id='home.column_settings.ranked_languages'
                  defaultMessage='Show only these languages'
                />
              </span>

              <NonceProvider
                nonce={
                  document.querySelector<HTMLMetaElement>(
                    'meta[name=style-nonce]',
                  )?.content ?? ''
                }
                cacheKey='ranked-languages'
              >
                <AsyncSelect
                  isMulti
                  value={selectedLanguages}
                  onChange={onLanguagesChange}
                  loadOptions={loadLanguageOptions}
                  className='column-select__container'
                  classNamePrefix='column-select'
                  name='ranked-languages'
                  placeholder={intl.formatMessage(messages.languagePlaceholder)}
                  noOptionsMessage={noLanguageOptionsMessage}
                  // The column settings panel is a max-height scroll container,
                  // so a menu rendered inside it gets clipped. Portal it to the
                  // body and carry the .column-settings__hashtags class along,
                  // which is what the themed .column-select rules are scoped
                  // to, so the menu escapes the clipping without needing any
                  // styles of its own.
                  menuPortalTarget={document.body}
                  classNames={{ menuPortal: () => 'column-settings__hashtags' }}
                  styles={{
                    // That wrapper carries a top margin meant for the inline
                    // layout, which would offset a portalled menu from its input
                    menuPortal: (base): CSSObjectWithLabel =>
                      Object.assign({}, base, { marginTop: 0, zIndex: 9999 }),
                  }}
                />
              </NonceProvider>
            </div>
          </div>
        )}
      </section>
    </div>
  );
};
