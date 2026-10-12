import test from 'node:test';
import assert from 'node:assert/strict';

// Render the real browser templates without starting OAuth, auto-refresh or a real API request.
globalThis.document={readyState:'loading',getElementById(){return null;},addEventListener(){}};
globalThis.addEventListener=()=>{};
const {state}=await import('../front/app/core.mjs');
const {renderSteppedRegistration,submitRegistration}=await import('../front/app/registration.mjs');

const DEPARTURE='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const EVENT='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const streamers=[{id:'alpha',name:'Alpha',capacity:15},{id:'bravo',name:'Bravo',capacity:15}];
function fixture(type='Gridfest',rounds=[{circuit:'lemans',durationMinutes:30,categories:['Hypercar']}]){
  state.user={id:'111111111111111111',name:'Nathan Boulanger'};
  state.permissions=['access','solo_open'];state.community={id:'tdz',name:'TDZ'};state.grindfest=true;
  state.currentEventId=EVENT;state.drafts={};state.registrationOpen=new Set([DEPARTURE]);
  const departure={id:DEPARTURE,startsAt:Date.now()+86400000,availability:[],crews:[]};
  const event={id:EVENT,format:'solo',sim:'lmu',categories:[...new Set(rounds.flatMap(round=>round.categories))],rounds,
    details:{type,streamers},departures:[departure]};
  state.events=[event];
  const draft={name:state.user.name,gameName:'',streamerId:'',forOther:false};
  state.drafts[DEPARTURE]=draft;
  return {event,departure,draft};
}

for(const type of ['Grindfest','Gridfest'])test(`${type} keeps the original steps, pilot identity and recap with LMU name and streamer`,()=>{
  const {event,departure,draft}=fixture(type);
  const first=renderSteppedRegistration(event,departure,draft);
  assert.match(first,/registration-form registration-stepper/);
  assert.match(first,/Étape 1 sur 2/);
  assert.match(first,/name="gridfestGameName"[^>]*required/);
  assert.match(first,/name="registrationStreamer" required/);
  assert.match(first,/data-action="registration-step"[^>]*data-step="2"/);
  assert.match(first,/registration-summary/);
  draft.gameName='Nathan <LMU>';draft.streamerId='bravo';draft.step=2;
  const summary=renderSteppedRegistration(event,departure,draft);
  assert.match(summary,/Étape 2 sur 2 · Récapitulatif/);
  assert.match(summary,/<span>Pilote<\/span><strong>Nathan Boulanger<\/strong>/);
  assert.match(summary,/<span>Nom sur LMU<\/span><strong>Nathan &lt;LMU&gt;<\/strong>/);
  assert.match(summary,/<span>Streamer<\/span><strong>Bravo<\/strong>/);
  assert.match(summary,/<span>Catégorie<\/span>/);
  assert.match(summary,/data-step="1" data-edit="true"/);
  assert.match(summary,/data-step="1"[^>]*>Retour/);
});

test('rounds with no category still offer an identity step before the recap; every Gridfest round remains included',()=>{
  const {event,departure,draft}=fixture('Gridfest',[{circuit:'spa',durationMinutes:30,categories:[]}]);
  const empty=renderSteppedRegistration(event,departure,draft);
  assert.match(empty,/Étape 1 sur 2/);
  assert.match(empty,/<section class="registration-step" data-step="1" >/);
  assert.match(empty,/name="gridfestGameName"/);
  const multi=fixture('Gridfest',[{circuit:'spa',durationMinutes:30,categories:['Hypercar']},{circuit:'monza',durationMinutes:30,categories:['Hypercar','GT3']}]);
  const html=renderSteppedRegistration(multi.event,multi.departure,multi.draft);
  assert.match(html,/Étape 1 sur 3/);
  assert.doesNotMatch(html,/data-action="solo-skip"/);
  assert(multi.draft.choices.every(choice=>!choice.skip));
});

test('submitting the recap preserves the chosen streamer, LMU name and categories on every round',async()=>{
  const {event,departure,draft}=fixture('Gridfest',[{circuit:'spa',durationMinutes:30,categories:['Hypercar','GT3']},{circuit:'monza',durationMinutes:30,categories:['Hypercar','GT3']}]);
  renderSteppedRegistration(event,departure,draft);
  draft.gameName='Nathan LMU';draft.streamerId='bravo';draft.choices[0].category='GT3';draft.choices[1].category='Hypercar';
  const form={dataset:{departure:DEPARTURE},elements:{gridfestGameName:{value:'Nathan LMU'},registrationStreamer:{value:'bravo'}}};
  let saved;
  await submitRegistration(form,async(path,method,payload)=>{saved={path,method,payload};return {id:'new-entry'};});
  assert.equal(saved.method,'POST');
  assert.equal(saved.payload.name,'Nathan Boulanger');
  assert.equal(saved.payload.gameName,'Nathan LMU');
  assert.equal(saved.payload.streamerId,'bravo');
  assert.deepEqual(saved.payload.choices.map(choice=>choice.category),['GT3','Hypercar']);
});

test('regular solo registrations keep their original two steps without Gridfest fields',()=>{
  const {event,departure,draft}=fixture('OPEN');
  const html=renderSteppedRegistration(event,departure,draft);
  assert.match(html,/registration-form registration-stepper/);
  assert.match(html,/Étape 1 sur 2/);
  assert.doesNotMatch(html,/name="gridfestGameName"|name="registrationStreamer"|<span>Streamer<\/span>/);
});
