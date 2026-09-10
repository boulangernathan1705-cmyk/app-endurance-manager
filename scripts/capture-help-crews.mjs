import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

const BASE='http://127.0.0.1:4173';
const OUT='images/help';
await mkdir(OUT,{recursive:true});
const future=Date.now()+21*86400000;
const date=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(future));

function events(mine=false){return [{id:'event-help',name:'Daytona 8H',eventType:'lmu',durationHours:8,circuit:'daytona',categories:['GT3','Hypercar'],version:1,departures:[{id:'dep-help',date,time:'18:00',startsAt:future,availability:[
{id:'r1',participantId:'p1',name:'Nathan',category:'GT3',cars:['Ferrari 296 LMGT3'],carAny:false,status:'h1,h2,h3,h6,h7,h8',preferredPilot:'Josselin',version:1,mine,managed:false,canEdit:mine,discordLinked:true},
{id:'r2',participantId:'p2',name:'Josselin',category:'GT3',cars:['Ferrari 296 LMGT3'],carAny:false,status:'whole',preferredPilot:'Nathan',version:1,mine:false,managed:false,canEdit:false,discordLinked:true},
{id:'r3',participantId:'p3',name:'Rico',category:'GT3',cars:['BMW M4 LMGT3'],carAny:false,status:'h2,h3,h4,h5,h6',preferredPilot:'',version:1,mine:false,managed:false,canEdit:false,discordLinked:true},
{id:'r4',participantId:'p4',name:'Manu',category:'Hypercar',cars:['Toyota GR010 Hybrid'],carAny:false,status:'whole',preferredPilot:'',version:1,mine:false,managed:true,canEdit:true,discordLinked:true}],crews:[
{id:'c1',name:'Endurance GT3 #1',category:'GT3',car:'Ferrari 296 LMGT3',registrationIds:['r1','r2'],locked:false,version:1},
{id:'c2',name:'Endurance Hypercar #1',category:'Hypercar',car:'Toyota GR010 Hybrid',registrationIds:['r4'],locked:true,version:1}]}]}];}
const participants=[{id:'u1',name:'Nathan'},{id:'u2',name:'Josselin'},{id:'u3',name:'Rico'},{id:'u4',name:'Manu'}];

async function makePage(browser,role,mine=false){
 const context=await browser.newContext({viewport:{width:1440,height:1100},deviceScaleFactor:1});
 const page=await context.newPage(); const ev=events(mine);
 await page.route('**/api/**',async route=>{const path=new URL(route.request().url()).pathname;let body={ok:true};if(path==='/api/session')body={user:{id:'u',name:'Nathan',role},discordReady:true};else if(path==='/api/events')body={events:ev};else if(path==='/api/participants')body={participants};await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});});
 await page.goto(BASE,{waitUntil:'networkidle'});await page.waitForSelector('.event-card');await page.locator('.event-card').first().click();await page.waitForSelector('.departure-fold');await page.waitForTimeout(500);return{context,page};
}
async function mark(page,containerSel,targetSel,label){const c=page.locator(containerSel).first(),t=page.locator(targetSel).first();if(!(await c.count())||!(await c.isVisible())||!(await t.count())||!(await t.isVisible()))throw new Error(`${containerSel} / ${targetSel} absent`);await t.scrollIntoViewIfNeeded();await t.evaluate(el=>{el.dataset.hold=el.getAttribute('style')||'';el.style.outline='4px solid #31b86b';el.style.outlineOffset='4px';el.style.boxShadow='0 0 0 8px rgba(49,184,107,.22)';});const cb=await c.boundingBox(),tb=await t.boundingBox();await c.evaluate((el,d)=>{el.dataset.hpos=el.style.position||'';if(getComputedStyle(el).position==='static')el.style.position='relative';const n=document.createElement('div');n.dataset.hm='1';n.textContent=`${d.label} ↓`;n.style.cssText='position:absolute;z-index:99999;padding:8px 11px;border-radius:7px;background:#31b86b;color:#06130b;font:900 13px Arial,sans-serif;box-shadow:0 6px 20px rgba(0,0,0,.42);white-space:nowrap;pointer-events:none';n.style.left=`${Math.max(8,Math.min(d.left,Math.max(8,el.clientWidth-210)))}px`;n.style.top=`${Math.max(8,d.top)}px`;el.append(n);},{label,left:tb.x-cb.x,top:tb.y-cb.y-46});return{c,t};}
async function shot(page,name,csel,tsel,label){try{const {c,t}=await mark(page,csel,tsel,label);await page.waitForTimeout(150);await c.screenshot({path:`${OUT}/${name}.jpg`,type:'jpeg',quality:86});await c.evaluate(el=>{el.querySelectorAll('[data-hm]').forEach(n=>n.remove());el.style.position=el.dataset.hpos||'';});await t.evaluate(el=>{const old=el.dataset.hold||'';old?el.setAttribute('style',old):el.removeAttribute('style');});console.log('CAPTURED',name);return true;}catch(e){console.warn('SKIPPED',name,e.message);return false;}}
async function clickVisible(page,sel){const e=page.locator(sel).first();if(!(await e.count())||!(await e.isVisible()))return false;await e.click({timeout:5000});await page.waitForTimeout(450);return true;}

const browser=await chromium.launch({headless:true});let count=0;
try{
 {
  const {context,page}=await makePage(browser,'organizer',true);
  if(await clickVisible(page,'[data-crew-builder-open]')){if(await shot(page,'org-create-crew','.crew-builder-panel','[data-crew-builder-submit]','Créer l’équipage'))count++;}
  await context.close();
 }
 {
  const {context,page}=await makePage(browser,'organizer',true);
  await clickVisible(page,'[data-action="event-section"][data-section="crews"]');
  const fold=page.locator('.crew-page-accordion .departure-fold, #crew-departure-dep-help').first();
  if(await fold.count()){
   const summary=fold.locator(':scope > summary');
   if(await summary.count()&&await summary.isVisible())await summary.click();
   await page.waitForTimeout(700);
  }
  if(await shot(page,'org-crew-overview','.crew-section','.crew-management-summary','Ouvre un équipage'))count++;
  const details=page.locator('details.crew-management-accordion').first();
  if(await details.count()){
   const sum=details.locator(':scope > summary');if(await sum.count()&&await sum.isVisible())await sum.click();await page.waitForTimeout(600);
   if(await shot(page,'org-crew-status','details.crew-management-accordion','.crew-state-select','Choisis le statut'))count++;
   if(await shot(page,'org-assign-pilot','details.crew-management-accordion','.crew-candidate-action-card, .crew-add-pilot-button','Ajoute un pilote'))count++;
   if(await shot(page,'org-coverage','details.crew-management-accordion','.presence-timeline','Vérifie la couverture'))count++;
   if(await shot(page,'org-crew-actions','details.crew-management-accordion','.crew-actions','Actions de l’équipage'))count++;
  }
  if(await shot(page,'org-unassigned','.ux-remaining-pilots-section','.ux-remaining-heading','Pilotes non affectés'))count++;
  await context.close();
 }
 {
  const {context,page}=await makePage(browser,'pilot',true);
  const fold=page.locator('#departure-dep-help').first();
  if(await fold.count()){const sum=fold.locator(':scope > summary');if(await sum.count()&&await sum.isVisible())await sum.click();await page.waitForTimeout(900);}
  const bucket=page.locator('.ux-crew-bucket').filter({has:page.locator('.crew-pilot-accordion')}).first();
  if(await bucket.count()){const bsum=bucket.locator(':scope > summary');if(await bsum.count()&&await bsum.isVisible()&&!await bucket.evaluate(el=>el.open))await bsum.click();await page.waitForTimeout(500);}
  if(await shot(page,'pilot-crew','.ux-course-overview','.crew-pilot-accordion-summary','Ouvre ton équipage'))count++;
  const crew=page.locator('details.crew-pilot-accordion').first();
  if(await crew.count()){
    const csum=crew.locator(':scope > summary');
    if(await csum.count()&&await csum.isVisible()&&!await crew.evaluate(el=>el.open))await csum.click();
    await crew.evaluate(el=>{el.open=true;});
    await page.waitForTimeout(450);
    if(await shot(page,'pilot-crew-details','details.crew-pilot-accordion','.crew-pilot-accordion-body','Détail de l’équipage'))count++;
  }
  await context.close();
 }
}finally{await browser.close();}
console.log('DONE_CREW',count);
if(count<6)throw new Error(`Seulement ${count} captures équipage générées.`);
