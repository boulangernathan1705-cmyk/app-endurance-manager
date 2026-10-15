import test from 'node:test';
import assert from 'node:assert/strict';
import {raceMatches,raceFilterKey,mySituation,normalizeRaceFilters,raceFilterView,upcomingEntries,filteredCalendarEvents} from '../front/race-filters.mjs';
import {filterStorageKey,filterDate,setFilterDate} from '../front/filter-state.mjs';
import {filterEventCommunities,eventCommunities} from '../front/community-filters.mjs';

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

test('corrupt, unavailable and invisible saved filters are cleared for each calendar',()=>{
  for(const raw of [null,[],42,{communities:null,categories:'GT3',types:{},situation:'crew',from:'2026-02-31'}]){
    const result=normalizeRaceFilters(raw,{format:'solo'});
    assert.deepEqual(result.communities,[]);assert.deepEqual(result.types,[]);assert.deepEqual(result.categories,[]);
    assert.equal(result.situation,'');assert.equal(result.from,'');
  }
  const saved={communities:['mrt','removed'],categories:['GTP','GT3','GT3'],types:['official','special','unknown'],sims:['lmu'],kinds:['SAFE'],situation:'registered'};
  const lmu=normalizeRaceFilters(saved,{game:'lmu',communityIds:['mrt','tdz']});
  assert.deepEqual(lmu.communities,['mrt']);assert.deepEqual(lmu.categories,['GT3']);assert.deepEqual(lmu.types,['official','special']);
  assert.deepEqual(lmu.sims,[]);assert.deepEqual(lmu.kinds,[]);
  assert.deepEqual(normalizeRaceFilters(saved,{game:'iracing',communityIds:['mrt']}).communities,[],'a hidden single-community group cannot filter anything');
  const solo=normalizeRaceFilters(saved,{format:'solo',kindIds:[]});assert.deepEqual(solo.kinds,[]);assert.deepEqual(solo.sims,['lmu']);
});
test('storage keys isolate accounts, communities and screens, not just simulator',()=>{
  const context={communityId:'mrt',userId:'one'};
  const key=raceFilterKey('lmu','endurance',context);
  assert.notEqual(key,raceFilterKey('lmu','endurance',{...context,userId:'two'}));
  assert.notEqual(key,raceFilterKey('lmu','endurance',{...context,communityId:'tdz'}));
  assert.notEqual(key,filterStorageKey('planning',{game:'lmu',...context}));
  assert.equal(raceFilterKey('lmu','solo',context),raceFilterKey('iracing','solo',context));
});
test('date ranges stay valid and match an eligible start, not a past start on a future race',()=>{
  assert.equal(filterDate('2026-02-31'),'');assert.equal(filterDate('2028-02-29'),'2028-02-29');
  const selected=filters({from:'2026-10-17',to:'2026-10-18'});setFilterDate(selected,'from','2026-10-20');
  assert.equal(selected.to,'2026-10-20');setFilterDate(selected,'to','2026-10-16');assert.equal(selected.from,'2026-10-16');
  const event={...indy,departures:[{...departure('past',50),date:'2026-10-16'},{...departure('next',200),date:'2026-10-17'}]};
  assert.equal(raceMatches(event,filters({from:'2026-10-16',to:'2026-10-16'}),options),false);
  assert.equal(raceMatches(event,filters({from:'2026-10-16',to:'2026-10-16'}),{...options,archived:true}),true);
  assert.deepEqual(raceFilterView(event,filters({from:'2026-10-17'})).departures.map(item=>item.id),['next']);
});
test('community filters scope the cards, crews, counts, absences and my situation together',()=>{
  const mine={id:'mine',mine:true,participantId:'p1',status:'whole',community:{id:'tdz'}};
  const other={id:'other',participantId:'p2',status:'whole',community:{id:'mrt'}};
  const event={...indy,absences:[{name:'Absent MRT'},{name:'Absent TDZ',communityId:'tdz'}],departures:[departure('next',200,[mine,other],[{id:'crew',community:{id:'tdz'},registrationIds:['mine']}])]};
  const mrt=filters({communities:['mrt'],situation:'registered'});
  assert.equal(raceMatches(event,mrt,options),false,'a TDZ registration cannot satisfy the MRT situation filter');
  const view=raceFilterView(event,mrt,options);
  assert.deepEqual(view.departures[0].availability.map(item=>item.id),['other']);assert.deepEqual(view.departures[0].crews,[]);
  assert.deepEqual(view.absences.map(item=>item.name),['Absent MRT']);
  assert.equal(event.departures[0].availability.length,2,'the source stays intact');
  assert.equal(filterEventCommunities({...event,official:false},['tdz'],'mrt').departures[0].availability.length,2,'private events have no community view filter');
  assert.equal(eventCommunities({...event,official:false},[{id:'mrt'},{id:'tdz'}]).size,0);
  assert.equal(eventCommunities(event,[{id:'mrt'},{id:'tdz'}]).get('tdz').pilots.size,1);
});
test('Mes inscriptions excludes past starts and unavailable registrations even on a future race',()=>{
  const event={...indy,departures:[departure('old',50,[{id:'past',mine:true,status:'whole'}]),departure('next',200,[{id:'mine',mine:true,status:'whole'},{id:'managed',managed:true,status:'whole'},{id:'no',mine:true,status:'unavailable'}])]};
  assert.deepEqual(upcomingEntries([event],100).map(item=>item.reg.id),['mine','managed']);
});

test('a date slice cannot move a race with a later start into archives',()=>{
  const event={...indy,departures:[{...departure('old',50),date:'2026-10-16'},{...departure('next',200),date:'2026-10-17'}]};
  const selected=filters({from:'2026-10-16',to:'2026-10-16'});
  assert.deepEqual(filteredCalendarEvents([event],selected,{...options,archived:true}),[]);
  assert.deepEqual(filteredCalendarEvents([event],selected,options),[]);
  assert.equal(filteredCalendarEvents([event],filters({from:'2026-10-17'}),options).length,1);
});
