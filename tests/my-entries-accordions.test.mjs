import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url),'utf8');

test('Mes inscriptions sépare les trois blocs en accordéons natifs',()=>{
  const view=read('front/app/entries-view.mjs');
  assert.match(view,/contentAccordion\('Mon équipage',members\.length,ownCrewBody\)/);
  assert.match(view,/contentAccordion\('Autres équipages',otherCrews\.length,otherCrewsBody,true\)/);
  assert.match(view,/contentAccordion\('Pilotes sans équipage',unassigned\.length,unassignedBody,true\)/);
  assert.doesNotMatch(view,/ux-my-other-crews-heading/);
});

test('les deux accordéons secondaires sont plus compacts que Mon équipage',()=>{
  const css=read('styles/my-entries-accordions.css');
  const game=read('game.html');
  assert.match(css,/\.ux-my-entry-content-accordion\.is-compact/);
  assert.match(css,/min-height:\s*38px/);
  assert.match(css,/font-size:\s*14px/);
  assert.match(game,/my-entries-accordions\.css\?v=1-compact-secondary/);
});

test('la chaîne de modules Mes inscriptions est versionnée pour éviter un ancien onglet en cache',()=>{
  const app=read('app.js');
  const actions=read('front/app/actions.mjs');
  assert.match(app,/actions\.mjs\?v=4-my-entries-accordions/);
  assert.match(actions,/entries-view\.mjs\?v=2-three-accordions/);
});
