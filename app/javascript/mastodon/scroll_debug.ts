// Temporary: records why swipes stop scrolling the page, opened with #scrolldebug
const FLAG = 'scrolldebug';
const MAX_GESTURES = 30;

interface Gesture {
  t: number;
  target: string;
  chain: string[];
  startY: number;
  moves: number;
  prevented: number;
  scrollEvents: number;
  scrolledBy: number;
  focusBefore: string;
  focusAfter: string;
  htmlClass: string;
}

const gestures: Gesture[] = [];
let current: Gesture | null = null;
let scrollAtStart = 0;

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

// Every ancestor that could take the swipe for itself
function scrollChain(el: Element | null) {
  const out: string[] = [];

  for (let e = el; e; e = e.parentElement) {
    const c = getComputedStyle(e);
    const notes = [];

    if (c.overflowY !== 'visible') {
      notes.push(
        `oy=${c.overflowY} sh=${e.scrollHeight} ch=${e.clientHeight} st=${Math.round(e.scrollTop)}`,
      );
    }

    if (c.overflowX !== 'visible' && e.scrollWidth > e.clientWidth + 1) {
      notes.push(`ox=${c.overflowX} sw=${e.scrollWidth} cw=${e.clientWidth}`);
    }

    if (c.touchAction !== 'auto') {
      notes.push(`touch=${c.touchAction}`);
    }

    if (c.overscrollBehaviorY !== 'auto') {
      notes.push(`osb=${c.overscrollBehaviorY}`);
    }

    if (c.position === 'fixed' || c.position === 'sticky') {
      notes.push(c.position);
    }

    if (notes.length) {
      out.push(`${describe(e)} ${notes.join(' ')}`);
    }
  }

  return out;
}

function state() {
  const html = document.documentElement;
  const hc = getComputedStyle(html);
  const bc = getComputedStyle(document.body);
  const vv = window.visualViewport;

  return {
    scrollY: Math.round(window.scrollY),
    docHeight: html.scrollHeight,
    innerHeight: window.innerHeight,
    visualViewport: vv
      ? `${Math.round(vv.offsetTop)} ${Math.round(vv.height)} x${vv.scale}`
      : null,
    htmlClass: html.className,
    bodyClass: document.body.className,
    html: `oy=${hc.overflowY} touch=${hc.touchAction} osb=${hc.overscrollBehaviorY}`,
    body: `oy=${bc.overflowY} touch=${bc.touchAction} osb=${bc.overscrollBehaviorY}`,
    active: describe(document.activeElement),
    activeChain: scrollChain(document.activeElement),
  };
}

function report() {
  return JSON.stringify(
    {
      ua: navigator.userAgent,
      path: location.pathname,
      now: state(),
      gestures,
    },
    null,
    1,
  );
}

function onTouchStart(e: TouchEvent) {
  const touch = e.touches[0];
  const target = e.target instanceof Element ? e.target : null;

  scrollAtStart = window.scrollY;
  current = {
    t: Math.round(performance.now()),
    target: describe(target),
    chain: scrollChain(target),
    startY: touch ? Math.round(touch.clientY) : 0,
    moves: 0,
    prevented: 0,
    scrollEvents: 0,
    scrolledBy: 0,
    focusBefore: describe(document.activeElement),
    focusAfter: '',
    htmlClass: document.documentElement.className,
  };
}

function onTouchMove(e: TouchEvent) {
  if (!current) {
    return;
  }

  current.moves += 1;

  if (e.defaultPrevented) {
    current.prevented += 1;
  }
}

function onTouchEnd() {
  const gesture = current;

  if (!gesture) {
    return;
  }

  // Momentum keeps scrolling after the finger lifts, so settle first
  window.setTimeout(() => {
    gesture.scrolledBy = Math.round(window.scrollY - scrollAtStart);
    gesture.focusAfter = describe(document.activeElement);
    gestures.push(gesture);

    if (gestures.length > MAX_GESTURES) {
      gestures.shift();
    }

    render();
  }, 700);
}

let label: HTMLSpanElement | null = null;

function render() {
  if (!label) {
    return;
  }

  const last = gestures.at(-1);
  label.textContent = `swipes ${gestures.length}${last ? `, last moved ${last.scrolledBy}px` : ''}`;
}

function mountPanel() {
  const panel = document.createElement('div');
  panel.style.cssText =
    'position:fixed;left:8px;right:8px;top:calc(env(safe-area-inset-top) + 60px);z-index:99999;background:#000c;color:#fff;font:12px/1.4 monospace;padding:6px 8px;border-radius:8px;display:flex;gap:8px;align-items:center';

  label = document.createElement('span');
  label.style.flex = '1';
  label.textContent = 'scroll debug on';

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

  // Bubble phase on window, so defaultPrevented reflects every handler before it
  window.addEventListener('touchstart', onTouchStart, {
    passive: true,
    capture: true,
  });
  window.addEventListener('touchmove', onTouchMove, { passive: true });
  window.addEventListener('touchend', onTouchEnd, { passive: true });
  window.addEventListener(
    'scroll',
    () => {
      if (current) {
        current.scrollEvents += 1;
      }
    },
    { passive: true },
  );

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mountPanel);
  } else {
    mountPanel();
  }
}
