import {test,expect} from '@playwright/test';
import {officialSetupPage,OFFICIAL_GUILD} from '../../server/official-discord-setup.mjs';
const PATH='/api/admin/official-discord-setup';
async function mock(page,conflict=false){
  const calls=[];
  await page.route('**/api/admin/**',async route=>{
    const req=route.request(),path=new URL(req.url()).pathname;
    if(path.endsWith('/page'))return route.fulfill({contentType:'text/html',body:await officialSetupPage().text()});
    calls.push({method:req.method(),input:req.postDataJSON()});
    const posts=calls.filter(call=>call.method==='POST').length;
    const data=req.method()==='POST'?{done:posts===2,message:posts===2?'Organisation créée.':'Lot créé.'}:{guildName:'Endurance Manager',items:[{name:'Courses LMU',type:4,parent:null,action:conflict?'conflict':posts?'reuse':'create'}],notes:['Les courses restent gérées par le site.'],welcomeMessages:{bienvenue:'Bienvenue sur Endurance Manager'}};
    await route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
  });
  await page.goto(PATH+'/page');return calls;
}
test('preview performs no writes, exact server confirmation is required and every batch needs an explicit click',async({page})=>{
  const calls=await mock(page);const create=page.locator('#create');await expect(create).toBeDisabled();
  await page.locator('#preview').click();await expect(page.locator('#plan')).toContainText('Courses LMU');
  expect(calls.filter(call=>call.method==='POST')).toHaveLength(0);
  await page.locator('#confirmation').fill('wrong');await expect(create).toBeDisabled();
  await page.locator('#confirmation').fill(OFFICIAL_GUILD);await expect(create).toBeEnabled();await create.click();
  await expect(create).toHaveText('Créer le lot suivant');expect(calls.filter(call=>call.method==='POST')).toHaveLength(1);
  expect(calls.find(call=>call.method==='POST').input).toEqual({confirmGuildId:OFFICIAL_GUILD});
  await create.click();await expect(create).toBeDisabled();await expect(page.locator('#status')).toHaveText('Organisation créée.');
  expect(calls.filter(call=>call.method==='POST')).toHaveLength(2);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
});
test('a preview conflict prevents creation even with the correct server identifier',async({page})=>{
  const calls=await mock(page,true);await page.locator('#preview').click();await expect(page.locator('#plan')).toContainText('Conflit à résoudre');
  await page.locator('#confirmation').fill(OFFICIAL_GUILD);await expect(page.locator('#create')).toBeDisabled();expect(calls.filter(call=>call.method==='POST')).toHaveLength(0);
});
