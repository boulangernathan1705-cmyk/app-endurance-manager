import {test,expect} from '@playwright/test';

for(const width of [1440,390])test(`TDZ shared quarter and seven-column calendar at ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:1000});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  const event=(id,name,date,archived=false)=>({id,name,format:'solo',sim:'lmu',access:'open',eventType:'private',details:{type:'OPEN',streamTime:'20:30',streamEnd:'23:00'},categories:['Hypercar'],circuit:'spa',durationMinutes:60,rounds:[{circuit:'spa',durationMinutes:60,categories:['Hypercar']}],version:1,archived,
    departures:[{id:id+'-d',startsAt:Date.parse(date+'T20:00:00Z'),date,time:'21:00',availability:[],crews:[]}]});
  const future=event('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','OPEN DE DÉCEMBRE','2026-12-06');
  const past=event('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','OPEN DE NOVEMBRE','2026-11-04',true);
  let organiser=false,season={start:'2026-10',version:1};
  await page.route('**/api/**',route=>{
    const url=new URL(route.request().url());let data={ok:true};
    if(url.pathname==='/api/session')data={user:{id:'111111111111111111',name:'Nathan',communityIntroSeen:true},access:'member',permissions:['access','endurance','solo_open',...(organiser?['create_race']:[])],soloRaces:true,eventTdz:true,tdzSeason:season,soloLabel:'EVENT TDZ',eventTypes:['OPEN'],community:{id:'tdz',slug:'tdz',name:'TDZ',appearance:{}},communities:[]};
    else if(url.pathname==='/api/community/season'){const input=route.request().postDataJSON();season={start:input.start,version:season.version+1};data=season;}
    else if(url.pathname==='/api/races')data={events:url.searchParams.get('scope')==='archived'?[past]:[future]};
    else if(url.pathname.includes('notifications'))data={notifications:[],unread:0};
    return route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
  });
  await page.addInitScript(()=>{localStorage.setItem('endurance_manager_locale','fr');localStorage.setItem('em_tdz_season:tdz:111111111111111111',JSON.stringify({start:'2020-01',length:4}));});
  await page.goto('/events/');
  await expect(page.locator('.page-head [data-action="event-filter"]')).toHaveCount(0);
  await expect(page.locator('.tdz-quick-filters [data-action="tdz-filter-all"]')).toBeVisible();
  await expect(page.locator('.tdz-quick-filters [data-action="race-filter"][data-value="registered"]')).toBeVisible();
  await page.locator('.tdz-quick-filters [data-action="race-filter-toggle"]').click();
  await expect(page.locator('.tdz-calendar .race-filter-panel')).toBeVisible();
  await expect(page.locator('[data-race-filter-date]')).toHaveCount(0);
  await page.locator('.tdz-quick-filters [data-action="race-filter-toggle"]').click();
  await expect(page.locator('.tdz-month-tabs [aria-pressed]')).toHaveCount(3);
  await expect(page.locator('.tdz-season-editor')).toHaveCount(0);
  await page.locator('[data-action="tdz-season"][data-field="month"][data-value="1"][aria-pressed]').click();
  await expect(page.locator('.tdz-month-grid')).toContainText('OPEN DE NOVEMBRE');
  await expect(page.locator('.tdz-month-grid .tdz-race-circuit')).toContainText('Spa');
  await expect(page.locator('.tdz-month-grid .tdz-race-duration')).toHaveText('1 h');
  await expect(page.locator('.tdz-month-grid .tdz-race-stream')).toContainText('Stream');
  expect(await page.locator('.tdz-month-grid').evaluate(el=>getComputedStyle(el).gridTemplateColumns.split(' ').length)).toBe(7);
  if(width===390){
    await expect(page.locator('.tdz-mobile-agenda')).toHaveCount(0);
    await expect(page.locator('.tdz-month-view .tdz-month-day .tdz-race:visible')).toHaveCount(1);
    const card=page.locator('.tdz-month-day .tdz-race').first();
    await expect(card).toContainText('Spa');
    await expect(card).toContainText('21h');
    const row=await page.locator('.tdz-month-day:has(.tdz-race)').first().boundingBox();
    expect(row.height).toBeGreaterThan(60);
    expect(row.height).toBeLessThan(145);
    await card.click();
    await expect(page).toHaveURL(/#event=/);
    await page.goto('/events/');
  }
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await page.screenshot({path:test.info().outputPath(`tdz-season-${width}.png`),fullPage:true});
  await page.getByRole('button',{name:'Toute la saison',exact:true}).click();
  await expect(page.locator('.tdz-season-month')).toHaveCount(3);
  await expect(page.locator('.tdz-season-overview')).toContainText('OPEN DE DÉCEMBRE');
  await page.locator('.tdz-season-overview [data-action="open"]').filter({hasText:'OPEN DE DÉCEMBRE'}).click();
  await expect(page).toHaveURL(/#event=aaaaaaaa/);
  organiser=true;
  await page.goto('/events/');
  await page.locator('.tdz-season-editor summary').click();
  await page.locator('[data-season-year]').fill('2027');
  await page.locator('[data-season-quarter]').selectOption('01');
  await page.getByRole('button',{name:'Enregistrer pour tous'}).click();
  await expect(page.locator('.tdz-season-label')).toContainText('Saison 1 · 2027');
  organiser=false;
  await page.reload();
  await expect(page.locator('.tdz-season-label')).toContainText('Saison 1 · 2027');
  await expect(page.locator('.tdz-season-editor')).toHaveCount(0);
  expect(errors).toEqual([]);
});

for(const [width,height] of [[1440,900],[1366,768],[390,844]])test(`dense six-week month fits fullscreen and remembers preference at ${width}px`,async({page})=>{
  await page.setViewportSize({width,height});
  const events=Array.from({length:30},(_,i)=>{
    const date=`2026-11-${String(i+1).padStart(2,'0')}`,id=`aaaaaaaa-aaaa-4aaa-8aaa-${String(i+1).padStart(12,'0')}`;
    return {id,name:`Course ${i+1}`,format:'solo',sim:i%2?'iracing':'lmu',access:'open',eventType:'private',details:{type:'OPEN',streamTime:'20:30',streamEnd:'23:00'},categories:['GT3'],circuit:'spa',durationMinutes:60,rounds:[{circuit:'spa',durationMinutes:60,categories:['GT3']}],version:1,departures:[{id:id+'-d',startsAt:Date.parse(date+'T20:00:00Z'),date,time:'21:00',availability:[],crews:[]}]};
  });
  await page.route('**/api/**',route=>{
    const url=new URL(route.request().url());let data={ok:true};
    if(url.pathname==='/api/session')data={user:{id:'111111111111111111',name:'Nathan',communityIntroSeen:true},access:'member',permissions:['access','solo_open'],soloRaces:true,eventTdz:true,tdzSeason:{start:'2026-10',version:1},soloLabel:'EVENT TDZ',eventTypes:['OPEN'],community:{id:'tdz',slug:'tdz',name:'TDZ',appearance:{}},communities:[]};
    else if(url.pathname==='/api/races')data={events:url.searchParams.get('scope')==='archived'?[]:events};
    else if(url.pathname.includes('notifications'))data={notifications:[],unread:0};
    return route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
  });
  await page.goto('/events/');
  await page.locator('[data-field="month"][data-value="1"][aria-pressed]').click();
  await page.getByRole('button',{name:'Afficher le calendrier en plein écran'}).click();
  const dialog=page.getByRole('dialog',{name:'Calendrier de saison en plein écran'});
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('.tdz-race')).toHaveCount(30);
  await expect(dialog.locator('.tdz-month-day')).toHaveCount(42);
  expect(await dialog.evaluate(el=>el.scrollHeight<=el.clientHeight+1)).toBe(true);
  expect(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
  expect(await dialog.locator('.tdz-month-grid').evaluate(grid=>{const bottom=grid.getBoundingClientRect().bottom;return [...grid.querySelectorAll('.tdz-race')].every(card=>card.getBoundingClientRect().bottom<=bottom);})).toBe(true);
  const last=await dialog.locator('.tdz-month-day').last().boundingBox();
  expect(last.y+last.height).toBeLessThanOrEqual(height);
  await page.screenshot({path:test.info().outputPath(`tdz-fullscreen-${width}.png`)});
  await page.reload();
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await page.reload();
  await expect(dialog).toHaveCount(0);
  await page.getByRole('button',{name:'Afficher le calendrier en plein écran'}).click();
  await dialog.locator('.tdz-race').first().click();
  await expect(page).toHaveURL(/#event=/);
  await expect(dialog).toHaveCount(0);
  expect(await page.locator('body').evaluate(el=>getComputedStyle(el).overflow)).not.toBe('hidden');
});
