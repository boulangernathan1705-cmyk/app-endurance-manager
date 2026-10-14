import {test,expect} from '@playwright/test';
test('pilot availability bars have one colour; only the current card is highlighted',async({page})=>{
 await page.route('**/api/**',route=>{const path=new URL(route.request().url()).pathname;let data={ok:true};if(path==='/api/session')data={user:{id:'111111111111111111',name:'Nathan',communityIntroSeen:true},access:'member',permissions:['access','endurance'],community:{id:'alpha',slug:'alpha',name:'Alpha'},communities:[]};else if(['/api/events','/api/races'].includes(path))data={events:[]};else if(path.includes('notifications'))data={notifications:[],unread:0};return route.fulfill({contentType:'application/json',body:JSON.stringify(data)});});
 await page.goto('/lmu/');await page.waitForFunction(async()=>{const {state}=await import('/front/app/core.mjs');return Boolean(state.user);});
 await page.evaluate(async()=>{const {renderAvailabilityTimeline}=await import('/front/timeline.mjs');const departure={startsAt:Date.now()+86400000,time:'21:00'};document.querySelector('#app').innerHTML='<div class="ux-unassigned-grid">'+['Nathan','Etienne','LoorZ'].map((name,i)=>`<div class="pilot-row${i===0?' ux-current-pilot':''}"><span class="pilot-name">${name}</span>${renderAvailabilityTimeline({departure,duration:4,status:'whole'})}</div>`).join('')+'</div>';document.dispatchEvent(new CustomEvent('endurance:render'));});
 await expect(page.locator('.presence-timeline.pilot-timeline-tone-0')).toHaveCount(3);
 const colours=await page.locator('.presence-segment.is-present').evaluateAll(els=>els.map(el=>getComputedStyle(el).backgroundColor));expect(new Set(colours).size).toBe(1);
 const outlines=await page.locator('.pilot-row').evaluateAll(els=>els.map(el=>getComputedStyle(el).outlineWidth));expect(outlines[0]).not.toBe(outlines[1]);
});
