import {test,expect} from '@playwright/test';

// Only the roles the site looks at are listed; the others wait in « Ajouter un rôle ». Every API request is mocked.
const roles=[{id:'1',name:'@everyone',permissions:['access','endurance']},{id:'2',name:'Pilote',permissions:['access','endurance']},
  {id:'3',name:'Nitro Booster',permissions:[]},{id:'4',name:'GT3',permissions:[]},{id:'5',name:'Admin',permissions:[],administrator:true}];
test('roles: only the followed ones, add one from the server, take one off',async({page})=>{
  const puts=[];
  await page.route('**/api/**',async route=>{
    const request=route.request(),path=new URL(request.url()).pathname;
    let data={ok:true};
    if(request.method()==='PUT')puts.push({path,input:request.postDataJSON()});
    if(path==='/api/session')data={user:{id:'100000000000000001',name:'Max'},permissions:['admin','access'],manager:false,community:{name:'Test',shortName:'T',appearance:{}},communities:[]};
    if(path==='/api/members')data={members:[],permissions:['access','admin']};
    if(path==='/api/community/settings')data={community:{name:'Test'},modules:{},permissions:['access','endurance','crews','admin'],roles,crews:{}};
    if(path==='/api/community/setup')data={community:{name:'Test'},siteUrl:'https://site.example',guild:{id:'1',name:'Test',botPresent:true},rolesConfigured:true,discordInviteUrl:''};
    if(path.startsWith('/api/races'))data={events:[]};
    await route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
  });
  await page.goto('/members.html#roles');
  await expect(page.locator('.adm-role:visible strong')).toHaveText(['@everyone','Pilote']);
  await expect(page.locator('.adm-admins')).toContainText('Admin');
  await page.locator('[data-role-add]').selectOption('4');
  await expect(page.locator('.adm-role[data-role="4"]')).toBeVisible();
  await page.locator('.adm-role[data-role="4"] .adm-perm',{hasText:'Accès au site'}).click();
  await expect.poll(()=>puts.at(-1)).toEqual({path:'/api/community/roles/4',input:{permissions:['access']}});
  const remove=page.locator('.adm-role[data-role="2"] [data-role-remove]');
  await remove.click();
  expect(puts).toHaveLength(1);
  await remove.click();
  await expect(page.locator('.adm-role[data-role="2"]')).toBeHidden();
  expect(puts.at(-1)).toEqual({path:'/api/community/roles/2',input:{permissions:[]}});
  await expect(page.locator('[data-role-add] option[value="2"]')).toBeEnabled();
});
