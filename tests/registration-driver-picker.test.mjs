import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const registration=readFileSync(new URL('../front/app/registration.mjs',import.meta.url),'utf8');

test('inscrire un autre pilote demande d’abord de choisir un pilote',()=>{
  assert.match(registration,/Choose a driver':'Choisir un pilote/);
  assert.match(registration,/value="__manual__"/);
  assert.match(registration,/Other driver':'Autre pilote/);
  assert.match(registration,/manualOther=field\.value==='__manual__'/);
  assert.match(registration,/!draft\.participantUserId&&!draft\.manualOther\)throw Error\('Choisis un pilote\.'/);
});
