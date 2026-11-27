import {test,expect} from '@playwright/test';

const alpha={id:'alpha',slug:'alpha',name:'Alpha',shortName:'A'},beta={id:'beta',slug:'beta',name:'Beta',shortName:'B'};
const start=(id='start')=>({id,date:'2090-10-15',time:'14:00',startsAt:Date.parse('2090-10-15T12:00:00Z'),availability:[],crews:[]});
const race=(game,extras={})=>({id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',name:'Special official',official:true,format:'endurance',circuit:game==='iracing'?'iracing-spa':'spa',eventType:'special',categories:['GT3'],details:{},durationHours:2,durationMinutes:120,departures:[start()],version:1,...extras});
async function boot(page,game,events,combos=false){
  await page.route('**/api/**',async route=>{
    const path=new URL(route.request().url()).pathname;
    let data={ok:true};
    if(path==='/api/session')data={user:{id:'111111111111111111',name:'Nathan',communityIntroSeen:true},access:'member',permissions:['access','endurance','crews','solo_open',...(combos?['combos']:[])],combos,community:alpha,communities:[alpha,beta],soloRaces:true,eventTypes:['OPEN','SAFE'],eventTdz:true};
    else if(['/api/events','/api/races'].includes(path))data={events};
    else if(path==='/api/participants')data={participants:[]};
    else if(path.includes('notifications'))data={notifications:[],unread:0};
    await route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
  });
  await page.goto(`/${game}/`);
  await page.waitForFunction(async()=>{const {state}=await import('/front/app/core.mjs');return state.access==='member'&&state.events.length>0;});
  // The app's own first display done (Firefox may finish it after the events): it would otherwise redraw over the test's.
  await page.waitForLoadState('networkidle');
}

test('Endurance month shows all starts for the selected day', async ({page}) => {
  await page.clock.setFixedTime(Date.parse('2030-11-26T08:00:00Z'));
  const slot = (date, time) => ({
    ...start(`${date}-${time}`), date, time, startsAt:Date.parse(`${date}T${time}:00+01:00`)
  });
  const departures = ['21:00', '00:00', '15:30', '06:00', '18:00', '03:00', '12:00']
    .map(time => slot('2030-11-15', time));
  departures.push(slot('2030-11-16', '08:45'));
  await boot(page, 'lmu', [race('lmu', {name:'6h de COTA', circuit:'cota', departures})]);
  await page.locator('[data-action="cal-view"][data-view="month"]').click();
  const card = page.locator('.cal-side .cal-ev.is-endurance');
  for (const [width, dayButton] of [[1440, '.cal-num'], [390, '.cal-tap']]) {
    await page.setViewportSize({width, height:900});
    await page.locator(`${dayButton}[data-day="2030-11-15"]`).click();
    await expect(card).toHaveCount(1);
    await expect(card.locator('.cal-start-times strong')).toHaveText(['0h', '3h', '6h', '12h', '15h30', '18h', '21h']);
    await expect(card.locator('.cal-type')).toHaveText('Événement spécial');
    await expect(card).not.toContainText('+6');

    await page.locator(`${dayButton}[data-day="2030-11-16"]`).click();
    await expect(card).toHaveCount(1);
    await expect(card).toContainText('8h45');
    await expect(card.locator('.cal-start-times')).toHaveCount(0);
  }
});

for(const game of ['lmu','iracing'])test(`${game}: mobile cards show the simulator and duration without the circuit drawing`,async({page})=>{
  const circuits=game==='iracing'?['iracing-indianapolis','iracing-nurburgring-gp','iracing-montreal']:['spa','le-mans'];
  await boot(page,game,circuits.map((circuit,index)=>race(game,{id:`mobile-${index}`,circuit,name:index===0?'Spa':'Production Endurance Challenge',departures:[start(),{...start('next'),date:'2090-10-17',startsAt:Date.parse('2090-10-17T12:00:00Z')}]})));
  for(const width of [320,390,430,760]){
    await page.setViewportSize({width,height:844});
    const cards=page.locator('.race-card');
    await expect(cards).toHaveCount(circuits.length);
    const artworkSizes=[];
    for(const card of await cards.all()){
      await expect(card.locator('.circuit-visual')).toHaveCount(0);
      const art=card.locator('.race-card-top > .endurance-card-head'),head=card.locator('.race-head'),date=head.locator('.race-date'),times=card.locator('.race-starts');
      await expect(art).toBeVisible();await expect(date).toHaveCount(1);
      const badge=head.locator('.race-endurance-date .endurance-card-identity');
      await expect(badge).toHaveText(game==='lmu'?'LMU Endurance':'iRacing Endurance');
      await expect(head.locator('.race-endurance-meta .endurance-card-duration')).toHaveText('2 h');
      await expect(art.locator('.endurance-card-caption')).toHaveCount(0);
      await expect(card).toHaveClass(/endurance-preview/);
      expect(await art.evaluate(el=>getComputedStyle(el).clipPath)).toContain('polygon');
      const [a,h,d,t,badgeBox]=await Promise.all([art.boundingBox(),head.boundingBox(),date.boundingBox(),times.boundingBox(),badge.boundingBox()]);
      artworkSizes.push(Math.round(a.width));
      expect(a.width).toBeGreaterThanOrEqual(82);
      expect(a.height).toBeGreaterThanOrEqual(82);
      expect(a.x+a.width).toBeLessThanOrEqual(h.x+1);
      expect(h.width).toBeGreaterThan(a.width);
      expect(d.height).toBeLessThanOrEqual(34);
      expect(badgeBox.x).toBeGreaterThanOrEqual(h.x);
      expect(t.y).toBeGreaterThanOrEqual(a.y+a.height);
      expect(t.x).toBeLessThan(h.x);
      expect(t.x+t.width).toBeGreaterThanOrEqual(h.x+h.width-9);
      expect(await card.evaluate(el=>el.scrollWidth-el.clientWidth)).toBeLessThanOrEqual(1);

    }
    expect(new Set(artworkSizes).size).toBe(1);
  }
});

test('LMU mobile: a full ten-start weekend stays compact without hiding departures or categories',async({page})=>{
  const departures=[[15,['12:00','20:00']],[16,['03:00','09:00','15:00','21:00']],[17,['03:00','09:00','15:00','21:00']]].flatMap(([day,times])=>times.map(time=>{
    const date='2090-10-'+day;
    return {...start(date+'-'+time),date,time,startsAt:Date.parse(date+'T'+time+':00+02:00')};
  }));
  await page.addInitScript(()=>localStorage.setItem('endurance_manager_locale','fr'));
  await boot(page,'lmu',[race('lmu',{name:'Championnat Endurance du Mans',circuit:'le-mans',categories:['Hypercar','LMP2 WEC','GT3'],departures,durationHours:6,durationMinutes:360})]);
  await page.evaluate(()=>document.fonts.ready);
  for(const width of [320,390,430]){
    await page.setViewportSize({width,height:844});
    const card=page.locator('button.race-card.is-endurance');
    await expect(card).toHaveCount(1);
    await expect(card.locator('.race-start .endurance-start-icon')).toHaveCount(10);
    await expect(card.locator('.event-category-badge')).toHaveCount(3);
    for(const item of await card.locator('.race-start,.event-category-badge').all()){
      await expect(item).toBeVisible();
      expect(await item.evaluate(el=>el.scrollWidth-el.clientWidth)).toBeLessThanOrEqual(1);
    }
    for(const day of await card.locator('.race-day').all()){
      const sameRow=await day.evaluate(row=>[...row.querySelectorAll('.race-start')].every(chip=>chip.offsetTop===row.querySelector('.race-start').offsetTop));
      expect(sameRow).toBe(true);
    }
    const rect=await card.boundingBox();
    expect(rect.height).toBeLessThanOrEqual(255);
    expect(await card.evaluate(el=>el.scrollWidth-el.clientWidth)).toBeLessThanOrEqual(1);
  }
});

for(const game of ['lmu','iracing'])test(`${game}: official special filter, reset, and corrupt saved filters`,async({page})=>{
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  const events=[race(game),race(game,{id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',name:'Regular series',eventType:'lmu'}),race(game,{id:'cccccccc-cccc-4ccc-8ccc-cccccccccccc',name:'Community race',official:false,eventType:'private'})];
  await boot(page,game,events);
  // The outer border and stripe follow the simulator, not special/series/private badges.
  for(const width of [390,1366]){
    await page.setViewportSize({width,height:900});
    for(const card of await page.locator('button.race-card.is-endurance').all()){
      const colors=await card.evaluate((el,sim)=>{
        const sample=document.createElement('span');
        sample.style.cssText='position:absolute;pointer-events:none;background:var(--em-kind-'+sim+');border:1px solid color-mix(in srgb,var(--em-kind-'+sim+') 40%,var(--em-border))';
        el.append(sample);
        const expected=getComputedStyle(sample),actual=getComputedStyle(el),stripe=getComputedStyle(el,'::before');
        const result={border:actual.borderTopColor,expectedBorder:expected.borderTopColor,stripe:stripe.backgroundColor,expectedStripe:expected.backgroundColor};
        sample.remove();
        return result;
      },game);
      expect(colors.border).toBe(colors.expectedBorder);
      expect(colors.stripe).toBe(colors.expectedStripe);
    }
  }
  await page.locator('[data-action="race-filter-toggle"]').click();
  await page.locator('[data-action="race-filter"][data-group="types"][data-value="special"]').click();
  await expect(page.locator('.event-card')).toHaveCount(1);
  await expect(page.locator('.event-card')).toContainText('Special official');
  await page.locator('[data-action="race-filter-reset"]').click();
  await expect(page.locator('.event-card')).toHaveCount(3);
  await page.evaluate(async()=>{
    const {state,activeGame}=await import('/front/app/core.mjs');const {raceFilterKey}=await import('/front/race-filters.mjs');
    const key=raceFilterKey(activeGame,'endurance',{communityId:state.community.id,userId:state.user.id});
    localStorage.setItem(key,JSON.stringify({categories:null,types:{},communities:['removed'],kinds:['SAFE']}));
    state.raceFiltersBy={};const {renderHome}=await import('/front/app/home-view.mjs');renderHome();
  });
  await expect(page.locator('.event-card')).toHaveCount(3);expect(errors).toEqual([]);
});

test('TDZ agenda groups Paris days, uses one filter bar and ignores obsolete advanced filters',async({page})=>{
  await page.clock.setFixedTime(Date.parse('2090-10-13T08:00:00Z'));
  const base={...start(),date:'2090-10-13',startsAt:Date.parse('2090-10-13T12:00:00Z')};
  const tomorrow={...base,id:'tomorrow',date:'2090-10-14',startsAt:Date.parse('2090-10-14T12:00:00Z')};
  const second={...base,id:'second',time:'18:00',startsAt:Date.parse('2090-10-13T16:00:00Z')};
  const solo=race('lmu',{format:'solo',sim:'lmu',name:'Solo OPEN',access:'open',official:false,rounds:[{circuit:'spa',durationMinutes:120,categories:[]}],details:{type:'OPEN'},categories:[],departures:[base,second,tomorrow]});
  await page.addInitScript(()=>{localStorage.setItem('endurance_manager_locale','fr');if(!localStorage.getItem('em_filters_v3:tdz-home:all:alpha:111111111111111111'))localStorage.setItem('em_filters_v3:tdz-home:all:alpha:111111111111111111',JSON.stringify({view:'list',advanced:{sims:['iracing'],kinds:['SAFE'],from:'2091-01-01'}}));});
  await boot(page,'lmu',[solo]);
  await page.goto('/lmu/#accueil');
  const list=page.locator('.tdz-agenda'),days=list.locator('.tdz-agenda-day[data-day]');
  await expect(days).toHaveCount(2);
  await expect(page.getByRole('button',{name:'Events TDZ',exact:true})).toHaveAttribute('aria-pressed','true');
  await expect(page.getByRole('button',{name:'Tout',exact:true})).toHaveAttribute('aria-pressed','false');
  await expect(days.first()).toHaveAttribute('data-day','2090-10-13');
  await expect(days.last()).toHaveAttribute('data-day','2090-10-14');
  await expect(days.first().locator('.event-card')).toHaveCount(1);
  await expect(days.first().locator('.race-start')).toHaveCount(2);
  await expect(days.last().locator('.event-card')).toHaveCount(1);
  for(const width of [1440,390]){
    await page.setViewportSize({width,height:900});
    const heading=await days.first().locator('h2').boundingBox(),card=await days.first().locator('.event-card').boundingBox(),row=await days.first().boundingBox();
    if(width>760){expect(card.x).toBeGreaterThan(heading.x);expect(card.width/row.width).toBeGreaterThan(.65);expect(card.width/row.width).toBeLessThan(.85);}
    else {expect(card.y).toBeGreaterThan(heading.y);expect(card.width/row.width).toBeGreaterThan(.95);}
    expect(await list.evaluate(el=>el.scrollWidth-el.clientWidth)).toBeLessThanOrEqual(1);
  }
  await expect(page.locator('[data-action="race-filter-toggle"]')).toHaveCount(0);
  await page.getByRole('button',{name:'Endurance LMU',exact:true}).click();
  await expect(list.locator('.event-card')).toHaveCount(0);
  await page.getByRole('button',{name:'Tout',exact:true}).click();
  await expect(page.getByRole('button',{name:'Tout',exact:true})).toHaveAttribute('aria-pressed','true');
  await expect(list.locator('.event-card')).toHaveCount(2);
  await page.reload();
  await expect(page.getByRole('button',{name:'Tout',exact:true})).toHaveAttribute('aria-pressed','true');
  await expect(list.locator('.event-card')).toHaveCount(2);
  await page.getByRole('button',{name:'Semaine suivante'}).click();
  await expect(list.locator('.event-card')).toHaveCount(0);
  await page.getByRole('button',{name:'Semaine précédente'}).click();
  await expect(list.locator('.event-card')).toHaveCount(2);
  await page.getByRole('button',{name:'Semaine',exact:true}).click();
  await expect(page.locator('.week-block').filter({hasText:'Solo OPEN'})).toHaveCount(2);
  await expect(page.locator('[data-action="race-filter-toggle"]')).toHaveCount(0);
  await page.getByRole('button',{name:'Mois',exact:true}).click();
  await expect(page.locator('.cal')).toBeVisible();
  await expect(page.locator('[data-action="race-filter-toggle"]')).toHaveCount(0);
  await page.evaluate(async()=>{const {state}=await import('/front/app/core.mjs');state.eventTdz=false;state.eventTypes=[];state.events[0].details={};state.listFormat='solo';state.raceFilterOpen=true;const {renderHome}=await import('/front/app/home-view.mjs');renderHome();});
  await expect(page.locator('.event-card')).toHaveCount(1);
  await expect(page.locator('[data-action="race-filter-toggle"]')).toHaveCount(1);
  await expect(page.locator('[data-group="sims"]')).not.toHaveCount(0);
  await expect(page.locator('[data-group="kinds"]')).toHaveCount(0);
});

test('opening TDZ home resets dates, while browsing and switching views preserves the selected week',async({page})=>{
  await page.setViewportSize({width:1440,height:900});
  await page.clock.setFixedTime(Date.parse('2030-11-26T08:00:00Z'));
  const event=race('lmu',{format:'solo',sim:'lmu',name:'Solo OPEN',access:'open',official:false,rounds:[{circuit:'spa',durationMinutes:120,categories:[]}],details:{type:'OPEN'},categories:[],departures:[{...start(),date:'2030-11-27',startsAt:Date.parse('2030-11-27T12:00:00Z')}]});
  await boot(page,'lmu',[event]);
  await page.locator('#navigation .nav-week-button').click();
  const label=page.locator('.week-label');
  const prev=page.getByRole('button',{name:'Semaine précédente'});
  const next=page.getByRole('button',{name:'Semaine suivante'});
  const view=name=>page.getByRole('button',{name,exact:true});
  await expect(label).toContainText('Cette semaine');
  await view('Tout').click();
  await prev.click();
  await expect(label).toContainText('La semaine dernière');
  await view('Liste').click();
  await expect(label).toContainText('La semaine dernière');
  await view('Mois').click();
  await expect(page.locator('.cal-month.on')).toHaveAttribute('data-month','2030-11');
  await view('Semaine').click();
  await expect(label).toContainText('La semaine dernière');
  await page.locator('#navigation .nav-week-button').click();
  await expect(label).toContainText('Cette semaine');
  await expect(view('Tout')).toHaveAttribute('aria-pressed','true');
  await view('Mois').click();
  await view('Liste').click();
  await expect(label).toContainText('Cette semaine');
  await expect(page.locator('.tdz-agenda')).toContainText('Solo OPEN');
  await next.click();
  await expect(label).toContainText('La semaine prochaine');
  await page.locator('#navigation [data-action="my-entries"]').click();
  await expect(page).toHaveURL(/#inscriptions$/);
  await page.locator('#navigation .nav-week-button').click();
  await expect(view('Liste')).toHaveAttribute('aria-pressed','true');
  await expect(label).toContainText('Cette semaine');
  await view('Mois').click();
  await page.locator('.cal-shift').first().click();
  await expect(page.locator('.cal-month.on')).toHaveAttribute('data-month','2030-10');
  await page.locator('#navigation .nav-week-button').click();
  await expect(page.locator('.cal-month.on')).toHaveAttribute('data-month','2030-11');
  await page.locator('.cal-num[data-day="2030-11-12"]').click();
  await view('Semaine').click();
  await expect(label).toContainText('du 11 novembre');
  await page.locator('#navigation [data-action="my-entries"]').click();
  await expect(page).toHaveURL(/#inscriptions$/);
  await page.goBack();
  await expect(page).toHaveURL(/#accueil$/);
  await expect(label).toContainText('Cette semaine');
  await expect(view('Tout')).toHaveAttribute('aria-pressed','true');
});

test('TDZ weekly list fits seven days on desktop and scrolls only crowded days',async({page})=>{
  await page.setViewportSize({width:1440,height:900});
  await page.clock.setFixedTime(Date.parse('2090-10-09T08:00:00Z'));
  const date=i=>'2090-10-'+String(9+i).padStart(2,'0');
  const make=(i,j)=>race('lmu',{id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaa'+String(i*10+j).padStart(3,'0'),name:'Event '+i+'-'+j,format:'solo',sim:'lmu',access:'open',official:false,details:{type:'OPEN'},rounds:[{circuit:'spa',durationMinutes:120,categories:[]}],categories:[],departures:[{...start('d-'+i+'-'+j),date:date(i),startsAt:Date.parse(date(i)+'T12:00:00Z')+j*3600000,time:String(14+j).padStart(2,'0')+':00'}]});
  const events=Array.from({length:7},(_,i)=>make(i,0));
  events.push(...Array.from({length:5},(_,j)=>make(3,j+1)));
  await page.addInitScript(()=>localStorage.setItem('endurance_manager_locale','fr'));
  await boot(page,'lmu',events);
  await page.goto('/lmu/#accueil');
  await page.getByRole('button',{name:'Liste',exact:true}).click();
  const agenda=page.locator('.tdz-agenda'),days=agenda.locator('.tdz-agenda-day[data-day]'),busy=days.nth(3).locator('.tdz-agenda-cards');
  await expect(days).toHaveCount(7);
  await expect(busy.locator('.event-card')).toHaveCount(6);
  for(const [width,height] of [[1440,900],[1280,768]]){
    await page.setViewportSize({width,height});
    await expect.poll(async()=>{const box=await agenda.boundingBox();return box.y+box.height;}).toBeLessThanOrEqual(height+1);
    const first=await days.first().boundingBox(),last=await days.last().boundingBox();
    expect(first.y).toBeGreaterThan(0);expect(last.y+last.height).toBeLessThanOrEqual(height+1);
    expect(await busy.evaluate(el=>el.scrollHeight-el.clientHeight)).toBeGreaterThan(0);
    await expect(busy).toHaveCSS('overflow-y','auto');
    await busy.evaluate(el=>el.scrollTop=el.scrollHeight);
    expect(await busy.evaluate(el=>el.scrollTop)).toBeGreaterThan(0);
    await expect(page.getByRole('button',{name:'Semaine suivante'})).toBeInViewport();
  }
  await page.setViewportSize({width:390,height:844});
  await expect(busy).not.toHaveCSS('overflow-y','auto');
  expect((await days.last().boundingBox()).y).toBeGreaterThan(844);
  await expect(busy.locator('.event-card').last()).toBeVisible();
  expect(await agenda.evaluate(el=>el.scrollWidth-el.clientWidth)).toBeLessThanOrEqual(1);
});

test('community choices update the whole race view and never hide a private event',async({page})=>{
  const event=race('lmu',{absences:[{name:'Absent Alpha'},{name:'Absent Beta',communityId:'beta'}],departures:[start(),{...start('next'),date:'2090-10-16',startsAt:Date.parse('2090-10-16T12:00:00Z')}]});
  for(const departure of event.departures)departure.availability=[{id:`a-${departure.id}`,participantId:'a',name:'Pilot Alpha',mine:true,status:'whole',category:'GT3',carAny:true,community:alpha},{id:`b-${departure.id}`,participantId:'b',name:'Pilot Beta',status:'whole',category:'GT3',carAny:true,community:beta}];
  await boot(page,'lmu',[event]);
  await page.evaluate(async id=>{const {state}=await import('/front/app/core.mjs');state.categoryEntry=true;state.categoryEntryPeek=id;state.currentEventId=id;const {renderEvent}=await import('/front/app/event-view.mjs');renderEvent();},event.id);
  await expect(page.locator('.ce-board-name')).toHaveCount(1);await expect(page.locator('.ce-board-name')).toContainText('Pilot Alpha');
  await expect(page.locator('.event-absences')).toContainText('Absent Alpha');await expect(page.locator('.event-absences')).not.toContainText('Absent Beta');
  await page.locator('.race-community-filter [data-community=""]').click();
  await expect(page.locator('.ce-board-name')).toHaveCount(2);await expect(page.locator('.event-absences')).toContainText('Absent Beta');
  await page.locator('.race-community-filter [data-community="beta"]').click();
  await expect(page.locator('.ce-board-name')).toHaveCount(1);await expect(page.locator('.ce-board-name')).toContainText('Pilot Beta');
  await expect(page.locator('.event-absences')).not.toContainText('Absent Alpha');
  await page.evaluate(async()=>{const {state}=await import('/front/app/core.mjs');state.events[0].official=false;const {renderEvent}=await import('/front/app/event-view.mjs');renderEvent();});
  await expect(page.locator('.race-community-filter')).toHaveCount(0);await expect(page.locator('.ce-board-name')).toHaveCount(2);
});

for (const game of ['lmu','iracing']) test(`${game}: preview preserves card size and touch navigation`,async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await boot(page,game,[race(game),race(game,{id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',name:'Second race'})]);
  const cards=page.locator('button.race-card.is-endurance'),card=cards.first(),body=card.locator('.race-card-body');
  await expect(cards).toHaveCount(2);
  await page.mouse.move(0,0);
  const before=await card.boundingBox();
  expect(await body.evaluate(el=>getComputedStyle(el).backgroundImage)).not.toContain('lmu-pano/');
  const touch=async locator=>{
    await locator.dispatchEvent('pointerdown',{pointerType:'touch',bubbles:true});
    await locator.dispatchEvent('click',{detail:1,bubbles:true,cancelable:true});
  };
  await touch(card);
  await expect(card).toHaveClass(/is-panorama-preview/);
  await expect(card.locator('.circuit-visual')).toHaveCount(0);
  expect(await body.evaluate(el=>getComputedStyle(el).backgroundImage)).toContain(game==='lmu'?'/images/endurance/lmu-pano/spa.webp':'/images/endurance/iracing-pano/iracing-spa.webp');
  if(game==='iracing')expect(await body.evaluate(el=>getComputedStyle(el).backgroundImage)).not.toContain('lmu-pano/');
  const after=await card.boundingBox();
  expect(after.width).toBeCloseTo(before.width,0);expect(after.height).toBeCloseTo(before.height,0);
  await touch(cards.nth(1));
  await expect(card).not.toHaveClass(/is-panorama-preview/);
  await expect(cards.nth(1)).toHaveClass(/is-panorama-preview/);
  await page.keyboard.press('Escape');
  await expect(cards.nth(1)).not.toHaveClass(/is-panorama-preview/);
  await touch(card);
  await touch(card);
  const detail=page.locator('.race-header.is-endurance-detail');
  await expect(detail).toBeVisible();
  await expect(detail.locator('.circuit-visual img')).toHaveCount(1);
});

for(const enabled of [true,false])test('pilot space on iRacing and shared home, module '+enabled,async({page})=>{
  await page.setViewportSize({width:1366,height:900});
  await boot(page,'iracing',[race('iracing')],enabled);
  const link=page.locator('#navigation .nav-plugin-button');
  await expect(link).toHaveCount(enabled?1:0);
  if(enabled)await expect(link).toBeVisible();
  await page.locator('#navigation .nav-week-button').click();
  await expect(link).toHaveCount(enabled?1:0);
  await page.setViewportSize({width:390,height:844});
  const mobile=page.locator('.tab-bar [data-tab="nav-plugin-button"]');
  await expect(mobile).toHaveCount(enabled?1:0);
  if(enabled)await expect(mobile).toBeVisible();
});

test('iRacing circuit photos load independently in compact cards, previews and details',async({page},testInfo)=>{
  test.setTimeout(90000);
  const circuits=['iracing-spa','iracing-bathurst','iracing-laguna-seca','iracing-tbd'];
  const events=circuits.map((circuit,index)=>race('iracing',{id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa'+index,circuit,name:'Artwork '+circuit}));
  await boot(page,'iracing',events);
  for(const width of [1440,390]){
    await page.setViewportSize({width,height:900});
    await page.mouse.move(0,0);
    for(const [index,circuit] of circuits.entries()){
      const card=page.locator('button.race-card.is-endurance[data-id="'+events[index].id+'"]');
      const art=card.locator('.endurance-card-head'),body=card.locator('.race-card-body');
      const cover=index===3?'/images/endurance/iracing.webp':'/images/endurance/iracing/'+circuit+'.webp';
      const pano=index===3?cover:'/images/endurance/iracing-pano/'+circuit+'.webp';
      await expect(card).toBeVisible();
      expect(await art.evaluate(el=>getComputedStyle(el,'::before').backgroundImage)).toContain(cover);
      const before=await card.boundingBox();
      await card.evaluate(el=>el.classList.add('is-panorama-preview'));
      expect(await body.evaluate(el=>getComputedStyle(el).backgroundImage)).toContain(pano);
      expect(await body.evaluate(el=>getComputedStyle(el).backgroundImage)).not.toContain('/lmu-pano/');
      expect(await page.evaluate(async urls=>{
        for(const url of urls){const img=new Image();img.src=url;await img.decode();if(!img.naturalWidth)return false;}
        return true;
      },[cover,pano])).toBe(true);
      const after=await card.boundingBox();
      expect(after.width).toBeCloseTo(before.width,0);
      expect(after.height).toBeCloseTo(before.height,0);
      await testInfo.attach(circuit+'-'+width,{body:await card.screenshot(),contentType:'image/png'});
      await card.evaluate(el=>el.classList.remove('is-panorama-preview'));
    }
  }
  for(const [index,circuit] of circuits.slice(0,3).entries()){
    await page.goto('/iracing/#event='+events[index].id);
    const detail=page.locator('.race-header.is-endurance-detail');
    await expect(detail).toHaveClass(new RegExp('endurance-track-'+circuit));
    const hero=detail.locator('.endurance-detail-hero');
    expect(await hero.evaluate(el=>getComputedStyle(el).backgroundImage)).toContain('/images/endurance/iracing-pano/'+circuit+'.webp');
    await expect(hero.locator('.circuit-visual img')).toBeVisible();
  }
});

test('all named iRacing circuit images decode and stay separate from LMU',async({page})=>{
  test.setTimeout(90000);
  await boot(page,'iracing',[race('iracing')]);
  const failures=await page.evaluate(async()=>{
    const {GAME_CATALOGS}=await import('/shared/catalog.mjs');
    const {IRACING_ARTWORK,enduranceArtworkClass,endurancePreviewClass}=await import('/front/endurance-card.mjs');
    const bad=[];
    for(const {id} of GAME_CATALOGS.iracing.circuits.filter(c=>!c.random&&!c.id.endsWith('-tbd'))){
      if(!Object.hasOwn(IRACING_ARTWORK,id)||!enduranceArtworkClass({circuit:id},'iracing').includes(id)||!endurancePreviewClass({circuit:id},'iracing').includes(id)||enduranceArtworkClass({circuit:id},'lmu'))bad.push(id+' registry');
      for(const dir of ['iracing','iracing-pano']){
        const img=new Image();img.src='/images/endurance/'+dir+'/'+id+'.webp';
        try{await img.decode();if(!img.naturalWidth||!img.naturalHeight)bad.push(img.src);}catch{bad.push(img.src);}
      }
    }
    return bad;
  });
  expect(failures).toEqual([]);
});
