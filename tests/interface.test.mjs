import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url),'utf8');

function scheduleHarness() {
  const context=vm.createContext({Intl,Date,console,globalThis:{}});
  const catalog=read('shared/catalog.mjs').replace(/\bexport\s+/g,'');
  const schedule=read('front/schedule.mjs').replace(/\bexport\s+/g,'');
  vm.runInContext(catalog+'\n'+schedule,context);
  return {run:code=>vm.runInContext(code,context)};
}

test('agenda sorts unsorted departures and groups upcoming races by Paris weeks and months',()=>{
  const h=scheduleHarness();
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
});

test('archive uses the end of the last race and sorts newest finishes first',()=>{
  const h=scheduleHarness();
  const result=h.run(`(() => {
    const now=Date.parse('2026-09-07T12:00:00Z');
    const race=(name,start,durationHours)=>({name,durationHours,departures:[{startsAt:Date.parse(start)}]});
    const source=[race('Old','2026-09-02T00:00:00Z',6),race('Running','2026-09-07T00:00:00Z',24),race('Just finished','2026-09-07T06:00:00Z',6),{name:'Undated',departures:[]}];
    return {active:groupEvents(source,'upcoming',now),archive:groupEvents(source,'archived',now)};
  })()`);
  assert.equal(result.active[0].label,'En cours');
  assert.deepEqual(Array.from(result.archive[0].items,x=>x.event.name),['Just finished','Old']);
});

test('agenda handles Paris midnight, Sunday to Monday, DST and new year',()=>{
  const h=scheduleHarness();
  const group=(now,date)=>h.run(`groupEvents([{name:'Race',departures:[{startsAt:Date.parse('${date}')}]}],'upcoming',Date.parse('${now}'))[0].label`);
  assert.equal(group('2026-09-06T21:30:00Z','2026-09-06T22:30:00Z'),'La semaine prochaine');
  assert.equal(group('2026-09-06T22:15:00Z','2026-09-07T12:00:00Z'),'Cette semaine');
  assert.equal(group('2026-10-25T00:30:00Z','2026-10-25T23:30:00Z'),'La semaine prochaine');
  assert.equal(group('2026-12-20T12:00:00Z','2027-01-15T12:00:00Z'),'janvier 2027');
});

test('Course produit directement l’interface finale',()=>{
  const eventView=read('front/app/event-view.mjs');
  const crews=read('front/app/crews.mjs');
  assert.match(eventView,/event-header-stats/);
  assert.match(eventView,/departure-fold/);
  assert.match(eventView,/Modifier mon inscription/);
  assert.match(eventView,/Inscrire un autre pilote/);
  assert.match(crews,/ux-course-pilots-accordion/);
  assert.match(crews,/ux-course-crews-accordion/);
  assert.match(crews,/crew-pilot-accordion/);
});

test('Équipages produit directement la gestion finale',()=>{
  const crews=read('front/app/crews.mjs');
  const eventView=read('front/app/event-view.mjs');
  assert.match(eventView,/event-section','Équipages'/);
  assert.match(crews,/crew-management-accordion/);
  assert.match(crews,/data-crew-state-select/);
  assert.match(crews,/edit-crew/);
  assert.match(crews,/add-crew-pilot/);
  assert.match(crews,/remove-crew-pilot/);
});

test('le formulaire inscription est unique et compact',()=>{
  const registration=read('front/app/registration.mjs');
  assert.match(registration,/registration-identity-grid/);
  assert.match(registration,/Pilote souhaité/);
  assert.match(registration,/TOUTE LA COURSE/);
  assert.doesNotMatch(registration,/button\('availability','INDISPONIBLE'/);
  assert.match(registration,/renderAvailabilityTimeline\(\{departure,duration,status:stateDraft\.status,interactive:true/);
});

test('Mes inscriptions est rendu par la base commune',()=>{
  const entries=read('front/app/entries-view.mjs');
  assert.match(entries,/native-my-entry-card/);
  assert.match(entries,/Mes inscriptions personnelles/);
  assert.match(entries,/Inscriptions que je gère/);
  assert.match(entries,/Pilotes sans équipage/);
});
