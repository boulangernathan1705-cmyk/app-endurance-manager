import {test,expect} from '@playwright/test';

async function admin(page) {
  const calls=[];
  await page.route('**/api/**',async route=>{
    const path=new URL(route.request().url()).pathname;
    let data={ok:true};
    if(path==='/api/session')data={user:{id:'100000000000000001',name:'Nathan',role:'admin',communityIntroSeen:true},access:'member',permissions:['access','admin'],community:{name:'Ma communauté',shortName:'MC',slug:'test',appearance:{palette:'cyan',defaultMode:'dark'}},communities:[]};
    if(path==='/api/members')data={members:[],permissions:['access','admin']};
    if(path==='/api/community/settings')data={community:{name:'Ma communauté',shortName:'MC',palette:'cyan',defaultMode:'dark'},modules:{},permissions:['access','admin'],roles:[],crews:{}};
    if(path==='/api/community/setup')data={community:{name:'Ma communauté'},siteUrl:'https://site.example',guild:{id:'900000000000000001',name:'Ma communauté',botPresent:true},rolesConfigured:true};
    if(path==='/api/community/appearance')calls.push(route.request().postDataJSON());
    await route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
  });
  await page.goto('/members.html');
  await page.getByRole('tab',{name:'Apparence',exact:true}).click();
  return calls;
}
test('ten constrained palettes, independent live preview, save and personal mode persistence',async({page})=>{
  const calls=await admin(page);
  await expect(page.locator('input[name="palette"]')).toHaveCount(10);
  await page.locator('label.palette-choice').filter({hasText:'Violet'}).click();
  await page.locator('.mode-choices label').filter({hasText:'Clair'}).click();
  await expect(page.locator('[data-look-preview]')).toHaveAttribute('data-preview-mode','light');
  await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
  await expect(page.locator('[data-look-preview]')).toHaveCSS('--preview-accent','#7442ba');
  await page.locator('form[data-appearance]').getByRole('button',{name:'Enregistrer',exact:true}).click();
  await expect(page.locator('form[data-appearance] .settings-status')).toContainText('enregistrée');
  expect(calls).toEqual([{name:'Ma communauté',shortName:'MC',palette:'violet',defaultMode:'light'}]);
  await expect(page.locator('html')).toHaveAttribute('data-theme','light');
  await page.getByRole('button',{name:'Passer en mode sombre',exact:true}).click();
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
  await page.getByRole('button',{name:'Passer en mode clair',exact:true}).click();
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme','light');
  // The navigation and the ten colour choices fit small phone viewports too.
  await page.getByRole('tab',{name:'Apparence',exact:true}).click();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth+1)).toBe(true);
});
