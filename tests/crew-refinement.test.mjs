import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('Course rend directement les équipages et pilotes du départ sur une seule page', () => {
  const crews = read('front/app/crews.mjs');
  const eventView = read('front/app/event-view.mjs');
  assert.match(crews, /crew-pilot-accordion-summary/);
  assert.match(crews, /crew-unified-card/);
  assert.match(crews, /ÉQUIPAGE COMPLET/);
  assert.match(crews, /ÉQUIPAGE OUVERT/);
  assert.match(crews, /Pilotes sans équipage/);
  assert.match(crews, /ux-course-crews-body/);
  assert.match(eventView, /renderPilots\(event,departure/);
  assert.doesNotMatch(eventView, /event-section-tabs/);
  assert.doesNotMatch(crews, /MutationObserver/);
});

test('un pilote peut rejoindre quitter gérer et supprimer son équipage depuis la vue course', () => {
  const crews = read('front/app/crews.mjs');
  const actions = read('front/app/actions.mjs');
  assert.match(crews, /button\('join-crew','Rejoindre'/);
  assert.match(crews, /button\('leave-crew','Quitter'/);
  assert.match(crews, /button\('delete-crew','Supprimer'/);
  assert.match(crews, /crew\.ownedByMe\?'Gérer':'Modifier'/);
  assert.match(crews, /crew\.canManage/);
  assert.match(crews, /data-crew-state-select/);
  assert.match(actions, /case 'join-crew'/);
  assert.match(actions, /case 'leave-crew'/);
  assert.match(actions, /case 'delete-crew'/);
});

test('création et modification utilisent le même éditeur équipage contextualisé au départ', () => {
  const builder = read('crew-builder.js');
  const crews = read('front/app/crews.mjs');
  assert.match(builder, /async function openBuilder\(crewId = null, preferredDepartureId = ''\)/);
  assert.match(builder, /mode:'edit'/);
  assert.match(builder, /mode:'create'/);
  assert.match(builder, /Créer mon équipage/);
  assert.match(builder, /Responsable de l’équipage/);
  assert.match(builder, /found\.crew\.canManage/);
  assert.match(builder, /create\.dataset\.departure/);
  assert.match(builder, /\[data-action="edit-crew"\]/);
  assert.match(crews, /crew-section-create/);
  assert.doesNotMatch(builder, /MutationObserver/);
});

test('le worker répare la migration de responsabilité équipage avant les appels API', () => {
  const wrapper = read('server/worker-with-migrations.mjs');
  const dev = read('wrangler.jsonc');
  const prod = read('wrangler.prod.jsonc');
  assert.match(wrapper, /PRAGMA table_info\(crews\)/);
  assert.match(wrapper, /ALTER TABLE crews ADD COLUMN owner_user_id/);
  assert.match(wrapper, /0016_crew_ownership\.sql/);
  assert.match(dev, /server\/worker-with-migrations\.mjs/);
  assert.match(prod, /server\/worker-with-migrations\.mjs/);
});

test('le rendu principal publie des événements explicites au lieu d’observer le DOM', () => {
  const core = read('front/app/core.mjs');
  const desktop = read('front/desktop-home-toolbar.mjs');
  const timeline = read('front/timeline-colors.mjs');
  assert.match(core, /endurance:render/);
  assert.match(core, /endurance:nav/);
  assert.match(desktop, /addEventListener\('endurance:render'/);
  assert.match(desktop, /addEventListener\('endurance:nav'/);
  assert.match(timeline, /addEventListener\('endurance:render'/);
});
