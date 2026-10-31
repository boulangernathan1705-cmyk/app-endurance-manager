import {test,expect} from '@playwright/test';

// « Accueil »: the next race, a card for each part of the site, the week with both simulators' endurances.
for(const width of [1440,390])test(`the home shows the next race, the cards and the week at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:1000});
 // Both starts in a few minutes: always in this week.
 const now=Date.now(),soon=now+5*60000;
 const reg={id:'reg-1',participantId:'pilot',name:'Nathan',mine:true,category:'Hypercar',status:'whole',cars:[],carAny:true};
 const race=(id,name,circuit,startsAt,availability=[],crews=[])=>({id,name,format:'endurance',eventType:'special',capacity:30,categories:['Hypercar'],circuit,durationMinutes:360,durationHours:6,version:1,
  departures:[{id:`${id}-d`,date:new Date(startsAt).toISOString().slice(0,10),time:'15:00',startsAt,availability,crews}]});
 const lmu=race('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','6h de Spa','spa',soon,[reg],[{id:'crew',name:'Apex Racing',category:'Hypercar',registrationIds:['reg-1']}]);
 const iracing=race('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','12h de Sebring','iracing-sebring',soon+60000);
 await page.route('**/api/**',route=>{
  const url=new URL(route.request().url()),path=url.pathname;let data={ok:true};
  if(path==='/api/session')data={user:{id:'111111111111111111',name:'Nathan',communityIntroSeen:true},access:'member',permissions:['access','endurance'],community:{id:'test',slug:'test',name:'Test',appearance:{}},communities:[]};
  else if(['/api/races','/api/events'].includes(path))data={events:url.searchParams.get('game')==='iracing'?[iracing]:[lmu]};
  else if(path==='/api/participants')data={participants:[]};
  else if(path.includes('/notifications'))data={notifications:[],unread:0};
  return route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
 });
 await page.addInitScript(()=>localStorage.setItem('endurance_manager_locale','fr'));
 await page.goto('/lmu/#accueil');
 await expect(page.locator('.home-next')).toContainText('6h de Spa');
 await expect(page.locator('.home-next')).toContainText('Apex Racing');
 await expect(page.locator('.home-card.is-lmu')).toContainText('6h de Spa');
 await expect(page.locator('.home-card.is-iracing')).toContainText('12h de Sebring');
 await expect(page.locator('.home-card.is-mine')).toContainText('1 course');
 // No administration card without the permission.
 await expect(page.locator('.home-card.is-admin')).toHaveCount(0);
 await expect(page.locator('.week-block')).toHaveCount(2);
 await page.locator('[data-action="week-filter"][data-filter="iracing"]').click();
 await expect(page.locator('.week-block')).toHaveCount(1);
 await expect(page.locator('.week-block')).toContainText('12h de Sebring');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
 await page.locator('.home-card.is-mine').click();
 await expect(page).toHaveURL(/#inscriptions$/);
});
