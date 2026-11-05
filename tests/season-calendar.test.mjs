import test from 'node:test';
import assert from 'node:assert/strict';
import {monthKey,validMonth,shiftMonth,seasonMonths,monthDays} from '../front/season-calendar.mjs';
const race=(id,date,extra={})=>({id,name:id,format:'solo',departures:[{id:id+'-d',startsAt:Date.parse(date),availability:[]}],...extra});
test('seasons always contain three months',()=>{
  assert.deepEqual(seasonMonths('2026-10'),['2026-10','2026-11','2026-12']);
  assert.deepEqual(seasonMonths('2026-12',3),['2026-12','2027-01','2027-02']);
  assert.equal(shiftMonth('2027-01',-1),'2026-12');
  assert.equal(validMonth('2026-13'),false);assert.equal(validMonth('bad'),false);
});
test('a month uses Paris dates, with complete Monday to Sunday rows, including leap years',()=>{
  assert.equal(monthKey(Date.parse('2026-10-31T23:30:00Z')),'2026-11');
  const days=monthDays([], '2028-02');
  assert.equal(days.length%7,0);assert.equal(new Date(days[0].day*86400000).getUTCDay(),1);
  assert.equal(days.filter(d=>d.inMonth).length,29);
});
test('completed events stay in their season and multiple starts share one card per Paris day',()=>{
  const completed=race('completed','2026-11-04T20:00:00Z',{archived:true});
  const boundary=race('boundary','2026-10-31T23:30:00Z');
  boundary.departures.push({id:'second',startsAt:Date.parse('2026-11-01T18:00:00Z')});
  const outside=race('outside','2026-11-30T23:30:00Z');
  const days=monthDays([completed,boundary,outside], '2026-11');
  const items=days.flatMap(d=>d.items);
  assert.deepEqual(items.map(i=>i.event.id),['boundary','completed']);
  assert.equal(items[0].starts.length,2);
  assert.equal(completed.archived,true);
  assert.ok(days.filter(d=>!d.inMonth).every(d=>d.items.length===0));
});
