import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

test('agenda sorts unsorted departures and groups upcoming races by Paris weeks and months',()=>{
  const h=interfaceHarness();
  const result=h.run(`(() => {
    const race=(name,dates)=>({name,durationHours:6,departures:dates.map(date=>({startsAt:Date.parse(date)}))});
    return groupEvents([
      race('October',['2026-10-12T10:00:00Z']),
      race('Later',['2026-09-24T10:00:00Z']),
      race('Multiple',['2026-09-13T10:00:00Z','2026-09-08T10:00:00Z','2026-09-01T10:00:00Z']),
      race('Next week',['2026-09-14T10:00:00Z']),
      race('Soonest',['2026-09-07T12:00:00Z'])
    ],'upcoming',Date.parse('2026-09-07T08:00:00Z'));
  })()`);
  assert.deepEqual(Array.from(result,g=>g.label),['Cette semaine','La semaine prochaine','Plus tard en septembre','octobre']);
  assert.deepEqual(Array.from(result[0].items,x=>x.event.name),['Soonest','Multiple']);
  assert.equal(result[0].items[1].next.startsAt,Date.parse('2026-09-08T10:00:00Z'));
});

test('archive uses the end of the last race and sorts newest finishes first',()=>{
  const h=interfaceHarness();
  const result=h.run(`(() => {
    const now=Date.parse('2026-09-07T12:00:00Z');
    const race=(name,start,durationHours)=>({name,durationHours,departures:[{startsAt:Date.parse(start)}]});
    const source=[race('Old','2026-09-02T00:00:00Z',6),race('Running','2026-09-07T00:00:00Z',24),race('Just finished','2026-09-07T06:00:00Z',6),{name:'Undated',departures:[]}];
    return {active:groupEvents(source,'upcoming',now),archive:groupEvents(source,'archived',now)};
  })()`);
  assert.equal(result.active[0].label,'En cours');
  assert.equal(result.active[0].items[0].event.name,'Running');
  assert.equal(result.active[1].label,'Dates à confirmer');
  assert.deepEqual(Array.from(result.archive[0].items,x=>x.event.name),['Just finished','Old']);
});

test('agenda handles Paris midnight, Sunday to Monday, DST and new year',()=>{
  const h=interfaceHarness();
  const group=(now,date)=>h.run(`groupEvents([{name:'Race',departures:[{startsAt:Date.parse('${date}')}]}],'upcoming',Date.parse('${now}'))[0].label`);
  assert.equal(group('2026-09-06T21:30:00Z','2026-09-06T22:30:00Z'),'La semaine prochaine');
  assert.equal(group('2026-09-06T22:15:00Z','2026-09-07T12:00:00Z'),'Cette semaine');
  assert.equal(group('2026-10-25T00:30:00Z','2026-10-25T23:30:00Z'),'La semaine prochaine');
  assert.equal(group('2026-12-20T12:00:00Z','2027-01-15T12:00:00Z'),'janvier 2027');
});

function interfaceHarness(role='pilot',duration=6) {
  const app={innerHTML:'',querySelector:()=>null,insertAdjacentHTML(){}};
  const document={getElementById:()=>app,addEventListener(){}};
  const context=vm.createContext({document,Intl,Date,URLSearchParams,structuredClone,setInterval(){},localStorage:{getItem:()=>''},console});
  const catalog=readFileSync(new URL('../shared/catalog.mjs',import.meta.url),'utf8').replace(/\bexport\s+/g,'');
  const schedule=readFileSync(new URL('../front/schedule.mjs',import.meta.url),'utf8').replace(/\bexport\s+/g,'');
  const timeline=readFileSync(new URL('../front/timeline.mjs',import.meta.url),'utf8').replace(/\bexport\s+/g,'');
  const source=readFileSync(new URL('../app.js',import.meta.url),'utf8').replace(/^import[^\n]+\n/gm,'').replace(/start\(\);\s*$/,'');
  vm.runInContext(catalog+'\n'+schedule+'\n'+timeline+'\n'+source,context);
  const departure={id:'first',date:'2090-01-01',time:'12:00',startsAt:Date.UTC(2090,0,1),availability:[{id:'reg',name:'<Pilot>',status:'whole',category:'Hypercar',car:'Ferrari 499P',cars:['Ferrari 499P'],carAny:false,version:1,mine:true,canEdit:true}],crews:[{id:'crew',name:'FMT <test>',car:'Ferrari 499P',category:'Hypercar',version:1,registrationIds:['reg']}]};
  const event={id:'event',name:'Test',circuit:'daytona',eventType:'special',durationHours:duration,categories:['Hypercar'],departures:[departure,{...departure,id:'second',time:'15:00',crews:[],availability:[]}]};
  vm.runInContext(`events=${JSON.stringify([event])};user={role:${JSON.stringify(role)}};currentEventId='event';`,context);
  return {app,context,run:code=>vm.runInContext(code,context)};
}
test('compact course header, foldable departures, read-only crews for pilots, escaped names',()=>{
  const h=interfaceHarness();h.run('renderEvent()');
  assert(h.app.innerHTML.includes('event-header-stats'));
  assert(h.app.innerHTML.includes('Daytona International Speedway'));
  assert(h.app.innerHTML.includes('event-type-special'));
  assert(h.app.innerHTML.includes('crew-pilot-group crew-palette-0'));
  assert(h.app.innerHTML.includes('Ferrari 499P'));
  assert(h.app.innerHTML.includes('01h'));
  assert(!h.app.innerHTML.includes('class="pilot-car"'));
  assert(h.app.innerHTML.includes('id="departure-first"'));assert(h.app.innerHTML.includes('id="departure-second"'));
  assert.equal((h.app.innerHTML.match(/class="departure-fold"/g)||[]).length,2);
  h.run("eventSection='crews';renderEvent()");
  assert(h.app.innerHTML.includes('event-header-stats'));
  assert(!h.app.innerHTML.includes('data-section="crews"'));
  assert(!h.app.innerHTML.includes('data-action="new-crew"'));
  assert(!h.app.innerHTML.includes('data-action="add-crew-pilot"'));
  assert(h.app.innerHTML.includes('Mon inscription'));
  assert(h.app.innerHTML.includes('fold-registration'));
});
test('organizer crew controls and hourly palette scale to short, odd and 24-hour races',async()=>{
  for(const duration of [1,2,4,6,7,13,24]) {
    const h=interfaceHarness('organizer',duration);
    h.run("eventSection='crews';renderEvent()");
    assert(h.app.innerHTML.includes('data-action="new-crew"'));
    assert(h.app.innerHTML.includes('data-action="remove-crew-pilot"'));
    assert.equal((h.app.innerHTML.match(/<span class="presence-segment /g)||[]).length,duration);
    assert(h.app.innerHTML.includes('coverage-one'));
    assert(!h.app.innerHTML.includes('phase-'));
    h.run("eventSection='race';renderEvent()");
    assert(h.app.innerHTML.includes('presence-timeline duration-'+duration+' is-interactive'));
    assert(h.app.innerHTML.includes('name="carPreference"'));
    assert(h.app.innerHTML.includes('name="carAny"'));
    assert.equal((h.app.innerHTML.match(/data-action="availability"/g)||[]).length,2*(duration+2));
    assert.equal((h.app.innerHTML.match(/<button[^>]+class="presence-segment is-present"/g)||[]).length,duration);
    await h.run("perform('availability',{dataset:{departure:'first',value:'h1'}})");
    assert.equal((h.app.innerHTML.match(/<button[^>]+class="presence-segment is-present"/g)||[]).length,duration-1);
    assert(!h.app.innerHTML.includes('style="'));
  }
});

test('my entries and crew preferences share timelines while other crews stay summarized',()=>{
  const h=interfaceHarness('organizer',24);
  h.run('renderMyEntries()');
  assert(h.app.innerHTML.includes('MON ÉQUIPAGE'));
  assert.equal((h.app.innerHTML.match(/class="presence-timeline /g)||[]).length,2);
  assert(!h.app.innerHTML.includes('my-entry-accordion event-type-special" open'));
  h.run("events[0].departures[0].crews=[];renderMyEntries()");
  assert(h.app.innerHTML.includes('PILOTE EN AFFECTATION'));
  assert.equal((h.app.innerHTML.match(/class="presence-timeline /g)||[]).length,1);
  const wishes=h.run('pilotWishes(events[0].departures[0].availability[0],events[0].departures[0],24)');
  assert(wishes.includes('presence-timeline duration-24'));
  assert.equal((wishes.match(/<span class="presence-segment /g)||[]).length,24);
});

test('crew identity and ownership reach the course view for pilots, including empty crews',()=>{
  for (const locked of [false,true]) {
    const h=interfaceHarness('pilot');
    h.run(`events[0].departures[0].crews[0].locked=${locked};renderEvent()`);
    assert(h.app.innerHTML.includes('data-event-id="event"'));
    assert(h.app.innerHTML.includes(`data-crew-id="crew" data-crew-locked="${locked}" data-crew-mine="true"`));
    assert.equal(h.app.eventViewData.events[0].departures[0].crews[0].locked,locked);
    h.run("events[0].departures[0].availability[0].mine=false;renderEvent()");
    assert(h.app.innerHTML.includes('data-crew-mine="false"'));
    h.run("events[0].departures[0].availability=[];events[0].departures[0].crews[0].registrationIds=[];renderEvent()");
    assert(h.app.innerHTML.includes('data-crew-id="crew"'));
    assert(h.app.innerHTML.includes('Aucun pilote affecté.'));
  }
});
