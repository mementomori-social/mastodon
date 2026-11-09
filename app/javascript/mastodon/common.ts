import { startMobileAutohide } from './mobile_autohide';
import { startScrollDebug } from './scroll_debug';
import { startSeasonalEffects } from './seasonal_effects';
import { setupLinkListeners } from './utils/links';

export function start() {
  setupLinkListeners();
  startMobileAutohide();
  startScrollDebug();
  startSeasonalEffects();
}
