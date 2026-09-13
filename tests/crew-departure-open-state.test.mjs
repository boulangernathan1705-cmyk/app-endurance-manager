import test from 'node:test';
import assert from 'node:assert/strict';
import {rememberDepartureForCrewAction} from '../front/crew-departure-open-state.mjs';

test('rejoindre un équipage garde le départ ouvert au prochain rendu',()=>{
  const state={selectedDepartureId:null};
  const target={dataset:{action:'join-crew',departure:'departure-join'}};
  assert.equal(rememberDepartureForCrewAction(state,target),true);
  assert.equal(state.selectedDepartureId,'departure-join');
});

test('quitter un équipage garde aussi le départ ouvert au prochain rendu',()=>{
  const state={selectedDepartureId:null};
  const target={dataset:{action:'leave-crew',departure:'departure-leave'}};
  assert.equal(rememberDepartureForCrewAction(state,target),true);
  assert.equal(state.selectedDepartureId,'departure-leave');
});

test('les autres actions ne modifient pas le départ sélectionné',()=>{
  const state={selectedDepartureId:'departure-current'};
  const target={dataset:{action:'delete-crew',departure:'departure-other'}};
  assert.equal(rememberDepartureForCrewAction(state,target),false);
  assert.equal(state.selectedDepartureId,'departure-current');
});
