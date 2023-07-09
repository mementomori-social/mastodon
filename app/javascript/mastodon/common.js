import Rails from '@rails/ujs';
import 'font-awesome/css/font-awesome.css';

export function start() {
  require.context('../images/', true);

  try {
    Rails.start();
  } catch (e) {
    // If called twice
  }
}

// Hide the top bar when scrolling down, show it when scrolling up
let lastScrollTop = 0;
let lastScrollDirection = 0;
let lastScrollTime = 0;
let scrollTimeout = null;

function scrollHandler() {
  const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
  const scrollDirection = scrollTop > lastScrollTop ? 1 : -1;
  const scrollTime = Date.now();

  if (scrollDirection !== lastScrollDirection) {
    lastScrollDirection = scrollDirection;
    lastScrollTime = scrollTime;
  }

  if (scrollTimeout) {
    clearTimeout(scrollTimeout);
  }

  if (scrollDirection === 1) {
    document.body.classList.remove('scroll-up');
    document.body.classList.add('scroll-down');
  } else {
    document.body.classList.remove('scroll-down');
    document.body.classList.add('scroll-up');

    if (scrollTime - lastScrollTime > 1000) {
      document.body.classList.add('scroll-top');
    }
  }

  scrollTimeout = setTimeout(() => {
    document.body.classList.remove('scroll-top');
  }
, 1000);

  lastScrollTop = scrollTop;
}

export function enableScrollHandler() {
  window.addEventListener('scroll', scrollHandler);
}

// Launch
enableScrollHandler();
