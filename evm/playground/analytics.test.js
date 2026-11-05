// Offline fixtures only: no browser, vendor script, analytics beacon or RPC.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { createAnalytics, ANALYTICS_CONFIG, ANALYTICS_ORIGIN, ANALYTICS_EXCLUSION_KEY,
  ANALYTICS_SCRIPT, analyticsEligibility, analyticsKnownAutomation, analyticsReferrerAllowed } from './analytics-core.js';

// Hypothetical qualification exercises the loader contract, not vendor behavior.
const qualified = { enabled: true, production: true, beaconToken: 'a'.repeat(32), reportingSiteTag: 'b'.repeat(32), automaticInjectionDisabled: true,
  sourceCountryPolicyQualified: true, documentLifecycleQualified: true, referrerOrigins: ['https://search.example'] };
const eligible = overrides => analyticsEligibility({ config: qualified, url: `${ANALYTICS_ORIGIN}/projects/`, regionMarker: 'eligible', ...overrides });
class Target {
  handlers = new Map();
  addEventListener(name, fn) { if (!this.handlers.has(name)) this.handlers.set(name, new Set()); this.handlers.get(name).add(fn); }
  removeEventListener(name, fn) { this.handlers.get(name)?.delete(fn); }
  dispatch(name, event = {}) { for (const fn of this.handlers.get(name) ?? []) fn(event); }
}
function fixture({ config = qualified, url = `${ANALYTICS_ORIGIN}/projects/`, regionMarker = 'eligible', referrer = '', automation = {}, existingScript = false, failure } = {}) {
  const win = new Target(), doc = new Target(), data = new Map(), writes = [], scripts = [], policies = [], appended = [];
  let reloads = 0;
  win.location = { href: url, reload() { reloads += 1; } };
  win.navigator = { webdriver: false, userAgent: 'Mozilla/5.0 Chrome/156.0.0.0', ...automation };
  win.fetch = win.sendBeacon = () => { throw new Error('No network permitted'); };
  win.localStorage = {
    getItem(key) { if (failure === 'read') throw Error('blocked'); return data.get(key) ?? null; },
    setItem(key, value) { if (failure === 'write') throw Error('blocked'); writes.push([key, value]); if (failure !== 'silent-write') data.set(key, value); },
    removeItem() { throw Error('Storage deletion forbidden'); }, clear() { throw Error('Storage clear forbidden'); },
  };
  doc.referrer = referrer;
  doc.querySelectorAll = () => regionMarker === null ? [] : [{ getAttribute: () => regionMarker }];
  doc.querySelector = () => existingScript ? {} : null;
  doc.createElement = tag => { assert.ok(['meta', 'script'].includes(tag)); return { tagName: tag.toUpperCase(), attributes: {}, setAttribute(k, v) { this.attributes[k] = v; } }; };
  doc.head = { append(node) { appended.push(node); (node.tagName === 'SCRIPT' ? scripts : policies).push(node); } }; win.document = doc;
  Object.defineProperty(doc, 'cookie', { get() { throw Error('No cookie access'); }, set() { throw Error('No cookie writes'); } });
  return { win, doc, data, writes, scripts, policies, appended, reloads: () => reloads, start: () => createAnalytics({ window: win, document: doc, config }) };
}

test('authored candidate is OFF in production, staging, previews, local and CI regardless of old Allow', () => {
  for (const key of ['enabled', 'production', 'automaticInjectionDisabled', 'sourceCountryPolicyQualified', 'documentLifecycleQualified']) assert.equal(ANALYTICS_CONFIG[key], false);
  assert.match(ANALYTICS_CONFIG.beaconToken, /^[a-f0-9]{32}$/); assert.notEqual(ANALYTICS_CONFIG.beaconToken, '0'.repeat(32)); assert.deepEqual(ANALYTICS_CONFIG.referrerOrigins, []);
  for (const url of [ANALYTICS_ORIGIN, `${ANALYTICS_ORIGIN}/projects/`, 'https://pulse-staging.inshell.art/', 'https://pulse-site.user.workers.dev/',
    'https://preview.pages.dev/', 'http://127.0.0.1:4173/']) {
    const f = fixture({ config: ANALYTICS_CONFIG, url });
    f.data.set('pulse.analytics.preference.v1', JSON.stringify({ choice: 'allow', version: 1, expiresAt: 9999999999999 }));
    assert.equal(f.start().status().loaded, false); assert.equal(f.appended.length, 0); assert.equal(f.writes.length, 0);
  }
});

test('all production configuration and qualification gates must independently be explicit true', () => {
  assert.equal(eligible(), 'eligible');
  for (const key of ['enabled', 'production', 'automaticInjectionDisabled', 'sourceCountryPolicyQualified', 'documentLifecycleQualified']) {
    for (const value of [false, undefined, 'true', 1]) {
      const config = { ...qualified, [key]: value };
      assert.notEqual(eligible({ config }), 'eligible', `${key}=${value}`);
      const f = fixture({ config }); f.start(); assert.equal(f.appended.length, 0, `${key}=${value}`);
    }
  }
  // An old receiving-colo/manual-mode label is not source-country policy proof.
  assert.equal(Object.hasOwn(ANALYTICS_CONFIG, 'regionalManualModeQualified'), false);
  for (const value of [false, undefined]) {
    assert.equal(eligible({ config: { ...qualified, sourceCountryPolicyQualified: value, regionalManualModeQualified: true } }), 'source-country-unqualified');
  }
  for (const beaconToken of ['', null, '0'.repeat(32), 'G-EXAMPLE', 'ops-analytics-inshell-read', 'https://example.com', 'a'.repeat(33)]) {
    assert.equal(eligible({ config: { ...qualified, beaconToken } }), 'site-unconfigured');
  }
});

test('actual URL boundaries reject every query/fragment and sensitive or unlisted route', () => {
  for (const path of ['/projects/']) assert.equal(eligible({ url: `${ANALYTICS_ORIGIN}${path}` }), 'eligible');
  for (const path of ['/', '/projects.html', '/?', '/#', '/?utm_source=secret', '/#private', '/projects/#private', '/projects/?x=1', '/projects', '/index.html',
    '/docs/agent-index.json', '/docs/agent-prompt.txt', '/docs/documents/core-api.json', '/api/status', '/api/call', '/mint', '/wallet', '/auth/callback',
    '/p/private-handle', '/work/secret', '/projects//', '/projects/%2f', '/privacy-secret']) {
    assert.notEqual(eligible({ url: `${ANALYTICS_ORIGIN}${path}` }), 'eligible', path);
    const f = fixture({ url: `${ANALYTICS_ORIGIN}${path}` }); assert.equal(f.start().status().loaded, false); assert.equal(f.scripts.length, 0);
  }
  for (const url of ['http://pulse.inshell.art/', 'https://pulse.inshell.art.evil.test/', 'https://pulse-staging.inshell.art/',
    'https://user:secret@pulse.inshell.art/', 'https://pulse.inshell.art:8443/', 'invalid']) assert.notEqual(eligible({ url }), 'eligible');
});

test('native referrer safety skips sensitive actual context instead of sanitizing an event label', () => {
  for (const referrer of ['', `${ANALYTICS_ORIGIN}/projects/`, 'https://search.example/']) assert.equal(analyticsReferrerAllowed(referrer, qualified.referrerOrigins), true);
  assert.equal(analyticsReferrerAllowed('https://unknown.example/'), false);
  for (const referrer of [`${ANALYTICS_ORIGIN}/`, `${ANALYTICS_ORIGIN}/#lab`, `${ANALYTICS_ORIGIN}/api/status`, `${ANALYTICS_ORIGIN}/docs/agent-prompt.txt`,
    'https://private.example/work/secret?prompt=SENTINEL#draft', 'https://search.example/?q=secret', 'https://user:secret@search.example/', 'javascript:secret', '/relative']) {
    assert.equal(analyticsReferrerAllowed(referrer), false, referrer);
    const f = fixture({ referrer }); assert.equal(f.start().status().loaded, false); assert.equal(f.scripts.length, 0);
  }
});

test('explicit old exclusion and storage failures prevent script construction with no initial writes', () => {
  for (const stored of ['1', 'true', 'false', '', '{}']) {
    const f = fixture(); f.data.set(ANALYTICS_EXCLUSION_KEY, stored);
    assert.equal(f.start().status().excluded, true); assert.equal(f.scripts.length, 0); assert.equal(f.writes.length, 0);
  }
  const f = fixture({ failure: 'read' }); assert.equal(f.start().status().storageAvailable, false); assert.equal(f.scripts.length, 0);
});

test('known automation suppresses even a hypothetically qualified production loader', () => {
  for (const userAgent of ['HeadlessChrome', 'Playwright', 'Googlebot', 'ChatGPT-User', 'Claude-User', 'PerplexityBot', 'OAI-SearchBot']) {
    assert.equal(analyticsKnownAutomation({ userAgent }), true);
    const f = fixture({ automation: { userAgent } }); f.start(); assert.equal(f.scripts.length, 0);
  }
  const f = fixture({ automation: { webdriver: true } }); f.start(); assert.equal(f.scripts.length, 0);
});

test('eligible document gets one origin-only policy immediately before one native loader, whose file fetch stays no-referrer', () => {
  const f = fixture(); const c = f.start(); assert.equal(c.status().loaded, true); assert.equal(f.start(), c);
  assert.equal(f.policies.length, 1); assert.equal(f.policies[0].name, 'referrer'); assert.equal(f.policies[0].content, 'strict-origin');
  assert.deepEqual(f.appended.map(node => node.tagName), ['META', 'SCRIPT']);
  assert.equal(f.appended[0], f.policies[0]); assert.equal(f.appended[1], f.scripts[0]);
  assert.equal(f.scripts.length, 1); assert.equal(f.scripts[0].src, ANALYTICS_SCRIPT);
  assert.equal(f.scripts[0].type, 'module'); assert.equal(f.scripts[0].referrerPolicy, 'no-referrer');
  assert.deepEqual(JSON.parse(f.scripts[0].attributes['data-cf-beacon']), { token: qualified.beaconToken, spa: false });
  assert.notEqual(qualified.beaconToken, qualified.reportingSiteTag);
  assert.notEqual(JSON.parse(f.scripts[0].attributes['data-cf-beacon']).token, qualified.reportingSiteTag);
  const reportingOnly = fixture({ config: { ...qualified, beaconToken: undefined } });
  assert.equal(reportingOnly.start().status().reason, 'site-unconfigured');
  assert.equal(reportingOnly.appended.length, 0);
  assert.equal(f.writes.length, 0);
  const injected = fixture({ existingScript: true }); assert.equal(injected.start().status().loaded, false); assert.equal(injected.appended.length, 0);
});

test('ineligible or unreadable/excluded browsers cannot change document policy or append an SDK', () => {
  for (const options of [
    { url: `${ANALYTICS_ORIGIN}/` }, { url: `${ANALYTICS_ORIGIN}/projects/?private=1` },
    { url: 'https://pulse-staging.inshell.art/projects/' }, { regionMarker: null }, { regionMarker: 'off' },
    { referrer: `${ANALYTICS_ORIGIN}/private` }, { automation: { webdriver: true } }, { failure: 'read' },
  ]) {
    const f = fixture(options); assert.equal(f.start().status().loaded, false); assert.equal(f.appended.length, 0);
  }
  const excluded = fixture(); excluded.data.set(ANALYTICS_EXCLUSION_KEY, '1');
  assert.equal(excluded.start().status().loaded, false); assert.equal(excluded.appended.length, 0);
});

test('exclusion alone changes its existing boolean, preserving saved scenarios, old choices and functional data', () => {
  const f = fixture({ config: ANALYTICS_CONFIG });
  const kept = new Map([['pulse-core-playground/v1', '{"scenario":"saved"}'], ['pulse.analytics.preference.v1', '{"choice":"allow"}'], ['auth', 'unchanged']]);
  for (const [key, value] of kept) f.data.set(key, value);
  const c = f.start(); assert.equal(c.setExcluded(true).excluded, true); assert.equal(c.setExcluded(false).excluded, false);
  assert.deepEqual(f.writes, [[ANALYTICS_EXCLUSION_KEY, '1'], [ANALYTICS_EXCLUSION_KEY, '0']]);
  for (const [key, value] of kept) assert.equal(f.data.get(key), value);
  assert.equal(f.scripts.length, 0); assert.equal(f.reloads(), 0);
});

test('exclusion removal and old consent storage events cannot activate an existing document', () => {
  const f = fixture(); f.data.set(ANALYTICS_EXCLUSION_KEY, '1'); const c = f.start();
  c.setExcluded(false); f.win.dispatch('storage', { key: 'pulse.analytics.preference.v1' });
  assert.equal(f.scripts.length, 0); assert.equal(c.status().loaded, false);
});

test('hypothetical loaded-document withdrawal requests a real boundary, never pretends script removal stops handlers', () => {
  for (const event of ['exclude', 'storage', 'hashchange', 'popstate']) {
    const f = fixture(); f.data.set('pulse-core-playground/v1', 'saved'); const c = f.start();
    if (event === 'exclude') c.setExcluded(true);
    else if (event === 'storage') { f.data.set(ANALYTICS_EXCLUSION_KEY, '1'); f.win.dispatch('storage', { key: ANALYTICS_EXCLUSION_KEY }); }
    else { f.win.location.href += '#private'; f.win.dispatch(event); }
    assert.equal(c.status().reloadRequired, true); assert.equal(f.reloads(), 1); assert.equal(f.data.get('pulse-core-playground/v1'), 'saved');
    if (event === 'exclude' || event === 'storage') {
      const next = fixture(); for (const [key, value] of f.data) next.data.set(key, value);
      assert.equal(next.start().status().reason, 'browser-excluded'); assert.equal(next.scripts.length, 0);
      assert.equal(next.data.get('pulse-core-playground/v1'), 'saved'); assert.equal(next.writes.length, 0);
    }
    // Offline reload intent and next-document gate only, not native final-send cancellation.
    assert.equal(ANALYTICS_CONFIG.documentLifecycleQualified, false);
  }
});

test('failed or silently dropped exclusion writes are reported, never clear stored data', () => {
  for (const failure of ['write', 'silent-write']) {
    const f = fixture({ config: ANALYTICS_CONFIG, failure }); f.data.set('saved', 'keep');
    const state = f.start().setExcluded(true); assert.equal(state.storageAvailable, false); assert.equal(f.data.get('saved'), 'keep'); assert.equal(f.appended.length, 0);
  }
});

test('page/CSP integration removes GA4 and all consent prompts while keeping quiet Privacy and a disabled exclusion UI fallback', () => {
  for (const file of ['index.html', 'projects.html']) {
    const text = readFileSync(new URL(file, import.meta.url), 'utf8');
    assert.doesNotMatch(text, /Google Analytics|gtag|googletagmanager|analytics-notice|analytics-settings|<dialog|Allow analytics|Reject analytics/);
    assert.match(text, /<summary>Privacy<\/summary>/); assert.match(text, /data-privacy-action="exclude" disabled/);
    assert.match(text, /src="\/analytics.js"/);
    assert.match(text, /measurement is limited to the public Projects page at \/projects\//);
    assert.match(text, /Excluding this browser prevents measurement on later page loads/);
    assert.match(text, /If this page is being measured, it reloads; a final performance report .* may be sent while it closes/);
    assert.match(text, /Your saved scenarios are unchanged/);
    assert.match(text, /whole measured document/); assert.match(text, /without the page path or query/);
    assert.doesNotMatch(text, /<meta\b[^>]*name=["']referrer["']/);
  }
  for (const file of ['README.md', 'docs/playground.md']) {
    const text = readFileSync(new URL(file, import.meta.url), 'utf8');
    assert.match(text, /Home-to-Projects/); assert.match(text, /external.*allowlist is empty/);
    assert.match(text, /cross-tab/i); assert.match(text, /final.*report/);
    assert.match(text, /private-path final-send.*(?:FAIL|failure)/);
  }
  for (const file of ['worker.js', 'server.js']) {
    const text = readFileSync(new URL(file, import.meta.url), 'utf8');
    assert.doesNotMatch(text, /google-analytics|googletagmanager|analytics\.google/);
    assert.match(text, /script-src 'self' https:\/\/static\.cloudflareinsights\.com;/);
    assert.match(text, /connect-src 'self' https:\/\/cloudflareinsights\.com;/);
    assert.match(text, /"Referrer-Policy": "no-referrer"/);
  }
});

test('actual quiet Privacy entry preserves storage and applies exclusion without a dialog or collector', async () => {
  const f = fixture({ config: ANALYTICS_CONFIG });
  const status = { textContent: '' };
  function control() { const t = new Target(); t.hidden = false; t.disabled = false; t.focus = () => { t.focused = true; }; return t; }
  const exclude = control(), include = control(); include.hidden = true;
  f.doc.querySelector = selector => ({ '[data-privacy-status]': status, '[data-privacy-action="exclude"]': exclude,
    '[data-privacy-action="include"]': include })[selector] ?? null;
  f.data.set('pulse-core-playground/v1', 'saved-scenario'); f.data.set('pulse.analytics.preference.v1', 'old-record');
  const oldWindow = globalThis.window, oldDocument = globalThis.document;
  globalThis.window = f.win; globalThis.document = f.doc;
  try {
    await import(`./analytics.js?privacy-fixture`);
    assert.equal(exclude.disabled, false); assert.match(status.textContent, /off/);
    exclude.dispatch('click'); assert.equal(f.data.get(ANALYTICS_EXCLUSION_KEY), '1');
    assert.equal(exclude.hidden, true); assert.equal(include.hidden, false); assert.equal(include.focused, true);
    assert.match(status.textContent, /excluded/);
    include.dispatch('click'); assert.equal(f.data.get(ANALYTICS_EXCLUSION_KEY), '0'); assert.equal(exclude.focused, true);
    assert.equal(f.data.get('pulse-core-playground/v1'), 'saved-scenario'); assert.equal(f.data.get('pulse.analytics.preference.v1'), 'old-record');
    assert.equal(f.scripts.length, 0); assert.equal(f.reloads(), 0);
  } finally {
    if (oldWindow === undefined) delete globalThis.window; else globalThis.window = oldWindow;
    if (oldDocument === undefined) delete globalThis.document; else globalThis.document = oldDocument;
  }
});

test('server marker is mandatory and composes with every existing browser gate, never grants qualification', () => {
  for (const regionMarker of [null, '', 'off', 'US', 'true', 'Eligible']) {
    assert.equal(eligible({ regionMarker }), 'server-region-off');
    const f = fixture({ regionMarker }); f.start(); assert.equal(f.scripts.length, 0);
  }
  const duplicates = fixture(); duplicates.doc.querySelectorAll = () => [{ getAttribute: () => 'eligible' }, { getAttribute: () => 'eligible' }];
  duplicates.start(); assert.equal(duplicates.scripts.length, 0);
  const f = fixture({ regionMarker: 'eligible', config: ANALYTICS_CONFIG }); f.start(); assert.equal(f.scripts.length, 0);
  for (const regionMarker of [null, 'off', 'eligible']) {
    const tab = fixture({ regionMarker }); tab.data.set(ANALYTICS_EXCLUSION_KEY, '1'); tab.data.set('saved', 'keep'); tab.start();
    assert.equal(tab.scripts.length, 0); assert.equal(tab.data.get('saved'), 'keep'); assert.equal(tab.writes.length, 0);
  }
});
