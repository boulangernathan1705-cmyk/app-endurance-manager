import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile, access} from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('le build produit les deux espaces simulateurs et Cloudflare conserve les URLs avec slash', async () => {
  const [build, wrangler, home, hub, helpLoader] = await Promise.all([
    read('scripts/build.mjs'),
    read('wrangler.jsonc'),
    read('index.html'),
    read('front/game-hub.mjs'),
    read('front/help-loader.mjs')
  ]);

  assert.match(build, /lmu\/index\.html/);
  assert.match(build, /iracing\/index\.html/);
  assert.equal(JSON.parse(wrangler).assets.html_handling, 'auto-trailing-slash');
  assert.match(home, /href="\/lmu\/"/);
  assert.match(home, /href="\/iracing\/"/);
  assert.match(hub, /'\/lmu\/'/);
  assert.match(hub, /'\/iracing\/'/);
  assert.match(helpLoader, /href="\/lmu\/"/);
  assert.match(helpLoader, /href="\/iracing\/"/);
});

test('les inscriptions sont rendues nativement sans observateur DOM parallèle', async () => {
  const [app, game] = await Promise.all([read('app.js'), read('game.html')]);
  let sharingExists = true;
  try { await access(new URL('../front/registration-sharing.mjs', import.meta.url)); }
  catch { sharingExists = false; }

  assert.equal(sharingExists, false);
  assert.doesNotMatch(game, /front\/registration-sharing\.mjs/);
  assert.match(app, /function renderRegistrationWorkspace\(event,departure\)/);
  assert.match(app, /renderRegistrationForm\(event,departure\)/);
  assert.doesNotMatch(app, /new MutationObserver/);
});
