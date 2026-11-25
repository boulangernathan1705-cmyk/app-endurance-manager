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
  expect(await art.evaluate(el=>getComputedStyle(el,'::before').backgroundImage)).toContain(game==='lmu'?'/images/endurance/lmu/cota.webp':'/images/endurance/iracing.webp');
  const [a,m,c]=await Promise.all([art.boundingBox(),map.boundingBox(),caption.boundingBox()]);
  expect(m.x).toBeGreaterThanOrEqual(a.x+a.width-1);
  expect(m.width).toBeGreaterThan(70);
  expect(c.x+c.width).toBeLessThanOrEqual(m.x+1);
  expect(Math.abs(c.y+c.height-a.y-a.height)).toBeLessThanOrEqual(2);
  expect(await art.evaluate(el=>getComputedStyle(el).clipPath)).toContain('polygon');
  expect(await caption.evaluate(el=>getComputedStyle(el).backgroundColor)).toBe('rgba(9, 14, 20, 0.78)');
  expect(await art.evaluate(el=>getComputedStyle(el,'::after').clipPath)).toContain('polygon');
  const mapImage=map.locator('img'),picture=await mapImage.boundingBox();
  expect(picture.x).toBeGreaterThan(m.x+3);
  expect(picture.x+picture.width).toBeLessThan(m.x+m.width-3);
  expect(Math.abs(picture.x+picture.width/2-m.x-m.width/2)).toBeLessThan(5);
  expect(Math.abs(picture.y+picture.height/2-m.y-m.height/2)).toBeLessThan(5);
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

/* A visual contact sheet of every circuit in each simulator, using the real
   detailed-header map styles and original image sources (no mock drawings). */
for(const game of ['lmu','iracing'])test('endurance-circuit-catalog-'+game,async({page},testInfo)=>{
  test.setTimeout(120000);
  await mockSite(page);
  const race=game==='lmu'?SPA:SEBRING;
  await page.goto('/'+game+'/#event='+race.id);
  const header=page.locator('.race-header.is-endurance-detail');
  await expect(header).toBeVisible();
  const mapSize=await header.locator('.circuit-visual').boundingBox();
  const count=await page.evaluate(async({game,mapWidth,mapHeight})=>{
    const {GAME_CATALOGS}=await import('/shared/catalog.mjs');
    const {circuitVisual}=await import('/front/app/core.mjs');
    const circuits=GAME_CATALOGS[game].circuits.filter(c=>!c.random&&!c.id.endsWith('-tbd'));
    const app=document.querySelector('#app'),sheet=document.createElement('div');
    sheet.id='circuit-audit-sheet';
    sheet.style.cssText='display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;background:#101619;padding:4px;box-sizing:border-box;width:100%';
    for(const circuit of circuits){
      const item=document.createElement('section');item.className='race-header is-endurance-detail';
      item.style.cssText='min-width:0;overflow:hidden';
      const label=document.createElement('div');label.textContent=circuit.id;label.style.cssText='font-size:10px;line-height:14px;overflow-wrap:anywhere;padding:3px;color:#fff';
      const hero=document.createElement('div');hero.className='endurance-detail-hero';
      hero.style.cssText='display:block;height:'+Math.round(mapHeight*Math.min(1, (innerWidth/3-12)/mapWidth))+'px;width:100%';
      hero.innerHTML=circuitVisual(circuit.id);
      item.append(label,hero);sheet.append(item);
    }
    app.replaceChildren(sheet);
    // Isolate the contact sheet from fixed application chrome, including mobile navigation.
    for(let node=app;node.parentElement&&node!==document.body;node=node.parentElement){
      for(const sibling of node.parentElement.children)if(sibling!==node)sibling.style.setProperty('display','none','important');
    }
    for(const node of document.querySelectorAll('body *'))if(!sheet.contains(node)&&!node.contains(sheet)&&getComputedStyle(node).position==='fixed')node.style.setProperty('display','none','important');
    return circuits.length;
  },{game,mapWidth:mapSize.width,mapHeight:mapSize.height});
  const images=page.locator('#circuit-audit-sheet img');
  await expect(images).toHaveCount(count);
  const audit=await images.evaluateAll(async imgs=>Promise.all(imgs.map(async img=>{
    img.loading='eager';
    try{await img.decode();}catch{return {id:img.dataset.circuit,loaded:false};}
    const m=img.parentElement.getBoundingClientRect(),p=img.getBoundingClientRect();
    return {id:img.dataset.circuit,loaded:true,inside:p.left>=m.left+3&&p.right<=m.right-3&&p.top>=m.top+3&&p.bottom<=m.bottom-3,
      centered:Math.abs(p.x+p.width/2-m.x-m.width/2)<8&&Math.abs(p.y+p.height/2-m.y-m.height/2)<8};
  })));
  expect(audit.filter(a=>!a.loaded||!a.inside||!a.centered)).toEqual([]);
  console.log(game+' : '+count+' circuits chargés et cadrés ('+testInfo.project.name+')');
  await expect(page.locator('#circuit-audit-sheet')).toHaveScreenshot('endurance-circuit-catalog-'+game+'.png',{timeout:20000});
});

/* Review all 18 real covers in all three card contexts at each viewport.
   Use the actual header dimensions measured on the application, and the same
   production selectors. Scale only the review cells, not the source artwork. */
test('endurance-lmu-artwork-catalog',async({page},testInfo)=>{
  test.setTimeout(120000);
  await mockSite(page);
  await page.goto('/lmu/#accueil');
  const home=page.locator('.week-block.is-lmu .endurance-card-head').first();
  await expect(home).toBeVisible();
  const homeSize=await home.boundingBox();
  await page.goto('/lmu/');
  const list=page.locator('button.race-card.is-endurance .endurance-card-head').first();
  await expect(list).toBeVisible();
  const listSize=await list.boundingBox();
  await page.goto('/lmu/#event='+SPA.id);
  const detail=page.locator('.endurance-detail-hero .endurance-card-head');
  await expect(detail).toBeVisible();
  const detailSize=await detail.boundingBox();
  const result=await page.evaluate(async({sizes})=>{
    const {GAME_CATALOGS}=await import('/shared/catalog.mjs');
    const {enduranceHeader}=await import('/front/endurance-card.mjs');
    const circuits=GAME_CATALOGS.lmu.circuits.filter(c=>!c.random&&!c.id.endsWith('-tbd'));
    const app=document.querySelector('#app'),sheet=document.createElement('div');
    sheet.id='lmu-artwork-audit';
    sheet.style.cssText='display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;background:#101619;padding:4px;box-sizing:border-box;width:100%;align-items:start';
    const cellWidth=(app.clientWidth-24)/3;
    for(const title of ['Accueil','Liste','Fiche']){
      const h=document.createElement('strong');h.textContent=title;h.style.cssText='color:#fff;text-align:center;font-size:12px';sheet.append(h);
    }
    const checks=[];
    for(const circuit of circuits){
      for(const [index,context] of ['home','list','detail'].entries()){
        const cell=document.createElement('div');cell.style.cssText='min-width:0;overflow:hidden;color:#fff;text-align:center;font-size:10px';
        const label=document.createElement('div');label.textContent=circuit.id;cell.append(label);
        const frame=document.createElement('div');frame.style.cssText='display:block;margin:auto;width:max-content';
        const html=enduranceHeader({circuit:circuit.id,name:'Test',durationMinutes:360},'lmu');
        if(context==='home')frame.innerHTML='<div class="week-block is-endurance is-lmu">'+html+'</div>';
        else if(context==='list')frame.innerHTML='<button class="race-card is-endurance" type="button"><span class="race-card-top">'+html+'</span></button>';
        else frame.innerHTML='<div class="endurance-detail-hero">'+html+'<span class="circuit-visual" style="display:none"></span></div>';
        const art=frame.querySelector('.endurance-card-head'),size=sizes[index];
        for(const wrapper of frame.querySelectorAll('.week-block,.race-card,.race-card-top,.endurance-detail-hero')){
          wrapper.style.setProperty('display','block','important');wrapper.style.setProperty('padding','0','important');wrapper.style.setProperty('margin','0','important');wrapper.style.setProperty('border','0','important');wrapper.style.setProperty('width',size.width+'px','important');wrapper.style.setProperty('height',size.height+'px','important');wrapper.style.setProperty('min-width','0','important');
        }
        for(const [key,value] of Object.entries({width:size.width+'px',height:size.height+'px','min-height':size.height+'px','max-height':size.height+'px',margin:'0'}))art.style.setProperty(key,value,'important');
        frame.style.zoom=String(Math.min(1,cellWidth/size.width));
        cell.append(frame);sheet.append(cell);
        checks.push({art,id:circuit.id,context});
      }
    }
    app.replaceChildren(sheet);
    for(let node=app;node.parentElement&&node!==document.body;node=node.parentElement){
      for(const sibling of node.parentElement.children)if(sibling!==node)sibling.style.setProperty('display','none','important');
    }
    for(const node of document.querySelectorAll('body *'))if(!sheet.contains(node)&&!sheet.contains(node.parentElement)&&!node.contains(sheet)&&getComputedStyle(node).position==='fixed')node.style.setProperty('display','none','important');
    const audit=await Promise.all(checks.map(async({art,id,context})=>{
      const style=getComputedStyle(art,'::before'),mobile=innerWidth<=760;
      const prop=context==='list'||(context==='home'&&mobile)?'--track-focus-compact':context==='detail'&&mobile?'--track-focus-detail':'--track-focus-wide';
      const image=new Image();image.src='/images/endurance/lmu/'+id+'.webp';
      let loaded=true;try{await image.decode();}catch{loaded=false;}
      return {id,context,loaded,correct:style.backgroundPosition===style.getPropertyValue(prop).trim()&&style.backgroundImage.includes('/images/endurance/lmu/'+id+'.webp')&&style.backgroundSize.split(',').every(s=>s.trim()==='cover')};
    }));
    return {count:circuits.length,audit};
  },{sizes:[homeSize,listSize,detailSize]});
  expect(result.count).toBe(18);
  expect(result.audit).toHaveLength(54);
  expect(result.audit.filter(a=>!a.loaded||!a.correct)).toEqual([]);
  console.log('18 covers, 54 framings verified ('+testInfo.project.name+')');
  await page.evaluate(()=>document.fonts.ready);
  await expect(page.locator('#lmu-artwork-audit')).toHaveScreenshot('endurance-lmu-artwork-catalog.png',{timeout:20000});
});
