import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {soloEventCounts} from '../front/solo-card-counts.mjs';

const now = 1000;
const reg = (id, participantId, extra = {}) => ({id, participantId, status: 'available', ...extra});
const start = (startsAt, availability = []) => ({startsAt, availability});
const count = (departures, extra = {}, options = {}) => soloEventCounts({departures, ...extra}, {now, ...options});

test('solo card counts a pilot on a later start when the first is empty', () => {
  assert.deepEqual(count([start(2000), start(3000, [reg('r1', 'p1')]), start(4000), start(5000)]),
    {confirmed: 1, waiting: 0, capacity: null});
});

test('solo card deduplicates pilots, excludes withdrawals and past starts, and prioritizes confirmed entries', () => {
  const departures = [
    start(500, [reg('old', 'old-pilot')]),
    start(2000, [reg('r1', 'p1'), reg('r2', 'p2', {waitlistPosition: 1}), reg('r3', 'p3', {status: 'unavailable'})]),
    start(3000, [reg('r4', 'p1'), reg('r5', 'p2'), reg('r6', 'p4', {waitlistPosition: 1})]),
    start(4000, [reg('r7', 'p4', {waitlistPosition: 2}), reg('legacy', null)])
  ];
  assert.deepEqual(count(departures, {capacity: 20}), {confirmed: 3, waiting: 1, capacity: null});
  assert.deepEqual(count(departures, {capacity: 20}, {archived: true}), {confirmed: 4, waiting: 1, capacity: null});
});

test('solo card keeps capacity for one relevant start and supports pending dates', () => {
  assert.deepEqual(count([start(500), start(2000, [reg('r1', 'p1')])], {capacity: 10}),
    {confirmed: 1, waiting: 0, capacity: 10});
  assert.deepEqual(count([start(null, [reg('r1', 'p1')]), start(null)], {schedulePending: true}),
    {confirmed: 1, waiting: 0, capacity: null});
  assert.deepEqual(count([start(500), start(1000)]), {confirmed: 0, waiting: 0, capacity: null});
});

test('only the multi-start list card uses event-wide counts; per-start fills retain their default', () => {
  const home = readFileSync(new URL('../front/app/home-view.mjs', import.meta.url), 'utf8');
  const solo = readFileSync(new URL('../front/app/solo.mjs', import.meta.url), 'utf8');
  const planning = readFileSync(new URL('../front/app/planning.mjs', import.meta.url), 'utf8');
  assert.ok(home.includes('soloFill(event,shown,(event.departures||[]).length>1?soloEventCounts(event,{archived}):undefined)'));
  assert.ok(solo.includes('counts = soloCounts(event, departure)'));
  assert.ok(planning.includes('soloFill(event,departure)'));
});
