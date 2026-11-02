import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {eventLogoName} from '../shared/catalog.mjs';

test('TDZ Training events show their own logo on LMU and iRacing, others keep OPEN / SAFE', () => {
  assert.equal(eventLogoName({sim:'lmu', access:'open', type:'TONDEUZ TRAINING'}), 'training-lmu');
  assert.equal(eventLogoName({sim:'iracing', access:'safe', type:'TONDEUZ TRAINING'}), 'training-iracing');
  assert.equal(eventLogoName({sim:'ams2', access:'safe', type:'TONDEUZ TRAINING'}), 'safe-ams2');
  assert.equal(eventLogoName({sim:'lmu', access:'safe', type:'SAFE'}), 'safe-lmu');
  assert.equal(eventLogoName({sim:'iracing', access:'open'}), 'open-iracing');
  for (const name of ['training-lmu', 'training-iracing']) assert.ok(existsSync(new URL(`../images/event-access/${name}.png`, import.meta.url)));
});
