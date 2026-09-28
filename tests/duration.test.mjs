import test from 'node:test';
import assert from 'node:assert/strict';
import {durationLabel, eventMinutes} from '../shared/duration.mjs';

test('race durations read in hours and minutes', () => {
  assert.equal(durationLabel(360), '6 h');
  assert.equal(durationLabel(150), '2 h 30');
  assert.equal(durationLabel(65), '1 h 05');
  assert.equal(durationLabel(40), '40 min');
  assert.equal(eventMinutes({durationHours:4}), 240);
  assert.equal(eventMinutes({durationHours:3, durationMinutes:150}), 150);
});

test('driver change required: always on LMU; on iRacing the organizer decides, over 4 h by default', async () => {
  const {driverChangeRequired} = await import('../shared/duration.mjs');
  assert.equal(driverChangeRequired({circuit:'spa', durationMinutes:120}), true);
  assert.equal(driverChangeRequired({circuit:'iracing-spa', durationMinutes:240}), false);
  assert.equal(driverChangeRequired({circuit:'iracing-spa', durationMinutes:360}), true);
  assert.equal(driverChangeRequired({circuit:'iracing-spa', durationMinutes:360, driverChangeRequired:false}), false);
  assert.equal(driverChangeRequired({circuit:'iracing-spa', durationMinutes:120, driverChangeRequired:true}), true);
});
