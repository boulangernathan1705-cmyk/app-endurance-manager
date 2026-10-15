import test from 'node:test';
import assert from 'node:assert/strict';
import {raceMatches,raceFilterKey,mySituation} from '../front/race-filters.mjs';

const filters=overrides=>({communities:[],types:[],categories:[],sims:[],kinds:[],from:'',to:'',situation:'',...overrides});
const departure=(id,startsAt,availability=[],crews=[])=>({id,startsAt,date:'2026-10-17',availability,crews});
const options={communityId:'mrt',now:100};
const indy={official:true,eventType:'special',circuit:'iracing-indianapolis',categories:['GT3'],departures:[departure('a',200,[{id:'r',mine:true,community:{id:'tdz'},status:'whole'}])]};

test('Indianapolis matches both official and special, while regular series stay out of special',()=>{
  assert.equal(raceMatches(indy,filters({types:['special']}),options),true);
  assert.equal(raceMatches(indy,filters({types:['official']}),options),true);
  assert.equal(raceMatches({...indy,eventType:'lmu'},filters({types:['special']}),options),false);
});
test('community filtering follows entries and empty crews, not ownership of the shared calendar',()=>{
  assert.equal(raceMatches(indy,filters({communities:['tdz']}),options),true);
  assert.equal(raceMatches(indy,filters({communities:['mrt']}),options),false);
  const emptyCrew={...indy,departures:[departure('a',200,[],[{community:{id:'mrt'},registrationIds:[]}])]};
  assert.equal(raceMatches(emptyCrew,filters({communities:['mrt']}),options),true);
  assert.equal(raceMatches({...indy,official:false},filters({communities:['mrt']}),options),true);
});
test('a crew on a later start is found even with an earlier unassigned registration',()=>{
  const event={...indy,departures:[departure('a',200,[{id:'r1',mine:true,status:'whole'}]),departure('b',300,[{id:'r2',mine:true,status:'whole'}],[{registrationIds:['r2']}])]};
  assert.equal(raceMatches(event,filters({situation:'crew'}),options),true);
  assert.equal(mySituation(event,{includePast:true}).crew.registrationIds[0],'r2');
  assert.equal(raceMatches(event,filters({situation:'no-crew'}),options),false);
});
test('past registrations do not count as future registrations; archives keep them',()=>{
  const event={...indy,departures:[departure('a',50,[{id:'r',mine:true,status:'whole'}]),departure('b',200)]};
  assert.equal(raceMatches(event,filters({situation:'registered'}),options),false);
  assert.equal(raceMatches(event,filters({situation:'free'}),options),true);
  assert.equal(raceMatches(event,filters({situation:'registered'}),{...options,archived:true}),true);
});
test('simulators remember their own endurance filters; solo events share theirs',()=>{
  assert.notEqual(raceFilterKey('lmu'),raceFilterKey('iracing'));
  assert.equal(raceFilterKey('lmu','solo'),raceFilterKey('iracing','solo'));
});
