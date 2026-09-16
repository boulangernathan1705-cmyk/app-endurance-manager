import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL(`../${path}`,import.meta.url),'utf8');

test('la navigation expose directement Teams et communautés',()=>{
  const home=read('front/app/home-view.mjs');
  const groups=read('front/app/organizations-view.mjs');
  assert.match(home,/data-organizations-open>Teams & communautés</);
  assert.match(groups,/TEAMS & COMMUNAUTÉS/);
  assert.match(groups,/MA TEAM/);
  assert.match(groups,/MES COMMUNAUTÉS/);
  assert.doesNotMatch(groups,/space-tree/);
  assert.doesNotMatch(groups,/MES ESPACES/);
});

test('les Teams restent privées et seules les communautés se découvrent',()=>{
  const groups=read('front/app/organizations-view.mjs');
  assert.match(groups,/Une Team est privée/);
  assert.match(groups,/Créer ma Team/);
  assert.match(groups,/REJOINDRE UNE COMMUNAUTÉ/);
  assert.match(groups,/data-organization-join/);
  assert.match(groups,/Créer une communauté/);
  assert.doesNotMatch(groups,/data-discovery-kind/);
  assert.doesNotMatch(groups,/Découvrir des espaces/);
});

test('une Team ou communauté peut ouvrir ses endurances filtrées',()=>{
  const groups=read('front/app/organizations-view.mjs');
  assert.match(groups,/data-space-events/);
  assert.match(groups,/normalizeAudienceFilter\(state\.organizations,\[groupEvents\.dataset\.spaceEvents\]\)/);
  assert.match(groups,/Voir les endurances/);
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

test('la page de jeu charge la version simplifiée Teams et Communautés',()=>{
  const game=read('game.html');
  assert.match(game,/spaces-hub\.css\?v=2-teams-communities-simple/);
  assert.match(game,/app\.js\?v=88-teams-communities-simple/);
});
