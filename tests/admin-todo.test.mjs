import test from 'node:test';
import assert from 'node:assert/strict';
import {todoItems} from '../front/admin-todo.mjs';

const NOW = Date.parse('2026-11-02T08:00:00Z'), DAY = 86400000;

test('« À traiter » lists, start by start, the pilots without a crew, the empty crews and the times to confirm', () => {
  const spa = {id:'spa', name:'6h de Spa', departures:[{id:'a', startsAt:NOW + 5 * DAY,
    availability:[{id:'r1', participantId:'p1', status:'whole'}, {id:'r2', participantId:'p2', status:'whole'}, {id:'r3', participantId:'p3', status:'unavailable'}, {id:'r4', participantId:'p1', status:'whole'}],
    crews:[{id:'c1', registrationIds:['r2']}, {id:'c2', registrationIds:[]}]}]};
  const pending = {id:'lm', name:'24h', schedulePending:true, departures:[{id:'b', startsAt:NOW + 3 * DAY, availability:[], crews:[]}]};
  const far = {id:'far', name:'Loin', departures:[{id:'c', startsAt:NOW + 20 * DAY, availability:[{id:'x', status:'whole'}], crews:[]}]};
  const solo = {id:'solo', name:'Event', format:'solo', departures:[{id:'d', startsAt:NOW + DAY, availability:[{id:'y', status:'whole'}], crews:[]}]};
  const items = todoItems([spa, pending, far, solo], 'lmu', NOW);
  // p1 is entered twice (two categories): counted once.
  assert.deepEqual(items.map(item => `${item.eventId}:${item.text}`), ['lm:Horaires à confirmer', 'spa:1 pilote sans équipage', 'spa:1 équipage sans pilote']);
  assert.equal(items[1].game, 'lmu');
  assert.deepEqual(todoItems([{...spa, departures:[{...spa.departures[0], startsAt:NOW - DAY}]}], 'lmu', NOW), []);
});

test('a line says the day and the time as on the rest of the site', async () => {
  const {todoWhen} = await import('../front/admin-todo.mjs');
  assert.equal(todoWhen({startsAt:Date.parse('2026-11-07T14:00:00Z')}), 'sam. 7 nov. à 15h');
  assert.equal(todoWhen({startsAt:Date.parse('2026-11-07T08:30:00Z')}), 'sam. 7 nov. à 9h30');
});
