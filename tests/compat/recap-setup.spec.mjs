import {test,expect} from '@playwright/test';
import {mkdir} from 'node:fs/promises';
import {join} from 'node:path';

const TEXT='555555555555555555', CATEGORY='666666666666666666', IRACING='777777777777777777';
// This suite mocks every API request, so it never writes to a community or to a real Discord server.
async function mockAdmin(page,{legacy=false,permission=true,iracingPermission=true,crewEnabled=false,initialBotRecap=null}={}) {
  const calls=[];let botRecap=initialBotRecap;
  await page.route('**/api/**',async route=>{
    const request=route.request(),path=new URL(request.url()).pathname,method=request.method();
    calls.push({path,method,input:request.postDataJSON()});
    let data={ok:true};
    if(path==='/api/session')data={user:{id:'100000000000000001',name:'Max'},permissions:['admin','access'],manager:false,community:{name:'Ma communauté',shortName:'MC',appearance:{}},communities:[]};
    if(path==='/api/members')data={members:[],permissions:['access','admin']};
    if(path==='/api/community/settings')data={community:{name:'Ma communauté',shortName:'MC'},modules:{crewChannels:crewEnabled},permissions:['access','admin'],roles:[],crews:{botReady:true,categories:[{id:CATEGORY,name:'Courses LMU'}]}};
    if(path==='/api/community/setup')data={community:{name:'Ma communauté'},siteUrl:'https://site.example',guild:{id:'900000000000000001',name:'Ma communauté',botPresent:true},rolesConfigured:true,recaps:legacy?[{scope:'all',webhook:'webhook …1234'}]:[],botRecap,recapBotInviteUrl:'https://discord.com/oauth2/authorize?client_id=123',discordInviteUrl:'https://discord.gg/example'};
    if(path==='/api/community/recap/destinations')data={destinations:[{id:TEXT,type:0,name:'récap-endurances',ready:true,missing:[]},{id:CATEGORY,type:4,name:'Endurances',ready:permission,missing:permission?[]:['Gérer les salons']},{id:IRACING,type:4,name:'Courses iRacing',ready:iracingPermission,missing:iracingPermission?[]:['Gérer les salons']}]};
    if(path==='/api/community/recap/preview')data={previews:(request.postDataJSON().mode==='events'?['6h-de-spa-12345678','24h-du-mans-87654321']:['récap-endurances']).map(name=>({name,payload:{embeds:[{title:'Préparation des endurances',description:'📍 Spa-Francorchamps · ⏱️ 6h\n📅 dimanche 11 octobre · 14h',fields:[{name:'Équipages',value:'🟪 **Apex Racing** · GT3 · 🔓 Ouvert\n👤 Nathan · 👤 Max\n📋 Sans équipage : Leo'},{name:'🚫 Pilotes absents',value:'Alex'}],url:'https://site.example/lmu/#event=spa'}]}}))};
    if(path==='/api/community/recap'&&method==='PUT'){const input=request.postDataJSON();botRecap={...input,enabled:input.enabled!==false,destinationName:input.mode==='events'?'Endurances':'récap-endurances',iracingDestinationName:input.iracingDestinationId?'Courses iRacing':null};data={ok:true,published:true};}
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
  });
  await page.addInitScript(()=>localStorage.setItem('endurance_manager_locale','fr'));
  await page.goto('/members.html');
  await page.getByRole('tab',{name:'Modules',exact:true}).click();
  await page.locator('[data-module-tile="recap"] [data-module-open]').click();
  return calls;
}
async function screenshot(page,name){
  if(!process.env.RECAP_SCREENSHOT_DIR)return;
  await mkdir(process.env.RECAP_SCREENSHOT_DIR,{recursive:true});
  await page.locator('[data-module-tile="recap"]').screenshot({path:join(process.env.RECAP_SCREENSHOT_DIR,name+'.png')});
}
for(const mode of ['general','events'])test(`guided ${mode} recap: independent filters, read-only preview, explicit test and activation`,async({page},testInfo)=>{
  const calls=await mockAdmin(page),wizard=page.locator('[data-recap-wizard]');
  await expect(wizard.locator('[data-recap-step]:visible')).toHaveCount(1);
  await expect(wizard.locator('[data-recap-back]')).toBeHidden();
  await wizard.locator(`input[name="mode"][value="${mode}"]`).check();
  if(mode==='events')await screenshot(page,`recap-choices-${testInfo.project.name}`);
  await wizard.getByRole('button',{name:'Continuer',exact:true}).click();
  await expect(wizard.locator('input[name="lmu"]')).toBeChecked();await expect(wizard.locator('input[name="iracing"]')).toBeChecked();
  await wizard.locator('.role-pill').filter({has:page.locator('input[name="lmu"]')}).click();await wizard.locator('.role-pill').filter({has:page.locator('input[name="iracing"]')}).click();
  await wizard.getByRole('button',{name:'Continuer',exact:true}).click();await expect(wizard.locator('.settings-status')).toContainText('au moins un simulateur');
  await wizard.locator('.role-pill').filter({has:page.locator('input[name="lmu"]')}).click();await wizard.locator('.role-pill').filter({has:page.locator('input[name="iracing"]')}).click();
  await wizard.getByRole('button',{name:'Continuer',exact:true}).click();
  await wizard.locator('select[name="destination"]').selectOption(mode==='events'?CATEGORY:TEXT);
  await wizard.getByRole('button',{name:'Continuer',exact:true}).click();
  await expect(wizard.locator('[data-recap-preview]')).toContainText('Apex Racing');
  await expect(wizard.locator('[data-recap-next]')).toBeHidden();
  expect(calls.filter(call=>['/api/community/recap','/api/community/recap/test'].includes(call.path))).toHaveLength(0);
  await expect(wizard.locator('.recap-preview')).toHaveCount(mode==='events'?2:1);
  if(mode==='events')await screenshot(page,`recap-preview-${testInfo.project.name}`);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  await wizard.getByRole('button',{name:'Envoyer un test sur Discord',exact:true}).click();
  await expect(wizard.locator('.settings-status')).toContainText('n’active pas');
  expect(calls.filter(call=>call.path==='/api/community/recap/test')).toHaveLength(1);
  await wizard.getByRole('button',{name:'Activer le récap automatique',exact:true}).click();
  await expect(page.locator('[data-recap-summary]')).toContainText('Actif');
  await expect(page.locator('[data-recap-wizard]')).toBeHidden();
  const activation=calls.find(call=>call.path==='/api/community/recap');expect(activation.input).toMatchObject({mode,scope:'all',destinationId:mode==='events'?CATEGORY:TEXT});
});

test('missing permissions are explained before activation and legacy configuration stays intact',async({page})=>{
  const calls=await mockAdmin(page,{legacy:true,permission:false});
  await expect(page.locator('[data-recap-summary]')).toContainText('Récap existant conservé');
  await page.getByRole('button',{name:'Modifier',exact:true}).click();
  const wizard=page.locator('[data-recap-wizard]');await wizard.locator('input[value="events"]').check();
  await wizard.getByRole('button',{name:'Continuer',exact:true}).click();await wizard.getByRole('button',{name:'Continuer',exact:true}).click();
  await wizard.locator('select[name="destination"]').selectOption(CATEGORY);await expect(wizard.locator('[data-recap-rights]')).toContainText('Gérer les salons');
  await wizard.getByRole('button',{name:'Continuer',exact:true}).click();
  await expect(wizard.locator('.settings-status')).toContainText('Permissions manquantes');
  await expect(wizard.locator('[data-recap-step="2"]')).toBeVisible();
  expect(calls.filter(call=>call.path==='/api/community/recap')).toHaveLength(0);
});

test('separate LMU and iRacing destinations are previewed, saved and restored with independent crew controls',async({page})=>{
  const calls=await mockAdmin(page,{crewEnabled:true}),wizard=page.locator('[data-recap-wizard]');
  await wizard.locator('input[value="events"]').check();
  await wizard.getByRole('button',{name:'Continuer',exact:true}).click();await wizard.getByRole('button',{name:'Continuer',exact:true}).click();
  await expect(wizard.locator('[data-recap-destination-label]')).toHaveText('Catégorie LMU');
  await expect(wizard.locator('[data-recap-iracing-destination]')).toBeVisible();
  await wizard.locator('select[name="destination"]').selectOption(CATEGORY);await wizard.locator('select[name="iracingDestination"]').selectOption(IRACING);
  await wizard.getByRole('button',{name:'Continuer',exact:true}).click();await expect(wizard.locator('[data-recap-preview]')).toContainText('Apex Racing');
  const preview=calls.find(call=>call.path==='/api/community/recap/preview');expect(preview.input).toMatchObject({destinationId:CATEGORY,iracingDestinationId:IRACING});
  expect(calls.filter(call=>call.method==='PUT')).toHaveLength(0);
  await wizard.getByRole('button',{name:'Activer le récap automatique',exact:true}).click();
  await expect(page.locator('[data-recap-summary]')).toContainText('Courses iRacing');
  await page.locator('[data-module-tile="crewChannels"] [data-module-open]').click();
  const crew=page.locator('[data-module-tile="crewChannels"]');
  await expect(crew).toContainText('Organisation coordonnée');await expect(crew).toContainText('fin du départ de son équipage');await expect(crew).toContainText('fin du dernier départ');
  await expect(crew.locator('input[data-module="crewChannels"]')).toBeChecked();expect(calls.filter(call=>call.path==='/api/community/modules')).toHaveLength(0);
  await page.locator('[data-recap-edit]').click();await wizard.getByRole('button',{name:'Continuer',exact:true}).click();await wizard.getByRole('button',{name:'Continuer',exact:true}).click();
  await expect(wizard.locator('select[name="iracingDestination"]')).toHaveValue(IRACING);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
});

test('missing permissions in the iRacing category block activation; general mode hides that choice',async({page})=>{
  const calls=await mockAdmin(page,{iracingPermission:false}),wizard=page.locator('[data-recap-wizard]');
  await wizard.locator('input[value="events"]').check();await wizard.getByRole('button',{name:'Continuer',exact:true}).click();await wizard.getByRole('button',{name:'Continuer',exact:true}).click();
  await wizard.locator('select[name="destination"]').selectOption(CATEGORY);await wizard.locator('select[name="iracingDestination"]').selectOption(IRACING);
  await expect(wizard.locator('[data-recap-rights]')).toContainText('Courses iRacing');
  await wizard.getByRole('button',{name:'Continuer',exact:true}).click();await expect(wizard.locator('.settings-status')).toContainText('Permissions manquantes');
  expect(calls.filter(call=>call.path==='/api/community/recap/preview')).toHaveLength(0);
  await wizard.getByRole('button',{name:'Retour',exact:true}).click();await wizard.getByRole('button',{name:'Retour',exact:true}).click();await wizard.locator('input[value="general"]').check();
  await wizard.getByRole('button',{name:'Continuer',exact:true}).click();await wizard.getByRole('button',{name:'Continuer',exact:true}).click();
  await expect(wizard.locator('[data-recap-iracing-destination]')).toBeHidden();await wizard.locator('select[name="destination"]').selectOption(TEXT);
  await wizard.getByRole('button',{name:'Continuer',exact:true}).click();await expect(wizard.locator('[data-recap-preview]')).toContainText('Apex Racing');
  expect(calls.find(call=>call.path==='/api/community/recap/preview').input.iracingDestinationId).toBeNull();
});
