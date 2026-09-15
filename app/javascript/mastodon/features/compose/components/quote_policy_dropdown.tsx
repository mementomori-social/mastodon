import { useCallback, useRef, useState } from 'react';

import { defineMessages, useIntl } from 'react-intl';

import classNames from 'classnames';

import type { ApiQuotePolicy } from '@/mastodon/api_types/quotes';
import { Popover } from '@/mastodon/components/popover';
import FormatQuoteIcon from '@/material-icons/400-24px/format_quote.svg?react';
import GroupIcon from '@/material-icons/400-24px/group.svg?react';
import LockIcon from '@/material-icons/400-24px/lock.svg?react';
import { DropdownSelector } from 'mastodon/components/dropdown_selector';
import { Icon } from 'mastodon/components/icon';

const messages = defineMessages({
  public_short: {
    id: 'quote_policy.public.short',
    defaultMessage: 'Anyone can quote',
  },
  public_long: {
    id: 'quote_policy.public.long',
    defaultMessage: 'Anyone can quote this post',
  },
  followers_short: {
    id: 'quote_policy.followers.short',
    defaultMessage: 'Followers only',
  },
  followers_long: {
    id: 'quote_policy.followers.long',
    defaultMessage: 'Only your followers can quote',
  },
  nobody_short: { id: 'quote_policy.nobody.short', defaultMessage: 'No one' },
  nobody_long: {
    id: 'quote_policy.nobody.long',
    defaultMessage: 'No one can quote this post',
  },
  change_quote_policy: {
    id: 'quote_policy.change',
    defaultMessage: 'Change who can quote',
  },
});

interface QuotePolicyDropdownProps {
  value: ApiQuotePolicy;
  onChange: (value: ApiQuotePolicy) => void;
  disabled?: boolean;
}

const QuotePolicyDropdown: React.FC<QuotePolicyDropdownProps> = ({
  value,
  onChange,
  disabled,
}) => {
  const intl = useIntl();
  const [popoverTarget, setPopoverTarget] = useState<HTMLDivElement | null>(
    null,
  );
  const previousFocusTargetRef = useRef<HTMLElement | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  const handleClose = useCallback(() => {
    if (isOpen && previousFocusTargetRef.current) {
      previousFocusTargetRef.current.focus({ preventScroll: true });
    }
    setIsOpen(false);
  }, [isOpen]);

  const handleToggle = useCallback(() => {
    if (isOpen) {
      handleClose();
    }
    setIsOpen((prev) => !prev);
  }, [handleClose, isOpen]);

  const registerPreviousFocusTarget = useCallback(() => {
    if (!isOpen) {
      previousFocusTargetRef.current = document.activeElement as HTMLElement;
    }
  }, [isOpen]);

  const handleButtonKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if ([' ', 'Enter'].includes(e.key)) {
        registerPreviousFocusTarget();
      }
    },
    [registerPreviousFocusTarget],
  );

  const options = [
    {
      icon: 'quote',
      iconComponent: FormatQuoteIcon,
      value: 'public',
      text: intl.formatMessage(messages.public_short),
      meta: intl.formatMessage(messages.public_long),
    },
    {
      icon: 'group',
      iconComponent: GroupIcon,
      value: 'followers',
      text: intl.formatMessage(messages.followers_short),
      meta: intl.formatMessage(messages.followers_long),
    },
    {
      icon: 'lock',
      iconComponent: LockIcon,
      value: 'nobody',
      text: intl.formatMessage(messages.nobody_short),
      meta: intl.formatMessage(messages.nobody_long),
    },
  ];

  const selectedOption =
    options.find((item) => item.value === value) ?? options[0];

  return (
    <div ref={setPopoverTarget}>
      <button
        type='button'
        title={intl.formatMessage(messages.change_quote_policy)}
        aria-expanded={isOpen}
        onClick={handleToggle}
        onMouseDown={registerPreviousFocusTarget}
        onKeyDown={handleButtonKeyDown}
        disabled={disabled}
        className={classNames('dropdown-button', { active: isOpen })}
      >
        {selectedOption && (
          <>
            <Icon
              id={selectedOption.icon}
              icon={selectedOption.iconComponent}
            />
            <span className='dropdown-button__label'>
              {selectedOption.text}
            </span>
          </>
        )}
      </button>

      <Popover
        isOpen={isOpen}
        offset={5}
        reference={popoverTarget}
        onClose={handleClose}
      >
        {({ props, placement }) => (
          <div {...props}>
            <div
              className={`dropdown-animation privacy-dropdown__dropdown ${placement}`}
            >
              <DropdownSelector
                items={options}
                value={value}
                onClose={handleClose}
                onChange={onChange as (value: string) => void}
              />
            </div>
          </div>
        )}
      </Popover>
    </div>
  );
};

// eslint-disable-next-line import/no-default-export
export default QuotePolicyDropdown;
