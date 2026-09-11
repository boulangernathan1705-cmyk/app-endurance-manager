import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile, access} from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('le build produit les deux espaces simulateurs et Cloudflare conserve les URLs avec slash', async () => {
  const [build, wrangler, home, hub, homeView] = await Promise.all([
    read('scripts/build.mjs'),
    read('wrangler.jsonc'),
    read('index.html'),
    read('front/game-hub.mjs'),
    read('front/app/home-view.mjs')
  ]);

  assert.match(build, /lmu\/index\.html/);
  assert.match(build, /iracing\/index\.html/);
  assert.equal(JSON.parse(wrangler).assets.html_handling, 'auto-trailing-slash');
  assert.match(home, /href="\/lmu\/"/);
  assert.match(home, /href="\/iracing\/"/);
  assert.match(hub, /'\/lmu\/'/);
  assert.match(hub, /'\/iracing\/'/);
  assert.match(homeView, /href="\/lmu\/"/);
  assert.match(homeView, /href="\/iracing\/"/);
});

test('la base commune rend les inscriptions sans interface parallèle', async () => {
  const [app, game, registration, eventView] = await Promise.all([
    read('app.js'),
    read('game.html'),
    read('front/app/registration.mjs'),
    read('front/app/event-view.mjs')
  ]);

  assert.match(app, /front\/app\/actions\.mjs/);
  assert.match(registration, /function renderRegistrationWorkspace\(event,departure\)/);
  assert.match(registration, /function renderRegistrationForm\(event,departure,stateDraft=draftFor\(departure\)\)/);
  assert.match(eventView, /Inscrire un autre pilote/);
  assert.doesNotMatch(game, /registration-sharing|ux-refinement\.js|crew-accordion\.js|crew-controls\.mjs|layout-polish\.mjs|course-crew-flatten\.mjs|my-entries-native\.mjs/);
});

test('les scripts actifs ne dépendent plus de MutationObserver ni d’un proxy global fetch', async () => {
  const paths = [
    'app.js',
    'front/app/actions.mjs',
    'front/app/core.mjs',
    'front/app/registration.mjs',
    'front/app/crews.mjs',
    'front/app/event-view.mjs',
    'front/desktop-home-toolbar.mjs',
    'front/timeline-colors.mjs',
    'crew-builder.js'
  ];
  const sources = await Promise.all(paths.map(read));
  for (const [index, source] of sources.entries()) {
    assert.doesNotMatch(source, /MutationObserver/, `${paths[index]} ne doit pas observer le DOM`);
  }
  const context = await read('front/game-context.js');
  assert.doesNotMatch(context, /globalThis\.fetch\s*=/);
});

test('les anciens scripts métier ont réellement disparu du dépôt', async () => {
  const legacy = [
    'crew-accordion.js',
    'ux-refinement.js',
    'front/crew-controls.mjs',
    'front/pilot-display.mjs',
    'front/layout-polish.mjs',
    'front/course-crew-flatten.mjs',
    'front/my-entries-native.mjs',
    'front/home-event-card.mjs',
    'front/circuit-sources.mjs',
    'front/event-entry-state.mjs',
    'front/help-loader.mjs'
  ];
  for (const path of legacy) {
    await assert.rejects(access(new URL(`../${path}`, import.meta.url)), undefined, `${path} doit être supprimé`);
  }
});
