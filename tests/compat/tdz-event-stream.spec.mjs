import {test,expect} from '@playwright/test';
// EVENT TDZ (Nathan 2026-11-02): « Sans stream » or « En stream » is always answered at « Horaire »; streamed, its start and
// end are asked. A TONDEUZ TRAINING is a window (« de 20h à 22h »): circuit and categories only, no sessions.
const EVENT='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
for(const width of [1440,390])test(`TDZ event: stream choice and training window at ${width}px`,async({page})=>{
  test.setTimeout(60000);
  await page.setViewportSize({width,height:1000});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  let saved=null;
  await page.route('**/api/**',route=>{
    const request=route.request(),pathname=new URL(request.url()).pathname;let data={ok:true};
    if(pathname==='/api/session')data={user:{id:'111111111111111111',name:'Admin',communityIntroSeen:true},access:'member',permissions:['access','admin','create_race','manage_races','endurance','solo_open'],soloRaces:true,eventTdz:true,eventTypes:['OPEN','SAFE','BOULOULES','TONDEUZ TRAINING'],communityStreamUrl:'https://www.twitch.tv/lapraline_tdz',community:{id:'tdz',slug:'tdz',name:'TDZ',appearance:{}},communities:[]};
    else if(['/api/events','/api/races'].includes(pathname)&&request.method()==='GET')data={events:[]};
    else if(pathname==='/api/races'&&request.method()==='POST'){saved=request.postDataJSON();data={id:EVENT};}
    else if(pathname.includes('notifications'))data={notifications:[],unread:0};
    return route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
  });
  await page.addInitScript(()=>localStorage.setItem('endurance_manager_locale','fr'));
  await page.goto('/events/');
  await page.getByRole('button',{name:'Ajouter un événement'}).click();
  const form=page.locator('form[data-kind="solo-event"]'),next=form.locator('[data-solo-step="next"]');
  const clock=name=>form.locator('[data-clock]').filter({has:page.locator(`[name="${name}"]`)});
  const setClock=async(name,value)=>{await clock(name).locator('[data-clock-hour]').selectOption(value.slice(0,2));await clock(name).locator('[data-clock-minute]').selectOption(value.slice(3));};
  await form.locator('[name="eventName"]').fill('Training Spa');
  await form.locator('label:has(input[name="eventType"][value="TONDEUZ TRAINING"])').click();
  await next.click();
  await expect(form.locator('[data-solo-step-label]')).toHaveText('Étape 2 sur 5 · Horaire');
  const date=new Date(Date.now()+3*86400000).toISOString().slice(0,10);
  await form.locator('[name="date"]').fill(date);
  await form.locator('[name="timeHour"]').selectOption('20');
  await expect(clock('eventEnd')).toBeVisible();
  await expect(clock('eventEnd')).toContainText('Fin (Paris)');
  await expect(form.locator('.departure-field')).toContainText('Début (Paris)');
  await setClock('eventEnd','22:00');
  // The stream question has no default answer and must be answered (no click on « Continuer » here: Firefox's
  // validation bubble would block the next clicks).
  await expect(form.locator('[data-stream-times]')).toBeHidden();
  await expect(form.locator('input[name="eventStreamed"]:checked')).toHaveCount(0);
  await expect(form.locator('input[name="eventStreamed"]').first()).toHaveAttribute('required','');
  await form.locator('label:has(input[name="eventStreamed"][value="yes"])').click();
  await expect(form.locator('[data-stream-times]')).toBeVisible();
  await expect(form.locator('[data-stream-times] a')).toHaveText('twitch.tv/lapraline_tdz');
  await expect(form.locator('[name="eventStreamTime"]')).toHaveValue('20:00');
  await expect(form.locator('[name="eventStreamEnd"]')).toHaveValue('22:00');
  // An end before the start is refused (until 6h it is the next morning).
  await setClock('eventStreamEnd','19:00');
  expect(await clock('eventStreamEnd').locator('[data-clock-hour]').evaluate(select=>select.validationMessage)).toBe('La fin du stream doit être après son début.');
  await setClock('eventStreamEnd','23:00');
  await next.click();
  // A training: the circuit and categories only.
  await expect(form.locator('[data-solo-step-label]')).toHaveText('Étape 3 sur 5 · Circuit');
  await expect(form.locator('[name="roundMinutes"]')).toBeHidden();
  await expect(form.locator('[data-add-round]')).toBeHidden();
  await form.locator('[name="roundCircuit"]').selectOption('spa');
  await next.click();await next.click();
  await expect(form.locator('[data-solo-recap]')).toContainText('20h–22h');
  await expect(form.locator('[data-solo-recap]')).toContainText('📺 20h–23h');
  await form.locator('[data-solo-submit]').click();
  await expect.poll(()=>saved).not.toBeNull();
  expect(saved.details).toMatchObject({type:'TONDEUZ TRAINING',streamTime:'20:00',streamEnd:'23:00'});
  expect(saved.rounds).toHaveLength(1);
  expect(saved.rounds[0]).toMatchObject({circuit:'spa',durationMinutes:120,practice:null,qualifying:null,capacity:null});
  expect(errors).toEqual([]);
});
test('TDZ event without stream sends no stream times',async({page})=>{
  let saved=null;
  await page.route('**/api/**',route=>{
    const request=route.request(),pathname=new URL(request.url()).pathname;let data={ok:true};
    if(pathname==='/api/session')data={user:{id:'111111111111111111',name:'Admin',communityIntroSeen:true},access:'member',permissions:['access','admin','create_race','manage_races','endurance','solo_open'],soloRaces:true,eventTdz:true,eventTypes:['OPEN','SAFE'],communityStreamUrl:'',community:{id:'tdz',slug:'tdz',name:'TDZ',appearance:{}},communities:[]};
    else if(['/api/events','/api/races'].includes(pathname)&&request.method()==='GET')data={events:[]};
    else if(pathname==='/api/races'&&request.method()==='POST'){saved=request.postDataJSON();data={id:EVENT};}
    else if(pathname.includes('notifications'))data={notifications:[],unread:0};
    return route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
  });
  await page.addInitScript(()=>localStorage.setItem('endurance_manager_locale','fr'));
  await page.goto('/events/');
  await page.getByRole('button',{name:'Ajouter un événement'}).click();
  const form=page.locator('form[data-kind="solo-event"]'),next=form.locator('[data-solo-step="next"]');
  const clock=name=>form.locator('[data-clock]').filter({has:page.locator(`[name="${name}"]`)});
  const setClock=async(name,value)=>{await clock(name).locator('[data-clock-hour]').selectOption(value.slice(0,2));await clock(name).locator('[data-clock-minute]').selectOption(value.slice(3));};
  await form.locator('[name="eventName"]').fill('Coupe GT3');
  await form.locator('label:has(input[name="eventType"][value="OPEN"])').click();
  await next.click();
  await form.locator('[name="date"]').fill(new Date(Date.now()+3*86400000).toISOString().slice(0,10));
  await expect(clock('eventEnd')).toBeHidden();
  await form.locator('label:has(input[name="eventStreamed"][value="yes"])').click();
  await expect(form.locator('[data-stream-times]')).toContainText('Aucun lien de stream réglé');
  await form.locator('label:has(input[name="eventStreamed"][value="no"])').click();
  await next.click();
  await expect(form.locator('[data-solo-step-label]')).toHaveText('Étape 3 sur 5 · Manches');
  await form.locator('[name="roundCircuit"]').selectOption('spa');
  await next.click();await next.click();
  await expect(form.locator('[data-solo-recap]')).toContainText('sans stream');
  await form.locator('[data-solo-submit]').click();
  await expect.poll(()=>saved).not.toBeNull();
  expect(saved.details.streamTime).toBe('');expect(saved.details.streamEnd).toBe('');
});
test('TDZ rally night asks the stream too',async({page})=>{
  let saved=null;
  await page.route('**/api/**',route=>{
    const request=route.request(),pathname=new URL(request.url()).pathname;let data={ok:true};
    if(pathname==='/api/session')data={user:{id:'111111111111111111',name:'Admin',communityIntroSeen:true},access:'member',permissions:['access','admin','create_race','manage_races','endurance','solo_open'],soloRaces:true,eventTdz:true,eventTypes:['OPEN','SAFE','BOULOULES'],communityStreamUrl:'https://www.twitch.tv/lapraline_tdz',community:{id:'tdz',slug:'tdz',name:'TDZ',appearance:{}},communities:[]};
    else if(['/api/events','/api/races'].includes(pathname)&&request.method()==='GET')data={events:[]};
    else if(pathname==='/api/races'&&request.method()==='POST'){saved=request.postDataJSON();data={id:EVENT};}
    else if(pathname.includes('notifications'))data={notifications:[],unread:0};
    return route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
  });
  await page.addInitScript(()=>localStorage.setItem('endurance_manager_locale','fr'));
  await page.goto('/events/');
  await page.getByRole('button',{name:'Ajouter un événement'}).click();
  const solo=page.locator('form[data-kind="solo-event"]');
  await solo.locator('[name="eventName"]').fill('Bouboules');
  await solo.locator('label:has(input[name="eventSim"][value="acrally"])').click();
  await solo.locator('label:has(input[name="eventType"][value="BOULOULES"])').click();
  await solo.locator('[data-solo-step="next"]').click();
  const form=page.locator('form[data-kind="rally-event"]');
  await form.locator('[name="date"]').fill(new Date(Date.now()+3*86400000).toISOString().slice(0,10));
  await form.locator('label:has(input[name="eventStreamed"][value="yes"])').click();
  await expect(form.locator('[data-stream-times]')).toBeVisible();
  for(let step=0;step<3;step++)await form.locator('[data-rally-step="next"]').click();
  await expect(form.locator('[data-rally-recap]')).toContainText('📺 21h–23h');
  await form.locator('[data-rally-submit]').click();
  await expect.poll(()=>saved).not.toBeNull();
  expect(saved.details).toMatchObject({streamTime:'21:00',streamEnd:'23:00'});
});
