import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('Course rend directement les équipages et pilotes du départ sur une seule page', () => {
  const crews = read('front/app/crews.mjs');
  const eventView = read('front/app/event-view.mjs');
  assert.match(crews, /crew-pilot-accordion-summary/);
  assert.match(crews, /crew-unified-card/);
  assert.match(crews, /'Complet'/);
  assert.match(crews, /'Places libres'/);
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
  assert.match(crews, /button\('edit-crew','Gérer'/);
  assert.doesNotMatch(crews, /crew\.ownedByMe\?'Gérer':'Modifier'/);
  assert.match(crews, /button\('delete-crew',.*<span>Supprimer<\/span>/);
  assert.match(crews, /danger-link crew-delete-button/);
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

test('la responsabilité d’équipage vient de la migration 0016, jamais d’un contrôle à chaque démarrage du worker', () => {
  const wrapper = read('server/worker-with-migrations.mjs');
  const dev = read('wrangler.jsonc');
  const prod = read('wrangler.prod.jsonc');
  // The deployment applies the migrations first: no database call spent on the schema at each cold start.
  assert.doesNotMatch(wrapper, /PRAGMA table_info|ALTER TABLE|CREATE (TABLE|INDEX)/);
  assert.match(read('migrations/0016_crew_ownership.sql'), /ALTER TABLE crews ADD COLUMN owner_user_id/);
  assert.match(dev, /server\/worker-with-migrations\.mjs/);
  assert.match(prod, /server\/worker-with-migrations\.mjs/);
});

test('le rendu principal publie des événements explicites au lieu d’observer le DOM', () => {
  const core = read('front/app/core.mjs');
  const homeView = read('front/app/home-view.mjs');
  const router = read('front/app/router.mjs');
  const timeline = read('front/timeline-colors.mjs');
  assert.match(core, /endurance:render/);
  assert.match(core, /endurance:nav/);
  assert.match(homeView, /addEventListener\('endurance:render'/);
  assert.match(router, /addEventListener\('endurance:render'/);
  assert.match(timeline, /addEventListener\('endurance:render'/);
});
