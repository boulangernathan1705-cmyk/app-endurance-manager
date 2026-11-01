import {test,expect} from '@playwright/test';

// The reference pages, always the same: a fixed date (Wednesday 6 November 2030, 10h Paris) and fixed data.
const NOW=Date.parse('2030-11-06T09:00:00Z'),HOUR=3600000;
const SATURDAY=Date.parse('2030-11-09T14:00:00Z'),SUNDAY=Date.parse('2030-11-10T13:00:00Z');
const SESSION={user:{id:'111111111111111111',name:'Nathan',communityIntroSeen:true},access:'member',discordReady:true,
  permissions:['access','endurance','crews','manage_registrations','manage_races'],community:{id:'test',slug:'test',name:'Test',appearance:{}},communities:[]};
const reg=(id,name,category,status,extra={})=>({id,name,category,status,cars:[],carAny:true,participantId:'p'+id,version:1,canEdit:true,...extra});
const race=(id,name,circuit,startsAt,availability=[],crews=[])=>({id,name,format:'endurance',eventType:'private',createdByMe:true,categories:['Hypercar','GT3'],circuit,durationMinutes:360,durationHours:6,version:1,
  departures:[{id:`${id}-d`,date:new Date(startsAt).toISOString().slice(0,10),time:new Date(startsAt).toLocaleTimeString('fr-FR',{timeZone:'Europe/Paris',hour:'2-digit',minute:'2-digit'}),startsAt,endsAt:startsAt+6*HOUR,availability,crews}]});
const SPA=race('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','6h de Spa','spa',SATURDAY,
  [reg('r1','Alex Moreau','Hypercar','whole'),reg('r2','Léa Fontaine','Hypercar','whole'),reg('r3','Tom Weber','Hypercar','h1,h2,h3'),reg('r4','Max','Hypercar','h4,h5,h6'),
   reg('r5','Sara Lopes','GT3','h4,h5,h6'),reg('r6','Nico Varga','GT3','h3,h4,h5,h6'),reg('r7','Jules Martin','GT3','h1,h2'),reg('r8','Leo','Hypercar','whole')],
  [{id:'c1',name:'Apex Racing #7',category:'Hypercar',car:'Porsche 963',locked:true,version:1,canManage:true,registrationIds:['r1','r2','r3','r4'],pilots:['Alex Moreau','Léa Fontaine','Tom Weber','Max']},
   {id:'c2',name:'Team Dune #92',category:'GT3',car:'',locked:false,version:1,canManage:true,registrationIds:['r5','r6'],pilots:['Sara Lopes','Nico Varga']}]);
const SEBRING=race('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','12h de Sebring','iracing-sebring',SUNDAY);

async function mockSite(page){
  await page.clock.setFixedTime(NOW);
  await page.route('**/api/**',route=>{
    const url=new URL(route.request().url()),path=url.pathname;let data={ok:true};
    if(path==='/api/session')data=SESSION;
    else if(['/api/races','/api/events'].includes(path))data={events:url.searchParams.get('game')==='iracing'?[SEBRING]:[SPA]};
    else if(path==='/api/participants')data={participants:[]};
    else if(path.includes('/notifications'))data={notifications:[],unread:0};
    return route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
  });
  await page.addInitScript(()=>{localStorage.setItem('endurance_manager_locale','fr');document.cookie='em_sim=lmu; Path=/';});
}
const settle=page=>page.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].map(image=>image.complete?null:new Promise(done=>{image.onload=image.onerror=done;})));});

test('charte',async({page})=>{
  await page.goto('/charte');
  await settle(page);
  await expect(page).toHaveScreenshot('charte.png',{fullPage:true});
});

test('accueil',async({page})=>{
  await mockSite(page);
  await page.goto('/lmu/#accueil');
  await expect(page.locator('.home-card.is-lmu')).toContainText('6h de Spa');
  await settle(page);
  await expect(page.locator('#app')).toHaveScreenshot('accueil.png');
});

test('equipages',async({page})=>{
  await mockSite(page);
  await page.goto(`/lmu/#event=${SPA.id}`);
  await page.locator(`#departure-${SPA.departures[0].id} > summary`).click();
  await expect(page.locator('.crew-card-shell:visible').first()).toContainText('Apex Racing');
  await settle(page);
  await expect(page.locator('.pilot-section:visible').first()).toHaveScreenshot('equipages.png');
});
