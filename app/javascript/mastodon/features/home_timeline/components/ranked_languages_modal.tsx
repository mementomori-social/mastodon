import { useCallback, useMemo } from 'react';

import { FormattedMessage, defineMessages, useIntl } from 'react-intl';

import { List as ImmutableList } from 'immutable';

import type { CSSObjectWithLabel } from 'react-select';
import { NonceProvider } from 'react-select';
import AsyncSelect from 'react-select/async';

import { changeSetting } from '@/mastodon/actions/settings';
import {
  clearTimeline,
  expandHomeTimeline,
} from '@/mastodon/actions/timelines';
import {
  ModalShell,
  ModalTitle,
} from '@/mastodon/components/modal_shell/redesign';
import { languages as preloadedLanguages } from '@/mastodon/initial_state';
import { useAppDispatch, useAppSelector } from '@/mastodon/store';

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

const RankedLanguagesModal: React.FC<{ onClose: () => void }> = ({
  onClose,
}) => {
  const intl = useIntl();
  const dispatch = useAppDispatch();
  const stored = useAppSelector((state) =>
    state.settings.getIn(['home', 'rankedLanguages']),
  );

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
    // A plain array right after a change, an Immutable List once rehydrated
    const codes = (
      ImmutableList.isList(stored)
        ? stored.toArray()
        : Array.isArray(stored)
          ? stored
          : []
    ) as string[];

    return codes.map(
      (code) =>
        languageOptions.find((option) => option.value === code) ?? {
          value: code,
          label: code,
        },
    );
  }, [stored, languageOptions]);

  const handleChange = useCallback(
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

  // Nothing is listed until you type, like the hashtag column settings
  const loadOptions = useCallback(
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

  const noOptionsMessage = useCallback(
    () => intl.formatMessage(messages.languageNoOptions),
    [intl],
  );

  return (
    <ModalShell maxWidth={480}>
      <ModalTitle onClose={onClose}>
        <FormattedMessage
          id='home.column_settings.ranked_languages'
          defaultMessage='Filter languages'
        />
      </ModalTitle>

      <div className='column-settings__hashtags'>
        <NonceProvider
          nonce={
            document.querySelector<HTMLMetaElement>('meta[name=style-nonce]')
              ?.content ?? ''
          }
          cacheKey='ranked-languages'
        >
          <AsyncSelect
            isMulti
            autoFocus
            value={selectedLanguages}
            onChange={handleChange}
            loadOptions={loadOptions}
            className='column-select__container'
            classNamePrefix='column-select'
            name='ranked-languages'
            placeholder={intl.formatMessage(messages.languagePlaceholder)}
            noOptionsMessage={noOptionsMessage}
            menuPortalTarget={document.body}
            classNames={{ menuPortal: () => 'column-settings__hashtags' }}
            styles={{
              menuPortal: (base): CSSObjectWithLabel =>
                Object.assign({}, base, { marginTop: 0, zIndex: 9999 }),
            }}
          />
        </NonceProvider>
      </div>
    </ModalShell>
  );
};

export default RankedLanguagesModal;
