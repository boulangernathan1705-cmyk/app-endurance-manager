import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL(`../${path}`,import.meta.url),'utf8');

test('inscrire un autre pilote n’ouvre pas automatiquement la liste des pilotes',()=>{
  const behavior=read('front/registration-select-behavior.mjs');
  const registration=read('front/app/registration.mjs');
  const html=read('game.html');

  assert.match(behavior,/ux-summary-registration-other\[data-action="new-registration"\]/);
  assert.doesNotMatch(behavior,/\.focus\s*\(/);
  assert.match(registration,/>Choisir un pilote<\/option>/);
  assert.match(registration,/>Autre pilote<\/option>/);
  assert.match(html,/registration-select-behavior\.mjs\?v=1/);
});
