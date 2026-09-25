import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import workerWithMigrations from '../server/worker-with-migrations.mjs';

const read = path => JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'));
const page = () => new Response('<html><body><main>ok</main></body></html>', {headers:{'Content-Type':'text/html; charset=utf-8'}});

test('only the dev configuration marks the site as a test version', () => {
  const dev = read('wrangler.jsonc');
  assert.equal(dev.vars.SITE_ENV, 'development');
  // Pages go through the worker on dev, which then needs the static files binding.
  assert.equal(dev.assets.run_worker_first, true);
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
