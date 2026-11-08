import {test,expect} from '@playwright/test';
// EVENT TDZ month (Nathan 2026-11-08): the endurance starts the community streams (« Je streame ce départ ») sit in the
// calendar in violet with the stream's time and the streamer's crew; a stream announced during one of them is shown once;
// the other endurances stay in Endurance. Filters: Tout, Events, Streams, Mes courses.
const pad=value=>String(value).padStart(2,'0');
const now=new Date(),next=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth()+1,1));
const month=`${next.getUTCFullYear()}-${pad(next.getUTCMonth()+1)}`,season=`${now.getUTCFullYear()}-${pad(now.getUTCMonth()+1)}`;
// Paris winter or summer time does not matter here: times are given as the site stores them.
const at=(day,time)=>({date:`${month}-${pad(day)}`,time,startsAt:Date.parse(`${month}-${pad(day)}T${time}:00Z`)});
const reg=(id,name,more={})=>({id,name,status:'whole',category:'GT3',...more});
const events=[
  {id:'open-1',name:'OPEN LMU Monza',format:'solo',sim:'lmu',access:'open',details:{type:'OPEN'},rounds:[{circuit:'monza'}],categories:[],version:1,absences:[],
    departures:[{id:'o1',...at(3,'21:00'),availability:[reg('a','Pilote A')],crews:[]}]},
  {id:'endu-1',name:'Nurburgring Endurance Championship',format:'endurance',circuit:'spa',eventType:'lmu',official:true,categories:['GT3'],durationHours:4,durationMinutes:240,version:1,absences:[],
    departures:[{id:'n1',...at(8,'14:00'),endsAt:at(8,'14:00').startsAt+4*3600000,availability:[reg('r1','La Praline',{streamTime:'13:30',streamEnd:'18:30'}),reg('r2','Paul')],
      crews:[{id:'c1',name:'01',registrationIds:['r1','r2']}]}]},
  {id:'endu-2',name:'6h de Spa',format:'endurance',circuit:'spa',eventType:'special',official:true,categories:['GT3'],durationHours:6,durationMinutes:360,version:1,absences:[],
    departures:[{id:'s1',...at(15,'15:00'),endsAt:at(15,'15:00').startsAt+6*3600000,availability:[reg('r3','Pilote C')],crews:[]}]},
  {id:'stream-same',name:'Stream du Nurburgring',format:'solo',sim:'stream',details:{streamTime:'13:00',activity:'LMU'},categories:[],version:1,absences:[],
    departures:[{id:'x1',...at(8,'13:00'),availability:[],crews:[]}]},
  {id:'stream-free',name:'Soirée setups',format:'solo',sim:'stream',details:{streamTime:'20:30',activity:'Discussion'},categories:[],version:1,absences:[],
    departures:[{id:'x2',...at(19,'20:30'),availability:[],crews:[]}]}
];
for(const width of [1440,390])test(`EVENT TDZ month: streamed endurances, one stream, filters at ${width}px`,async({page},info)=>{
  await page.setViewportSize({width,height:1000});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/api/**',route=>{
    const request=route.request(),url=new URL(request.url());let data={ok:true};
    if(url.pathname==='/api/session')data={user:{id:'111111111111111111',name:'La Praline',communityIntroSeen:true},access:'member',permissions:['access','endurance','solo_open'],
      soloRaces:true,eventTdz:true,eventTypes:['OPEN','SAFE','BOULOULES','TONDEUZ TRAINING'],tdzSeason:{start:season,months:12,version:1},community:{id:'tdz',slug:'tdz',name:'TDZ',appearance:{}},communities:[]};
    else if(['/api/events','/api/races'].includes(url.pathname))data={events:url.searchParams.get('game')==='iracing'?[]:events};
    else if(url.pathname.includes('notifications'))data={notifications:[],unread:0};
    return route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
  });
  await page.addInitScript(()=>{localStorage.setItem('endurance_manager_locale','fr');localStorage.setItem('calendar-view:solo','month');document.cookie='em_sim=lmu; Path=/';});
  await page.goto('/events/');
  await page.locator('.cal-shift').last().click();
  const grid=page.locator('.cal-grid');
  await expect(grid).toBeVisible();
  if(width>700){
    const streamed=grid.locator('.cal-cell.t-stream',{hasText:'Nurburgring'});
    await expect(streamed).toContainText('📺');await expect(streamed).toContainText('Stream 13h30');
    await expect(grid.locator('.cal-cell',{hasText:'Soirée setups'})).toBeVisible();
  }else{
    await expect(grid.locator('.cal-line.t-stream',{hasText:'Nurburgring'})).toContainText('13h30');
  }
  // The stream announced during the streamed start is that start's; the endurance nobody streams stays in Endurance.
  await expect(page.locator('.cal')).not.toContainText('Stream du Nurburgring');
  await expect(page.locator('.cal')).not.toContainText('6h de Spa');
  await grid.locator(`[data-day="${month}-08"]:visible`).last().click();
  await expect(page.locator('.cal-side')).toContainText('Stream 13h30 · départ 14h · Équipage 01 · La Praline · Paul');
  if(info.project.name.startsWith('chromium'))await page.screenshot({path:test.info().outputPath(`calendrier-${width}.png`),fullPage:true});
  await page.getByRole('button',{name:'📺 Streams'}).click();
  await expect(page.locator('.cal')).not.toContainText('OPEN LMU Monza');
  await expect(page.locator('.cal')).toContainText('Soirée setups');
  await page.getByRole('button',{name:'Events',exact:true}).click();
  await expect(page.locator('.cal')).toContainText('OPEN LMU Monza');
  await expect(page.locator('.cal')).not.toContainText('Soirée setups');
  expect(errors).toEqual([]);
});

// The real case (Nathan 2026-11-08 12h): La Praline streams an iRacing endurance today, seen from the events' list and
// from the home's « Events » filter, with a stream announced too. Both show the stream once, through the endurance.
test('a streamed iRacing endurance shows in the events list and under the home « Events » filter',async({page})=>{
  await page.setViewportSize({width:1440,height:1000});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  const start=Date.now()+2*3600000,date=new Date(start).toISOString().slice(0,10);
  const endu={id:'endu-ir',name:'Nurburgring Endurance Championship',format:'endurance',circuit:'iracing-spa',eventType:'lmu',official:true,categories:['GT3'],durationHours:4,durationMinutes:240,version:1,absences:[],
    departures:[{id:'n1',date,time:'14:00',startsAt:start,endsAt:start+4*3600000,availability:[{id:'r1',name:'La Praline',status:'whole',category:'GT3',streamTime:'13:30'}],crews:[]}]};
  const live={id:'stream-ir',name:'Stream du Nurburgring',format:'solo',sim:'stream',details:{streamTime:'13:30',activity:'iRacing'},categories:[],version:1,absences:[],
    departures:[{id:'x1',date,time:'13:30',startsAt:start-30*60000,availability:[],crews:[]}]};
  await page.route('**/api/**',route=>{
    const url=new URL(route.request().url());let data={ok:true};
    if(url.pathname==='/api/session')data={user:{id:'111111111111111111',name:'Nathan',communityIntroSeen:true},access:'member',permissions:['access','endurance','solo_open'],
      soloRaces:true,eventTdz:true,eventTypes:['OPEN','SAFE'],community:{id:'tdz',slug:'tdz',name:'TDZ',appearance:{}},communities:[]};
    else if(['/api/events','/api/races'].includes(url.pathname))data={events:url.searchParams.get('game')==='iracing'?[endu]:[live]};
    else if(url.pathname.includes('notifications'))data={notifications:[],unread:0};
    return route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
  });
  await page.addInitScript(()=>{localStorage.setItem('endurance_manager_locale','fr');localStorage.setItem('calendar-view:solo','list');localStorage.setItem('em_week_filters','["event"]');document.cookie='em_sim=lmu; Path=/';});
  await page.goto('/events/');
  const list=page.locator('.event-agenda');
  await expect(list).toContainText('📺 Stream 13h30 · Nurburgring Endurance Championship');
  await expect(list).not.toContainText('Stream du Nurburgring');
  await page.goto('/lmu/#accueil');
  await expect(page.locator('.week-block').filter({hasText:'Nurburgring Endurance Championship'})).toBeVisible();
  await expect(page.locator('.week-grid')).not.toContainText('Stream du Nurburgring');
  expect(errors).toEqual([]);
});
