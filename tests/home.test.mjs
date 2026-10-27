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

test('with EVENT TDZ, the events calendar is the home page; the simulator is asked in Endurance', async () => {
  const {homeRedirect} = await import('../server/home.mjs');
  const events = {slug:'tdz', modules:{soloRaces:true}};
  const go = cookie => homeRedirect(new Request('https://site.example/', {headers: cookie ? {Cookie: cookie} : {}}), events)?.headers.get('Location');
  assert.equal(go(''), '/events/');
  assert.equal(go('em_sim=iracing'), '/events/');
  assert.equal(homeRedirect(new Request('https://site.example/?accueil'), events), null);
  assert.equal(homeRedirect(new Request('https://site.example/'), {modules:{}}), null);
  const context = readFileSync(new URL('../front/game-context.js', import.meta.url), 'utf8');
  assert.match(context, /if \(!events && \(chosen \|\| !\/\^#\(solo\|event=\)\/i\.test\(location\.hash\)\)\)/);
  // The calendar has its own address (/events/); older links, even typed by hand (/lmu/#SOLO), lead there.
  const router = readFileSync(new URL('../front/app/router.mjs', import.meta.url), 'utf8');
  assert.match(router, /const hash=location\.hash\.toLowerCase\(\);[\s\S]*if\(hash===SOLO_HASH\)\{history\.replaceState\(null,'',EVENTS_PATH\+location\.search\);return \{page:'home',list:'solo'\};\}/);
  assert.match(router, /if\(onEvents\(\)\)return \{page:'home',list:'solo'\}/);
  assert.match(context, /const game = events \? remembered \|\| 'lmu'/);
  assert.match(readFileSync(new URL('../front/app/actions.mjs', import.meta.url), 'utf8'), /state\.soloRaces&&!simChosen\(\)\)\{openSimChooser\(\)/);
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
  // The site's pages and the API go through the Worker (the address says which community); everything else is
  // served directly, and an unknown address gets public/404.html without the Worker (free and outside the daily
  // quota: on 2026-10-12 a robot tried ~900,000 addresses in an hour and used up the free plan).
  const routes = prod.assets.run_worker_first;
  assert.ok(!routes.includes('/*'), 'unknown addresses must not wake the Worker');
  assert.equal(prod.assets.not_found_handling, '404-page');
  for (const route of ['/', '/api/*', '/telemetry/*', '/manifest.webmanifest', '/app-icon.png', '/lmu*', '/iracing*', '/events*'])
    assert.ok(routes.includes(route), route);
  for (const page of ['members', 'help', 'about', 'legal', 'privacy', 'changelog', 'circuit-credits', 'demande-communaute', 'diagnostics', 'fiches-combo', 'mur-des-stands', 'mur'])
    assert.ok(routes.some(route => route.endsWith('*') && `/${page}`.startsWith(route.slice(0, -1))), page);
  // Wrangler refuses the deploy when a route is already covered by a shorter one ('/mur*' covers '/mur-des-stands*').
  for (const route of routes) assert.ok(!routes.some(other => other !== route && other.endsWith('*') && !other.startsWith('!') && !route.startsWith('!') && route.startsWith(other.slice(0, -1))), `${route} is redundant`);
  for (const route of routes.filter(route => route.startsWith('!'))) assert.doesNotMatch(route, /\.html|^!\/(?:\*|api|telemetry|downloads|lmu|iracing)/, route);
  assert.match(readFileSync(new URL('../404.html', import.meta.url), 'utf8'), /Page introuvable/);
  assert.equal(prod.assets.binding, 'ASSETS');
});

test('after the Discord login, a pilot without a simulator picks one in a small window', () => {
  const hub = readFileSync(new URL('../front/game-hub.mjs', import.meta.url), 'utf8');
  assert.match(hub, /if \(!\/\(\?:\^\|;\\s\*\)em_sim=\/\.test\(document\.cookie\)\) openSimChooser\(session\.user\.name\)/);
  assert.match(hub, /href="\$\{sim\.href\}"/);
  // The home page no longer lists races: the simulator spaces do.
  assert.doesNotMatch(hub, /\/api\/races/);
});
