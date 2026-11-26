import {test} from 'node:test';
import assert from 'node:assert/strict';
import {bestOf, paceStats, tyreStats} from '../front/combos-stats.mjs';

const pilots = new Map([['a', {name:'A'}], ['b', {name:'B'}], ['c', {name:'C'}]]);

test('the crew pace weights visible drivers equally and preserves the best lap', () => {
  const data = [
    {id:'a', laps:30, avg:100, best:98, fuel:10, sectors:{laps:15, avg:[30, 32, 38], best:[29, 31, 37]}},
    {id:'b', laps:10, avg:106, best:104, fuel:null, sectors:{laps:5, avg:[32, 34, 40], best:[31, 33, 39]}},
    {id:'c', laps:1, avg:90, best:90}
  ];
  const rows = paceStats(data, pilots, new Set(['c']));
  assert.deepEqual(rows.map(row => row.id), ['crew','a','b']);
  assert.deepEqual(
    {laps:rows[0].laps, avg:rows[0].avg, best:rows[0].best, fuel:rows[0].fuel, sectors:rows[0].sectors},
    {laps:40, avg:103, best:98, fuel:10, sectors:{laps:20, avg:[31, 33, 39], best:[29, 31, 37]}}
  );
  assert.equal(bestOf([{...rows[0], best:1}, ...rows.slice(1)], row => row.best), 98);
});

test('the tyre summary averages each wheel independently and preserves missing data', () => {
  const data = [
    {id:'a', laps:4, wear:[null, 0, 10, null]},
    {id:'b', laps:6, wear:[null, 10, null, null]},
    {id:'unknown', laps:99, wear:[90, 90, 90, 90]}
  ];
  const [crew] = tyreStats(data, pilots, new Set());
  assert.equal(crew.laps, 10);
  assert.deepEqual(crew.wear, [null, 5, 10, null]);
  assert.deepEqual(tyreStats(data, pilots, new Set(['b'])).map(row => row.id), ['a']);
});

// Memo reliability: unknown values cannot produce a confident pit estimate.
test('memo projections keep the reserve and unknown refuelling times', async () => {
  const {stintProjection, refuelDuration, localDayEnd} = await import('../front/combos-stats.mjs');
  assert.equal(stintProjection(100, 4.2, 3), 23);
  assert.equal(stintProjection(100, null, 3), null);
  assert.equal(refuelDuration({fuel:40, energy:60, fuelRate:2, energyRate:3, connect:2}), 22);
  assert.equal(refuelDuration({fuel:40, energy:60, fuelRate:null, energyRate:3, connect:2}), null);
  assert.equal(refuelDuration({fuel:null, energy:0}), 0);
  assert.equal(localDayEnd('2026-10-25'), new Date(2026,9,26).getTime() - 1);
});
