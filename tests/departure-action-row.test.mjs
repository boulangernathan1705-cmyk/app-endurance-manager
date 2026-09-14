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

  assert.match(view,/ux-summary-registration-actions[\s\S]*S’inscrire[\s\S]*Inscrire un autre pilote/);
  assert.match(view,/ux-summary-create-crew[\s\S]*data-crew-builder-open/);
  assert.match(view,/const participation=renderPilots\(event,departure\);/);
  assert.doesNotMatch(view,/renderPilots\(event,departure,\{canCreateCrew:/);
  assert.match(css,/grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
  assert.match(desktop,/\.ux-summary-registration-actions:has\(> \.ux-summary-create-crew\)[\s\S]*grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(desktop,/width:\s*clamp\(300px, 36vw, 450px\)/);
  assert.match(mobile,/\.departure-fold\[id\^="departure-"\] > summary > \.ux-summary-registration-actions[\s\S]*grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\) !important/);
  assert.doesNotMatch(css,/grid-template-columns:repeat\(auto-fit,minmax\((?:92|100)px,1fr\)\)/);
  assert.match(html,/event-shell-alignment\.css\?v=7-desktop-three-departure-actions/);
  assert.match(html,/event-polish\.css\?v=3-three-departure-actions/);
  assert.match(html,/mobile-density-v2\.css\?v=3-three-departure-actions/);
  assert.match(html,/app\.js\?v=84-crew-departure-open-state/);
});
