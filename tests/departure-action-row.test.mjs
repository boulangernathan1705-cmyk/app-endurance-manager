import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL(`../${path}`,import.meta.url),'utf8');

test('la création d’équipage est regroupée avec les actions du départ',()=>{
  const view=read('front/app/event-view.mjs');
  const css=read('styles/event-shell-alignment.css');
  const eventCss=read('styles/event-polish.css');
  const html=read('game.html');
  const app=read('app.js');
  assert.match(view,/ux-summary-registration-actions\$\{canCreateCrew\?' is-three-actions':''\}/);
  assert.match(view,/ux-summary-create-crew/);
  assert.match(view,/Créer un équipage/);
  assert.match(css,/\.ux-summary-registration-actions\.is-three-actions/);
  assert.match(css,/grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(css,/min-width:\s*420px/);
  assert.match(eventCss,/grid-template-columns:34px minmax\(220px,1fr\) max-content minmax\(420px,520px\)/);
  assert.match(eventCss,/summary>\.fold-meta\{[\s\S]*?grid-column:3!important/);
  assert.match(eventCss,/summary>\.ux-summary-registration-actions\{[\s\S]*?grid-column:4!important/);
  assert.match(html,/event-polish\.css\?v=4-desktop-meta-action-columns/);
  assert.match(html,/event-shell-alignment\.css\?v=8-explicit-three-departure-actions/);
  assert.match(html,/app\.js\?v=87-spaces-hub/);
  assert.match(app,/actions\.mjs\?v=26-audiences/);
});

test('sur mobile les trois actions du départ restent dans la même ligne',()=>{
  const css=read('styles/mobile-density-v2.css');
  assert.match(css,/\.departure-fold\[id\^="departure-"\] > summary > \.ux-summary-registration-actions\s*\{[\s\S]*?grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(css,/\.ux-summary-registration-actions > button\s*\{[\s\S]*?white-space:\s*normal/);
});
