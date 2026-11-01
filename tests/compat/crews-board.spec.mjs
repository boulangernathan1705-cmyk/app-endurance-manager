import {test,expect} from '@playwright/test';

// Crews board: each crew shows its hours (red where nobody drives) and, for its manager, the pilot without crew who fills a gap.
const EVENT='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',START='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
test('crews board: coverage bar with gaps, suggestion and new crew tile',async({page})=>{
  const day=new Date(Date.now()+3*86400000);day.setUTCHours(14,0,0,0);const start=day.getTime();
  const reg=(id,name,category,status)=>({id,name,category,status,cars:[],carAny:true,participantId:'p'+id,version:1,canEdit:true});
  const availability=[reg('r1','Alex','Hypercar','whole'),reg('r5','Sara','GT3','h4,h5,h6'),reg('r6','Nico','GT3','h3,h4,h5,h6'),reg('r7','Jules','GT3','h1,h2')];
  const departure={id:START,date:'2090-10-15',time:'15:00',startsAt:start,endsAt:start+6*3600000,availability,
    crews:[{id:'c1',name:'Apex',category:'Hypercar',car:'',locked:false,version:1,canManage:true,registrationIds:['r1'],pilots:['Alex']},
      {id:'c2',name:'Dune',category:'GT3',car:'',locked:false,version:1,canManage:true,registrationIds:['r5','r6'],pilots:['Sara','Nico']}]};
  const event={id:EVENT,name:'6h test',format:'endurance',circuit:'spa',eventType:'private',createdByMe:true,categories:['Hypercar','GT3'],durationHours:6,durationMinutes:360,version:1,departures:[departure]};
  let added=null;
  await page.route('**/api/**',async route=>{
    const request=route.request(),path=new URL(request.url()).pathname;let data={ok:true};
    if(path==='/api/session')data={user:{id:'111111111111111111',name:'Nathan',communityIntroSeen:true},access:'member',discordReady:true,
      permissions:['access','endurance','crews','manage_registrations','manage_races'],community:{id:'test',slug:'test',name:'Test',appearance:{}},communities:[]};
    else if(['/api/events','/api/races'].includes(path))data={events:[event]};
    else if(path==='/api/participants')data={participants:[]};
    else if(path==='/api/crews/c2/members'&&request.method()==='POST')added=request.postDataJSON();
    else if(path.includes('/notifications'))data={notifications:[],unread:0};
    await route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
  });
  await page.addInitScript(()=>{localStorage.setItem('endurance_manager_locale','fr');document.cookie='em_sim=lmu; Path=/';});
  await page.goto(`/lmu/#event=${EVENT}`);
  await page.locator(`#departure-${START} > summary`).click();
  const dune=page.locator('.crew-card-shell').filter({hasText:'Dune'}).first();
  await expect(dune.locator('.crew-coverage-bar i')).toHaveCount(6);
  await expect(dune.locator('.crew-coverage-bar i.is-gap')).toHaveCount(2);
  await expect(dune.locator('.crew-coverage')).toHaveAttribute('aria-label','2 heures sans pilote');
  await expect(dune.locator('.crew-pilot-hours').first()).toContainText('18h–21h');
  await expect(dune.locator('.crew-gap-suggestion')).toContainText('Jules couvrirait 15h–17h');
  await expect(page.locator('.crew-card-shell').filter({hasText:'Apex'}).first().locator('.crew-coverage-bar i.is-gap')).toHaveCount(0);
  await expect(page.locator('.crew-new-tile:visible').first()).toBeVisible();
  await dune.locator('.crew-gap-add').click();
  await expect.poll(()=>added).toMatchObject({registrationId:'r7',version:1});
});
