import { startMobileAutohide } from './mobile_autohide';
import { startSeasonalEffects } from './seasonal_effects';
import { setupLinkListeners } from './utils/links';

export function start() {
  setupLinkListeners();
  startMobileAutohide();
  startSeasonalEffects();
}
