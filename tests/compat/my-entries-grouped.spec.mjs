import {test,expect} from '@playwright/test';

for(const width of [1440,390])test(`entries group race starts and keep crews and managed pilots separate at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:1000});
 const pilot={id:'reg-1',participantId:'pilot',name:'Nathan',mine:true,category:'Hypercar',status:'h1,h2',cars:[],carAny:true};
 const start=(id,time,day,availability,crews=[])=>({id,date:`2090-10-${day}`,time,startsAt:Date.parse(`2090-10-${day}T${time}:00+02:00`),availability,crews});
 const event={id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',name:'4h de Portimao',format:'endurance',sim:'lmu',eventType:'special',capacity:30,categories:['Hypercar','GT3'],circuit:'portimao',durationMinutes:240,durationHours:4,version:1,
  departures:[start('start-1','14:00','16',[pilot,{...pilot,id:'reg-other',mine:false,managed:true,participantId:'other',name:'Other pilot'}]),start('start-2','19:00','17',[{...pilot,id:'reg-2'},{...pilot,id:'reg-other-2',mine:false,managed:true,participantId:'other',name:'Other pilot'},{...pilot,id:'reg-third',mine:false,managed:true,participantId:'third',name:'Third pilot'}],[{id:'crew',name:'Apex Racing',car:'Ferrari 499P',category:'Hypercar',registrationIds:['reg-2']}])]};
 const second={...event,id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',name:'24h du Mans',circuit:'le-mans',departures:[start('start-3','15:30','24',[{...pilot,id:'reg-3'}])]};
 await page.route('**/api/**',route=>{
  const path=new URL(route.request().url()).pathname;let data={ok:true};
  if(path==='/api/session')data={user:{id:'111111111111111111',name:'Nathan',communityIntroSeen:true},access:'member',permissions:['access','endurance'],community:{id:'test',slug:'test',name:'Test',appearance:{}},communities:[]};
  else if(['/api/races','/api/events'].includes(path))data={events:[event,second]};
  else if(path==='/api/participants')data={participants:[]};
  else if(path.includes('/notifications'))data={notifications:[],unread:0};
  return route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
 });
 await page.addInitScript(()=>localStorage.setItem('endurance_manager_locale','fr'));
 await page.goto('/lmu/#inscriptions');
 const personal=page.locator('.native-my-entries-group').filter({has:page.getByRole('heading',{name:'Mes inscriptions personnelles'})});
 await expect(personal.locator('.native-my-entry-card')).toHaveCount(2);
 const grouped=personal.locator('.my-entry-grouped');
 await expect(grouped.locator('h2')).toHaveText('4h de Portimao');
 await expect(grouped.locator('summary')).toContainText('2 créneaux');
 await expect(grouped.locator('summary')).toContainText('14h');await expect(grouped.locator('summary')).toContainText('19h');
 await grouped.locator('summary').click();
 await expect(grouped.locator('.my-entry-slot')).toHaveCount(2);
 await expect(grouped.locator('[data-entry-departure="start-1"]')).toContainText('En attente d’affectation');
 await expect(grouped.locator('[data-entry-departure="start-2"]')).toContainText('Apex Racing');
 await expect(grouped.locator('.my-entry-slot').nth(1)).toContainText('17 oct.');
 const managed=page.locator('.native-my-entries-group').filter({has:page.getByRole('heading',{name:'Inscriptions que je gère'})});
 await expect(managed.locator('.native-my-entry-card')).toHaveCount(2);
 await expect(managed.locator('.my-entry-grouped .ux-managed-entry-name')).toHaveText('Other pilot');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
 await grouped.getByRole('button',{name:'Voir la course'}).click();
 await expect(page).toHaveURL(new RegExp(`#event=${event.id}$`));
 await page.evaluate(async()=>{
  const {state}=await import('/front/app/core.mjs');
  state.events[0].format='solo';state.events[0].rounds=[{circuit:'portimao',durationMinutes:40,categories:['Hypercar']}];
  (await import('/front/app/entries-view.mjs')).renderMyEntries();
 });
 const solo=personal.locator('.my-entry-grouped.is-solo');
 await expect(solo).toHaveCount(1);
 await solo.locator('summary').click();
 await expect(solo.locator('.my-entry-slot')).toHaveCount(2);
 await expect(solo.locator('.native-my-entry-card')).toHaveCount(0);
});
