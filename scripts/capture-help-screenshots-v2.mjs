import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

const BASE = 'http://127.0.0.1:4173';
const OUT = 'images/help';
await mkdir(OUT, {recursive:true});

const future = Date.now() + 21 * 86400000;
const date = new Intl.DateTimeFormat('en-CA', {timeZone:'Europe/Paris', year:'numeric', month:'2-digit', day:'2-digit'}).format(new Date(future));

function demoEvents({mine=false, managed=false}={}) {
  return [{
    id:'event-help', name:'Daytona 8H', eventType:'lmu', durationHours:8, circuit:'daytona',
    categories:['Hypercar','GT3'], version:1,
    departures:[{
      id:'dep-help', date, time:'18:00', startsAt:future,
      availability:[
        {id:'r1',participantId:'p1',name:'Nathan',category:'GT3',cars:['Ferrari 296 LMGT3','Porsche 911 GT3 R LMGT3'],carAny:false,status:'h1,h2,h3,h6,h7,h8',preferredPilot:'Josselin',version:1,mine,managed:false,canEdit:mine,discordLinked:true},
        {id:'r2',participantId:'p2',name:'Josselin',category:'GT3',cars:['Ferrari 296 LMGT3'],carAny:false,status:'whole',preferredPilot:'Nathan',version:1,mine:false,managed:false,canEdit:false,discordLinked:true},
        {id:'r3',participantId:'p3',name:'Rico',category:'GT3',cars:['BMW M4 LMGT3'],carAny:false,status:'h2,h3,h4,h5,h6',preferredPilot:'',version:1,mine:false,managed:false,canEdit:false,discordLinked:true},
        {id:'r4',participantId:'p4',name:'Manu',category:'Hypercar',cars:['Toyota GR010 Hybrid'],carAny:false,status:'whole',preferredPilot:'',version:1,mine:false,managed,canEdit:managed,discordLinked:true}
      ],
      crews:[
        {id:'c1',name:'Endurance GT3 #1',category:'GT3',car:'Ferrari 296 LMGT3',registrationIds:['r1','r2'],locked:false,version:1},
        {id:'c2',name:'Endurance Hypercar #1',category:'Hypercar',car:'Toyota GR010 Hybrid',registrationIds:['r4'],locked:true,version:1}
      ]
    }]
  }];
}

const participants=[{id:'u1',name:'Nathan'},{id:'u2',name:'Josselin'},{id:'u3',name:'Rico'},{id:'u4',name:'Manu'}];
const members=[{id:'1001',name:'Nathan',role:'admin'},{id:'1002',name:'Josselin',role:'organizer'},{id:'1003',name:'Rico',role:'pilot'}];
const roleUser=role=>role==='guest'?null:{id:`user-${role}`,name:'Nathan',role};
let completed=[];
let skipped=[];

async function pageFor(browser, role='guest', opts={}, viewport={width:1440,height:1100}) {
  const context=await browser.newContext({viewport,deviceScaleFactor:1});
  const page=await context.newPage();
  const events=demoEvents(opts);
  await page.route('**/api/**',async route=>{
    const path=new URL(route.request().url()).pathname;
    let body={ok:true};
    if(path==='/api/session') body={user:roleUser(role),discordReady:true};
    else if(path==='/api/events') body={events};
    else if(path==='/api/participants') body={participants};
    else if(path==='/api/members') body={members};
    else if(path==='/api/guest/link') body={link:'https://exemple.endurance-manager/mon-lien-personnel'};
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
  });
  await page.goto(BASE,{waitUntil:'networkidle'});
  await page.waitForSelector('.event-card');
  await page.waitForTimeout(350);
  return {context,page};
}

async function marker(container,target,label,side='top') {
  await target.scrollIntoViewIfNeeded();
  await container.scrollIntoViewIfNeeded();
  await target.evaluate(el=>{
    el.dataset.helpOldStyle=el.getAttribute('style')||'';
    el.style.outline='4px solid #31b86b';
    el.style.outlineOffset='4px';
    el.style.boxShadow='0 0 0 8px rgba(49,184,107,.22)';
  });
  const cb=await container.boundingBox(),tb=await target.boundingBox();
  if(!cb||!tb) return;
  await container.evaluate((el,d)=>{
    el.dataset.helpOldPosition=el.style.position||'';
    if(getComputedStyle(el).position==='static') el.style.position='relative';
    const note=document.createElement('div');
    note.dataset.helpMarker='1';
    note.style.cssText='position:absolute;z-index:999999;padding:8px 11px;border-radius:7px;background:#31b86b;color:#06130b;font:900 13px Arial,sans-serif;box-shadow:0 6px 20px rgba(0,0,0,.42);white-space:nowrap;pointer-events:none';
    const arrow=d.side==='left'?'→':d.side==='bottom'?'↑':'↓';
    note.textContent=d.side==='left'?`${arrow} ${d.label}`:`${d.label} ${arrow}`;
    const maxLeft=Math.max(8,el.clientWidth-210);
    note.style.left=`${Math.max(8,Math.min(d.left,maxLeft))}px`;
    note.style.top=`${Math.max(8,d.top)}px`;
    el.append(note);
  },{label,side,left:tb.x-cb.x,top:side==='bottom'?tb.y-cb.y+tb.height+12:tb.y-cb.y-46});
}

async function unmarker(container,target){
  await container.evaluate(el=>{el.querySelectorAll('[data-help-marker]').forEach(n=>n.remove());el.style.position=el.dataset.helpOldPosition||'';delete el.dataset.helpOldPosition;});
  await target.evaluate(el=>{const old=el.dataset.helpOldStyle||'';old?el.setAttribute('style',old):el.removeAttribute('style');delete el.dataset.helpOldStyle;});
}

async function capture(page,name,containerSelector,targetSelector='',label='',side='top'){
  try{
    const container=page.locator(containerSelector).first();
    if(!(await container.count())||!(await container.isVisible())) throw new Error(`container ${containerSelector} absent/masqué`);
    let target=null;
    if(targetSelector){
      target=page.locator(targetSelector).first();
      if(!(await target.count())||!(await target.isVisible())) throw new Error(`target ${targetSelector} absent/masqué`);
      await marker(container,target,label,side);
    }
    await page.waitForTimeout(120);
    await container.screenshot({path:`${OUT}/${name}.jpg`,type:'jpeg',quality:86});
    if(target) await unmarker(container,target);
    completed.push(name);
    console.log('CAPTURED',name);
  }catch(error){skipped.push(`${name}: ${error.message}`);console.warn('SKIPPED',name,error.message);}
}

async function openEvent(page){
  await page.locator('.event-card').first().click();
  await page.waitForSelector('.departure-fold');
  const fold=page.locator('.departure-fold').first();
  await fold.evaluate(el=>{el.open=true;});
  await page.waitForTimeout(450);
}

const browser=await chromium.launch({headless:true});
try{
  // PILOTE / VISITEUR
  {
    const {context,page}=await pageFor(browser,'guest');
    await capture(page,'pilot-events','.event-agenda','.event-card','Clique sur la course');
    await openEvent(page);
    const fold=page.locator('.departure-fold').first(); await fold.evaluate(el=>{el.open=true;});
    await capture(page,'pilot-register','.fold-registration','.registration-form','Remplis ton inscription');
    await capture(page,'pilot-availability','.registration-choices','[data-action="availability"][data-value="whole"]','Toute la course');
    await capture(page,'pilot-category','.category-area','.category-button.gt3','Choisis ta catégorie');
    await page.locator('.category-button.gt3').first().click(); await page.waitForTimeout(250);
    await capture(page,'pilot-cars','.car-preference-panel','.car-any-option','Ou coche cette option','left');
    await capture(page,'pilot-teammate','.registration-form','input[name="preferredPilot"]','Coéquipier souhaité');
    await capture(page,'pilot-submit','.registration-form','.save-button','Valide ici','bottom');
    await context.close();
  }
  {
    const {context,page}=await pageFor(browser,'guest',{}, {width:700,height:950});
    await capture(page,'pilot-connection','header, .site-nav-shell','.discord-button','Connexion Discord','left');
    await context.close();
  }
  {
    const {context,page}=await pageFor(browser,'pilot',{mine:true});
    await openEvent(page);
    const fold=page.locator('.departure-fold').first(); await fold.evaluate(el=>{el.open=true;}); await page.waitForTimeout(200);
    await capture(page,'pilot-edit','.pilot-section','.edit-button','Modifier');
    const crew=page.locator('details.crew-pilot-accordion').first();
    if(await crew.count()){await crew.evaluate(el=>{el.open=true;});await capture(page,'pilot-crew','details.crew-pilot-accordion','details.crew-pilot-accordion > summary','Ouvre ton équipage');}
    await page.locator('[data-action="my-entries"]').first().click(); await page.waitForSelector('.my-entry-card');
    await capture(page,'pilot-my-entries','.my-entry-card','.my-entry-header','Ton inscription');
    await context.close();
  }

  // ORGANISATEUR
  {
    const {context,page}=await pageFor(browser,'organizer',{mine:true,managed:true});
    await capture(page,'org-home-create','main','.home-create-event [data-action="create"]','Ajouter un évènement','left');
    await page.locator('.home-create-event [data-action="create"]').click(); await page.waitForSelector('.event-creation');
    await capture(page,'org-create-event','.event-creation','.creation-basics','Informations générales');
    await page.locator('[data-action="home"]').first().click(); await page.locator('.event-card').first().click(); await page.waitForSelector('.departure-fold');
    const raceFold=page.locator('.departure-fold').first(); await raceFold.evaluate(el=>{el.open=true;}); await page.waitForTimeout(300);
    await capture(page,'org-edit-event','main > .toolbar','[data-action="edit-event"]','Modifier l’événement');
    await capture(page,'org-departure','.departure-fold','.departure-fold > summary','Le départ à gérer');
    await capture(page,'org-registration','.pilot-section','.pilot-row','Lis les inscriptions');
    await capture(page,'org-add-pilot','.registration-form','[data-action="new-registration"][data-mode="pilot"]','Ajouter un pilote');
    await page.locator('[data-action="event-section"][data-section="crews"]').click(); await page.waitForTimeout(500);
    const crewFold=page.locator('.crew-page-accordion .departure-fold').first(); if(await crewFold.count()) await crewFold.evaluate(el=>{el.open=true;}); await page.waitForTimeout(400);
    await capture(page,'org-crew-overview','.crew-section','.crew-list','Équipages du départ');
    const mgmt=page.locator('details.crew-management-accordion').first();
    if(await mgmt.count()){
      await mgmt.evaluate(el=>{el.open=true;});await page.waitForTimeout(200);
      await capture(page,'org-crew-status','details.crew-management-accordion','.crew-state-select','Ouvert / complet');
      await capture(page,'org-assign-pilot','details.crew-management-accordion','.crew-assignment select, .crew-add-pilot-button','Affecter un pilote');
      await capture(page,'org-coverage','details.crew-management-accordion','.presence-timeline','Couverture horaire');
      await capture(page,'org-crew-actions','details.crew-management-accordion','.crew-actions','Actions équipage','bottom');
    }
    await capture(page,'org-unassigned','.ux-remaining-pilots-section','.ux-remaining-heading','Pilotes restants');
    const newCrew=page.locator('[data-action="new-crew"]').first();
    if(await newCrew.count()&&await newCrew.isVisible()){
      await newCrew.click();await page.waitForSelector('.crew-form');
      await capture(page,'org-create-crew','.crew-form','button[type="submit"]','Enregistrer l’équipage','bottom');
    }
    await page.locator('[data-action="my-entries"]').first().click(); await page.waitForTimeout(300);
    await capture(page,'org-managed-entry','main','.my-entries-group','Inscriptions gérées');
    await context.close();
  }

  // ADMIN
  {
    const {context,page}=await pageFor(browser,'admin',{mine:true,managed:true});
    await page.locator('[data-action="members"]').click();await page.waitForSelector('.member-list');
    await capture(page,'admin-members','.member-list','.member-row select','Choisir le rôle','left');
    await context.close();
  }
}finally{await browser.close();}

console.log(`DONE ${completed.length} captures`);
if(skipped.length) console.log('SKIPPED LIST\n'+skipped.join('\n'));
if(completed.length<12) throw new Error(`Seulement ${completed.length} captures générées.`);
