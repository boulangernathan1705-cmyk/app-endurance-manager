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
  [reg('r1','Alex Moreau','Hypercar','whole'),reg('r2','Léa Fontaine','Hypercar','whole'),reg('r3','Tom Weber','Hypercar','h1,h2,h3',{mine:true}),reg('r4','Max','Hypercar','h4,h5,h6'),
   reg('r5','Sara Lopes','GT3','h4,h5,h6'),reg('r6','Nico Varga','GT3','h3,h4,h5,h6'),reg('r7','Jules Martin','GT3','h1,h2'),reg('r8','Leo','Hypercar','whole')],
  [{id:'c1',name:'Apex Racing #7',category:'Hypercar',car:'Porsche 963',locked:true,version:1,canManage:true,registrationIds:['r1','r2','r3','r4'],pilots:['Alex Moreau','Léa Fontaine','Tom Weber','Max']},
   {id:'c2',name:'Team Dune #92',category:'GT3',car:'',locked:false,version:1,canManage:true,registrationIds:['r5','r6'],pilots:['Sara Lopes','Nico Varga']}]);
// A pilot's « Demander un équipage », checked on the organisers' « Équipages » page.
const REQUEST={id:'cccccccc-cccc-4ccc-8ccc-cccccccccccc',eventId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',departureId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa-d',game:'lmu',name:'Les Tortues',category:'GT3',car:'',registrationIds:['r7'],requester:'Jules Martin',mine:false,createdAt:NOW/1000-1200};
const SEBRING=race('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','Production Endurance Challenge','iracing-sebring',SUNDAY);

async function mockSite(page){
  await page.clock.setFixedTime(NOW);
  await page.route('**/api/**',route=>{
    const url=new URL(route.request().url()),path=url.pathname;let data={ok:true};
    if(path==='/api/session')data=SESSION;
    else if(['/api/races','/api/events'].includes(path))data={events:url.searchParams.get('game')==='iracing'?[SEBRING]:[SPA]};
    else if(path==='/api/participants')data={participants:[]};
    else if(path.includes('/notifications'))data={notifications:[],unread:0};
    else if(path==='/api/crew-requests')data={requests:[REQUEST]};
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
  await expect(page.locator('.home-next-box')).toContainText('6h de Spa');
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

test('organisateurs',async({page})=>{
  await mockSite(page);
  await page.goto('/lmu/#equipages');
  await expect(page.locator('.crews-request')).toContainText('Les Tortues');
  await settle(page);
  await expect(page.locator('#app')).toHaveScreenshot('organisateurs.png');
});

test('endurance-list',async({page})=>{
  await mockSite(page);
  await page.route('**/api/races?**',route=>{
    const event={...SEBRING,official:true,eventType:'special',durationMinutes:120,durationHours:2,departures:[0,1,2].map((day,index)=>({...SEBRING.departures[0],id:'start-'+index,startsAt:SATURDAY+day*24*HOUR,date:new Date(SATURDAY+day*24*HOUR).toISOString().slice(0,10),time:['20:00','08:00','19:00'][index]}))};
    return route.fulfill({contentType:'application/json',body:JSON.stringify({events:[event]})});
  });
  await page.goto('/iracing/');
  await expect(page.locator('button.race-card.is-endurance')).toContainText('Production Endurance Challenge');
  await settle(page);
  await expect(page.locator('#app')).toHaveScreenshot('endurance-list.png');
});

test('endurance-list-lmu',async({page})=>{
  await mockSite(page);
  await page.route('**/api/races?**',route=>{
    const event={...SPA,name:'Chdf',circuit:'cota',official:false,eventType:'special',departures:[{...SPA.departures[0],availability:[],crews:[]}]};
    return route.fulfill({contentType:'application/json',body:JSON.stringify({events:[event]})});
  });
  await page.goto('/lmu/');
  await expect(page.locator('button.race-card.is-endurance')).toContainText('Chdf');
  await settle(page);
  await expect(page.locator('#app')).toHaveScreenshot('endurance-list-lmu.png');
});

for(const game of ['lmu','iracing'])test('endurance-detail-'+game,async({page})=>{
  await mockSite(page);
  const race=game==='lmu'?{...SPA,name:'Chdf',circuit:'cota',eventType:'special',details:{trackLimits:'strict',tyres:25,grid:55,fairShare:false}}:{...SEBRING,official:true,durationMinutes:120,durationHours:2};
  await page.route('**/api/races?**',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({events:[race]})}));
  await page.goto('/'+game+'/#event='+race.id);
  const header=page.locator('.race-header.is-endurance-detail');
  await expect(header).toContainText(race.name);
  await expect(header.locator('.endurance-card-duration')).toHaveText(game==='lmu'?'6H':'2H');
  const hero=header.locator('.endurance-detail-hero'),art=hero.locator('.endurance-card-head'),map=hero.locator('.circuit-visual'),caption=hero.locator('.endurance-card-caption');
  await expect(map).toBeVisible();
  expect(await art.evaluate(el=>getComputedStyle(el,'::before').backgroundImage)).toContain('/images/endurance/'+game+'.webp');
  const [a,m,c]=await Promise.all([art.boundingBox(),map.boundingBox(),caption.boundingBox()]);
  expect(m.x).toBeGreaterThanOrEqual(a.x+a.width-1);
  expect(m.width).toBeGreaterThan(70);
  expect(c.x+c.width).toBeLessThanOrEqual(m.x+1);
  expect(Math.abs(c.y+c.height-a.y-a.height)).toBeLessThanOrEqual(2);
  expect(await art.evaluate(el=>getComputedStyle(el).clipPath)).toContain('polygon');
  const [date,title]=await Promise.all([header.locator('.endurance-detail-meta').boundingBox(),header.locator('.event-title').boundingBox()]);
  expect(Math.abs(date.x-title.x)).toBeLessThanOrEqual(2);
  expect(title.y).toBeGreaterThanOrEqual(date.y+date.height-1);
  expect(await header.locator('.event-title').evaluate(el=>getComputedStyle(el).color)).toBe(await header.evaluate(el=>{const sample=document.createElement('span');sample.style.color='var(--em-text-strong, #f4f6f5)';el.append(sample);const color=getComputedStyle(sample).color;sample.remove();return color;}));
  expect(await header.evaluate(el=>el.scrollWidth-el.clientWidth)).toBeLessThanOrEqual(1);
  // Only the hero's map needs to settle here. Lazy crew images further down
  // the page are outside this snapshot and may never start loading.
  await page.evaluate(()=>document.fonts.ready);
  await map.locator('img').evaluate(async img=>{img.loading='eager';await img.decode();});
  await expect(header).toHaveScreenshot('endurance-detail-'+game+'.png');
});
