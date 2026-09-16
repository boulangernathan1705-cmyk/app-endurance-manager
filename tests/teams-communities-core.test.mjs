import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL(`../${path}`,import.meta.url),'utf8');

test('Teams et communautés restent un socle métier sans dupliquer les endurances',()=>{
  const migration=read('migrations/0018_organizations.sql');
  const audiences=read('migrations/0019_registration_audiences.sql');
  const api=read('server/organizations.mjs');
  assert.match(migration,/CREATE TABLE organizations/);
  assert.match(migration,/CREATE TABLE organization_members/);
  assert.match(migration,/ALTER TABLE crews ADD COLUMN organization_id/);
  assert.match(audiences,/CREATE TABLE registration_audiences/);
  assert.match(audiences,/inscription reste unique/i);
  assert.match(api,/organizationAwareFetch/);
  assert.match(api,/decorateEvents/);
});

test('le front est event-first et ne recrée plus un mini-site par groupe',()=>{
  const network=read('front/app/paddock-network.mjs');
  const home=read('front/app/home-view.mjs');
  const event=read('front/app/event-view.mjs');
  assert.match(network,/Mon réseau/);
  assert.match(network,/network-drawer/);
  assert.match(network,/Ma Team/);
  assert.match(network,/Mes communautés/);
  assert.doesNotMatch(network,/Vue d’ensemble/);
  assert.doesNotMatch(network,/data-tab=/);
  assert.match(home,/Ce qui mérite ton attention/);
  assert.match(home,/SIGNAUX DU RÉSEAU/);
  assert.match(home,/Tu es inscrit sans équipage/);
  assert.match(event,/VOIR CETTE COURSE POUR/);
  assert.match(event,/Tout le paddock/);
  assert.match(event,/data-paddock-scope/);
  assert.doesNotMatch(event,/Retour à/);
});

test('les fixtures de dev restent isolées et la nouvelle interface est versionnée',()=>{
  const seed=read('server/dev-seed-organizations.mjs');
  const html=read('game.html');
  const app=read('app.js');
  assert.match(seed,/https:\/\/app\.endurance-manager\.workers\.dev/);
  assert.match(seed,/const url=new URL\(request\.url\)/);
  assert.match(seed,/if\(url\.origin!==DEV_ORIGIN\)return/);
  assert.match(seed,/name:'FMT'/);
  assert.match(seed,/name:'Endurance Community'/);
  assert.match(html,/paddock-network\.css\?v=1-event-first/);
  assert.match(html,/app\.js\?v=86-paddock-network/);
  assert.match(app,/paddock-network\.mjs\?v=1-event-first/);
  assert.doesNotMatch(app,/teams-communities\.mjs/);
});
