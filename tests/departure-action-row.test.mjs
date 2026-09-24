import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL(`../${path}`,import.meta.url),'utf8');

test('la création d’équipage est regroupée avec les actions du départ',()=>{
  const view=read('front/app/event-view.mjs');
  const css=read('styles/event-polish.css');
  const desktop=read('styles/event-shell-alignment.css');
  const mobile=read('styles/mobile-density-v2.css');
  const html=read('game.html');

  assert.match(view,/ux-summary-registration-actions\$\{canCreateCrew\?' is-three-actions':''\}/);
  assert.match(view,/ux-summary-create-crew[\s\S]*data-crew-builder-open/);
  assert.match(view,/const participation=renderPilots\(event,departure\);/);
  assert.doesNotMatch(view,/renderPilots\(event,departure,\{canCreateCrew:/);
  assert.match(css,/grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
  assert.match(css,/grid-template-columns:34px minmax\(220px,1fr\) max-content minmax\(420px,520px\)!important/);
  assert.match(css,/summary>\.fold-meta[\s\S]*grid-column:3!important/);
  assert.match(css,/summary>\.ux-summary-registration-actions[\s\S]*grid-column:4!important/);
  assert.match(desktop,/\.ux-summary-registration-actions\.is-three-actions[\s\S]*grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\) !important/);
  assert.match(desktop,/\.ux-summary-registration-actions:has\(> \.ux-summary-create-crew\)/);
  assert.match(desktop,/width:\s*clamp\(420px, 34vw, 520px\) !important/);
  assert.match(mobile,/\.departure-fold\[id\^="departure-"\] > summary > \.ux-summary-registration-actions[\s\S]*grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\) !important/);
  assert.doesNotMatch(css,/grid-template-columns:repeat\(auto-fit,minmax\((?:92|100)px,1fr\)\)/);
  assert.match(html,/event-shell-alignment\.css\?v=8-explicit-three-departure-actions/);
  assert.match(html,/event-polish\.css\?v=4-desktop-meta-action-columns/);
  assert.match(html,/mobile-density-v2\.css\?v=5-community-menu-layer/);
  assert.match(html,/app\.js\?v=99-community-navigation/);
});
