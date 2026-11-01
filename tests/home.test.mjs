import test from 'node:test';
import assert from 'node:assert/strict';
import {readdirSync, readFileSync} from 'node:fs';
import workerWithMigrations from '../server/worker-with-migrations.mjs';

const assets = {fetch: async () => new Response('<html><body>accueil</body></html>', {headers:{'Content-Type':'text/html; charset=utf-8', ETag:'"abc"'}})};
const home = (path, cookie = '') => workerWithMigrations.fetch(new Request(`https://site.example${path}`, {headers: cookie ? {Cookie: cookie} : {}}), {ASSETS: assets}, {});

test('"/" opens the « Accueil » in the simulator the pilot chose, LMU otherwise', async () => {
  for (const [cookie, location] of [['em_session=x; em_sim=iracing', '/iracing/#accueil'], ['em_sim=lmu', '/lmu/#accueil'], ['', '/lmu/#accueil'], ['em_sim=elsewhere', '/lmu/#accueil']]) {
    const response = await home('/', cookie);
    assert.equal(response.status, 302, cookie);
    assert.equal(response.headers.get('Location'), location, cookie);
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
  }
  const {homeRedirect} = await import('../server/home.mjs');
  // With EVENT TDZ too: the « Accueil » shows the events with the endurances.
  assert.equal(homeRedirect(new Request('https://site.example/')).headers.get('Location'), '/lmu/#accueil');
  const context = readFileSync(new URL('../front/game-context.js', import.meta.url), 'utf8');
  // The « Accueil », the events calendar and a shared race are not a choice of simulator.
  assert.match(context, /if \(!events && \(chosen \|\| !\/\^#\(solo\|event=\|accueil\)\/i\.test\(location\.hash\)\)\)/);
  // The calendar has its own address (/events/); older links, even typed by hand (/lmu/#SOLO), lead there.
  const router = readFileSync(new URL('../front/app/router.mjs', import.meta.url), 'utf8');
  assert.match(router, /const hash=location\.hash\.toLowerCase\(\);[\s\S]*if\(hash===SOLO_HASH\)\{history\.replaceState\(null,'',EVENTS_PATH\+location\.search\);return \{page:'home',list:'solo'\};\}/);
  assert.match(router, /if\(onEvents\(\)\)return \{page:'home',list:'solo'\}/);
  assert.match(context, /const game = events \? remembered \|\| 'lmu'/);
  assert.match(readFileSync(new URL('../front/app/actions.mjs', import.meta.url), 'utf8'), /state\.soloRaces&&!simChosen\(\)\)\{openSimChooser\(\)/);
});

test('the former simulator choice stays reachable with ?accueil', async () => {
  const response = await home('/?accueil', 'em_sim=lmu');
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('ETag'), null, 'the home page is never answered with a stale 304');
  assert.equal(response.headers.get('Cache-Control'), 'no-store, no-transform');
});

test('simulator spaces remember the choice and the logo leads to the chosen simulator', () => {
  assert.match(readFileSync(new URL('../front/game-context.js', import.meta.url), 'utf8'), /em_sim=\$\{game\}; path=\/; max-age=31536000; SameSite=Lax/);
  for (const page of ['game.html', 'members.html', 'help.html', 'about.html'])
    assert.match(readFileSync(new URL(`../${page}`, import.meta.url), 'utf8'), /class="brand-button logo" href="\/"/, page);
  const prod = JSON.parse(readFileSync(new URL('../wrangler.prod.jsonc', import.meta.url), 'utf8'));
  // The site's pages and the API go through the Worker (the address says which community); everything else is
  // served directly, and an unknown address gets public/404.html without the Worker (free and outside the daily
  // quota: on 2026-10-12 a robot tried ~900,000 addresses in an hour and used up the free plan).
  const routes = prod.assets.run_worker_first;
  assert.ok(!routes.includes('/*'), 'unknown addresses must not wake the Worker');
  assert.equal(prod.assets.not_found_handling, '404-page');
  // /discord/*: the clicks on the « Absent » button of the races' threads (server/discord-interactions.mjs).
  for (const route of ['/', '/api/*', '/telemetry/*', '/discord/*', '/manifest.webmanifest', '/app-icon.png', '/lmu*', '/iracing*', '/events*'])
    assert.ok(routes.includes(route), route);
  // Every page of the site (each .html at the root), not only those known today: a new page works on dev (where
  // everything goes through the Worker) and must not be forgotten in production. Pages without a route of their own:
  // index (« / »), game (served under /lmu and /iracing), 404 and offline (served without the Worker).
  const pages = readdirSync(new URL('..', import.meta.url)).filter(name => name.endsWith('.html')).map(name => name.slice(0, -5))
    .filter(page => !['index', 'game', '404', 'offline'].includes(page));
  assert.ok(pages.length >= 12, 'the pages are found');
  for (const page of pages)
    assert.ok(routes.some(route => route.endsWith('*') && `/${page}`.startsWith(route.slice(0, -1))), `${page}.html must be in run_worker_first of wrangler.prod.jsonc`);
  // Wrangler refuses the deploy when a route is already covered by a shorter one ('/mur*' covers '/mur-des-stands*').
  for (const route of routes) assert.ok(!routes.some(other => other !== route && other.endsWith('*') && !other.startsWith('!') && !route.startsWith('!') && route.startsWith(other.slice(0, -1))), `${route} is redundant`);
  for (const route of routes.filter(route => route.startsWith('!'))) assert.doesNotMatch(route, /\.html|^!\/(?:\*|api|telemetry|downloads|lmu|iracing)/, route);
  assert.match(readFileSync(new URL('../404.html', import.meta.url), 'utf8'), /Page introuvable/);
  assert.equal(prod.assets.binding, 'ASSETS');
});

test('after the Discord login, a pilot without a simulator picks one on the page itself, asked once', () => {
  const hub = readFileSync(new URL('../front/game-hub.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(hub, /openSimChooser|showModal/);
  assert.match(hub, /Choisis ta simu ci-dessous/);
  // The home page no longer lists races: the simulator spaces do.
  assert.doesNotMatch(hub, /\/api\/races/);
});
