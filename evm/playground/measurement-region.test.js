import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorker } from './worker.js';
import { DENIED_COUNTRIES, projectsRegionBit, markMeasurementHtml } from './measurement-region.js';
const origin = 'https://pulse.inshell.art';
const html = '<!doctype html><html><head><title>Projects</title></head><body>Public projects</body></html>';
function request(country, path = '/projects/', host = origin, extra = {}) {
  const req = new Request(host + path, { headers: { 'CF-IPCountry': 'US', 'X-Country': 'US' }, ...extra });
  if (country !== undefined) Object.defineProperty(req, 'cf', { value: { country } });
  return req;
}
const worker = () => createWorker(() => { throw Error('No live RPC permitted'); });
function env(documentEnvironment = 'production') {
  const raw = new Map([['/projects.html', html], ['/index.html', html], ['/styles.css', 'raw-css'], ['/docs/agent-index.json', '{"static":true}']]);
  const touched = [];
  return { PULSE_MEASUREMENT_DOCUMENT_ENV: documentEnvironment, raw, touched,
    ASSETS: { fetch: async req => { const path = new URL(req.url).pathname; touched.push(path); return new Response(req.method === 'HEAD' ? null : raw.get(path), { headers: { ETag: 'raw-asset', 'Cache-Control': 'public,max-age=3600' } }); } } };
}
const expected = bit => `<meta name="pulse-measurement-region" content="${bit}">`;

test('trusted country only: all restricted codes and malformed/unknown country stay off', () => {
  for (const country of DENIED_COUNTRIES) assert.equal(projectsRegionBit(request(country), 'production'), 'off', country);
  for (const country of [undefined, null, '', 'XX', 'T1', 'ZZ', 'AA', 'EU', 'UK', 'us', ' US', 'USA', 1, {}, ['US']])
    assert.equal(projectsRegionBit(request(country), 'production'), 'off', String(country));
  for (const country of ['US', 'CN', 'SG', 'JP', 'AU', 'CA']) assert.equal(projectsRegionBit(request(country), 'production'), 'eligible');
  const req = request(undefined); const accessed = [];
  Object.defineProperty(req, 'cf', { value: new Proxy({}, { get(_target, key) { accessed.push(key); if (key !== 'country') throw Error('Sensitive property'); return 'US'; } }) });
  assert.equal(projectsRegionBit(req, 'production'), 'eligible'); assert.deepEqual(accessed, ['country']);
  assert.equal(projectsRegionBit(request(undefined), 'production'), 'off', 'Spoofed country headers ignored');
});

test('only canonical production Projects GET/HEAD is a prospective document: aliases and environments fail closed', () => {
  for (const path of ['/', '/projects', '/projects.html', '/projects/?', '/projects/#', '/projects/?country=US', '/projects/#private', '/api/status', '/api/call', '/auth', '/docs/agent-prompt.txt'])
    assert.equal(projectsRegionBit(request('US', path), 'production'), 'off', path);
  for (const host of ['http://pulse.inshell.art', 'https://pulse-staging.inshell.art', 'https://preview.pages.dev', 'https://user.workers.dev', 'http://127.0.0.1:4173'])
    assert.equal(projectsRegionBit(request('US', '/projects/', host), 'production'), 'off');
  for (const mode of [undefined, '', 'local', 'test', 'CI', 'staging', true]) assert.equal(projectsRegionBit(request('US'), mode), 'off');
  assert.equal(projectsRegionBit(request('US', '/projects/', origin, { method: 'HEAD' }), 'production'), 'eligible');
  assert.equal(projectsRegionBit(request('US', '/projects/', origin, { method: 'POST' }), 'production'), 'off');
});

test('existing Worker simulates allowed/denied/unknown HTML in both country request orders without mutating raw cache', async () => {
  for (const sequence of [['SG', 'GB', undefined, 'SG'], ['GB', 'SG', 'ZZ', 'GB'], ['US', 'DE', undefined, 'CN'], ['DE', 'US', 'CH', 'US'], [undefined, 'US', 'ZZ', 'US']]) {
    const runtime = worker(), assets = env();
    for (const country of sequence) {
      const response = await runtime.fetch(request(country), assets);
      const bit = ['US', 'CN', 'SG'].includes(country) ? 'eligible' : 'off';
      const body = await response.text(); assert.equal(response.status, 200);
      assert.equal(response.headers.get('Cache-Control'), 'no-store'); assert.equal(response.headers.get('ETag'), null);
      assert.equal((body.match(/name="pulse-measurement-region"/g) ?? []).length, 1);
      assert.ok(body.includes(expected(bit))); assert.doesNotMatch(body, /country=|"country"|city|latitude|longitude|asn/i);
      assert.equal(assets.raw.get('/projects.html'), html); assert.ok(!assets.raw.get('/projects.html').includes('pulse-measurement-region'));
    }
    for (const path of ['/styles.css', '/docs/agent-index.json']) {
      const response = await runtime.fetch(request('US', path), assets);
      assert.equal(await response.text(), assets.raw.get(path)); assert.equal(response.headers.get('ETag'), 'raw-asset');
    }
  }
});

test('Home and canonical alias never receive eligible bit, ordinary builds are off, HEAD has no rewritten body', async () => {
  for (const path of ['/', '/projects', '/projects/?x=private']) {
    const response = await worker().fetch(request('US', path), env()); assert.ok((await response.text()).includes(expected('off')));
  }
  assert.equal((await worker().fetch(request('US', '/projects.html'), env())).status, 404, 'not a public route; no new alias');
  for (const mode of [undefined, 'local', 'staging', 'CI']) {
    const assets = env(mode); if (mode === undefined) delete assets.PULSE_MEASUREMENT_DOCUMENT_ENV;
    const response = await worker().fetch(request('US'), assets); assert.ok((await response.text()).includes(expected('off')));
  }
  const response = await worker().fetch(request('US', '/projects/', origin, { method: 'HEAD' }), env());
  assert.equal(await response.text(), ''); assert.equal(response.headers.get('Cache-Control'), 'no-store');
});


test('HTML cannot reuse raw conditional/range validators; static assets keep their request cache semantics', async () => {
  const assets = env(), seen = []; const original = assets.ASSETS.fetch;
  assets.ASSETS.fetch = async req => { seen.push(req); return original(req); };
  const headers = { 'If-None-Match': 'old', 'If-Modified-Since': 'old', Range: 'bytes=0-10', 'If-Range': 'old' };
  const response = await worker().fetch(request('US', '/projects/', origin, { headers }), assets);
  assert.ok((await response.text()).includes(expected('eligible')));
  for (const name of Object.keys(headers)) assert.equal(seen[0].headers.has(name), false);
  await worker().fetch(request('DE', '/styles.css', origin, { headers }), assets);
  assert.equal(seen[1].headers.get('If-None-Match'), 'old');
  assert.equal(markMeasurementHtml('<head><meta content="eligible" name="pulse-measurement-region"></head>', 'eligible'), '<head></head>');
  assert.equal(markMeasurementHtml('no-head', 'eligible'), 'no-head');
});

test('HTML strips inherited shared-cache overrides for both country orders, HEAD, errors and unrewritten responses; static assets retain them', async () => {
  const overrides = { 'Cache-Control': 'public,max-age=3600', 'CDN-Cache-Control': 'public,max-age=600',
    'Cloudflare-CDN-Cache-Control': 'public,max-age=600', 'Surrogate-Control': 'max-age=600', ETag: 'raw' };
  const sharedNames = ['CDN-Cache-Control', 'Cloudflare-CDN-Cache-Control', 'Surrogate-Control'];
  for (const sequence of [['US', 'DE', undefined], [undefined, 'DE', 'US']]) {
    for (const [status, method, rawHtml] of [[200, 'GET', html], [200, 'HEAD', html], [404, 'GET', html],
      [500, 'HEAD', html], [500, 'GET', html], [302, 'GET', html], [304, 'GET', null], [200, 'GET', 'no head tag']]) {
      const runtime = worker();
      const assets = { PULSE_MEASUREMENT_DOCUMENT_ENV: 'production', ASSETS: { fetch: async req => {
        const path = new URL(req.url).pathname;
        return new Response(method === 'HEAD' || status === 304 ? null : path.endsWith('.html') ? rawHtml : 'raw static', { status, headers: overrides });
      } } };
      for (const country of sequence) for (const path of ['/projects/', '/projects', '/']) {
        const response = await runtime.fetch(request(country, path, origin, { method }), assets);
        assert.equal(response.status, status); assert.equal(response.headers.get('Cache-Control'), 'no-store');
        for (const name of sharedNames) assert.equal(response.headers.get(name), null, `${name}: ${country}/${method}/${status}`);
        const body = await response.text();
        if (status === 200 && method === 'GET' && rawHtml === html) assert.ok(body.includes(expected(country === 'US' && path === '/projects/' ? 'eligible' : 'off')));
      }
      const staticResponse = await runtime.fetch(request('US', '/styles.css', origin, { method }), assets);
      for (const name of sharedNames) assert.equal(staticResponse.headers.get(name), overrides[name]);
      assert.equal(staticResponse.headers.get('ETag'), 'raw');
      assert.equal(overrides['CDN-Cache-Control'], 'public,max-age=600', 'Raw asset header source not mutated');
    }
  }
});
