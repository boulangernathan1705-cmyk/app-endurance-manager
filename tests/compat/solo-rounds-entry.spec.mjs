import {test,expect} from '@playwright/test';

// An event in several rounds (Nathan 2026-11-01): one entry block at the top, the rounds as information, the pilots once.
const pilot=(id,name,extra={})=>({id,name,status:'whole',category:'GT3',...extra});
for(const width of [1366,390])test(`one entry block for an event in two rounds at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:1000});
 const departure={id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',date:'2090-10-15',time:'21:00',startsAt:Date.now()+86400000,crews:[],
  availability:[pilot('p1','Sara Lopes'),pilot('p2','Nico Varga'),pilot('p3','Jules Martin')]};
 const race={id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',name:'Sprint GT3 du jeudi',format:'solo',sim:'lmu',access:'open',circuit:'imola',durationHours:1,durationMinutes:50,categories:['GT3'],capacity:12,details:{type:'OPEN'},
  rounds:[{circuit:'imola',durationMinutes:25,categories:['GT3']},{circuit:'spa',durationMinutes:25,categories:['GT3']}],departures:[departure],version:1};
 await page.route('**/api/**',route=>{const path=new URL(route.request().url()).pathname;let data={ok:true};if(path==='/api/session')data={user:{id:'111111111111111111',name:'Nathan',communityIntroSeen:true},permissions:['access','endurance','solo_open'],access:'member',discordReady:true,community:{id:'alpha',slug:'alpha',name:'Alpha',modules:{soloRaces:true}},communities:[]};else if(['/api/events','/api/races'].includes(path))data={events:[race]};else if(path.includes('notifications'))data={notifications:[],unread:0};return route.fulfill({contentType:'application/json',body:JSON.stringify(data)});});
 await page.addInitScript(()=>localStorage.setItem('endurance_manager_locale','fr'));
 await page.goto('/lmu/');await page.waitForFunction(async()=>{const {state}=await import('/front/app/core.mjs');return Boolean(state.user);});
 const show=async availability=>page.evaluate(async({race,availability})=>{const {state}=await import('/front/app/core.mjs');race.departures[0].availability=availability;state.events=[race];state.currentEventId=race.id;const {renderEvent}=await import('/front/app/event-view.mjs');renderEvent();},{race,availability});
 await show(departure.availability);
 const block=page.locator('.solo-entry-block');
 await expect(block).toHaveCount(1);
 await expect(block).toContainText('Inscription aux 2 manches');
 await expect(block).toContainText('3 / 12 places prises');
 await expect(block.locator('[data-action="my-registration"]')).toBeVisible();
 // No button in the rounds, and the pilots once.
 await expect(page.locator('.solo-round-card')).toHaveCount(2);
 await expect(page.locator('.solo-round-card [data-action]')).toHaveCount(0);
 await expect(page.locator('.solo-round-pilots-all .solo-entry')).toHaveCount(3);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
 await page.locator('.solo-entry-block').scrollIntoViewIfNeeded();
 await page.screenshot({path:`/tmp/rounds-${width}.png`});
 // The pilot skips the second round: the block says so, and each round shows its own pilots.
 await show([...departure.availability,pilot('me','Nathan',{mine:true,roundChoices:[{category:'GT3'},{skip:true}]})]);
 await expect(block).toContainText('✓ Inscrit à la manche 1');
 await expect(page.locator('.solo-round-pilots-all')).toHaveCount(0);
 await expect(page.locator('.solo-round-card').nth(0).locator('.solo-entry')).toHaveCount(4);
 await expect(page.locator('.solo-round-card').nth(1).locator('.solo-entry')).toHaveCount(3);
 // Opening the entry window puts it right under the block.
 await block.locator('[data-action="my-registration"]').click();
 await expect(page.locator('.solo-round-starts.is-multi > .fold-registration')).toBeVisible();
 await page.screenshot({path:`/tmp/rounds-${width}-mine.png`});
});
