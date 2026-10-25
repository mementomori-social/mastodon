// On mobile the top and bottom bars slide away while scrolling down
const AUTOHIDE_MAX_WIDTH = 890;
const AUTOHIDE_FROM_TOP = 500;

let lastScrollTop = 0;

function scrollHandler() {
  const scrollTop = window.scrollY;
  const { classList } = document.body;

  if (window.innerWidth > AUTOHIDE_MAX_WIDTH || scrollTop < AUTOHIDE_FROM_TOP) {
    classList.remove('scroll-up', 'scroll-down');
    lastScrollTop = scrollTop;
    return;
  }

  const scrollingDown = scrollTop > lastScrollTop;

  classList.toggle('scroll-down', scrollingDown);
  classList.toggle('scroll-up', !scrollingDown);
  lastScrollTop = scrollTop;
}

export function startMobileAutohide() {
  window.addEventListener('scroll', scrollHandler, { passive: true });

  window.addEventListener('click', () => {
    document.body.classList.remove('scroll-down');
  });
}
