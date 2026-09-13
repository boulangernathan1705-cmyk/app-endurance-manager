import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url),'utf8');

test('la carte événement affiche le nombre total de pilotes sous le type d’événement',()=>{
  const home=read('front/app/home-view.mjs');
  const css=read('styles/home-event-card.css');

  assert.match(home,/eventCategoryCount,pilotCount,circuitVisual/);
  assert.match(home,/pilotCount\(\(event\.departures\|\|\[\]\)\.flatMap\(departure=>departure\.availability\|\|\[\]\)\)/);
  assert.match(home,/class="event-pilot-count"/);
  assert.match(home,/pilote\$\{totalPilots===1\?'':'s'\} inscrit\$\{totalPilots===1\?'':'s'\}/);
  assert.match(css,/\.event-card\.event-card-harmonized \.event-info\s*\{[^}]*flex-direction:\s*column/s);
  assert.match(css,/\.event-card\.event-card-harmonized \.event-pilot-count/);
});
