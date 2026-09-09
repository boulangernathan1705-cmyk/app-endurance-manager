import test from 'node:test';
import assert from 'node:assert/strict';
import {raceHourLabel, renderAvailabilityTimeline, timelineLabelVisible} from '../front/timeline.mjs';

const departure = {id:'departure', startsAt:Date.parse('2026-09-09T20:30:00Z')};
test('every duration from 1 to 24 keeps all hourly intervals, final boundary and unchanged status keys', () => {
  for (let duration=1; duration<=24; duration++) {
    for (const status of ['', 'whole', 'unavailable', 'h1', `h1,h${duration}`, 'beginning,middle']) {
      const html = renderAvailabilityTimeline({departure,duration,status,interactive:true});
      assert.equal((html.match(/<button /g)||[]).length,duration);
      assert.equal((html.match(/class="presence-boundary /g)||[]).length,duration+1);
      assert(html.indexOf('presence-edges')>html.indexOf('presence-track'));
      assert(html.includes(`data-value="h${duration}"`));
      const selected = status==='whole' ? duration : new Set(status.split(',').filter(x=>/^h\d+$/.test(x))).size;
      assert.equal((html.match(/aria-pressed="true"/g)||[]).length,selected);
      assert(!html.includes('style='));
      assert(!html.includes('phase-'));
    }
  }
});
test('real interval labels handle half hours, midnight and both Paris clock changes', () => {
  assert.equal(raceHourLabel(departure,0),'22h30');
  assert.equal(raceHourLabel(departure,2),'00h30');
  assert(renderAvailabilityTimeline({departure,duration:2}).includes('23h30 → 00h30'));
  const spring = {startsAt:Date.parse('2026-03-29T00:00:00Z')};
  assert.equal(raceHourLabel(spring,0),'01h');
  assert.equal(raceHourLabel(spring,1),'03h');
  const autumn = {startsAt:Date.parse('2026-10-25T00:00:00Z')};
  assert.equal(raceHourLabel(autumn,0),'02h');
  assert.equal(raceHourLabel(autumn,1),'02h');
  const html=renderAvailabilityTimeline({departure:autumn,duration:2});
  assert(html.includes('UTC+2'));assert(html.includes('UTC+1'));
});
test('crew coverage is read-only and distinguishes two pilots, one pilot and gaps', () => {
  const html=renderAvailabilityTimeline({departure,duration:4,counts:[2,0,1,3],label:'Couverture'});
  assert(!html.includes('<button'));
  assert(html.includes('presence-timeline duration-4 is-coverage'));
  assert.equal((html.match(/coverage-two/g)||[]).length,2);
  assert.equal((html.match(/coverage-one/g)||[]).length,1);
  assert.equal((html.match(/coverage-none/g)||[]).length,1);
  assert.equal((html.match(/ is-present/g)||[]).length,3);
  assert(html.includes('2 pilote(s) disponible(s)'));
  assert(html.includes('0 pilote(s) disponible(s)'));
  assert(html.includes('>2</span>'));
  assert(html.includes('>1</span>'));
});
test('sparse labels retain endpoints without crowding the finish for odd durations', () => {
  for(let duration=1;duration<=24;duration++) for(const capacity of [4,6,10,16,24]) {
    const labels=Array.from({length:duration+1},(_,i)=>i).filter(i=>timelineLabelVisible(i,duration,capacity));
    assert.equal(labels[0],0);assert.equal(labels.at(-1),duration);
    assert(labels.length<=capacity+1);
    for(let i=1;i<labels.length;i++) assert(labels[i]-labels[i-1]>=Math.ceil(duration/capacity));
  }
});
test('timeline attributes escape untrusted labels and departure identifiers', () => {
  const html=renderAvailabilityTimeline({departure:{...departure,id:'" onfocus="alert(1)'},duration:2,interactive:true,label:'<img src=x>'});
  assert(!html.includes(' onfocus="'));
  assert(html.includes('&quot;'));
  assert(!html.includes('<img'));
});
