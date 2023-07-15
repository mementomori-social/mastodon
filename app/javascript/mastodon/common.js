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

// Get the ancestor post from API
// NB! THERE ARE TWO REASONS NOT TO USE THIS RIGHT NOW:
// 1. It's a hack, it's not a good solution - it polls the API every two seconds which can cause rate limiting
// 2. It's not using the same logic as the Mastodon code, so it's not 100% accurate

// Poll every two seconds for new posts
const pollInterval = 2000;
let pollTimeout = null;

function poll() {
  // Get all .status that has .status-reply
  const statusReplies = document.querySelectorAll('.status.status-reply');

  // Check if <div role="region" aria-label="Home" class="column"> is found on the page
  const homeColumn = document.querySelector('[aria-label].column');

  // If not found, then we are not on the home page, don't continue
  if (!homeColumn) {
    // Poll again
    pollTimeout = setTimeout(poll, pollInterval);
    return;
  }

  // Check if exists
  if (statusReplies.length > 0) {

    // Loop through all visible status-replies
    for (let i = 0; i < statusReplies.length; i++) {
      const statusReply = statusReplies[i];

      // Get the id
      const statusReplyId = statusReply.getAttribute('data-id');

      // Only if not fetched yet
      if (!statusReply.classList.contains('fetched')) {

      // Ensure that the reply is not there, previousElementSibling shouldn't have class status-injected
      if (statusReply.previousElementSibling && statusReply.previousElementSibling.classList.contains('status-injected')) {
        return;
      }

      // Mark this post fetched
      statusReply.classList.add('fetched');

      // Get the ancestor from the API /api/v1/statuses/<id>
      fetch(`/api/v1/statuses/${statusReplyId}`)
        .then(response => response.json())
        .then(data => {
          // Get the ancestor {"id":"110644810514106278","created_...
          const ancestor = data;

          // Get the ancestor in_reply_to_id
          const ancestorId = ancestor.in_reply_to_id;

          // Get the ancestor .status from /api/v1/statuses/<id>
          fetch(`/api/v1/statuses/${ancestorId}`)
            .then(response => response.json())
            .then(data => {
              // Get the ancestor .status
              const ancestorStatus = data;

              // Get the content
              const ancestorContent = ancestorStatus.content;

              // Get link to post /@<username>/<id>
              const ancestorLink = '/@' + ancestorStatus.account.acct + '/' + ancestorStatus.id;

              // Build HTML
              const ancestorStatusBody = `
                <div class="status__wrapper status-injected status__wrapper-reply focusable">
                    <div class="status status-reply fetched status--in-thread" data-id="${ancestorStatus.id}">
                      <div class="status__line status__line--full status__line--first"></div>

                      <div class="status__info">
                        <a href="${ancestorLink}" class="status__display-name" rel="noopener noreferrer">
                          <div class="status__avatar"><div class="account__avatar" style="width: 46px; height: 46px;"><img src="${ancestorStatus.account.avatar}" alt="${ancestorStatus.account.display_name}"></div></div>
                          <span class="display-name"><bdi><strong class="display-name__html">${ancestorStatus.account.display_name}</strong></bdi> <span class="display-name__account">@${ancestorStatus.account.acct}</span></span>
                        </a>
                      </div>
                      <div class="status__content status__content--with-action" tabindex="0">
                        <div class="status__content__text status__content__text--visible translate" lang="en">
                        ${ancestorContent}
                        </div>
                      </div>
                    </div>
                </div>
              `;

              // Check if the ancestor is a reply to another post
              if (ancestorStatus.in_reply_to_id) {
                // Prepend this data before the status-reply
                statusReply.insertAdjacentHTML('beforebegin', ancestorStatusBody);
              }
            });
        });
      }
    }
  }

  // Poll again
  pollTimeout = setTimeout(poll, pollInterval);
}

export function enablePoll() {
  pollTimeout = setTimeout(poll, pollInterval);
}

// Launch
enablePoll();
enableScrollHandler();
