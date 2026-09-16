import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL(`../${path}`,import.meta.url),'utf8');

test('la navigation expose Espaces et le hub affiche une arborescence',()=>{
  const home=read('front/app/home-view.mjs');
  const spaces=read('front/app/organizations-view.mjs');
  const css=read('styles/spaces-hub.css');
  assert.match(home,/data-organizations-open>Espaces</);
  assert.match(spaces,/space-tree/);
  assert.match(spaces,/Endurance Manager/);
  assert.match(spaces,/TEAM PRIVÉE/);
  assert.match(spaces,/COMMUNAUTÉ OUVERTE/);
  assert.match(css,/\.space-tree-children/);
  assert.match(css,/\.space-tree-node/);
});

test('Découvrir sépare communautés ouvertes et Teams privées',()=>{
  const spaces=read('front/app/organizations-view.mjs');
  assert.match(spaces,/data-discovery-kind="community"/);
  assert.match(spaces,/data-discovery-kind="team"/);
  assert.match(spaces,/Les Teams sont fermées/);
  assert.match(spaces,/data-organization-join/);
  assert.match(spaces,/Créer une communauté/);
});

test('un espace peut ouvrir directement ses endurances filtrées',()=>{
  const spaces=read('front/app/organizations-view.mjs');
  assert.match(spaces,/data-space-events/);
  assert.match(spaces,/normalizeAudienceFilter\(state\.organizations,\[spaceEvents\.dataset\.spaceEvents\]\)/);
  assert.match(spaces,/Voir les endurances/);
});

test('FMT et Endurance Community sont des fixtures réservées au dev',()=>{
  const seed=read('server/dev-test-spaces.mjs');
  const dev=read('wrangler.jsonc');
  const prod=read('wrangler.prod.jsonc');
  assert.match(seed,/https:\/\/app\.endurance-manager\.workers\.dev/);
  assert.match(seed,/type:'team',name:'FMT'/);
  assert.match(seed,/type:'community',name:'Endurance Community'/);
  assert.match(seed,/\['admin','organizer'\]/);
  assert.match(dev,/https:\/\/app\.endurance-manager\.workers\.dev/);
  assert.doesNotMatch(prod,/https:\/\/app\.endurance-manager\.workers\.dev/);
});

test('la page de jeu charge les styles et la version du hub Espaces',()=>{
  const game=read('game.html');
  assert.match(game,/spaces-hub\.css\?v=1-tree-discovery/);
  assert.match(game,/app\.js\?v=87-spaces-hub/);
});
