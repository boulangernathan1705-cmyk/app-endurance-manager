import {test,expect} from '@playwright/test';
import {mkdir} from 'node:fs/promises';
import {join} from 'node:path';

const TEXT='555555555555555555', CATEGORY='666666666666666666', PIT='777777777777777777';
// This suite mocks every API request, so it never writes to a community or to a real Discord server.
async function mockAdmin(page,{permission=true,initialRecap=null,repairError=null,solo=true}={}) {
  const calls=[];let botRecap=initialRecap;
  await page.route('**/api/**',async route=>{
    const request=route.request(),path=new URL(request.url()).pathname,method=request.method();
    calls.push({path,method,input:request.postDataJSON()});
    let data={ok:true},status=200;
    if(path==='/api/session')data={user:{id:'100000000000000001',name:'Max'},permissions:['admin','access'],manager:false,community:{name:'Ma communauté',shortName:'MC',appearance:{}},communities:[]};
    if(path==='/api/members')data={members:[],permissions:['access','admin']};
    if(path==='/api/community/settings')data={community:{name:'Ma communauté',shortName:'MC'},modules:{soloRaces:solo},permissions:['access','admin'],roles:[],crews:{botReady:true,categories:[{id:PIT,name:'PIT WALK'}]}};
    if(path==='/api/community/setup')data={community:{name:'Ma communauté'},siteUrl:'https://site.example',guild:{id:'900000000000000001',name:'Ma communauté',botPresent:true},rolesConfigured:true,recapSetupRequired:!botRecap,botRecap,recapBotInviteUrl:'https://discord.com/oauth2/authorize?client_id=123&scope=bot&permissions=85008',discordInviteUrl:'https://discord.gg/example'};
    if(path==='/api/community/recap/destinations')data={destinations:[{id:TEXT,type:0,name:'récap-de-la-semaine',ready:true,missing:[]},{id:CATEGORY,type:4,name:'Endurances',ready:permission,missing:permission?[]:['Intégrer des liens','Gérer les salons']},{id:PIT,type:4,name:'PIT WALK',ready:true,missing:[]}]};
    if(path==='/api/community/recap/preview')data={previews:(request.postDataJSON().mode==='events'?['🏎️ LMU · 6h de Spa','🏎️ LMU · 24h du Mans']:['récap-de-la-semaine · Endurances LMU']).map(name=>({name,payload:{embeds:[{title:'📝 Endurances LMU',description:'📍 Spa-Francorchamps · ⏱️ 6h\n📅 dimanche 11 octobre · 14h',fields:[{name:'Équipages',value:'🟪 **Équipage A** · GT3 · 🔓 Ouvert\n👤 Pilote 1 · 👤 Pilote 2'}],url:'https://site.example/lmu/#event=spa'}]}}))};
    if(path==='/api/community/discord'&&method==='PUT'){
      const input=request.postDataJSON();
      if(input.enabled===false)botRecap={...botRecap,enabled:false};
      else if(!input.lmuId&&!input.iracingId&&!input.calendarId){status=400;data={error:'Choisis au moins un endroit où publier.'};}
      else {botRecap={enabled:true,mode:input.mode,lmuId:input.lmuId,lmuName:input.lmuId===TEXT?'récap-de-la-semaine':'Endurances',iracingId:input.iracingId,iracingName:'',calendarId:input.calendarId,calendarName:'',lastError:null};data={ok:true,published:true};}
    }
    if(path==='/api/community/recap/repair'){
      if(repairError){status=400;data={error:repairError};}
      else botRecap={...botRecap,lastError:null};
    }
    await route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
  });
  await page.addInitScript(()=>localStorage.setItem('endurance_manager_locale','fr'));
  await page.goto('/members.html');
  await page.getByRole('tab',{name:'Modules',exact:true}).click();
  await page.locator('[data-module-tile="discord"] [data-module-open]').click();
  return calls;
}
async function screenshot(page,name){
  if(!process.env.RECAP_SCREENSHOT_DIR)return;
  await mkdir(process.env.RECAP_SCREENSHOT_DIR,{recursive:true});
  await page.locator('[data-module-tile="discord"]').screenshot({path:join(process.env.RECAP_SCREENSHOT_DIR,name+'.png')});
}
const saves=calls=>calls.filter(call=>call.path==='/api/community/discord');

for(const mode of ['events','general'])test(`Discord setting, ${mode}: rows follow the choice, read-only preview, then activation`,async({page},testInfo)=>{
  const calls=await mockAdmin(page),form=page.locator('[data-discord-form]');
  await form.locator(`input[name="mode"][value="${mode}"]`).check();
  const target=CATEGORY;
  // Categories only, in both modes: in « récap de la semaine » the bot makes its channel there.
  await expect(form.locator('select[name="lmu"] option',{hasText:'récap-de-la-semaine'})).toHaveCount(0);
  await expect(form.locator('select[name="lmu"] option',{hasText:'Endurances'})).toHaveCount(1);
  await expect(form.locator('select[name="calendar"]')).toBeVisible();
  await expect(form.locator('select[name="crewCategory"]')).toHaveCount(0);
  // Nothing chosen yet: the server refuses, nothing is published.
  await form.getByRole('button',{name:'Activer',exact:true}).click();
  await expect(form.locator('.setup-actions .settings-status')).toContainText('au moins un endroit');
  await form.locator('select[name="lmu"]').selectOption(target);
  await form.locator('select[name="iracing"]').selectOption(target);
  await expect(form.locator('[data-discord-sketch]')).toContainText(mode==='events'?'6h de Spa':'Endurances iRacing');
  if(mode==='general'){
    await form.locator('input[name="crewChannels"]').check();
    await form.locator('select[name="crewCategory"]').selectOption(PIT);
    await expect(form.locator('[data-discord-sketch]')).toContainText('LMU · 6h de Spa · Équipage A');
  }
  await screenshot(page,`discord-${mode}-${testInfo.project.name}`);
  await form.getByRole('button',{name:'Voir les messages',exact:true}).click();
  await expect(form.locator('[data-recap-preview]')).toContainText('Équipage A');
  await expect(form.locator('.recap-preview')).toHaveCount(mode==='events'?2:1);
  expect(saves(calls)).toHaveLength(1);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  await form.getByRole('button',{name:'Activer',exact:true}).click();
  await expect(page.locator('[data-module-tile="discord"] .admin-state')).toContainText('Actif');
  const activation=saves(calls).at(-1);
  expect(activation.input).toMatchObject({mode,lmuId:target,iracingId:target,calendarId:''});
  if(mode==='general')expect(activation.input).toMatchObject({crewChannels:true,crewCategory:PIT});
});

test('missing bot permissions are named in the destination list',async({page})=>{
  await mockAdmin(page,{permission:false});
  const form=page.locator('[data-discord-form]');
  await expect(form.locator('select[name="lmu"] option',{hasText:'le bot n’a pas ses droits'})).toHaveCount(1);
  await form.locator('select[name="lmu"]').selectOption(CATEGORY);
  await expect(form.locator('.discord-rights')).toContainText('Gérer les salons');
  await expect(form.getByRole('link',{name:'Inviter le bot avec ses droits'})).toHaveAttribute('href',/permissions=85008/);
});

test('no calendar row without the events module',async({page})=>{
  await mockAdmin(page,{solo:false});
  await expect(page.locator('[data-discord-form] select[name="calendar"]')).toHaveCount(0);
});

const brokenRecap={enabled:true,mode:'events',lmuId:CATEGORY,lmuName:'Endurances',iracingId:'',iracingName:'',calendarId:'',calendarName:'',lastError:'Le salon de publication du récap est introuvable ou inaccessible au bot. Clique sur Réparer le récap.'};
test('admin can repair from the error without reconfiguring',async({page})=>{
  const calls=await mockAdmin(page,{initialRecap:brokenRecap});
  const form=page.locator('[data-discord-form]');
  await expect(form).toContainText('Publication en erreur');
  await form.getByRole('button',{name:'Réparer',exact:true}).click();
  await expect(page.locator('[data-discord-form] .setup-actions .settings-status')).toContainText('vérifiés');
  await expect(page.locator('[data-discord-form]')).not.toContainText('Publication en erreur');
  expect(calls.filter(c=>c.path==='/api/community/recap/repair')).toHaveLength(1);
  expect(saves(calls)).toHaveLength(0);
});

test('repair failures are visible beside the button and leave the settings intact',async({page})=>{
  await mockAdmin(page,{initialRecap:brokenRecap,repairError:'Dans les permissions de « Endurances », autorise le bot : Intégrer des liens.'});
  await page.getByRole('button',{name:'Réparer',exact:true}).click();
  await expect(page.locator('[data-discord-form] .setup-actions .settings-status')).toContainText('Intégrer des liens');
  await expect(page.getByRole('button',{name:'Réparer',exact:true})).toBeEnabled();
  await expect(page.locator('[data-discord-form]')).toContainText('Publication en erreur');
});
