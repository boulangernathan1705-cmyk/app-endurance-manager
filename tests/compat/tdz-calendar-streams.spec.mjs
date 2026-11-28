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
  await expect(page.getByRole('button',{name:'Events TDZ',exact:true})).toHaveAttribute('aria-pressed','true');
  await page.getByRole('button',{name:'Tout',exact:true}).click();
  await expect(page.locator('.cal')).toContainText('6h de Spa');
  await page.getByRole('button',{name:'Events TDZ',exact:true}).click();
  await expect(page.locator('.cal')).not.toContainText('6h de Spa');
  // The day number selects the day; clicking an event itself opens that race.
  await grid.locator(`${width>700?".cal-num":".cal-tap"}[data-day="${month}-08"]`).click();
  await expect(page.locator('.cal-side')).toContainText('Stream 13h30 · départ 14h · Équipage 01 · La Praline · Paul');
  if(info.project.name.startsWith('chromium'))await page.screenshot({path:test.info().outputPath(`calendrier-${width}.png`),fullPage:true});
  await page.getByRole('button',{name:'Events TDZ',exact:true}).click();
  await page.getByRole('button',{name:'📺 Streams'}).click();
  await expect(page.locator('.cal')).not.toContainText('OPEN LMU Monza');
  await expect(page.locator('.cal')).toContainText('Soirée setups');
  await page.getByRole('button',{name:'📺 Streams'}).click();
  await page.getByRole('button',{name:'Events TDZ',exact:true}).click();
  await expect(page.locator('.cal')).toContainText('OPEN LMU Monza');
  await expect(page.locator('.cal')).toContainText('Soirée setups');
  expect(errors).toEqual([]);
});

// The real case (Nathan 2026-11-08 12h): La Praline streams an iRacing endurance today, seen from the events' list and
// from the home's « Events » filter, with a stream announced too. Both show the stream once, through the endurance.
test('a streamed iRacing endurance shows in the events list and under the home « Events » filter',async({page})=>{
  await page.setViewportSize({width:1440,height:1000});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  const start=Date.now()+2*3600000,date=new Date(start).toISOString().slice(0,10);
  // On a Sunday night, in two hours is already next week in Paris: the home then shows it one week on.
  const paris=(time,option)=>new Date(time).toLocaleDateString('en-GB',{timeZone:'Europe/Paris',...option});
  const nextWeek=paris(Date.now(),{weekday:'long'})==='Sunday'&&paris(start)!==paris(Date.now());
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
  if(nextWeek)await page.getByRole('button',{name:'Semaine suivante'}).click();
  const list=page.locator('.event-agenda');
  await expect(list).toContainText('📺 Stream 13h30 · Nurburgring Endurance Championship');
  await expect(list).not.toContainText('Stream du Nurburgring');
  await page.goto('/lmu/#accueil');
  await page.getByRole('button',{name:'Semaine',exact:true}).click();
  if(nextWeek)await page.getByRole('button',{name:'Semaine suivante'}).click();
  await expect(page.locator('.week-block').filter({hasText:'Nurburgring Endurance Championship'})).toBeVisible();
  await expect(page.locator('.week-grid')).not.toContainText('Stream du Nurburgring');
  expect(errors).toEqual([]);
});

test('TDZ logo and endurance photo share the same mobile panel in the home',async({page})=>{
  test.skip((page.viewportSize()?.width||0)>760,'Mobile card layout');
  await page.clock.setFixedTime(new Date('2026-11-25T10:00:00Z'));
  const date='2026-11-25', startsAt=Date.parse(date+'T20:00:00Z');
  const departure={id:'start',date,time:'21:00',startsAt,endsAt:startsAt+3600000,availability:[],crews:[]};
  const tdz={id:'tdz-sample',name:'Course TDZ de test',format:'solo',sim:'lmu',access:'safe',details:{type:'SAFE',streamTime:'21:00',streamEnd:'23:00'},
    circuit:'cota',rounds:[{circuit:'cota',durationMinutes:30,practice:10,qualifying:5}],categories:[],version:1,absences:[],departures:[departure]};
  const endu={id:'endurance-sample',name:'Course endurance de test',format:'endurance',circuit:'cota',eventType:'lmu',
    categories:['Hypercar'],durationMinutes:120,version:1,details:{},absences:[],departures:[{...departure,id:'endurance-start'}]};
  await page.route('**/api/**',route=>{
    const url=new URL(route.request().url());
    let data={ok:true};
    if(url.pathname==='/api/session')data={user:{id:'111111111111111111',name:'Nathan',communityIntroSeen:true},access:'member',permissions:['access','endurance','solo_safe'],
      soloRaces:true,eventTdz:true,eventTypes:['OPEN','SAFE'],community:{id:'tdz',slug:'tdz',name:'TDZ',appearance:{}},communities:[]};
    else if(['/api/events','/api/races'].includes(url.pathname))data={events:url.searchParams.get('game')==='iracing'?[]:[tdz,endu]};
    else if(url.pathname==='/api/participants')data={participants:[]};
    else if(url.pathname.includes('notifications'))data={notifications:[],unread:0};
    return route.fulfill({json:data});
  });
  await page.addInitScript(()=>{localStorage.setItem('endurance_manager_locale','fr');document.cookie='em_sim=lmu; Path=/';});
  await page.goto('/lmu/#accueil');
  await page.getByRole('button',{name:'Tout',exact:true}).click();
  const track=page.locator('.week-block.is-endurance .endurance-card-head').first();
  const week=page.locator('.week-block.tdz-event-artwork',{hasText:tdz.name});
  const geometry=(element,pseudo)=>[parseFloat(getComputedStyle(element,pseudo).width),getComputedStyle(element,pseudo).clipPath,getComputedStyle(element,'::after').clipPath];
  await expect(track).toBeVisible();
  const reference=await track.evaluate(geometry,null);
  const weekPanel=await week.evaluate(geometry,'::before');
  expect(weekPanel[0]).toBeCloseTo(reference[0],1);
  expect(weekPanel.slice(1)).toEqual(reference.slice(1));
  expect(reference[1]).toContain('polygon');
  const tint=card=>card.evaluate(el=>getComputedStyle(el).backgroundImage);
  const weekBackground=await tint(week);
  expect(weekBackground).toContain('linear-gradient(160deg');
  await page.getByRole('button',{name:'Liste',exact:true}).click();
  const list=page.locator('.tdz-agenda .race-card.tdz-event-artwork',{hasText:tdz.name});
  await expect(list.locator('.solo-card-stream')).toBeVisible();
  await expect(list.locator('.solo-card-start')).toBeVisible();
  await expect(list.locator('img.event-access-logo')).toHaveAttribute('src','/images/event-access/safe-lmu.png');
  const listPanel=await list.locator('.race-card-type-logo').evaluate(geometry,null);
  expect(listPanel[0]).toBeCloseTo(reference[0],1);
  expect(listPanel.slice(1)).toEqual(reference.slice(1));
  expect(await list.evaluate(el=>el.scrollWidth-el.clientWidth)).toBeLessThanOrEqual(0);
  expect(await tint(list.locator('.race-card-body'))).toBe(weekBackground);
  const tap=async card=>{
    if(await page.evaluate(()=>navigator.maxTouchPoints>0))await card.tap();
    else await card.click();
  };
  await tap(list);
  await expect(page.locator('.race-header h1')).toContainText(tdz.name);
  await page.goto('/lmu/#accueil');
  await page.getByRole('button',{name:'Semaine',exact:true}).click();
  await tap(week);
  await expect(page.locator('.race-header h1')).toContainText(tdz.name);
  await page.goto('/lmu/#accueil');
  await tap(page.locator('.week-block.is-endurance'));
  await expect(page.locator('.race-header h1')).toContainText(endu.name);
});
