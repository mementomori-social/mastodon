import { FormattedMessage } from 'react-intl';

import classNames from 'classnames';

import { useOverflowButton } from '@/mastodon/hooks/useOverflow';
import { useToggle } from '@/mastodon/hooks/useToggle';
import { directHashtagLinks } from '@/mastodon/initial_state';

import { Button } from '../button';
import { HashtagMenu } from '../hashtag_menu';
import { MenuTrigger } from '../menu';

import classes from './styles.module.scss';

export const StatusHashtagBar: React.FC<{
  hashtags: string[];
  accountId: string;
}> = ({ hashtags, accountId }) => {
  const [showOverflow, { onTrue: onShowOverflow }] = useToggle();
  const { hiddenCount, wrapperRef, listRef, hiddenIndex, maxWidth } =
    useOverflowButton();

  if (hashtags.length === 0) {
    return null;
  }

  return (
    <div className={classes.hashtagsWrapper} ref={wrapperRef}>
      <div
        className={classNames(
          classes.hashtags,
          showOverflow && classes.hashtagsShowAll,
        )}
        ref={listRef}
        style={{ maxWidth }}
      >
        {hashtags.map((hashtag, index) => {
          const inert = hiddenIndex > 0 && index >= hiddenIndex;

          if (directHashtagLinks) {
            return (
              <Button
                as='link'
                size='xs'
                to={`/tags/${encodeURIComponent(hashtag)}`}
                inert={inert}
                key={hashtag}
              >
                #{hashtag}
              </Button>
            );
          }

          return (
            <HashtagMenu tagId={hashtag} accountId={accountId} key={hashtag}>
              <MenuTrigger size='xs' inert={inert}>
                #{hashtag}
              </MenuTrigger>
            </HashtagMenu>
          );
        })}
      </div>
      {hiddenCount > 0 && !showOverflow && (
        <Button size='xs' onClick={onShowOverflow}>
          <FormattedMessage
            id='featured_tags.more_items'
            defaultMessage='+{count}'
            values={{ count: hiddenCount }}
          />
        </Button>
      )}
    </div>
  );
};
