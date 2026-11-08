import { useCallback, useState } from 'react';

import { FormattedMessage } from 'react-intl';

import classNames from 'classnames';

import { CaretRightIcon } from '@phosphor-icons/react';

import { useResizeObserver } from '@/mastodon/hooks/useObserver';
import type {
  ExpandedStatusShape,
  StatusShape,
} from '@/mastodon/models/status';

import { Button } from '../button';
import { EmojiHTML } from '../emoji/html';

import classes from './content.module.scss';
import { useHandlersForStatus } from './hooks';

// As in v4: posts over 32 lines collapse to their first 15, then Read more and media
const MAX_LINES = 32;
const COLLAPSED_LINES = 15;

export const StatusContent: React.FC<
  {
    status: Omit<StatusShape | ExpandedStatusShape, 'reblog'>;
    statusContent?: string;
    onTranslate?: () => void;
    onReadMore?: () => void;
    collapsible?: boolean;
  } & React.ComponentPropsWithRef<'div'>
> = ({
  status,
  statusContent,
  onTranslate,
  onReadMore,
  collapsible,
  children,
  className,
  ...props
}) => {
  // Determines if a long post should show the read more button.
  const [collapsed, setCollapsed] = useState(false);
  const onResize: ResizeObserverCallback = useCallback((entries) => {
    for (const { target } of entries) {
      setCollapsed(isElementOverflowing(target));
    }
  }, []);
  const observer = useResizeObserver(onResize);
  const onRef = useCallback(
    (node: HTMLDivElement | null) => {
      if (!node || collapsed) {
        return;
      }

      observer.observe(node);
      setCollapsed(isElementOverflowing(node));
    },
    [collapsed, observer],
  );

  const htmlHandlers = useHandlersForStatus(status);

  const text =
    statusContent ?? status.translation?.contentHtml ?? status.contentHtml;
  const language = status.translation?.language ?? status.language;

  const isCollapsed = !!onReadMore && collapsible && collapsed;

  const style = {
    '--max-height': `${COLLAPSED_LINES}lh`,
    ...props.style,
  } as React.CSSProperties;

  return (
    <div
      {...props}
      className={classNames(
        className,
        classes.root,
        isCollapsed && classes.collapsed,
      )}
      style={style}
    >
      {text.trim().length > 0 && (
        <EmojiHTML
          className={classes.text}
          ref={onRef}
          lang={language}
          htmlString={text}
          extraEmojis={status.emojis}
          {...htmlHandlers}
        />
      )}

      {isCollapsed && (
        <Button
          size='sm'
          onClick={onReadMore}
          trailingIcon={CaretRightIcon}
          className={classes.readMore}
        >
          <FormattedMessage
            id='status.view_post'
            defaultMessage='View full post'
          />
        </Button>
      )}

      {children}
    </div>
  );
};

function isElementOverflowing(node: Element) {
  const { lineHeight } = getComputedStyle(node);
  const lineHeightPx = parseFloat(lineHeight);
  const maxHeight = lineHeightPx * MAX_LINES;

  // scrollHeight keeps the full height while the text is cut short
  return node.scrollHeight > maxHeight || node.scrollWidth > node.clientWidth;
}
