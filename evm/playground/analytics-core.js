// Owner-controlled optional statistics. Importing this module has no browser effects.
export const ANALYTICS_ORIGIN = 'https://pulse.inshell.art';
export const ANALYTICS_EXCLUSION_KEY = 'pulse.analytics.excluded.v1';
export const ANALYTICS_SCRIPT = 'https://static.cloudflareinsights.com/beacon.min.js';
export const ANALYTICS_ROUTES = Object.freeze(['/projects/']);

// LOCAL PILOT CANDIDATE ONLY: static public Projects, bounded full-document scope.
// Ordinary builds stay OFF: no PULSE_MEASUREMENT_DOCUMENT_ENV binding is authored.
// A live window needs separate approval, exact manual/no-auto-injection readback
// and an eligible server marker. These values are not broad browser qualification.
// These are reviewed source/build settings, never URL, storage or consent inputs.
export const ANALYTICS_CONFIG = Object.freeze({
  enabled: true,
  production: true,
  beaconToken: "ed3c6ec25c144104b45405c4f6b19fa5", // Public REST site_token, NOT reporting site_tag or an account API credential.
  automaticInjectionDisabled: true,
  // Bounded M3 SG/UK responses plus denied/unknown source tests; not RUM-colo proof.
  sourceCountryPolicyQualified: true,
  // Static full-document/reload contract only; a closing public report may remain.
  documentLifecycleQualified: true,
  referrerOrigins: Object.freeze([]), // External origins need separate review.
});

export function analyticsKnownAutomation(navigator = {}) {
  return navigator.webdriver === true || /(?:HeadlessChrome|PhantomJS|Playwright|Puppeteer|Googlebot|bingbot|DuckDuckBot|Baiduspider|YandexBot|Applebot|facebookexternalhit|Twitterbot|LinkedInBot|Slackbot|Discordbot|PetalBot|Bytespider|GPTBot|ChatGPT-User|ClaudeBot|Claude-User|PerplexityBot|Perplexity-User|Amazonbot|OAI-SearchBot)/i.test(String(navigator.userAgent ?? ''));
}

function plainUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && !/[?#]/.test(url.href) ? url : null;
  } catch { return null; }
}

export function analyticsReferrerAllowed(value = '', approvedOrigins = []) {
  if (value === '') return true;
  const url = plainUrl(value);
  if (!url) return false;
  // Do not rewrite a private referrer into a coarse event label: skip collection.
  return url.origin === ANALYTICS_ORIGIN ? ANALYTICS_ROUTES.includes(url.pathname) : Array.isArray(approvedOrigins) && approvedOrigins.includes(url.origin) && url.href === `${url.origin}/`;
}

export function analyticsEligibility({ config = {}, url, referrer = '', excluded = false, storageAvailable = true, automation = false, regionMarker = null }) {
  const current = plainUrl(url);
  if (config.enabled !== true || config.production !== true || !current || current.origin !== ANALYTICS_ORIGIN) return 'environment-disabled';
  if (!storageAvailable) return 'storage-unavailable';
  if (excluded) return 'browser-excluded';
  if (automation) return 'automation-excluded';
  if (!ANALYTICS_ROUTES.includes(current.pathname)) return 'page-excluded';
  if (regionMarker !== 'eligible') return 'server-region-off';
  if (!analyticsReferrerAllowed(referrer, config.referrerOrigins)) return 'referrer-excluded';
  if (typeof config.beaconToken !== 'string' || !/^[a-f0-9]{32}$/.test(config.beaconToken) || /^0+$/.test(config.beaconToken)) return 'site-unconfigured';
  if (config.automaticInjectionDisabled !== true) return 'injection-unqualified';
  if (config.sourceCountryPolicyQualified !== true) return 'source-country-unqualified';
  // spa:false is not evidence that unload/visibility or exclusion stops are safe.
  if (config.documentLifecycleQualified !== true) return 'lifecycle-unqualified';
  return 'eligible';
}

export function createAnalytics({ window: win, document: doc = win.document, config = ANALYTICS_CONFIG, onChange = () => {} }) {
  if (win.__pulseMeasurementController) return win.__pulseMeasurementController;
  const settings = Object.freeze({ ...config });
  let loaded = false, locked = false, storageFailed = false;
  const removers = [];
  function readExclusion() {
    try {
      const value = win.localStorage.getItem(ANALYTICS_EXCLUSION_KEY);
      // Preserve the old explicit boolean's conservative interpretation.
      return { excluded: value !== null && value !== '0', storageAvailable: !storageFailed };
    } catch { return { excluded: true, storageAvailable: false }; }
  }
  function inspect() {
    const state = readExclusion();
    const reason = analyticsEligibility({ config: settings, url: win.location.href, referrer: doc.referrer,
      ...state, automation: analyticsKnownAutomation(win.navigator),
      regionMarker: (() => {
        const markers = doc.querySelectorAll('meta[name="pulse-measurement-region"]');
        return markers.length === 1 ? markers[0].getAttribute('content') : null;
      })() });
    return { ...state, reason: locked ? 'next-document-required' : reason, loaded, reloadRequired: locked && loaded };
  }
  function notify() { const state = inspect(); onChange(state); return state; }
  function leaveMeasuredDocument() {
    if (!loaded || locked) return;
    locked = true;
    // Removing the script cannot stop vendor handlers. A full document reload
    // applies the saved exclusion/gates; an already queued final beacon may remain.
    // Bounded static-document contract, not private same-document safety or
    // immediate cancellation. See the pilot evidence/limits in README.md.
    try { win.location.reload(); } catch { /* UI keeps the reload requirement visible. */ }
  }
  const controller = {
    status: inspect,
    setExcluded(excluded) {
      const value = excluded ? '1' : '0';
      try {
        win.localStorage.setItem(ANALYTICS_EXCLUSION_KEY, value);
        if (win.localStorage.getItem(ANALYTICS_EXCLUSION_KEY) !== value) throw new Error('Not saved');
      } catch { storageFailed = true; }
      if (excluded) leaveMeasuredDocument();
      // Inclusion does not load a collector in an existing document.
      return notify();
    },
    destroy() { for (const remove of removers) remove(); locked = true; },
  };
  win.__pulseMeasurementController = controller;
  function listen(target, name, handler) {
    target.addEventListener(name, handler);
    removers.push(() => target.removeEventListener(name, handler));
  }
  listen(win, 'storage', event => {
    if (event.key !== null && event.key !== ANALYTICS_EXCLUSION_KEY) return;
    const state = inspect();
    if (!state.storageAvailable || state.excluded) leaveMeasuredDocument();
    notify();
  });
  // No History API monkey-patching or claims that a native beacon is sanitized.
  for (const name of ['hashchange', 'popstate']) listen(win, name, () => { leaveMeasuredDocument(); notify(); });
  if (inspect().reason === 'eligible') {
    if (doc.querySelector('script[data-cf-beacon], script[src^="https://static.cloudflareinsights.com/"]')) locked = true;
    else {
      const script = doc.createElement('script');
      script.type = 'module';
      script.src = ANALYTICS_SCRIPT;
      script.referrerPolicy = 'no-referrer';
      script.setAttribute('data-cf-beacon', JSON.stringify({ token: settings.beaconToken, spa: false }));
      // This changes the eligible document's default; the SDK file stays no-referrer.
      const policy = doc.createElement('meta');
      policy.name = 'referrer';
      policy.content = 'strict-origin';
      doc.head.append(policy);
      doc.head.append(script);
      loaded = true;
    }
  }
  notify();
  return controller;
}
