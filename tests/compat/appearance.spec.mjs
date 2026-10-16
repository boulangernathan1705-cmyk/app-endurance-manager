import {test,expect} from '@playwright/test';

async function admin(page) {
  const calls=[];
  await page.route('**/api/**',async route=>{
    const path=new URL(route.request().url()).pathname;
    let data={ok:true};
    if(path==='/api/session')data={user:{id:'100000000000000001',name:'Nathan',role:'admin',communityIntroSeen:true},access:'member',permissions:['access','admin'],community:{name:'Ma communauté',shortName:'MC',slug:'test',appearance:{palette:'endurance',defaultMode:'dark'}},communities:[]};
    if(path==='/api/members')data={members:[],permissions:['access','admin']};
    if(path==='/api/community/settings')data={community:{name:'Ma communauté',shortName:'MC',palette:'endurance',defaultMode:'dark'},modules:{},permissions:['access','admin'],roles:[],crews:{}};
    if(path==='/api/community/setup')data={community:{name:'Ma communauté'},siteUrl:'https://site.example',guild:{id:'900000000000000001',name:'Ma communauté',botPresent:true},rolesConfigured:true};
    if(path==='/api/community/appearance')calls.push(route.request().postDataJSON());
    await route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
  });
  await page.goto('/members.html');
  await page.getByRole('tab',{name:'Apparence',exact:true}).click();
  return calls;
}
test('curated racing themes, independent live preview, save and personal mode persistence',async({page})=>{
  const calls=await admin(page);
  await expect(page.locator('input[name="palette"]')).toHaveCount(11);
  await page.locator('label.palette-choice').filter({has:page.locator('input[value="redbull"]')}).click();
  await page.locator('.mode-choices label').filter({hasText:'Clair'}).click();
  await expect(page.locator('[data-look-preview]')).toHaveAttribute('data-preview-mode','light');
  await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
  await expect(page.locator('[data-look-preview]')).toHaveCSS('--preview-accent','#465372');
  await page.locator('form[data-appearance]').getByRole('button',{name:'Enregistrer',exact:true}).click();
  await expect(page.locator('form[data-appearance] .settings-status')).toContainText('enregistrée');
  expect(calls).toEqual([{name:'Ma communauté',shortName:'MC',palette:'redbull',defaultMode:'light'}]);
  await expect(page.locator('html')).toHaveAttribute('data-theme','light');
  await page.getByRole('button',{name:'Passer en mode sombre',exact:true}).click();
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
  await page.getByRole('button',{name:'Passer en mode clair',exact:true}).click();
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme','light');
  // The navigation and the theme choices fit small phone viewports too.
  await page.getByRole('tab',{name:'Apparence',exact:true}).click();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth+1)).toBe(true);
});

// Use the actual event renderer: a light page must never retain a dark Gridfest background.
for (const mode of ['light','dark']) test(`pastel ${mode}: rally and Gridfest keep the same readable race surfaces`,async({page})=>{
  const base={format:'solo',sim:'lmu',eventType:'private',access:'open',capacity:30,categories:['Hypercar'],circuit:'lemans',durationMinutes:60,durationHours:1,version:1,
    rounds:[{circuit:'lemans',durationMinutes:60,categories:['Hypercar']}],departures:[{id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',date:'2090-10-15',time:'21:00',startsAt:Date.now()+86400000,availability:[],crews:[]}]};
  const events=[{...base,id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',name:'Gridfest',details:{type:'Gridfest',streamers:[{id:'alpha',name:'Alpha',capacity:30}]}},
    {...base,id:'cccccccc-cccc-4ccc-8ccc-cccccccccccc',name:'Alsace',sim:'acrally',details:{type:'OPEN'}}];
  await page.route('**/api/**',async route=>{
    const url=new URL(route.request().url()),path=url.pathname;
    let data={ok:true};
    if(path==='/api/session')data={user:{id:'111111111111111111',name:'Nathan',communityIntroSeen:true},access:'member',permissions:['access','solo_open'],discordReady:true,soloRaces:true,eventTdz:true,grindfest:true,eventTypes:['OPEN','SAFE','Gridfest'],
      community:{id:'test',slug:'test',name:'Test',shortName:'Test',appearance:{palette:'redbull',defaultMode:mode}},communities:[]};
    else if(['/api/races','/api/events'].includes(path))data={events:url.searchParams.get('scope')==='archived'?[]:events};
    else if(path==='/api/participants')data={participants:[]};
    else if(path.includes('/notifications'))data={notifications:[],unread:0};
    await route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
  });
  await page.addInitScript(()=>{localStorage.setItem('endurance_manager_locale','fr');document.cookie='em_sim=lmu; Path=/';});
  await page.goto('/lmu/#solo');
  const gridfest=page.locator('.race-card.is-gridfest'),rally=page.locator('.race-card.sim-acrally');
  await expect(gridfest).toBeVisible();await expect(rally).toBeVisible();
  const paints=await page.locator('.race-card').evaluateAll(cards=>cards.map(card=>{
    const style=getComputedStyle(card),name=getComputedStyle(card.querySelector('.event-name'));
    return {background:style.backgroundColor,image:style.backgroundImage,text:name.color};
  }));
  expect(paints[0].background).toBe(paints[1].background);
  for(const paint of paints){expect(paint.image).toBe('none');expect(paint.text).not.toBe(paint.background);}
  const fills=await page.locator('.event-sim-badge').evaluateAll(badges=>badges.map(badge=>getComputedStyle(badge).backgroundColor));
  expect(new Set(fills).size).toBe(1);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth+1)).toBe(true);
});
