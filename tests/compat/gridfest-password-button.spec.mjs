import {test,expect} from '@playwright/test';
test('Gridfest send button works when race list omits the secret',async({page})=>{
 let sends=0;
 await page.route('**/api/**',route=>{const path=new URL(route.request().url()).pathname;let data={ok:true};if(path.endsWith('/gridfest/passwords')){if(route.request().method()==='POST')sends++;data={ready:true,botReady:true,waiting:0,pilots:[{name:'Nathan',status:'sent'}],results:[{status:'sent'}],nextCursor:''};}else if(path==='/api/session')data={user:{id:'111111111111111111',name:'Nathan',communityIntroSeen:true},access:'member',permissions:['access','admin'],community:{id:'alpha',slug:'alpha',name:'Alpha',modules:{soloRaces:true}},communities:[]};else if(['/api/events','/api/races'].includes(path))data={events:[]};else if(path.includes('notifications'))data={notifications:[],unread:0};return route.fulfill({contentType:'application/json',body:JSON.stringify(data)});});
 await page.goto('/lmu/');await page.waitForFunction(async()=>{const {state}=await import('/front/app/core.mjs');return Boolean(state.user);});
 await page.evaluate(async()=>{const {state,app}=await import('/front/app/core.mjs');state.grindfest=true;state.permissions=['admin'];state.busy=false;const race={id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',version:1,format:'solo',details:{type:'Gridfest'}};state.events=[race];state.currentEventId=race.id;const {gridfestPasswordPanel}=await import('/front/app/grindfest.mjs');app.innerHTML=gridfestPasswordPanel(race);});
 await expect(page.getByRole('button',{name:'Envoyer le mot de passe',exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'Configurer le mot de passe',exact:true})).toHaveAttribute('data-id','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
 page.on('dialog',dialog=>dialog.accept());
 await page.getByRole('button',{name:'Envoyer le mot de passe',exact:true}).click();
 await expect(page.locator('[data-gridfest-password-status]')).toContainText('1 / 1');expect(sends).toBe(1);
 await expect(page.locator('[data-kind="registration"]')).toHaveCount(0);
});

const EVENT='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
for (const width of [1440, 390]) test(`Gridfest cards and password configuration at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:1000});
 const race={id:EVENT,name:'Gridfest',format:'solo',sim:'lmu',eventType:'private',access:'open',capacity:30,categories:['Hypercar'],circuit:'le-mans',durationMinutes:40,version:1,
  details:{type:'Gridfest',streamers:[{id:'alpha',name:'Alpha',capacity:15},{id:'bravo',name:'Bravo',capacity:15}]},
  rounds:[{circuit:'le-mans',durationMinutes:40,categories:['Hypercar']}],
  departures:[{id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',date:'2090-10-15',time:'21:00',startsAt:Date.now()+86400000,crews:[],availability:[{id:'cccccccc-cccc-4ccc-8ccc-cccccccccccc',name:'Pilot',gameName:'Pilot LMU',streamerId:'alpha',status:'whole',category:'Hypercar',roundChoices:[{category:'Hypercar'}]}]}]};
 let registrations=0,saved=null;
 await page.route('**/api/**',route=>{
  const request=route.request(),path=new URL(request.url()).pathname;let data={ok:true};
  if(path==='/api/session')data={user:{id:'111111111111111111',name:'Admin',communityIntroSeen:true},access:'member',permissions:['access','admin','manage_races','endurance','solo_open'],soloRaces:true,eventTdz:true,grindfest:true,eventTypes:['Gridfest'],community:{id:'tdz',slug:'tdz',name:'TDZ',appearance:{}},communities:[]};
  else if(['/api/races','/api/events'].includes(path))data={events:[race]};
  else if(path===`/api/races/${EVENT}`&&request.method()==='PATCH'){saved=request.postDataJSON();data={id:EVENT};}
  else if(path.endsWith('/edit-details'))data={details:{...race.details,password:'existing-password'}};
  else if(path.endsWith('/registrations')&&request.method()==='POST')registrations++;
  else if(path.includes('/notifications'))data={notifications:[],unread:0};
  return route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
 });
 await page.addInitScript(()=>localStorage.setItem('endurance_manager_locale','fr'));
 await page.goto(`/lmu/#event=${EVENT}`);
 const cards=page.locator('.grindfest-column');await expect(cards).toHaveCount(2);
 if(width>600){const first=await cards.nth(0).boundingBox(),second=await cards.nth(1).boundingBox();expect(Math.abs(first.height-second.height)).toBeLessThanOrEqual(1);}
 else {const first=await cards.nth(0).boundingBox(),second=await cards.nth(1).boundingBox();expect(second.y).toBeGreaterThanOrEqual(first.y+first.height);}
 await page.getByRole('button',{name:'Configurer le mot de passe',exact:true}).click();
 const form=page.locator('form[data-kind="solo-event"]'),password=form.locator('[name="eventPassword"]');
 await expect(password).toBeVisible();await expect(password).toHaveValue('existing-password');await expect(password).toBeFocused();
 await expect(page.locator('form[data-kind="registration"]')).toHaveCount(0);expect(registrations).toBe(0);
 await password.fill('updated-password');
 for(let step=2;step<5;step++){await expect(form).toHaveAttribute('data-step',String(step));await form.locator('[data-solo-step="next"]').click();}
 await form.locator('[data-solo-submit]').click();
 await expect.poll(()=>saved?.details.password).toBe('updated-password');
 expect(saved.details.streamers).toEqual(race.details.streamers.map(streamer=>({...streamer,twitchUrl:'',logoUrl:''})));
 expect(saved.version).toBe(1);expect(registrations).toBe(0);
});
