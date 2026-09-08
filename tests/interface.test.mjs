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
  vm.runInContext(readFileSync(new URL('../app.js',import.meta.url),'utf8').replace(/start\(\);\s*$/,''),context);
  const departure={id:'first',date:'2090-01-01',time:'12:00',startsAt:Date.UTC(2090,0,1),availability:[{id:'reg',name:'<Pilot>',status:'whole',category:'Hypercar',car:'Ferrari 499P',cars:['Ferrari 499P'],carAny:false,version:1,mine:true,canEdit:true}],crews:[{id:'crew',name:'FMT <test>',car:'Ferrari 499P',category:'Hypercar',version:1,registrationIds:['reg']}]};
  const event={id:'event',name:'Test',circuit:'daytona',eventType:'special',durationHours:duration,categories:['Hypercar'],departures:[departure,{...departure,id:'second',time:'15:00',crews:[],availability:[]}]};
  vm.runInContext(`events=${JSON.stringify([event])};user={role:${JSON.stringify(role)}};currentEventId='event';`,context);
  return {app,context,run:code=>vm.runInContext(code,context)};
}
test('course recap, foldable departures, read-only crews for pilots, escaped names',()=>{
  const h=interfaceHarness();h.run('renderEvent()');
  assert(h.app.innerHTML.includes('RÉCAPITULATIF DE LA COURSE'));
  assert(h.app.innerHTML.includes('Daytona International Speedway'));
  assert(h.app.innerHTML.includes('event-type-special'));
  assert(h.app.innerHTML.includes('crew-pilot-group crew-palette-0'));
  assert(h.app.innerHTML.includes('Ferrari 499P'));
  assert(h.app.innerHTML.includes('id="departure-first"'));assert(h.app.innerHTML.includes('id="departure-second"'));
  assert.equal((h.app.innerHTML.match(/class="departure-fold"/g)||[]).length,2);
  h.run("eventSection='crews';renderEvent()");
  assert(h.app.innerHTML.includes('RÉCAPITULATIF DE LA COURSE'));
  assert(!h.app.innerHTML.includes('data-section="crews"'));
  assert(!h.app.innerHTML.includes('data-action="new-crew"'));
  assert(!h.app.innerHTML.includes('data-action="add-crew-pilot"'));
  assert(h.app.innerHTML.includes('Mon inscription'));
  assert(h.app.innerHTML.includes('fold-registration'));
});
test('organizer crew controls and hourly palette scale to 1, 4, 6 and 24 hours',async()=>{
  for(const duration of [1,4,6,24]) {
    const h=interfaceHarness('organizer',duration);
    h.run("eventSection='crews';renderEvent()");
    assert(h.app.innerHTML.includes('data-action="new-crew"'));
    assert(h.app.innerHTML.includes('data-action="remove-crew-pilot"'));
    assert.equal((h.app.innerHTML.match(/class="crew-availability-hour /g)||[]).length,duration);
    assert(h.app.innerHTML.includes('phase-0'));if(duration>1)assert(h.app.innerHTML.includes('phase-23'));
    h.run("eventSection='race';renderEvent()");
    assert(h.app.innerHTML.includes('availability-hour-grid compact-hours duration-'+duration));
    assert(h.app.innerHTML.includes('name="carPreference"'));
    assert(h.app.innerHTML.includes('name="carAny"'));
    assert.equal((h.app.innerHTML.match(/data-action="availability"/g)||[]).length,2*(duration+2));
    assert.equal((h.app.innerHTML.match(/hour-card phase-\d+ active/g)||[]).length,duration);
    await h.run("perform('availability',{dataset:{departure:'first',value:'h1'}})");
    assert.equal((h.app.innerHTML.match(/hour-card phase-\d+ active/g)||[]).length,duration-1);
    assert(!h.app.innerHTML.includes('style="'));
  }
});
