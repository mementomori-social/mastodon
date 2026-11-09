// Temporary: records what changes in the frame a feed jumps, opened with #scrolldebug
/* eslint-disable @typescript-eslint/unbound-method */
const FLAG = 'scrolldebug';
const SHIFT_LIMIT = 40;
const SCROLL_LIMIT = 250;
const MAX_JUMPS = 12;
const RECENT_MS = 150;

interface Row {
  id: string;
  top: number;
  height: number;
  placeholder: boolean;
}

interface Frame {
  t: number;
  scrollY: number;
  docHeight: number;
  innerHeight: number;
  rows: Row[];
  extras: Record<string, number>;
}

const events: string[] = [];
const jumps: unknown[] = [];

function note(text: string) {
  events.push(`${Math.round(performance.now())} ${text}`);

  if (events.length > 60) {
    events.shift();
  }
}

function recentEvents(now: number) {
  return events.filter((e) => now - parseInt(e, 10) < RECENT_MS);
}

function describe(el: Element | null) {
  if (!el) {
    return 'null';
  }

  const cls =
    typeof el.className === 'string' ? el.className.split(' ')[0] : '';
  return `${el.tagName.toLowerCase()}.${cls}`;
}

function hookScrollWrites() {
  const desc = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollTop');

  if (desc?.set && desc.get) {
    const { get, set } = desc;
    Object.defineProperty(Element.prototype, 'scrollTop', {
      configurable: true,
      get() {
        return get.call(this) as number;
      },
      set(value: number) {
        note(`scrollTop= ${Math.round(value)} on ${describe(this as Element)}`);
        set.call(this, value);
      },
    });
  }

  for (const name of ['scrollTo', 'scrollBy', 'scroll'] as const) {
    const original = window[name].bind(window) as (...args: unknown[]) => void;
    (window as unknown as Record<string, unknown>)[name] = (
      ...args: unknown[]
    ) => {
      note(`window.${name} ${JSON.stringify(args)}`);
      original(...args);
    };
  }

  const into = Element.prototype.scrollIntoView;
  Element.prototype.scrollIntoView = function (this: Element, ...args) {
    note(`scrollIntoView ${describe(this)}`);
    into.apply(this, args);
  };

  const focus = HTMLElement.prototype.focus;
  HTMLElement.prototype.focus = function (this: HTMLElement, ...args) {
    note(`focus ${describe(this)} ${JSON.stringify(args)}`);
    focus.apply(this, args);
  };
}

function snapshot(): Frame {
  const rows = Array.from(
    document.querySelectorAll<HTMLElement>('.item-list > article[data-id]'),
  ).map((a) => {
    const r = a.getBoundingClientRect();
    return {
      id: a.dataset.id ?? '',
      top: r.top,
      height: r.height,
      placeholder: a.style.opacity === '0',
    };
  });

  const extras: Record<string, number> = {};

  for (const sel of [
    '._comp_column_header__root',
    '.item-list',
    '.scrollable',
    '.item-list > :not(article)',
  ]) {
    const el = document.querySelector(sel);

    if (el) {
      const r = el.getBoundingClientRect();
      extras[sel] = Math.round(r.height);
      extras[`${sel}@top`] = Math.round(r.top + window.scrollY);
    }
  }

  return {
    t: performance.now(),
    scrollY: window.scrollY,
    docHeight: document.documentElement.scrollHeight,
    innerHeight: window.innerHeight,
    rows,
    extras,
  };
}

function compare(prev: Frame, next: Frame) {
  const before = new Map(prev.rows.map((r) => [r.id, r]));
  const visible = next.rows.find(
    (r) => before.has(r.id) && r.top + r.height > 0 && r.top < next.innerHeight,
  );

  if (!visible) {
    return;
  }

  const old = before.get(visible.id);

  if (!old) {
    return;
  }

  const scrolled = next.scrollY - prev.scrollY;
  const moved = visible.top - old.top;
  const shift = moved + scrolled;

  if (Math.abs(shift) < SHIFT_LIMIT && Math.abs(scrolled) < SCROLL_LIMIT) {
    return;
  }

  const changed = next.rows
    .filter((r) => {
      const o = before.get(r.id);
      return (
        !o ||
        Math.abs(o.height - r.height) > 1 ||
        o.placeholder !== r.placeholder
      );
    })
    .map((r) => {
      const o = before.get(r.id);
      return {
        id: r.id.slice(-6),
        where:
          r.top + r.height < 0
            ? 'above'
            : r.top > next.innerHeight
              ? 'below'
              : 'onscreen',
        from: o ? `${Math.round(o.height)}${o.placeholder ? 'P' : 'R'}` : 'new',
        to: `${Math.round(r.height)}${r.placeholder ? 'P' : 'R'}`,
      };
    });

  const removed = prev.rows
    .filter((r) => !next.rows.some((n) => n.id === r.id))
    .map((r) => r.id.slice(-6));

  const extras = Object.keys(next.extras)
    .filter((k) => prev.extras[k] !== next.extras[k])
    .map((k) => `${k}: ${prev.extras[k]} -> ${next.extras[k]}`);

  jumps.push({
    anchor: visible.id.slice(-6),
    moved: Math.round(moved),
    scrolled: Math.round(scrolled),
    shift: Math.round(shift),
    docHeight: `${prev.docHeight} -> ${next.docHeight}`,
    innerHeight: `${prev.innerHeight} -> ${next.innerHeight}`,
    frameMs: Math.round(next.t - prev.t),
    count: `${prev.rows.length} -> ${next.rows.length}`,
    changed,
    removed,
    extras,
    events: recentEvents(next.t),
  });

  if (jumps.length > MAX_JUMPS) {
    jumps.shift();
  }

  render();
}

let panel: HTMLDivElement | null = null;

function report() {
  return JSON.stringify(
    {
      ua: navigator.userAgent,
      theme: document
        .querySelector('link[rel=stylesheet][href*="themes/"]')
        ?.getAttribute('href'),
      path: location.pathname,
      jumps,
    },
    null,
    1,
  );
}

function render() {
  if (!panel) {
    return;
  }

  const last = jumps.at(-1) as { shift: number; scrolled: number } | undefined;
  const label = panel.querySelector('span');

  if (label) {
    label.textContent = `jumps ${jumps.length}${last ? `, last shift ${last.shift}, scrolled ${last.scrolled}` : ''}`;
  }
}

function mountPanel() {
  panel = document.createElement('div');
  panel.style.cssText =
    'position:fixed;left:8px;right:8px;top:calc(env(safe-area-inset-top) + 60px);z-index:99999;background:#000c;color:#fff;font:12px/1.4 monospace;padding:6px 8px;border-radius:8px;display:flex;gap:8px;align-items:center;pointer-events:auto';

  const label = document.createElement('span');
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

  hookScrollWrites();

  new MutationObserver((records) => {
    for (const r of records) {
      if ((r.target as Element).closest('article')) {
        continue;
      }

      if (r.type === 'attributes' && r.attributeName === 'class') {
        note(
          `class ${describe(r.target as Element)} ${(r.target as Element).className}`,
        );
      }
    }
  }).observe(document.body, {
    attributes: true,
    attributeFilter: ['class'],
    subtree: true,
  });

  window.addEventListener('resize', () => {
    note(`resize ${window.innerWidth}x${window.innerHeight}`);
  });

  const start = () => {
    mountPanel();
    let prev = snapshot();
    const tick = () => {
      const next = snapshot();
      compare(prev, next);
      prev = next;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
}
