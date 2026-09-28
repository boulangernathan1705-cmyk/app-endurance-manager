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
