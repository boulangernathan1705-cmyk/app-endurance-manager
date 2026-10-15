import {test,expect} from '@playwright/test';

const alpha={id:'alpha',slug:'alpha',name:'Alpha',shortName:'A'},beta={id:'beta',slug:'beta',name:'Beta',shortName:'B'};
const start=(id='start')=>({id,date:'2090-10-15',time:'14:00',startsAt:Date.parse('2090-10-15T12:00:00Z'),availability:[],crews:[]});
const race=(game,extras={})=>({id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',name:'Special official',official:true,format:'endurance',circuit:game==='iracing'?'iracing-spa':'spa',eventType:'special',categories:['GT3'],details:{},durationHours:2,durationMinutes:120,departures:[start()],version:1,...extras});
async function boot(page,game,events){
  await page.route('**/api/**',async route=>{
    const path=new URL(route.request().url()).pathname;
    let data={ok:true};
    if(path==='/api/session')data={user:{id:'111111111111111111',name:'Nathan',communityIntroSeen:true},access:'member',permissions:['access','endurance','crews','solo_open'],community:alpha,communities:[alpha,beta],soloRaces:true,eventTypes:['OPEN','SAFE'],eventTdz:true};
    else if(['/api/events','/api/races'].includes(path))data={events};
    else if(path==='/api/participants')data={participants:[]};
    else if(path.includes('notifications'))data={notifications:[],unread:0};
    await route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
  });
  await page.goto(`/${game}/`);
  await page.waitForFunction(async()=>{const {state}=await import('/front/app/core.mjs');return state.access==='member'&&state.events.length>0;});
}

for(const game of ['lmu','iracing'])test(`${game}: mobile circuit drawings fit inside their cards`,async({page})=>{
  // Use a deterministic wide SVG; remote availability must not affect layout checks.
  const svgNamespace=['http:','','www.w3.org','2000','svg'].join('/');
  await page.route('https://upload.wikimedia.org/**',route=>route.fulfill({contentType:'image/svg+xml',body:`<svg xmlns="${svgNamespace}" viewBox="0 0 800 200"><path d="M1 1H799V199H1Z" fill="none" stroke="black"/></svg>`}));
  const circuits=game==='iracing'?['iracing-indianapolis','iracing-nurburgring-gp','iracing-montreal']:['spa','le-mans'];
  await boot(page,game,circuits.map((circuit,index)=>race(game,{id:`mobile-${index}`,circuit})));
  for(const width of [320,390,430,760]){
    await page.setViewportSize({width,height:844});
    const cards=page.locator('.race-card');
    await expect(cards).toHaveCount(circuits.length);
    for(const card of await cards.all()){
      const panel=card.locator('.race-card-circuit'),visual=panel.locator('.circuit-visual'),img=visual.locator('img');
      await expect(img).toHaveCount(1);
      const [outer,box,drawing,picture]=await Promise.all([card.boundingBox(),panel.boundingBox(),visual.boundingBox(),img.boundingBox()]);
      for(const rect of [box,drawing,picture]){
        expect(rect.width).toBeGreaterThan(0);
        expect(rect.x).toBeGreaterThanOrEqual(outer.x-1);
        expect(rect.x+rect.width).toBeLessThanOrEqual(outer.x+outer.width+1);
      }
      expect(drawing.width).toBeLessThanOrEqual(box.width+1);
      expect(drawing.height).toBeLessThanOrEqual(box.height+1);
      expect(picture.width).toBeLessThanOrEqual(drawing.width+1);
      expect(await img.evaluate(node=>getComputedStyle(node).transform)).toBe('none');
    }
  }
});

for(const game of ['lmu','iracing'])test(`${game}: official special filter, reset, and corrupt saved filters`,async({page})=>{
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  const events=[race(game),race(game,{id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',name:'Regular series',eventType:'lmu'}),race(game,{id:'cccccccc-cccc-4ccc-8ccc-cccccccccccc',name:'Community race',official:false,eventType:'private'})];
  await boot(page,game,events);
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

test('SOLO and TDZ calendars ignore endurance-only filters and preserve their simulator choice',async({page})=>{
  const solo=race('lmu',{format:'solo',sim:'lmu',name:'Solo OPEN',access:'open',official:false,rounds:[{circuit:'spa',durationMinutes:120,categories:[]}],details:{type:'OPEN'},categories:[]});
  await boot(page,'lmu',[solo]);
  await page.evaluate(async()=>{
    const {state}=await import('/front/app/core.mjs');state.listFormat='solo';
    const {raceFilterKey}=await import('/front/race-filters.mjs');const key=raceFilterKey('lmu','solo',{communityId:state.community.id,userId:state.user.id});
    localStorage.setItem(key,JSON.stringify({types:['special'],communities:['beta'],categories:['GTP'],sims:['lmu'],kinds:['OPEN'],situation:'crew'}));
    state.raceFiltersBy={};state.raceFilterOpen=true;const {renderHome}=await import('/front/app/home-view.mjs');renderHome();
  });
  await expect(page.locator('.event-card')).toHaveCount(1);
  await expect(page.locator('[data-group="sims"][data-value="lmu"]')).toHaveAttribute('aria-pressed','true');
  await expect(page.locator('[data-group="kinds"][data-value="OPEN"]')).toHaveAttribute('aria-pressed','true');
  await page.evaluate(async()=>{const {state}=await import('/front/app/core.mjs');state.eventTdz=false;state.eventTypes=[];state.events[0].details={};const {renderHome}=await import('/front/app/home-view.mjs');renderHome();});
  await expect(page.locator('.event-card')).toHaveCount(1);await expect(page.locator('[data-group="kinds"]')).toHaveCount(0);
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
