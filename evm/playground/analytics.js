import { createAnalytics } from './analytics-core.js';

// Public measurement ID. The core still requires the exact production origin,
// so staging, previews and local servers never load Google.
const PULSE_ANALYTICS = Object.freeze({ enabled: true, production: true, measurementId: 'G-HPR2KD6JEP' });

const analyticsDialog = document.getElementById('analytics-settings');
const analyticsNotice = document.getElementById('analytics-notice');
const analyticsOpen = document.querySelector('[data-analytics-action="open"]');
if (analyticsDialog && analyticsNotice && analyticsOpen) {
  const analyticsConfig = PULSE_ANALYTICS;
  let analyticsReturnFocus;
  const renderAnalytics = state => {
    let message = 'Analytics is off.';
    if (!state.storageAvailable) message = 'Analytics is off here. Your preference could not be saved; this browser may not remember it on another visit.';
    else if (state.excluded) message = 'This browser is excluded from analytics until you remove the exclusion. Clearing site storage also removes it.';
    else if (state.choice === 'reject') message = 'You have rejected analytics. Further measurement is disabled on this page.';
    else if (state.reloadRequired) message = 'Analytics stays off on this page. A saved allowance can take effect on your next eligible page visit.';
    else if (state.allowed) message = 'Analytics is allowed on this page. Reject analytics to withdraw your permission.';
    else if (!analyticsConfig.enabled || !analyticsConfig.measurementId) message = 'Analytics is not enabled for this site. No Google analytics is loaded.';
    else if (!state.eligible) message = 'Analytics is unavailable on this page or in this browser.';
    document.getElementById('analytics-status').textContent = message;
    for (const button of document.querySelectorAll('[data-analytics-action="allow"]')) {
      button.disabled = !state.eligible || !state.storageAvailable || state.excluded;
    }
    document.querySelector('[data-analytics-action="include"]').hidden = !state.excluded;
    document.querySelector('[data-analytics-action="exclude"]').hidden = state.excluded;
    analyticsNotice.hidden = !state.eligible || !state.storageAvailable || state.excluded || ['allow', 'reject'].includes(state.choice) || state.reloadRequired || analyticsDialog.open;
  };
  const analyticsController = createAnalytics({ window, document, config: analyticsConfig, onChange: renderAnalytics });
  renderAnalytics(analyticsController.status());
  analyticsOpen.hidden = false;
  document.addEventListener('click', event => {
    const control = event.target.closest('[data-analytics-action]');
    if (!control || control.disabled) return;
    const action = control.dataset.analyticsAction;
    if (action === 'open') {
      analyticsReturnFocus = control;
      analyticsController.refresh();
      analyticsDialog.showModal();
      analyticsNotice.hidden = true;
      analyticsDialog.querySelector('h2').focus({ preventScroll: true });
    } else if (action === 'close') {
      analyticsDialog.close();
    } else if (['allow', 'reject', 'exclude', 'include'].includes(action)) {
      renderAnalytics(analyticsController[action]());
      // A dismissed notice must not strand keyboard focus in hidden controls.
      if (analyticsNotice.contains(control)) analyticsOpen.focus({ preventScroll: true });
    }
  });
  analyticsDialog.addEventListener('close', () => {
    renderAnalytics(analyticsController.status());
    const target = analyticsReturnFocus?.isConnected && analyticsReturnFocus.getClientRects().length
      ? analyticsReturnFocus : analyticsOpen;
    target.focus({ preventScroll: true });
  });
}
