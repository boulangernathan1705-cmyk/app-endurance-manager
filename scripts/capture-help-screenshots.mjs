import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

const BASE = 'http://127.0.0.1:4173';
const OUT = 'images/help';
await mkdir(OUT, {recursive:true});

const future = Date.now() + 21 * 24 * 60 * 60 * 1000;
const date = new Intl.DateTimeFormat('en-CA', {timeZone:'Europe/Paris', year:'numeric', month:'2-digit', day:'2-digit'}).format(new Date(future));

function makeEvents({mine=false, managed=false}={}) {
  const departure = {
    id:'dep-help',
    date,
    time:'18:00',
    startsAt: future,
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
  };
  return [{id:'event-help',name:'Daytona 8H',eventType:'lmu',durationHours:8,circuit:'daytona',categories:['Hypercar','GT3'],departures:[departure],version:1}];
}

const participants = [{id:'u1',name:'Nathan'},{id:'u2',name:'Josselin'},{id:'u3',name:'Rico'},{id:'u4',name:'Manu'}];
const members = [{id:'1001',name:'Nathan',role:'admin'},{id:'1002',name:'Josselin',role:'organizer'},{id:'1003',name:'Rico',role:'pilot'}];
const roleUser = role => role === 'guest' ? null : {id:`user-${role}`,name:'Nathan',role};

async function newPage(browser, role='guest', opts={}) {
  const context = await browser.newContext({viewport:{width:1440,height:1100}, deviceScaleFactor:1});
  const page = await context.newPage();
  const events = makeEvents(opts);
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    let body = {};
    if (path === '/api/session') body = {user:roleUser(role),discordReady:true};
    else if (path === '/api/events') body = {events};
    else if (path === '/api/participants') body = {participants};
    else if (path === '/api/members') body = {members};
    else if (path === '/api/guest/link') body = {link:'https://exemple.endurance-manager/mon-lien-personnel'};
    else body = {ok:true};
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
  });
  await page.goto(BASE, {waitUntil:'networkidle'});
  await page.waitForSelector('.event-card');
  await page.waitForTimeout(500);
  return {context,page};
}

async function addMarker(container, target, label, direction='down') {
  await target.scrollIntoViewIfNeeded();
  await container.scrollIntoViewIfNeeded();
  await target.evaluate(el => {
    el.dataset.helpCaptureOriginalStyle = el.getAttribute('style') || '';
    el.style.outline = '4px solid #31b86b';
    el.style.outlineOffset = '4px';
    el.style.boxShadow = '0 0 0 8px rgba(49,184,107,.22)';
  });
  const cbox = await container.boundingBox();
  const tbox = await target.boundingBox();
  if (!cbox || !tbox) return;
  await container.evaluate((el, data) => {
    el.dataset.helpCapturePosition = el.style.position || '';
    if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
    const marker = document.createElement('div');
    marker.dataset.helpCaptureMarker = 'true';
    marker.style.cssText = 'position:absolute;z-index:99999;display:flex;align-items:center;gap:8px;padding:8px 11px;border-radius:7px;background:#31b86b;color:#06130b;font:900 13px Arial,sans-serif;box-shadow:0 6px 20px rgba(0,0,0,.42);white-space:nowrap;pointer-events:none;';
    marker.innerHTML = data.direction === 'right' ? `<span>→</span><span>${data.label}</span>` : data.direction === 'up' ? `<span>↑</span><span>${data.label}</span>` : `<span>${data.label}</span><span>↓</span>`;
    const left = Math.max(8, Math.min(data.left, Math.max(8, el.clientWidth - 190)));
    marker.style.left = `${left}px`;
    marker.style.top = `${Math.max(8, data.top)}px`;
    el.append(marker);
  }, {label,direction,left:tbox.x-cbox.x,top:direction === 'up' ? tbox.y-cbox.y+tbox.height+14 : tbox.y-cbox.y-48});
}

async function cleanupMarker(container, target) {
  await container.evaluate(el => {
    el.querySelectorAll('[data-help-capture-marker]').forEach(node => node.remove());
    if (el.dataset.helpCapturePosition !== undefined) {
      el.style.position = el.dataset.helpCapturePosition;
      delete el.dataset.helpCapturePosition;
    }
  });
  await target.evaluate(el => {
    const original = el.dataset.helpCaptureOriginalStyle || '';
    if (original) el.setAttribute('style', original); else el.removeAttribute('style');
    delete el.dataset.helpCaptureOriginalStyle;
  });
}

async function shot(page, name, containerSelector, targetSelector=null, label='', direction='down') {
  const container = page.locator(containerSelector).first();
  await container.waitFor({state:'visible'});
  const target = targetSelector ? page.locator(targetSelector).first() : null;
  if (target) {
    await target.waitFor({state:'visible'});
    await addMarker(container, target, label, direction);
  }
  await page.waitForTimeout(180);
  await container.screenshot({path:`${OUT}/${name}.jpg`,type:'jpeg',quality:84});
  if (target) await cleanupMarker(container, target);
}

async function openEvent(page) {
  await page.locator('.event-card').first().click();
  await page.waitForSelector('.departure-fold');
  await page.waitForTimeout(500);
}

const browser = await chromium.launch({headless:true});
try {
  {
    const {context,page} = await newPage(browser,'guest',{mine:false});
    await shot(page,'pilot-events','.event-agenda','.event-card','Ouvre la course');
    await shot(page,'pilot-connection','.site-nav-shell','.discord-button','Connexion Discord','right');
    await openEvent(page);
    await shot(page,'pilot-register','.departure-fold','.fold-toolbar [data-action="focus-registration"]','Va à ton inscription');
    await shot(page,'pilot-availability','.registration-choices','[data-action="availability"][data-value="whole"]','Toute la course');
    await shot(page,'pilot-category','.category-area','.category-button.gt3','Choisis ta catégorie');
    await page.locator('.category-button.gt3').click();
    await page.waitForTimeout(250);
    await shot(page,'pilot-cars','.car-preference-panel','input[name="carAny"]','Ou choisis cette option','right');
    await shot(page,'pilot-teammate','.registration-form','#preference-dep-help','Coéquipier souhaité');
    await shot(page,'pilot-submit','.registration-form','.save-button','Valide ici','up');
    await context.close();
  }
  {
    const {context,page} = await newPage(browser,'pilot',{mine:true});
    await openEvent(page);
    await shot(page,'pilot-edit','.pilot-row','.edit-button','Modifier mon inscription','right');
    const crew = page.locator('details.crew-pilot-accordion, .crew-pilot-group').first();
    if (await crew.count()) {
      if (await crew.evaluate(el => el.tagName === 'DETAILS')) await crew.evaluate(el => {el.open = true;});
      await crew.screenshot({path:`${OUT}/pilot-crew.jpg`,type:'jpeg',quality:84});
    }
    await page.locator('[data-action="my-entries"]').first().click();
    await page.waitForSelector('.my-entry-card');
    await shot(page,'pilot-my-entries','.my-entry-card','.my-entry-header','Retrouve chaque inscription');
    await context.close();
  }
  {
    const {context,page} = await newPage(browser,'organizer',{mine:true,managed:true});
    await shot(page,'org-home-create','main','.home-create-event [data-action="create"]','Créer un événement','right');
    await page.locator('.home-create-event [data-action="create"]').click();
    await page.waitForSelector('.event-creation');
    await shot(page,'org-create-event','.event-creation','.creation-basics','Commence ici');
    await page.locator('[data-action="home"]').first().click();
    await page.locator('.event-card').first().click();
    await page.waitForTimeout(400);
    await shot(page,'org-edit-event','main > .toolbar','[data-action="edit-event"]','Modifier l’événement');
    await shot(page,'org-departure','.departure-fold','.departure-fold > summary','Choisis le bon départ');
    await shot(page,'org-add-pilot','.registration-form','[data-action="new-registration"][data-mode="pilot"]','Ajouter un pilote');
    if (await page.locator('[data-action="new-registration"][data-mode="category"]').count()) await shot(page,'org-multi-category','.registration-form','[data-action="new-registration"][data-mode="category"]','Ajouter une catégorie');
    await page.locator('[data-action="event-section"][data-section="crews"]').click();
    await page.waitForTimeout(650);
    const crewDetails = page.locator('details.crew-management-accordion').first();
    if (await crewDetails.count()) {
      await crewDetails.evaluate(el => {el.open = true;});
      await page.waitForTimeout(250);
      if (await page.locator('.crew-state-select').count()) await shot(page,'org-crew-status','details.crew-management-accordion','.crew-state-select','Ouvert / complet');
      if (await page.locator('.crew-assignment select, .crew-add-pilot-button').count()) await shot(page,'org-assign-pilot','details.crew-management-accordion','.crew-assignment select, .crew-add-pilot-button','Affecter un pilote');
      if (await page.locator('details.crew-management-accordion .availability-timeline, details.crew-management-accordion .timeline').count()) await shot(page,'org-coverage','details.crew-management-accordion','details.crew-management-accordion .availability-timeline, details.crew-management-accordion .timeline','Vérifie la couverture');
    }
    if (await page.locator('.unassigned-list').count()) await shot(page,'org-unassigned','.crew-section','.unassigned-list','Pilotes restant à affecter','up');
    const newCrew = page.locator('[data-action="new-crew"]').first();
    if (await newCrew.count()) {
      await newCrew.click();
      await page.waitForSelector('.crew-form');
      await shot(page,'org-create-crew','.crew-form','button[type="submit"]','Enregistrer l’équipage','up');
    }
    await context.close();
  }
  {
    const {context,page} = await newPage(browser,'admin',{mine:true,managed:true});
    await page.locator('[data-action="members"]').click();
    await page.waitForSelector('.member-list');
    await shot(page,'admin-members','.member-list','.member-row select','Choisir le rôle','right');
    await context.close();
  }
} finally {
  await browser.close();
}

console.log('Captures réelles générées dans', OUT);
