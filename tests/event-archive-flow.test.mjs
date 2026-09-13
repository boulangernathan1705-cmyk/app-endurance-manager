import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {eventSchedule,groupEvents} from '../front/schedule.mjs';

const read=path=>readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const departure=(id,startsAt)=>({id,startsAt,time:'20:00',availability:[],crews:[]});

test('un événement est archivé dès que son dernier départ a commencé',()=>{
  const event={name:'Endurance',durationHours:8,departures:[departure('a',1000),departure('b',2000)]};
  assert.equal(eventSchedule(event,1999).archived,false);
  assert.equal(eventSchedule(event,2000).archived,true);
  assert.equal(eventSchedule(event,2001).archived,true);
});

test('la durée de course ne retarde plus l’archivage',()=>{
  const event={name:'Course 8h',durationHours:8,departures:[departure('a',1000)]};
  const schedule=eventSchedule(event,1001);
  assert.equal(schedule.archived,true);
  assert.equal(schedule.archiveAt,1000);
});

test('un départ déjà lancé ne crée plus de groupe événement En cours s’il reste un départ futur',()=>{
  const event={name:'Week-end',durationHours:8,departures:[departure('a',1000),departure('b',5000)]};
  const groups=groupEvents([event],'upcoming',2000);
  assert.equal(groups.length,1);
  assert.notEqual(groups[0].label,'En cours');
  assert.equal(groups[0].items[0].next.id,'b');
});

test('la vue événement garde les départs fermés par défaut et range les départs passés en bas',()=>{
  const view=read('front/app/event-view.mjs');
  const css=read('styles/past-departures.css');
  const html=read('game.html');
  assert.match(view,/class="past-departures-fold"/);
  assert.match(view,/Départs passés/);
  assert.match(view,/renderDeparturePanel\(event,departure,index,false,\{isPast:true\}\)/);
  assert.doesNotMatch(view,/departure\.id===next\?\.id\|\|/);
  assert.match(view,/next-departure-tag/);
  assert.match(css,/\.past-departures-fold > summary[\s\S]*font-size:\s*14px/);
  assert.match(css,/@media \(max-width: 700px\)[\s\S]*\.past-departures-fold > summary[\s\S]*font-size:\s*13px/);
  assert.match(html,/past-departures\.css\?v=1/);
});
