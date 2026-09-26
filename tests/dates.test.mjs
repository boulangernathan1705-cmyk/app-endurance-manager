import test from 'node:test';
import assert from 'node:assert/strict';
import {timeLabel,timeAt,dateBlock,shortDateLabel} from '../front/dates.mjs';
import {countdown} from '../front/schedule.mjs';

test('hours use one format everywhere: 22h, 8h30', () => {
  assert.equal(timeLabel('22:00'), '22h');
  assert.equal(timeLabel('08:30'), '8h30');
  assert.equal(timeLabel('00:05'), '0h05');
  assert.equal(timeAt(Date.parse('2026-09-26T20:00:00Z')), '22h');
});

test('the date block shows weekday, day and month in Paris time', () => {
  const html = dateBlock(Date.parse('2026-09-26T20:00:00Z'));
  assert.match(html, /class="race-date"/);
  assert.match(html, /<strong>26<\/strong>/);
  assert.match(dateBlock(null), /is-unknown/);
  assert.match(dateBlock(Date.parse('2026-09-26T20:00:00Z'), {compact:true}), /race-date is-compact/);
  assert.match(shortDateLabel(Date.parse('2026-09-26T20:00:00Z')), /26/);
});

test('a countdown cannot be mistaken for a start time', () => {
  const now = Date.now();
  assert.match(countdown(now + (2 * 3600 + 5 * 60 + 30) * 1000), /^2 h 0[45] min$/);
  assert.match(countdown(now + (26 * 3600 + 60) * 1000), /^1 j 2 h$/);
  assert.match(countdown(now + 90 * 1000), /^1 min (29|30) s$/);
});
