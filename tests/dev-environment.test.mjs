import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import workerWithMigrations from '../server/worker-with-migrations.mjs';

const read = path => JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'));
const page = () => new Response('<html><body><main>ok</main></body></html>', {headers:{'Content-Type':'text/html; charset=utf-8'}});

test('only the dev configuration marks the site as a test version', () => {
  const dev = read('wrangler.jsonc');
  assert.equal(dev.vars.SITE_ENV, 'development');
  // Pages go through the worker on dev, which then needs the static files binding (static files are served directly).
  assert.ok(dev.assets.run_worker_first.includes('/*'));
  assert.ok(dev.assets.run_worker_first.every(route => route === '/*' || /^!\/(?:front|shared|images)\/\*$|^!\/[\w-]+\.(?:js|css)$/.test(route)));
  assert.equal(dev.assets.binding, 'ASSETS');
  assert.equal(read('wrangler.prod.jsonc').vars.SITE_ENV, undefined);
});

test('dev pages are kept out of search engines; production pages are untouched', async () => {
  const assets = {fetch: async () => page()};
  const dev = await workerWithMigrations.fetch(new Request('https://dev.example/lmu/'), {ASSETS:assets, SITE_ENV:'development'}, {});
  assert.equal(dev.headers.get('X-Robots-Tag'), 'noindex, nofollow');
  const robots = await workerWithMigrations.fetch(new Request('https://dev.example/robots.txt'), {ASSETS:assets, SITE_ENV:'development'}, {});
  assert.match(await robots.text(), /Disallow: \//);
  const prod = await workerWithMigrations.fetch(new Request('https://prod.example/lmu/'), {ASSETS:assets}, {});
  assert.equal(prod.headers.get('X-Robots-Tag'), null);
  assert.doesNotMatch(await prod.text(), /dev-site-banner/);
});

test('a development site used for real by a team (TEST_BANNER=off) has no banner but stays out of search engines', async () => {
  const assets = {fetch: async () => page()};
  const env = {ASSETS:assets, SITE_ENV:'development', TEST_BANNER:'off'};
  globalThis.HTMLRewriter ??= class { on(){return this;} transform(){ throw new Error('the banner must not be added'); } };
  try {
    const response = await workerWithMigrations.fetch(new Request('https://commu-dev.example/lmu/'), env, {});
    assert.equal(response.headers.get('X-Robots-Tag'), 'noindex, nofollow');
    assert.doesNotMatch(await response.text(), /dev-site-banner/);
  } finally { delete globalThis.HTMLRewriter; }
  const dev = JSON.parse(readFileSync(new URL('../wrangler.dev.jsonc', import.meta.url), 'utf8').replace(/^\s*\/\/.*$/gm, ''));
  assert.equal(dev.vars.TEST_BANNER, 'off');
});

test('an unknown page shows a "page introuvable" page, not a blank one', async () => {
  const assets = {fetch:async () => new Response(null, {status:404})};
  const html = await workerWithMigrations.fetch(new Request('https://site.example/page-inexistante', {headers:{Accept:'text/html'}}), {ASSETS:assets}, {});
  assert.equal(html.status, 404);
  assert.match(await html.text(), /Page introuvable/);
  // A missing image or script keeps its plain 404.
  const image = await workerWithMigrations.fetch(new Request('https://site.example/images/absente.png', {headers:{Accept:'image/*'}}), {ASSETS:assets}, {});
  assert.equal(image.status, 404);
  assert.equal(await image.text(), '');
});
