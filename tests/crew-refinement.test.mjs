import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('Course rend directement les accordéons équipages finaux', () => {
  const crews = read('front/app/crews.mjs');
  assert.match(crews, /crew-pilot-accordion-summary/);
  assert.match(crews, /ÉQUIPAGE COMPLET/);
  assert.match(crews, /ÉQUIPAGE OUVERT/);
  assert.match(crews, /ux-course-crews-body/);
  assert.doesNotMatch(crews, /MutationObserver/);
});

test('Équipages rend directement les contrôles de gestion finaux', () => {
  const crews = read('front/app/crews.mjs');
  assert.match(crews, /crew-management-accordion/);
  assert.match(crews, /data-crew-state-select/);
  assert.match(crews, /data-action=\\"edit-crew\\"/);
  assert.match(crews, /data-action=\\"add-crew-pilot\\"/);
  assert.match(crews, /data-action=\\"remove-crew-pilot\\"/);
});

test('création et modification utilisent le même éditeur équipage', () => {
  const builder = read('crew-builder.js');
  assert.match(builder, /async function openBuilder\(crewId = null\)/);
  assert.match(builder, /mode:'edit'/);
  assert.match(builder, /mode:'create'/);
  assert.match(builder, /Modifier «/);
  assert.match(builder, /Créer un nouvel équipage/);
  assert.match(builder, /\[data-action="edit-crew"\]/);
  assert.doesNotMatch(builder, /MutationObserver/);
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
