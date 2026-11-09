// Temporary: records why swipes stop scrolling the page, opened with #scrolldebug
const FLAG = 'scrolldebug';
const MAX_GESTURES = 30;
const SETTLE_MS = 700;
const STUCK_FINGER_PX = 120;
const STUCK_SCROLL_PX = 40;

interface Gesture {
  t: number;
  target: string;
  chain: string[];
  fingerDy: number;
  moves: number;
  prevented: number;
  ended: string;
  scrollStart: number;
  scrollMin: number;
  scrollMax: number;
  scrollAtLift: number;
  scrolledBy: number;
  targetMoved: number | null;
  docHeightDelta: number;
  targetRemoved: string;
  events: string[];
  selection: number;
  stuck: boolean;
}

const gestures: Gesture[] = [];
let current: Gesture | null = null;
let startY = 0;
let lastY = 0;
let targetEl: Element | null = null;
let targetTop = 0;
let docHeight = 0;
let removalObserver: MutationObserver | null = null;
let targetListeners: AbortController | null = null;

function describe(el: Element | null) {
  if (!el) {
    return 'null';
  }

  const cls =
    typeof el.className === 'string'
      ? el.className.split(' ').slice(0, 2).join('.')
      : '';
  return `${el.tagName.toLowerCase()}${cls ? `.${cls}` : ''}`;
}

function note(text: string) {
  if (!current) {
    return;
  }

  const ms = Math.round(performance.now() - current.t);

  if (current.events.length < 40) {
    current.events.push(`${ms} ${text}`);
  }
}

function callers() {
  return (new Error().stack ?? '')
    .split('\n')
    .slice(3, 6)
    .map((line) => line.replace(location.origin, '').trim())
    .join(' < ');
}

// Every ancestor that could take the swipe for itself
function scrollChain(el: Element | null) {
  const out: string[] = [];

  for (let e = el; e; e = e.parentElement) {
    const c = getComputedStyle(e);
    const notes = [];

    if (c.overflowY !== 'visible') {
      notes.push(`oy=${c.overflowY} sh=${e.scrollHeight} ch=${e.clientHeight}`);
    }

    if (c.touchAction !== 'auto') {
      notes.push(`touch=${c.touchAction}`);
    }

    if (c.userSelect !== 'auto' && c.userSelect !== 'text') {
      notes.push(`select=${c.userSelect}`);
    }

    if (notes.length) {
      out.push(`${describe(e)} ${notes.join(' ')}`);
    }
  }

  return out;
}

function watchRemoval(target: Element) {
  removalObserver?.disconnect();
  removalObserver = new MutationObserver((records) => {
    if (!current || current.targetRemoved || target.isConnected) {
      return;
    }

    const removed = records
      .flatMap((r) => [...r.removedNodes])
      .find((n) => n.contains(target));

    current.targetRemoved = `${Math.round(performance.now() - current.t)}ms ${describe(removed instanceof Element ? removed : null)}`;
  });
  removalObserver.observe(document.body, { childList: true, subtree: true });
}

function finish(ended: string) {
  const gesture = current;

  if (!gesture || gesture.ended) {
    return;
  }

  gesture.ended = ended;
  gesture.fingerDy = Math.round(startY - lastY);
  gesture.scrollAtLift = Math.round(window.scrollY - gesture.scrollStart);
  gesture.selection = document.getSelection()?.toString().length ?? 0;

  if (targetEl?.isConnected) {
    gesture.targetMoved = Math.round(
      targetTop - targetEl.getBoundingClientRect().top,
    );
  }

  targetListeners?.abort();

  window.setTimeout(() => {
    removalObserver?.disconnect();
    gesture.scrolledBy = Math.round(window.scrollY - gesture.scrollStart);
    gesture.docHeightDelta = document.documentElement.scrollHeight - docHeight;
    gesture.stuck =
      Math.abs(gesture.fingerDy) > STUCK_FINGER_PX &&
      Math.abs(gesture.scrollAtLift) < STUCK_SCROLL_PX;
    gestures.push(gesture);

    if (gestures.length > MAX_GESTURES) {
      gestures.shift();
    }

    render();
  }, SETTLE_MS);
}

function onTouchStart(e: TouchEvent) {
  const touch = e.touches[0];
  const target = e.target instanceof Element ? e.target : null;

  if (current && !current.ended) {
    finish('next touch');
  }

  startY = touch ? touch.clientY : 0;
  lastY = startY;
  targetEl = target;
  targetTop = target ? target.getBoundingClientRect().top : 0;
  docHeight = document.documentElement.scrollHeight;

  current = {
    t: performance.now(),
    target: describe(target),
    chain: scrollChain(target),
    fingerDy: 0,
    moves: 0,
    prevented: 0,
    ended: '',
    scrollStart: window.scrollY,
    scrollMin: 0,
    scrollMax: 0,
    scrollAtLift: 0,
    scrolledBy: 0,
    targetMoved: null,
    docHeightDelta: 0,
    targetRemoved: '',
    events: [],
    selection: 0,
    stuck: false,
  };

  if (!target) {
    return;
  }

  // A detached target never bubbles to window, so listen on it directly too
  targetListeners = new AbortController();
  const { signal } = targetListeners;
  target.addEventListener(
    'touchmove',
    (e) => {
      onTouchMove(e as TouchEvent);
    },
    { passive: true, signal },
  );
  target.addEventListener(
    'touchend',
    () => {
      finish('end');
    },
    { signal },
  );
  target.addEventListener(
    'touchcancel',
    () => {
      finish('cancel');
    },
    { signal },
  );
  watchRemoval(target);
}

function onTouchMove(e: TouchEvent) {
  if (!current || current.ended) {
    return;
  }

  const touch = e.touches[0];

  if (touch) {
    lastY = touch.clientY;
  }

  current.moves += 1;

  if (e.defaultPrevented) {
    current.prevented += 1;
  }

  const delta = Math.round(window.scrollY - current.scrollStart);
  current.scrollMin = Math.min(current.scrollMin, delta);
  current.scrollMax = Math.max(current.scrollMax, delta);
}

// Log every script-driven scroll or focus, with who called it
function patchScrollWrites() {
  const proto = Element.prototype;
  const desc = Object.getOwnPropertyDescriptor(proto, 'scrollTop');
  // eslint-disable-next-line @typescript-eslint/unbound-method
  const setScrollTop = desc?.set;

  if (desc && setScrollTop) {
    Object.defineProperty(proto, 'scrollTop', {
      ...desc,
      set(this: Element, value: number) {
        note(
          `scrollTop=${Math.round(value)} on ${describe(this)} by ${callers()}`,
        );
        setScrollTop.call(this, value);
      },
    });
  }

  const wrap = <T extends object>(owner: T, name: keyof T, label: string) => {
    const original = owner[name] as unknown as (...args: unknown[]) => unknown;

    (owner as Record<keyof T, unknown>)[name] = function (
      this: unknown,
      ...args: unknown[]
    ) {
      note(`${label}(${JSON.stringify(args).slice(0, 60)}) by ${callers()}`);
      return original.apply(this, args);
    };
  };

  wrap(window, 'scrollTo', 'window.scrollTo');
  wrap(window, 'scrollBy', 'window.scrollBy');
  wrap(window, 'scroll', 'window.scroll');
  wrap(proto, 'scrollTo', 'el.scrollTo');
  wrap(proto, 'scrollBy', 'el.scrollBy');
  wrap(proto, 'scrollIntoView', 'el.scrollIntoView');
  wrap(HTMLElement.prototype, 'focus', 'el.focus');
}

let label: HTMLSpanElement | null = null;

function render() {
  if (!label) {
    return;
  }

  const stuck = gestures.filter((g) => g.stuck).length;
  const last = gestures.at(-1);
  label.textContent = `swipes ${gestures.length}, stuck ${stuck}${last ? `, last ${last.scrollAtLift}/${last.fingerDy}px` : ''}`;
}

function report() {
  return JSON.stringify(
    {
      ua: navigator.userAgent,
      path: location.pathname,
      scrollY: Math.round(window.scrollY),
      docHeight: document.documentElement.scrollHeight,
      htmlClass: document.documentElement.className,
      bodyClass: document.body.className,
      active: describe(document.activeElement),
      gestures,
    },
    null,
    1,
  );
}

function mountPanel() {
  const panel = document.createElement('div');
  panel.style.cssText =
    'position:fixed;left:8px;right:8px;top:calc(env(safe-area-inset-top) + 60px);z-index:99999;background:#000c;color:#fff;font:12px/1.4 monospace;padding:6px 8px;border-radius:8px;display:flex;gap:8px;align-items:center';

  label = document.createElement('span');
  label.style.flex = '1';
  label.textContent = 'scroll debug v2 on';

  const copy = document.createElement('button');
  copy.textContent = 'Copy';
  copy.style.cssText =
    'background:#fff;color:#000;border-radius:6px;padding:4px 10px';
  copy.addEventListener('click', (e) => {
    e.stopPropagation();
    const text = report();
    void navigator.clipboard.writeText(text).then(
      () => {
        copy.textContent = 'Copied';
      },
      () => {
        window.prompt('Copy this', text);
      },
    );
  });

  panel.append(label, copy);
  document.body.append(panel);
}

export function startScrollDebug() {
  if (location.hash.includes(FLAG)) {
    sessionStorage.setItem(FLAG, '1');
  }

  if (sessionStorage.getItem(FLAG) !== '1') {
    return;
  }

  patchScrollWrites();

  window.addEventListener('touchstart', onTouchStart, {
    passive: true,
    capture: true,
  });
  window.addEventListener(
    'touchmove',
    (e) => {
      if (current && e.defaultPrevented) {
        note('touchmove prevented');
      }
    },
    { passive: true },
  );

  const events = [
    'focusin',
    'dragstart',
    'contextmenu',
    'selectstart',
    'click',
  ] as const;

  for (const type of events) {
    document.addEventListener(
      type,
      (e) => {
        note(
          `${type} ${describe(e.target instanceof Element ? e.target : null)}`,
        );
      },
      { capture: true, passive: true },
    );
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mountPanel);
  } else {
    mountPanel();
  }
}
