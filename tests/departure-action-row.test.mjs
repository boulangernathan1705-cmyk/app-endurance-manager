import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL(`../${path}`,import.meta.url),'utf8');

test('la création d’équipage est regroupée avec les actions du départ',()=>{
  const view=read('front/app/event-view.mjs');
  const css=read('styles/event-polish.css');
  const html=read('game.html');

  assert.match(view,/ux-summary-registration-actions[\s\S]*S’inscrire[\s\S]*Inscrire un autre pilote/);
  assert.match(view,/ux-summary-create-crew[\s\S]*data-crew-builder-open/);
  assert.match(view,/const participation=renderPilots\(event,departure\);/);
  assert.doesNotMatch(view,/renderPilots\(event,departure,\{canCreateCrew:/);
  assert.match(css,/grid-template-columns:repeat\(auto-fit,minmax\(100px,1fr\)\)/);
  assert.match(html,/event-polish\.css\?v=2-departure-crew-action/);
  assert.match(html,/app\.js\?v=83-departure-crew-action/);
});
