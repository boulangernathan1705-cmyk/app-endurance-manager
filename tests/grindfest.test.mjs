import test from 'node:test';
import assert from 'node:assert/strict';
import {validateEvent, validateRegistration} from '../server/core.mjs';
import {assignStreamerWaitlist, grindfestEnabled, normalizeStreamers} from '../shared/grindfest.mjs';

const streamers = [{id:'a',name:'Alpha',capacity:1,twitchUrl:'https://www.twitch.tv/alpha'}, {id:'b',name:'Bravo',capacity:2,twitchUrl:'https://www.twitch.tv/bravo'}];
const input = {name:'Grindfest',format:'solo',sim:'lmu',details:{type:'Grindfest',streamers},rounds:[{circuit:'spa',durationMinutes:60,categories:[]}],departures:[{date:'2090-10-15',time:'20:00'}]};

test('Grindfest calculates total capacity and requires a real streamer on every entry', () => {
  const data = validateEvent(input);
  assert.equal(data.capacity,3);
  const event = {...data,details:JSON.stringify(data.details),rounds:JSON.stringify(data.rounds),categories:JSON.stringify(data.categories)};
  assert.throws(() => validateRegistration({name:'Nathan'},event), /streamer/);
  assert.throws(() => validateRegistration({name:'Nathan',streamerId:'unknown'},event), /streamer/);
  assert.equal(validateRegistration({name:'Nathan',streamerId:'a'},event).streamerId,'a');
  const multi=validateEvent({...input,rounds:[...input.rounds,{circuit:'monza',durationMinutes:30,categories:[]}]});
  assert.equal(multi.capacity,3);
  assert.equal(multi.rounds.length,2);
  assert(multi.rounds.every(round=>round.capacity==null));
  const multiEvent={...multi,details:JSON.stringify(multi.details),rounds:JSON.stringify(multi.rounds),categories:JSON.stringify(multi.categories)};
  assert.deepEqual(validateRegistration({name:'Nathan',streamerId:'a'},multiEvent).roundChoices,[]);
  assert.throws(()=>validateRegistration({name:'Nathan',streamerId:'a',choices:[{}, {skip:true}]},multiEvent), /toutes les manches/);
  assert.throws(() => validateEvent({...input,details:{type:'OPEN'}},event), /ne peut pas changer/);
});

test('the entitlement belongs only to TDZ, even when another community enables the stored flag', () => {
  assert.equal(grindfestEnabled({slug:'tdz',modules:{grindfest:true}}),true);
  assert.equal(grindfestEnabled({slug:'fmt',modules:{grindfest:true}}),false);
  assert.equal(grindfestEnabled({slug:'tdz',modules:{grindfest:false}}),false);
  assert.equal(grindfestEnabled({slug:'test',modules:{grindfest:true}}),false);
  assert.equal(grindfestEnabled({slug:'test',modules:{grindfest:true}},true),true);
  assert.equal(grindfestEnabled({slug:'fmt',modules:{grindfest:true}},true),false);
});

test('waiting positions are per streamer, and withdrawing promotes only the matching queue', () => {
  const entries = ['a','a','a','b','b','b'].map((streamerId,index) => ({id:index,streamerId,status:'whole'}));
  assignStreamerWaitlist(entries,streamers);
  assert.deepEqual(entries.map(item=>item.waitlistPosition),[null,1,2,null,null,1]);
  const remaining = entries.slice(1);
  assignStreamerWaitlist(remaining,streamers);
  assert.deepEqual(remaining.map(item=>item.waitlistPosition),[null,1,null,null,1]);
});

test('streamer configuration rejects duplicate identities, unsafe links and invalid quotas', () => {
  for (const patch of [{id:'a'}, {name:'Alpha'}, {capacity:0}, {capacity:1.5}, {twitchUrl:'javascript:alert(1)'}, {twitchUrl:'https://twitch.tv.evil.example/bravo'}, {logoUrl:'data:image/svg+xml;base64,PHN2Zz4='}]) {
    assert.throws(() => normalizeStreamers([streamers[0], {...streamers[1],...patch}]));
  }
});
