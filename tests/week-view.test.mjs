import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parisDay,weekStart,weekDays} from '../front/week-days.mjs';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url),'utf8');
const day = text => Date.parse(text+'T00:00:00Z')/86400000;

test('the week runs from Monday to Sunday in Paris time, summer time included', () => {
  // Sunday 1 November 2026, 23h30 in Paris (22h30 UTC): still the week of Monday 26 October.
  assert.equal(weekStart(Date.parse('2026-11-01T22:30:00Z')), day('2026-10-26'));
  // Monday 2 November, 0h30 in Paris (23h30 UTC on Sunday): the new week.
  assert.equal(weekStart(Date.parse('2026-11-01T23:30:00Z')), day('2026-11-02'));
  assert.equal(weekStart(Date.parse('2026-11-01T23:30:00Z'), -1), day('2026-10-26'));
  // Sunday 25 October, the night the clocks go back.
  assert.equal(parisDay(Date.parse('2026-10-24T22:30:00Z')), day('2026-10-25'));
});

test('each start of the week is on its day, in time order, with the pilot\'s own starts marked', () => {
  const monday = day('2026-11-02');
  const spa = {id:'spa', name:'6h de Spa', durationHours:6, durationMinutes:360, departures:[
    {id:'a', startsAt:Date.parse('2026-11-07T14:00:00Z'), availability:[{id:'r1', mine:true, status:'whole'}, {id:'r2', status:'whole'}]},
    {id:'b', startsAt:Date.parse('2026-11-07T20:00:00Z'), availability:[{id:'r3', status:'unavailable'}]}]};
  const next = {id:'next', name:'Hors semaine', departures:[{id:'c', startsAt:Date.parse('2026-11-09T19:00:00Z')}]};
  const monza = {id:'monza', name:'Monza', durationHours:1, departures:[{id:'d', startsAt:Date.parse('2026-11-07T08:00:00Z')}]};
  const days = weekDays([spa, next, monza], monday);
  assert.equal(days.length, 7);
  assert.deepEqual(days[5].items.map(item => `${item.event.id}:${item.departure.id}`), ['monza:d', 'spa:a', 'spa:b']);
  assert.equal(days[5].items[1].mine, true); assert.equal(days[5].items[1].pilots, 2);
  assert.equal(days[5].items[2].mine, false); assert.equal(days[5].items[2].pilots, 0);
  // The second 6 h start ends the next day.
  assert.equal(days[5].items[2].endsAt, Date.parse('2026-11-08T02:00:00Z'));
  assert.equal(days.flatMap(item => item.items).some(item => item.event.id === 'next'), false);
});

test('« Accueil » is reached from the bar and its own address, and shows both simulators\' endurances', () => {
  const view = read('front/app/week-view.mjs'), router = read('front/app/router.mjs');
  assert.match(router, /WEEK_HASH='#accueil'/);
  // Its first address (#semaine) still leads there.
  assert.match(router, /OLD_WEEK_HASH='#semaine'/);
  assert.match(read('front/app/home-view.mjs'), /button\('week','Accueil'/);
  assert.match(read('front/account-menu.mjs'), /#accueil`, 'Accueil'/);
  // No cards repeating the bar (Nathan 2026-11-01): the week, and the pilot's next race beside it; endurances filtered by sim.
  assert.doesNotMatch(view, /home-card/);
  assert.match(view, /function nextBox\(all,now\)/);
  // Signed up nowhere: no box, the week takes the whole width.
  assert.match(view, /if\(!next\)return '';/);
  assert.match(view, /home-layout\$\{box\?'':' is-full'\}/);
  assert.doesNotMatch(view, /départ\$\{count/);
  assert.match(view, /\['lmu','Endurance LMU'\],\['iracing','Endurance iRacing'\]/);
  // The other simulator's endurances open in its own space.
  assert.match(view, /\/api\/races\?game=\$\{game\}&scope=upcoming/);
  assert.match(view, /href="\/\$\{event\.otherGame\}\/#event=\$\{event\.id\}"/);
});
