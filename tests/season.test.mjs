import test from 'node:test';
import assert from 'node:assert/strict';
import {seasonMonths,defaultSeason,validStart,validMonths} from '../shared/season.mjs';

// EVENT TDZ seasons (Nathan, 2026-11-07): the organisers choose the first month and the length; seasons follow each other.
test('a season: its first month and length, then the next ones on their own', () => {
  const season = {start:'2026-09', months:4};
  assert.deepEqual(seasonMonths(season, '2026-11'), ['2026-09','2026-10','2026-11','2026-12']);
  assert.deepEqual(seasonMonths(season, '2027-01'), ['2027-01','2027-02','2027-03','2027-04']);
  assert.deepEqual(seasonMonths(season, '2026-11', -1), ['2026-05','2026-06','2026-07','2026-08']);
  assert.deepEqual(seasonMonths({start:'2026-11', months:1}, '2026-11', 1), ['2026-12']);
  assert.deepEqual(seasonMonths({start:'2025-12', months:12}, '2026-11'), Array.from({length:12}, (_, index) => index ? `2026-${String(index).padStart(2, '0')}` : '2025-12'));
});
test('without a choice: the calendar quarter; only valid settings are kept', () => {
  assert.deepEqual(defaultSeason(Date.parse('2026-11-07T12:00:00Z')), {start:'2026-10', months:3});
  assert.ok(validStart('2026-11'));assert.ok(!validStart('2026-13'));assert.ok(!validStart('26-11'));
  assert.ok(validMonths(12));assert.ok(!validMonths(0));assert.ok(!validMonths(13));assert.ok(!validMonths(2.5));
});
