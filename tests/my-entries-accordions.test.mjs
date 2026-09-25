import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url),'utf8');

test('Mes inscriptions présente les trois blocs en colonnes, sans cadres imbriqués',()=>{
  const view=read('front/app/entries-view.mjs');
  assert.match(view,/column\('Mon équipage',members\.length,ownCrewBody\)/);
  assert.match(view,/column\('Autres équipages',otherCrews\.length,otherCrewsBody\)/);
  assert.match(view,/column\('Pilotes sans équipage',unassigned\.length,unassignedBody\)/);
  assert.match(view,/my-entry-columns/);
  assert.doesNotMatch(view,/contentAccordion/);
});

test('les modules internes sont importés sous une seule adresse (pas de doublon ?v=)',()=>{
  const actions=read('front/app/actions.mjs');
  assert.match(actions,/from '\.\/entries-view\.mjs'/);
  assert.doesNotMatch(actions,/\.mjs\?v=/);
});
