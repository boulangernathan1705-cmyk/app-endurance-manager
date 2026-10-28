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
    if(path==='/api/community/setup')data={community:{name:'Ma communauté'},siteUrl:'https://site.example',guild:{id:'900000000000000001',name:'Ma communauté',botPresent:true},rolesConfigured:true,recapSetupRequired:!botRecap,botRecap,recapBotInviteUrl:'https://discord.com/oauth2/authorize?client_id=123&scope=bot&permissions=85008',recapBotAdminInviteUrl:'https://discord.com/oauth2/authorize?client_id=123&scope=bot&permissions=8&guild_id=1',discordInviteUrl:'https://discord.gg/example'};
    if(path==='/api/community/recap/destinations')data={server:{ready:true,missing:[]},destinations:[{id:TEXT,type:0,name:'annonces',position:0,parentId:CATEGORY,parentName:'Endurances',ready:true,missing:[]},{id:CATEGORY,type:4,name:'Endurances',private:true,ready:permission,missing:permission?[]:['Intégrer des liens','Gérer les salons']},{id:PIT,type:4,name:'PIT WALK',ready:true,missing:[]}]};
    if(path==='/api/community/recap/preview')data={previews:(request.postDataJSON().mode==='events'?['🏎️ LMU · 6h de Spa','🏎️ LMU · 24h du Mans']:['récap-de-la-semaine · Endurances LMU']).map(name=>({name,payload:{embeds:[{title:'📝 Endurances LMU',description:'📍 Spa-Francorchamps · ⏱️ 6h\n📅 dimanche 11 octobre · 14h',fields:[{name:'Équipages',value:'🟪 **Équipage A** · GT3 · 🔓 Ouvert\n👤 Pilote 1 · 👤 Pilote 2'}],url:'https://site.example/lmu/#event=spa'}]}}))};
    if(path==='/api/community/discord'&&method==='DELETE'){botRecap={...botRecap,enabled:false};data={ok:true,done:true};}
    if(path==='/api/community/discord'&&method==='PUT'){
      const input=request.postDataJSON();
      botRecap={enabled:true,mode:input.layout.mode,lmuId:'',lmuName:'',iracingId:'',iracingName:'',calendarId:'',calendarName:'',lastError:null,layout:input.layout};data={ok:true,published:true};
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
// On a phone the questions come one per screen: « Suivant » / « Retour » until the control shows.
async function reach(page,locator){
  const form=page.locator('[data-discord-form]');
  for(const step of ['-1','1'])for(let i=0;i<12&&!(await locator.first().isVisible());i++){
    const button=form.locator(`[data-discord-step="${step}"]`);
    if(!(await button.isVisible())||await button.isDisabled())break;
    await button.click();
  }
  return locator;
}
const saves=calls=>calls.filter(call=>call.path==='/api/community/discord');

test('« une catégorie par course »: the questions follow the answers, the bot\'s category in the sketch, then activation',async({page})=>{
  const calls=await mockAdmin(page),form=page.locator('[data-discord-form]');
  await (await reach(page,form.locator('input[name="mode"][value="events"]'))).check();
  await (await reach(page,form.locator('input[name="sims"][value="all"]'))).check();
  await (await reach(page,form.locator('input[name="split"][value="apart"]'))).check();
  await expect(form.locator('[data-discord-sketch]')).toContainText('LMU');
  await expect(form.locator('[data-discord-sketch]')).toContainText('iRacing · 8h de Watkins Glen');
  await (await reach(page,form.locator('input[name="split"][value="together"]'))).check();
  await (await reach(page,form.locator('select[name="under"]'))).selectOption(CATEGORY);
  await expect(form.locator('[data-discord-sketch] li').filter({hasText:'Endurance Manager'})).toHaveCount(1);
  await expect(form.locator('select[name="week-all"]')).toHaveCount(0);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  await (await reach(page,form.getByRole('button',{name:'Activer',exact:true}))).click();
  await expect(page.locator('[data-module-tile="discord"] .admin-state')).toContainText('Actif');
  expect(saves(calls).at(-1).input.layout).toMatchObject({mode:'events',sims:'all',split:false,under:CATEGORY,showWeek:true});
});

test('« récap de la semaine »: just below a channel, voices in « Pit talk » made by the bot',async({page},testInfo)=>{
  const calls=await mockAdmin(page),form=page.locator('[data-discord-form]');
  await (await reach(page,form.locator('input[name="mode"][value="general"]'))).check();
  await (await reach(page,form.locator('input[name="sims"][value="all"]'))).check();
  await (await reach(page,form.locator('select[name="week-all"]'))).selectOption(TEXT);
  await (await reach(page,form.locator('select[name="events"]'))).selectOption('same');
  await expect(form.locator('select[name="under"]')).toHaveCount(0,{timeout:2000});
  await (await reach(page,form.locator('input[name="voices"][value="yes"]'))).check();
  await (await reach(page,form.locator('input[name="pit"][value="bot"]'))).check();
  await (await reach(page,form.locator('select[name="pitAt"]'))).selectOption(PIT);
  const sketch=await form.locator('[data-discord-sketch] li').allInnerTexts();
  expect(sketch.indexOf('# annonces')).toBeLessThan(sketch.indexOf('# 📅・endurances-de-la-semaine'));
  expect(sketch.indexOf('PIT WALK')+1).toBe(sketch.findIndex(item=>/Pit talk/i.test(item)));
  await screenshot(page,`discord-general-${testInfo.project.name}`);
  await (await reach(page,form.getByRole('button',{name:'Voir les messages',exact:true}))).click();
  await expect(form.locator('[data-recap-preview]')).toContainText('Équipage A');
  await (await reach(page,form.getByRole('button',{name:'Activer',exact:true}))).click();
  await expect(page.locator('[data-module-tile="discord"] .admin-state')).toContainText('Actif');
  expect(saves(calls).at(-1).input.layout).toMatchObject({mode:'general',week:{all:TEXT},events:'same',voices:true,pit:'bot',pitAt:PIT});
});

test('on a phone, one question per screen and the sketch last',async({page},testInfo)=>{
  test.skip(testInfo.project.name!=='android-chrome','phone layout');
  await mockAdmin(page);
  const form=page.locator('[data-discord-form]');
  await expect(form.locator('.discord-q:visible')).toHaveCount(1);
  await expect(form.locator('[data-discord-sketch]')).toBeHidden();
  const count=Number((await form.locator('[data-discord-count]').innerText()).split('/')[1]);
  for(let i=0;i<count;i++)await form.locator('[data-discord-step="1"]').click();
  await expect(form.locator('[data-discord-sketch]')).toBeVisible();
  await expect(form.locator('[data-discord-count]')).toHaveText('Aperçu');
});

test('missing bot permissions are named in the destination list',async({page})=>{
  await mockAdmin(page,{permission:false});
  const form=page.locator('[data-discord-form]');
  await (await reach(page,form.locator('input[name="mode"][value="general"]'))).check();
  await expect(form.locator('select[name="week-all"] option',{hasText:'le bot n’a pas ses droits'})).toHaveCount(1);
  await (await reach(page,form.locator('select[name="week-all"]'))).selectOption(CATEGORY);
  await expect(form.locator('.discord-rights')).toContainText('Gérer les salons');
  await expect(await reach(page,form.getByRole('link',{name:'Lien normal'}))).toHaveAttribute('href',/permissions=85008/);
  await expect(form.getByRole('link',{name:'Lien administrateur'})).toHaveAttribute('href',/permissions=8&/);
});

test('« Tout retirer » asks once more on the button itself',async({page})=>{
  const calls=await mockAdmin(page,{initialRecap:{enabled:true,mode:'events',lmuId:CATEGORY,lmuName:'Endurances',iracingId:'',iracingName:'',calendarId:'',calendarName:'',lastError:null,layout:{mode:'events',sims:'all',split:false,showWeek:true,showEvents:true,under:'top',voices:false,reminders:false}}});
  const remove=page.getByRole('button',{name:'Tout retirer',exact:true});
  await (await reach(page,remove)).click();
  await expect(page.getByRole('button',{name:'Confirmer : tout retirer'})).toBeVisible();
  expect(calls.filter(call=>call.method==='DELETE')).toHaveLength(0);
  await page.getByRole('button',{name:'Confirmer : tout retirer'}).click();
  await expect.poll(()=>calls.filter(call=>call.method==='DELETE'&&call.path==='/api/community/discord').length).toBe(1);
});

test('no calendar row without the events module',async({page})=>{
  await mockAdmin(page,{solo:false});
  const form=page.locator('[data-discord-form]');
  await (await reach(page,form.locator('input[name="mode"][value="general"]'))).check();
  await expect(form.locator('select[name="events"]')).toHaveCount(0);
  await (await reach(page,form.locator('input[name="mode"][value="events"]'))).check();
  await expect(form.locator('input[name="showEvents"]')).toHaveCount(0);
});

const brokenRecap={enabled:true,mode:'events',layout:{mode:'events',sims:'all',split:false,showWeek:true,showEvents:true,under:CATEGORY,voices:false,reminders:false},lmuId:CATEGORY,lmuName:'Endurances',iracingId:'',iracingName:'',calendarId:'',calendarName:'',lastError:'Le salon de publication du récap est introuvable ou inaccessible au bot. Clique sur Réparer le récap.'};
test('admin can repair from the error without reconfiguring',async({page})=>{
  const calls=await mockAdmin(page,{initialRecap:brokenRecap});
  const form=page.locator('[data-discord-form]');
  await expect(form).toContainText('Publication en erreur');
  await (await reach(page,form.getByRole('button',{name:'Réparer',exact:true}))).click();
  await expect(page.locator('[data-discord-form] .setup-actions .settings-status')).toContainText('vérifiés');
  await expect(page.locator('[data-discord-form]')).not.toContainText('Publication en erreur');
  expect(calls.filter(c=>c.path==='/api/community/recap/repair')).toHaveLength(1);
  expect(saves(calls)).toHaveLength(0);
});

test('repair failures are visible beside the button and leave the settings intact',async({page})=>{
  await mockAdmin(page,{initialRecap:brokenRecap,repairError:'Dans les permissions de « Endurances », autorise le bot : Intégrer des liens.'});
  await (await reach(page,page.getByRole('button',{name:'Réparer',exact:true}))).click();
  await expect(page.locator('[data-discord-form] .setup-actions .settings-status')).toContainText('Intégrer des liens');
  await expect(page.getByRole('button',{name:'Réparer',exact:true})).toBeEnabled();
  await expect(page.locator('[data-discord-form]')).toContainText('Publication en erreur');
});

test('« récap de la semaine », simus séparées: the bot makes « LMU » and « iRacing », private like the category chosen',async({page})=>{
  const calls=await mockAdmin(page);
  const form=page.locator('[data-discord-form]');
  await (await reach(page,form.locator('input[name="mode"][value="general"]'))).check();
  await (await reach(page,form.locator('input[name="split"][value="apart"]'))).check();
  await (await reach(page,form.locator('select[name="week-lmu"]'))).selectOption('bot');
  await (await reach(page,form.locator('select[name="week-iracing"]'))).selectOption('bot');
  await expect(form.locator('select[name="week-iracing"] option[value="bot"]')).toHaveText('Dans « iRacing », créée par le bot');
  await (await reach(page,form.locator('select[name="under"]'))).selectOption(CATEGORY);
  await expect(form.locator('select[name="under"] option[value="'+CATEGORY+'"]')).toContainText('privée');
  await expect(form.locator('input[name="copy"][value="private"]')).toBeChecked();
  await expect(form.getByText('Seuls ceux qui voient « Endurances » verront « 🔴 LMU » et « 🔵 iRacing ».')).toBeVisible();
  const submit=await reach(page,form.locator('button[type="submit"]'));
  await expect(form.locator('[data-discord-sketch]')).toContainText('LMU 🔒');
  await screenshot(page,'weekly-apart-private');
  await submit.click();
  await expect.poll(()=>calls.find(call=>call.path==='/api/community/discord'&&call.method==='PUT')?.input.layout.copy).toBe(true);
});
