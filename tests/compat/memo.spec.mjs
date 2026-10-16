import {test,expect} from '@playwright/test';

const scope={circuit:'spa',layout:'Spa WEC',car:'Toyota GR010 Hybrid',weather:'dry',compound:'Medium',gameVersion:'test-v1'};
const metrics={fuelLitres:{value:3,pilots:3,observations:60,min:2.8,max:3.2},energyPercent:{value:4.2,pilots:3,observations:60,min:4,max:4.4},lapSeconds:{value:120,pilots:3,observations:60,min:119,max:121}};
async function setup(page,{contributing=false,empty=false}={}) {
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/api/**',async route=>{
    const path=new URL(route.request().url()).pathname;
    let data={ok:true};
    if(path==='/api/session')data={user:{id:'100000000000000001',name:'Pilot',role:'pilot',communityIntroSeen:true},access:'member',permissions:['access'],memo:true,community:{name:'Ma communauté',shortName:'MC',appearance:{palette:'cyan',defaultMode:'dark'}},communities:[]};
    if(path==='/api/notifications')data={notifications:[],unread:0};
    if(path==='/api/memo')data={contributing,scopes:[scope],reference:null,connectorReady:false,link:null};
    if(path==='/api/memo/sheet')data={scope,contributing,personal:contributing?{fuelLitres:{value:3,observations:20},energyPercent:{value:4.2,observations:20},lapSeconds:{value:120,observations:20}}:null,collective:{pilots:empty?0:3,metrics:empty?{}:metrics},latest:null,pit:empty?null:{source:'Test fixture, not live data',verifiedAt:1792134000,pitTransit:50,pitLoss:30,services:{fuel:{after:[],basis:'litres',fixed:1,perUnit:1},tyres4:{after:['fuel'],seconds:12},driver:{after:[],seconds:42}}}};
    await route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
  });
  await page.goto('/memo.html');await expect(page.getByRole('heading',{name:'Services au stand'})).toBeVisible();
  return errors;
}

test('memo stop calculator handles concurrent swap, tabs and mobile layout',async({page})=>{
  const errors=await setup(page,{contributing:true});
  await page.locator('#memo-pit-form input[name="quantity"]').fill('5');
  await page.locator('#memo-pit-form select[name="tyres"]').selectOption('tyres4');
  await page.locator('#memo-pit-form input[name="driver"]').check();
  await expect(page.locator('#memo-pit-result')).toContainText('42 s');
  await expect(page.locator('#memo-pit-result')).toContainText('72 s');
  await page.getByRole('tab',{name:'Relais',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Les chiffres par tour'})).toBeVisible();
  await expect(page.locator('#memo-relays')).toContainText('Moyenne des autres');
  await page.locator('#memo-autonomy-form input[name="fuel"]').fill('75');
  await page.locator('#memo-autonomy-form input[name="energy"]').fill('100');
  await expect(page.locator('#memo-autonomy-result')).toContainText('23');
  await expect(page.locator('#memo-autonomy-result')).toContainText('46 min');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBeTruthy();
  await page.getByRole('tab',{name:'Relais',exact:true}).press('ArrowLeft');
  await expect(page.getByRole('tab',{name:'Stands',exact:true})).toBeFocused();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBeTruthy();
  expect(errors).toEqual([]);
});

test('memo empty state shows no invented values or personal column for readers',async({page})=>{
  const errors=await setup(page,{empty:true});
  await expect(page.locator('#memo-stands')).toContainText('Aucune valeur supposée');
  await page.locator('#memo-pit-form select[name="tyres"]').selectOption('tyres4');
  await expect(page.locator('#memo-pit-result')).toContainText('Calcul incomplet');
  await page.getByRole('tab',{name:'Relais',exact:true}).click();
  await expect(page.locator('#memo-relays')).toContainText('Pas encore de mesures');
  await expect(page.locator('#memo-relays th').filter({hasText:'Mes données'})).toHaveCount(0);
  await expect(page.locator('#memo-sharing')).toContainText('validation sur PC');
  await page.locator('select[name="circuit"]').selectOption('le-mans');
  await expect(page.locator('#memo-load-status')).toBeEmpty();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBeTruthy();
  expect(errors).toEqual([]);
});
