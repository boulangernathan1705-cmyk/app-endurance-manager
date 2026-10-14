import {test,expect} from '@playwright/test';
for(const count of [1,2])for(const tdz of [false,true])test(`solo header ${tdz?'TDZ':'SOLO'} ${count} rounds: larger logo and password only for entrants`,async({page})=>{
 const departure={id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',date:'2090-10-15',time:'21:00',startsAt:Date.now()+86400000,availability:[],crews:[]};
 const race={id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',name:'OPEN LMU',format:'solo',sim:'lmu',access:'open',circuit:'portimao',durationHours:1,durationMinutes:60,categories:[],details:{type:'OPEN',password:'test-password'},rounds:[{circuit:'portimao',durationMinutes:40,practice:5,qualifying:10,categories:['GT3'],weather:'cloudy'},{circuit:'spa',durationMinutes:40,categories:['GT3']}],departures:[departure],version:1};
 race.rounds=race.rounds.slice(0,count);
 await page.route('**/api/**',route=>{const path=new URL(route.request().url()).pathname;let data={ok:true};if(path==='/api/session')data={user:{id:'111111111111111111',name:'Nathan',communityIntroSeen:true},permissions:['access','endurance','manage_races','solo_open'],access:'member',discordReady:true,community:{id:'alpha',slug:'alpha',name:'Alpha',modules:{soloRaces:true}},communities:[]};else if(['/api/events','/api/races'].includes(path))data={events:[race]};else if(path.includes('notifications'))data={notifications:[],unread:0};return route.fulfill({contentType:'application/json',body:JSON.stringify(data)});});
 await page.goto('/lmu/');await page.waitForFunction(async()=>{const {state}=await import('/front/app/core.mjs');return Boolean(state.user);});
 await page.evaluate(async({race,tdz})=>{const {state}=await import('/front/app/core.mjs');state.eventTdz=tdz;state.manager=true;state.events=[race];state.currentEventId=race.id;const {renderEvent}=await import('/front/app/event-view.mjs');renderEvent();},{race,tdz});
 await expect(page.locator('.race-header .event-access-logo')).toBeVisible();
 await expect(page.locator('.race-header')).not.toContainText('test-password');
 await expect(page.locator('.race-controls [data-action="share-event"]')).toBeVisible();
 if(count===1)for(const chip of await page.locator('.race-header .round-item').all())expect((await chip.boundingBox()).height).toBeLessThan(45);
 await page.screenshot({path:`/tmp/solo-${count}-${tdz?'tdz':'plain'}-${test.info().project.name}.png`,fullPage:true});
 await page.evaluate(async()=>{const {state}=await import('/front/app/core.mjs');state.events[0].departures[0].availability=[{id:'r',mine:true,name:'Nathan',status:'whole',roundChoices:[{category:'GT3'},{skip:true}]}];const {renderEvent}=await import('/front/app/event-view.mjs');renderEvent();});
 await expect(page.locator('.solo-password-near-entry')).toContainText('test-password');
 await expect(page.locator('.race-header')).not.toContainText('test-password');
});
