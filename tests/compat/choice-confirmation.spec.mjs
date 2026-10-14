import {test} from '@playwright/test';
import assert from 'node:assert/strict';

// All API calls are mocked: no real events or registrations are changed.
test('simulator and community choices require Continue and retain the selected event type',async({page})=>{
const errors=[];page.on('pageerror',error=>errors.push(error.message));
const departure={id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',date:'2090-10-15',time:'21:00',startsAt:Date.now()+86400000,endsAt:Date.now()+86400000+21600000,availability:[],crews:[]};
const race={id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',name:'Official endurance',format:'endurance',official:true,circuit:'portimao',eventType:'special',categories:['GT3'],durationHours:6,durationMinutes:360,details:{trackLimits:'strict',tyres:14,grid:44,fairShare:true},departures:[0,1,2].map(i=>({...departure,id:i?departure.id.slice(0,-1)+i:departure.id,date:'2090-10-'+(15+i),startsAt:departure.startsAt+i*86400000,time:'21:00'})),version:1};
const communities=[{id:'alpha',slug:'alpha',name:'Alpha',appearance:{}},{id:'beta',slug:'beta',name:'Beta',appearance:{}}];
await page.route('**/api/**',async route=>{const path=new URL(route.request().url()).pathname;let data={ok:true};if(path==='/api/session')data={user:{id:'111111111111111111',name:'Nathan',communityIntroSeen:true},permissions:['access','endurance','create_race','manage_races','solo_open','solo_safe'],access:'member',discordReady:true,community:{...communities[0],modules:{soloRaces:true,eventTdz:true}},communities};else if(['/api/events','/api/races'].includes(path))data={events:[race]};else if(path.includes('notifications'))data={notifications:[],unread:0};else if(path==='/api/participants')data={participants:[]};await route.fulfill({contentType:'application/json',body:JSON.stringify(data)});});
await page.goto('/lmu/');await page.waitForFunction(async()=>{const {state}=await import('/front/app/core.mjs');return state.user?.name==='Nathan';});
await page.evaluate(async()=>{const {state}=await import('/front/app/core.mjs');state.listFormat='solo';state.eventTypes=['OPEN','SAFE','Bouboule'];const {renderSoloEventForm}=await import('/front/app/solo-form.mjs');renderSoloEventForm();});
await page.locator('[name="eventName"]').fill('Rally test');await page.locator('label').filter({has:page.locator('[name="eventSim"][value="acrally"]')}).click();assert.equal(await page.locator('[data-kind="solo-event"]').count(),1);assert.equal(await page.locator('[data-kind="rally-event"]').count(),0);
await page.locator('label').filter({has:page.locator('[name="eventType"][value="Bouboule"]')}).click();await page.locator('[data-solo-step="next"]').click();assert.equal(await page.locator('[data-kind="rally-event"]').count(),1);assert.equal(await page.locator('input[type="hidden"][name="eventType"]').inputValue(),'Bouboule');assert.equal(await page.locator('[name="eventType"][type="radio"]').count(),0);
await page.locator('[data-action="close-form"]').click();
await page.evaluate(async({race,communities})=>{const {state}=await import('/front/app/core.mjs');state.events=[race];state.communities=communities;state.currentEventId=race.id;state.drafts={};state.registrationOpen.add(race.departures[0].id);const {renderEvent}=await import('/front/app/event-view.mjs');renderEvent();},{race,communities});
assert.equal(await page.locator('[data-step="0"][data-kind="registration"]').count(),0);assert.equal(await page.evaluate(async(id)=>{const {state}=await import('/front/app/core.mjs');return state.drafts[id].communityId;},departure.id),'alpha');await page.locator('[data-action="registration-community"][data-community=""]').first().click();const chooser=page.locator('[data-step="0"][data-kind="registration"]');await chooser.waitFor();await chooser.locator('[data-community="alpha"]').click();assert.equal(await chooser.count(),1);assert.equal(await page.evaluate(async(id)=>{const {state}=await import('/front/app/core.mjs');return state.drafts[id].communityId||'';},departure.id),'');await chooser.locator('[data-community="beta"]').click();assert.equal(await chooser.locator('[data-community="beta"]').getAttribute('aria-pressed'),'true');await chooser.locator('[data-action="registration-community-confirm"]').click();assert.equal(await page.evaluate(async(id)=>{const {state}=await import('/front/app/core.mjs');return state.drafts[id].communityId;},departure.id),'beta');assert.equal(await page.locator('[data-step="0"][data-kind="registration"]').count(),0);
assert.equal(await page.locator('.planning-heading h2').count(),0);assert.equal(await page.locator('.race-controls [data-action="share-event"]').count(),1);assert.equal(await page.locator('.race-community-filter [data-community="alpha"]').count(),1);
assert.equal(await page.locator('.race-community-filter [data-community="beta"]').count(),1);
assert.equal(await page.locator('.race-header .race-starts').count(),0);
assert.equal(await page.locator('.race-info-chip').count(),4);
for(const chip of await page.locator('.race-info-chip').all())assert.ok((await chip.boundingBox()).height<50);
assert.equal(await page.locator('.race-header .race-my-start').count(),0);
assert.equal(await page.locator('.race-header .race-side .race-header-actions').count(),1);
assert.deepEqual(errors,[]);

});
