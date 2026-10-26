import test from 'node:test';
import assert from 'node:assert/strict';
import {validateEvent} from '../server/core.mjs';

const base = {name:'4h de Portimao', durationMinutes:240, eventType:'special', circuit:'portimao', categories:['GT3'], departures:[{date:'2030-10-16', time:'19:00'}]};

test('endurance race settings are optional, checked and kept when an older page leaves them out', () => {
  assert.deepEqual(validateEvent(base).details, {});
  assert.deepEqual(validateEvent({...base, details:{trackLimits:'strict', tyres:'8', grid:30, fairShare:false}}).details, {trackLimits:'strict', tyres:8, grid:30, fairShare:false});
  assert.deepEqual(validateEvent({...base, details:{trackLimits:'', tyres:'', grid:''}}).details, {});
  assert.throws(() => validateEvent({...base, details:{trackLimits:'souple'}}), /Limites de piste/);
  assert.throws(() => validateEvent({...base, details:{tyres:0}}), /Pneus/);
  assert.throws(() => validateEvent({...base, details:{grid:1.5}}), /Voitures/);
  assert.deepEqual(validateEvent({...base, details:{weather:'mixed', weatherNote:'  Pluie possible la nuit '}}).details, {weather:'mixed', weatherNote:'Pluie possible la nuit'});
  assert.deepEqual(validateEvent({...base, details:{weather:'', weatherNote:''}}).details, {});
  assert.throws(() => validateEvent({...base, details:{weather:'neige'}}), /Météo/);
  assert.throws(() => validateEvent({...base, details:{weatherNote:'x'.repeat(61)}}), /Précision météo/);
  const existing = {format:'endurance', departures:'[]', details:JSON.stringify({tyres:6})};
  assert.deepEqual(validateEvent(base, existing).details, {tyres:6});
});
