import {test,expect} from '@playwright/test';

// A busy weekend must scroll inside its day, without shrinking or losing race details.
for(const [width,height] of [[1280,720],[1440,900],[1920,1080],[2560,1440],[390,844]])test(`weekly calendar fits ${width}×${height}`,async({page})=>{
  await page.setViewportSize({width,height});
  await page.clock.setFixedTime(Date.parse('2030-11-06T09:00:00Z'));
  const startsAt=Date.parse('2030-11-09T14:00:00Z');
  const events=Array.from({length:9},(_,i)=>({id:`race-${i}`,name:`Endurance ${i+1} — championnat de la communauté`,format:'endurance',eventType:'special',categories:['Hypercar'],circuit:'spa',durationMinutes:360,version:1,
    departures:[{id:`departure-${i}`,date:'2030-11-09',time:'15:00',startsAt:startsAt+i*60000,endsAt:startsAt+21600000+i*60000,availability:[{id:`reg-${i}`,name:'Nathan',participantId:'pilot',mine:true,category:'Hypercar',status:'whole',cars:[],carAny:true}],crews:[]}]}));
  await page.route('**/api/**',route=>{
    const url=new URL(route.request().url());let data={ok:true};
    if(url.pathname==='/api/session')data={user:{id:'111111111111111111',name:'Nathan',communityIntroSeen:true},access:'member',permissions:['access','endurance','crews'],community:{id:'test',slug:'test',name:'Test',appearance:{}},communities:[]};
    else if(['/api/events','/api/races'].includes(url.pathname))data={events:url.searchParams.get('game')==='iracing'?[]:events};
    else if(url.pathname==='/api/participants')data={participants:[]};
    else if(url.pathname==='/api/crew-requests')data={requests:[]};
    else if(url.pathname.includes('/notifications'))data={notifications:[],unread:0};
    return route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
  });
  await page.addInitScript(()=>localStorage.setItem('endurance_manager_locale','fr'));
  await page.goto('/lmu/#accueil');
  await expect(page.locator('.week-block')).toHaveCount(9);
  await page.evaluate(()=>document.fonts.ready);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBeTruthy();
  if(width>1100){
    const banner=await page.locator('.hero-picture').boundingBox();
    expect(banner.width/banner.height).toBeCloseTo(4,1);
    const grid=page.locator('.week-grid');
    const bounds=await grid.boundingBox();
    expect(bounds.y+bounds.height).toBeLessThanOrEqual(height);
    await expect(page.locator('.week-day')).toHaveCount(7);
    expect(await page.evaluate(()=>document.documentElement.scrollHeight<=innerHeight+1)).toBeTruthy();
    const day=page.locator('.week-day-list').filter({has:page.locator('.week-block')});
    expect(await day.evaluate(el=>el.scrollHeight>el.clientHeight)).toBeTruthy();
    const cards=await day.locator('.week-block').evaluateAll(nodes=>nodes.map(n=>({top:n.getBoundingClientRect().top,bottom:n.getBoundingClientRect().bottom})));
    for(let i=1;i<cards.length;i++)expect(cards[i].top).toBeGreaterThanOrEqual(cards[i-1].bottom);
    await day.focus();await page.keyboard.press('End');
    await expect(day.locator('.week-block').last()).toBeInViewport();
    await expect(day.locator('.week-block').last()).toContainText('Circuit de Spa-Francorchamps');
    // A shorter window recomputes the space without reloading or hiding events.
    await page.setViewportSize({width,height:height-80});
    await expect.poll(async()=>{const b=await grid.boundingBox();return b.y+b.height;}).toBeLessThanOrEqual(height-80);
    await day.evaluate(el=>el.scrollTop=0);
    if(width===1440)await page.screenshot({path:'/tmp/calendar-desktop.png'});
  }else{
    expect(await page.locator('.week-day-list').filter({has:page.locator('.week-block')}).evaluate(el=>getComputedStyle(el).overflowY)).not.toBe('auto');
  }
});
