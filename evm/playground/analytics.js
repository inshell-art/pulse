import { createAnalytics, ANALYTICS_CONFIG } from './analytics-core.js';

const status = document.querySelector('[data-privacy-status]');
const exclude = document.querySelector('[data-privacy-action="exclude"]');
const include = document.querySelector('[data-privacy-action="include"]');
if (status && exclude && include) {
  const render = state => {
    status.textContent = !state.storageAvailable
      ? 'Optional statistics are off. Your browser preference could not be read or saved.'
      : state.reloadRequired
        ? 'Reloading applies this exclusion to later page loads. A final performance report for this already-open public page may still be sent while it closes.'
        : state.excluded
          ? 'This browser is excluded from optional audience statistics.'
          : state.loaded
            ? 'Optional Cloudflare audience statistics are active on this page.'
            : 'Optional audience statistics are off on this page.';
    exclude.hidden = state.excluded;
    include.hidden = !state.excluded;
    exclude.disabled = include.disabled = !state.storageAvailable;
  };
  const controller = createAnalytics({ window, document, config: ANALYTICS_CONFIG, onChange: render });
  for (const button of [exclude, include]) button.addEventListener('click', () => {
    render(controller.setExcluded(button === exclude));
    // A quiet disclosure remains open; no consent dialog or automatic grant.
    (button === exclude ? include : exclude).focus({ preventScroll: true });
  });
}
