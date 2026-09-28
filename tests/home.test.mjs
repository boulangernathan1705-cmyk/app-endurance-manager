import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import workerWithMigrations from '../server/worker-with-migrations.mjs';

const assets = {fetch: async () => new Response('<html><body>accueil</body></html>', {headers:{'Content-Type':'text/html; charset=utf-8', ETag:'"abc"'}})};
const home = (path, cookie = '') => workerWithMigrations.fetch(new Request(`https://site.example${path}`, {headers: cookie ? {Cookie: cookie} : {}}), {ASSETS: assets}, {});

test('a returning pilot goes straight to the simulator they chose', async () => {
  const response = await home('/', 'em_session=x; em_sim=iracing');
  assert.equal(response.status, 302);
  assert.equal(response.headers.get('Location'), '/iracing/');
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
});

test('the home page stays reachable with ?accueil, for new visitors and unknown values', async () => {
  for (const [path, cookie] of [['/?accueil', 'em_sim=lmu'], ['/', ''], ['/', 'em_sim=elsewhere']]) {
    const response = await home(path, cookie);
    assert.equal(response.status, 200, `${path} ${cookie}`);
    assert.equal(response.headers.get('ETag'), null, 'the home page is never answered with a stale 304');
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
  }
});

test('simulator spaces remember the choice and the logo leads to the chosen simulator', () => {
  assert.match(readFileSync(new URL('../front/game-context.js', import.meta.url), 'utf8'), /em_sim=\$\{game\}; path=\/; max-age=31536000; SameSite=Lax/);
  for (const page of ['game.html', 'members.html', 'help.html', 'about.html'])
    assert.match(readFileSync(new URL(`../${page}`, import.meta.url), 'utf8'), /class="brand-button logo" href="\/"/, page);
  const prod = JSON.parse(readFileSync(new URL('../wrangler.prod.jsonc', import.meta.url), 'utf8'));
  assert.ok(prod.assets.run_worker_first.includes('/'));
  assert.equal(prod.assets.binding, 'ASSETS');
});

test('after the Discord login, a pilot without a simulator picks one in a small window', () => {
  const hub = readFileSync(new URL('../front/game-hub.mjs', import.meta.url), 'utf8');
  assert.match(hub, /if \(!\/\(\?:\^\|;\\s\*\)em_sim=\/\.test\(document\.cookie\)\) openSimChooser\(session\.user\.name\)/);
  assert.match(hub, /href="\$\{sim\.href\}"/);
  // The home page no longer lists races: the simulator spaces do.
  assert.doesNotMatch(hub, /\/api\/races/);
});
