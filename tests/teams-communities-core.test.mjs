import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL(`../${path}`,import.meta.url),'utf8');

test('Teams et communautés sont un socle métier et non des copies d’événements',()=>{
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

test('le front possède de vraies pages Team et Communauté avec récapitulatif',()=>{
  const view=read('front/app/teams-communities.mjs');
  const event=read('front/app/event-view.mjs');
  const helper=read('front/app/organization-context.mjs');
  assert.match(view,/Teams & communautés/);
  assert.match(view,/Vue d’ensemble/);
  assert.match(view,/Endurances/);
  assert.match(view,/Équipages/);
  assert.match(view,/Membres/);
  assert.match(view,/MON RÉCAP/);
  assert.match(view,/PROCHAINE ENDURANCE/);
  assert.match(view,/data-teams-action="open-event"/);
  assert.match(event,/event-group-context/);
  assert.match(event,/scopeEvent\(rawEvent,state\.visibleAudienceIds\)/);
  assert.doesNotMatch(view,/\bEspaces\b/);
  assert.doesNotMatch(helper,/organizationFilterMarkup/);
});

test('les fixtures de dev restent isolées et les caches sont versionnés',()=>{
  const seed=read('server/dev-seed-organizations.mjs');
  const html=read('game.html');
  const worker=read('server/worker-with-migrations.mjs');
  assert.match(seed,/https:\/\/app\.endurance-manager\.workers\.dev/);
  assert.match(seed,/name:'FMT'/);
  assert.match(seed,/name:'Endurance Community'/);
  assert.match(worker,/ensureOrganizationSchema/);
  assert.match(worker,/organizationAwareFetch/);
  assert.match(html,/teams-communities\.css\?v=1-core/);
  assert.match(html,/app\.js\?v=85-teams-core/);
});
