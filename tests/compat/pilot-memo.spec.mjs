import {test,expect} from '@playwright/test';

const crewId='00000000-0000-4000-8000-000000000012', raceId='00000000-0000-4000-8000-000000000013';
const combo={track:'Spa-Francorchamps',car:'Ferrari 499P',laps:20,drivers:2};
const here={access:'member',user:{id:'1',name:'Nathan'},permissions:['access','combos'],combos:true,community:{id:'memo-ci',slug:'fmt',name:'FMT'}};
const empty={laps:0,drivers:[],moments:{day:0,night:0},compounds:{},endurance:{drivers:[],compounds:{}}};
const measured={laps:10,avg:125,q25:124.5,q75:125.5,best:123,slope:0.1,ve:7,fuel:6,wear:[1,1,1,1],temp:[],kpa:[],brake:[]};
const sheet={
  combo:{...combo,capacity:90},race:{id:raceId,name:'6 h de Spa'},notes:[],canManageNotes:true,canManagePeriods:false,
  periods:{events:[],versions:[]},setups:[],sample:{laps:20,drivers:2,sessions:2,from:1790000000000,to:1790000000000},
  pit:{stops:1,laneThrough:20,service:{fuelRate:2,energyRate:2,connect:2,tyres4:20,driver:0}},
  drivers:[{id:'1',name:'Nathan',me:true},{id:'2',name:'Lucas'}],
  conditions:{dry:{laps:20,trackTemp:[25,30],moments:{day:20,night:0},
    drivers:[{...measured,id:'1'},{...measured,id:'2',ve:8}],
    compounds:{Medium:{laps:20,drivers:[{...measured,id:'1'},{...measured,id:'2'}]}},endurance:{drivers:[{...measured,id:'1'},{...measured,id:'2',ve:8}],compounds:{Medium:{laps:20,drivers:[{...measured,id:'1'},{...measured,id:'2'}]}}}},damp:empty,rain:empty}
};

test('pilot memo opens on the race and crew, saves preparation filters, and loads heavy data on demand',async({page})=>{
  let history=0, installs=0, links=0, notes=[];
  await page.route(url=>url.pathname==='/api/session',route=>route.fulfill({json:here}));
  await page.route(url=>url.pathname==='/downloads/simhub/v0/plugin.json',route=>{installs++;return route.fulfill({json:{version:'0.2.3'}});});
  await page.route(url=>url.pathname.startsWith('/api/combos'),route=>{
    const path=new URL(route.request().url()).pathname;
    if(path==='/api/combos/link'){links++;return route.fulfill({json:{linked:true}});}
    if(path==='/api/combos')return route.fulfill({json:{combos:[combo],preferenceScope:'memo-ci:1'}});
    if(path==='/api/combos/crew')return route.fulfill({json:{id:crewId,name:'FMT #1',circuit:'spa',car:combo.car,members:['1']}});
    if(path==='/api/combos/sheet')return route.fulfill({json:{...sheet,notes}});
    if(path==='/api/combos/history'){history++;return route.fulfill({json:{stints:[],stops:[{pilot:'1',at:1790000000000,lap:8,lane:60,stopped:40,fuel:83,ve:0,tyres:4,repair:false}]}});}
    if(path==='/api/combos/notes'){
      const data=route.request().postDataJSON();
      notes=[{...data,id:crewId,author:'Nathan',createdAt:1790000000,mine:true,pinned:false}];
      return route.fulfill({status:201,json:notes[0]});
    }
    return route.fulfill({status:404,json:{}});
  });
  await page.goto('/simhub.html?circuit=spa&car=Ferrari+499P&crew='+crewId+'&race='+raceId+'#memo');
  const prep=page.locator('.cb-prep');
  await expect(prep).toContainText('6 h de Spa');
  await expect(page.getByLabel('Périmètre des statistiques')).toHaveValue('crew');
  await expect(page.getByRole('button',{name:'Statistiques',exact:true})).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Analyse',exact:true})).toHaveCount(0);
  await expect(prep).toContainText('2:05,000');
  await expect(prep).toContainText('2:04,500 – 2:05,500');
  await expect(prep.locator('.cb-wheel-diagram')).toHaveCount(0);
  await expect(prep.locator('.cb-relay-bars .cb-meter')).toHaveCount(3);
  await expect(prep.locator('[data-field=tyreInitial]')).toHaveCount(0);
  await expect(prep.locator('[data-fold=memo-notes]')).not.toHaveAttribute('open','');
  const initialViewport=page.viewportSize();
  for(const size of [{width:1920,height:1080},{width:1366,height:900}]){
    await page.setViewportSize(size);
    const panels=await prep.locator('.cb-memo-panel').evaluateAll(nodes=>nodes.map(node=>{const r=node.getBoundingClientRect();return {x:r.x,y:r.y,bottom:r.bottom};}));
    expect(panels).toHaveLength(4);
    expect(Math.abs(panels[0].y-panels[1].y)).toBeLessThanOrEqual(1);
    expect(Math.abs(panels[2].y-panels[3].y)).toBeLessThanOrEqual(1);
    expect(panels[1].x).toBeGreaterThan(panels[0].x);
    expect((await prep.locator('.cb-memo-footer').boundingBox()).y+(await prep.locator('.cb-memo-footer').boundingBox()).height).toBeLessThanOrEqual(size.height);
  }
  if(initialViewport)await page.setViewportSize(initialViewport);
  await expect(page.locator('.cb-overview')).toBeVisible();
  await expect(page.locator('.cb-context > .cb-drivers')).toHaveCount(0);
  await expect(prep).toContainText('Nathan');
  await expect(prep).not.toContainText('Lucas');
  expect(history).toBe(0);
  expect(links).toBe(1);
  await page.getByLabel('Périmètre des statistiques').selectOption('all');
  await expect(prep).toContainText('Lucas');
  await prep.getByLabel('Réserve du plein (%)').fill('10');
  await prep.getByLabel('Réserve du plein (%)').press('Tab');
  await expect(prep).toContainText('réserve 10 %');
  await expect(page).toHaveURL(/reserve=10/);
  await page.getByRole('button',{name:'Ajouter aux favoris'}).click();
  await page.reload();
  await expect(page.getByRole('button',{name:'Retirer des favoris'})).toBeVisible();
  await expect(prep).toContainText('réserve 10 %');
  await page.locator('[data-fold=memo-notes] > summary').click();
  await page.getByText('+ Nouvelle note',{exact:true}).click();
  await page.getByLabel('Thème').selectOption('tyres');
  await page.getByLabel('Portée').selectOption(raceId);
  await page.getByLabel('Nouvelle note').fill('Pressions à froid');
  await page.getByRole('button',{name:'Ajouter la note'}).click();
  await expect(page.getByText('Pressions à froid')).toBeVisible();
  expect(notes[0]).toMatchObject({eventId:raceId,theme:'tyres'});
  await expect(prep.getByText('Temps aux stands',{exact:true})).toBeVisible();
  await expect(prep.getByText('Plein + 4 pneus',{exact:true})).toBeVisible();
  expect(history).toBe(0);
  expect(installs).toBeGreaterThan(0);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  await page.setViewportSize({width:390,height:844});
  await expect(page.locator('.cb-overview')).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  await page.emulateMedia({media:'print'});
  await expect(prep).toBeVisible();
  await expect(prep.locator('.cb-print-context')).toHaveText('Spa-Francorchamps · Ferrari 499P · Sec');
  await expect(page.getByText('Notes de l’équipe',{exact:true})).toBeHidden();
});

test('memo circuit picker loads parent artwork and selects the exact layout',async({page})=>{
  const variants=[['Monza','monza'],['Monza Curva Grande Circuit','monza'],['Paul Ricard - ELMS','paul-ricard'],['Sebring School Circuit','sebring'],['Circuit de la Sarthe','le-mans'],['Spa-Francorchamps','spa'],['Fuji Speedway','fuji']];
  const items=[...variants.map(([track])=>({...combo,track})),{...combo,track:'Unknown layout'}];
  const requests=[];
  await page.route(url=>url.pathname==='/api/session',route=>route.fulfill({json:here}));
  await page.route(url=>url.pathname==='/api/combos/link',route=>route.fulfill({json:{linked:true}}));
  await page.route(url=>url.pathname==='/api/combos',route=>route.fulfill({json:{combos:items,preferenceScope:'artwork-test'}}));
  await page.route(url=>url.pathname==='/api/combos/sheet',route=>{
    const params=new URL(route.request().url()).searchParams;
    requests.push(Object.fromEntries(params));
    return route.fulfill({json:{...sheet,combo:{...combo,track:params.get('track')}}});
  });
  await page.goto('/simhub.html#memo');
  await page.locator('[data-picker=track]').click();
  const box=page.getByRole('dialog');
  await expect(box.locator('[data-track-choice]')).toHaveCount(items.length);
  for(const [track,id] of variants){
    const img=box.locator(`[data-track-choice="${track}"] .cb-tile-art img`);
    await img.scrollIntoViewIfNeeded();
    await expect(img).toHaveAttribute('src',`/images/endurance/lmu-pano/${id}.webp`);
    await expect.poll(()=>img.evaluate(node=>node.complete && node.naturalWidth>0)).toBe(true);
  }
  await expect(box.locator('[data-track-choice="Unknown layout"] .cb-tile-art img')).toHaveCount(0);
  await box.locator('[data-track-choice="Monza Curva Grande Circuit"]').click();
  await expect(page.locator('[data-picker=track]')).toContainText('Monza Curva Grande Circuit');
  expect(requests.at(-1)).toMatchObject({track:'Monza Curva Grande Circuit',car:combo.car});
  await expect(page.locator('[data-picker=track] .cb-tile-art img')).toHaveAttribute('src','/images/endurance/lmu-pano/monza.webp');
});

test('memo car picker loads LMU liveries and keeps category fallbacks',async({page})=>{
  const cars=[['Ferrari 499P','Hypercar','ferrari-499p'],['Oreca 07 Gibson ELMS','LMP2','oreca-elms'],['Ferrari 296 LMGT3','LMGT3','ferrari-296'],['Ferrari 488 GTE','GTE','ferrari-488'],['Unknown prototype','Hypercar',null],['Unknown GT','LMGT3',null]];
  const items=cars.map(([car,carClass])=>({...combo,car,carClass}));
  await page.route(url=>url.pathname==='/api/session',route=>route.fulfill({json:here}));
  await page.route(url=>url.pathname==='/api/combos/link',route=>route.fulfill({json:{linked:true}}));
  await page.route(url=>url.pathname==='/api/combos',route=>route.fulfill({json:{combos:items,preferenceScope:'car-artwork-test'}}));
  await page.route(url=>url.pathname==='/api/combos/sheet',route=>route.fulfill({json:sheet}));
  await page.goto('/simhub.html#memo');
  await expect(page.locator('[data-picker=car] .cb-tile-art img')).toHaveAttribute('src','/images/memo-cars/ferrari-499p.webp');
  await page.locator('[data-picker=car]').click();
  const box=page.getByRole('dialog');
  for(const [car,carClass,id] of cars){
    const img=box.getByRole('button',{name:new RegExp(car)}).locator('.cb-tile-art img');
    await img.scrollIntoViewIfNeeded();
    await expect(img).toHaveAttribute('src',id?`/images/memo-cars/${id}.webp`:carClass==='Hypercar'?'/images/memo-prototype.svg':'/images/memo-gt.svg');
    await expect.poll(()=>img.evaluate(node=>node.complete && node.naturalWidth>0)).toBe(true);
  }
});

test('disabled memo hides pilot navigation and never fetches downloads, sheet or wall data',async({page})=>{
  const paths=[];
  await page.route(url=>url.pathname==='/api/session',route=>route.fulfill({json:{...here,combos:false}}));
  await page.route(url=>url.pathname.startsWith('/api/combos') || url.pathname.startsWith('/downloads/simhub'),route=>{
    paths.push(new URL(route.request().url()).pathname);
    return route.fulfill({status:404,json:{error:'Fermé'}});
  });
  await page.goto('/simhub.html?circuit=spa#mur');
  await expect(page.locator('#simhub-gate')).toContainText('Cet espace n’est pas disponible.');
  await expect(page.getByRole('link',{name:'Retour aux courses'})).toBeVisible();
  await expect(page.getByRole('tab',{name:'Fiche mémo'})).toBeHidden();
  await expect(page.locator('.nav-plugin-button')).toBeHidden();
  expect(paths).toEqual(['/api/combos/link']);
});

test('chooses an available pair explicitly and applies advanced filters in one request',async({page})=>{
  const requests=[];
  const monza={...combo,track:'Monza',car:'Oreca 07 Gibson'};
  await page.route(url=>url.pathname==='/api/session',route=>route.fulfill({json:here}));
  await page.route(url=>url.pathname==='/api/combos/link',route=>route.fulfill({json:{linked:true}}));
  await page.route(url=>url.pathname==='/api/combos',route=>route.fulfill({json:{combos:[combo,monza],preferenceScope:'picker-test'}}));
  await page.route(url=>url.pathname==='/api/combos/sheet',route=>{
    const params=new URL(route.request().url()).searchParams;
    requests.push(Object.fromEntries(params));
    return route.fulfill({json:{...sheet,combo:params.get('track')==='Monza'?monza:combo}});
  });
  await page.goto('/simhub.html#memo');
  const box=page.getByRole('dialog');
  await page.locator('[data-picker=track]').click();
  await box.getByRole('searchbox').fill('mon');
  await expect(box.locator('[data-track-choice]')).toHaveCount(1);
  await box.getByRole('button',{name:/Monza/}).click();
  await expect(box.getByRole('heading',{name:'Choisir une voiture'})).toBeVisible();
  expect(requests).toHaveLength(1);
  await box.getByRole('button',{name:'Fermer'}).click();
  await expect(page.locator('[data-picker=track]')).toContainText(combo.track);
  await page.locator('[data-picker=track]').click();
  await box.getByRole('button',{name:/Monza/}).click();
  await box.getByRole('button',{name:/Oreca/}).click();
  await expect(page).toHaveURL(/track=Monza/);
  expect(requests.at(-1)).toMatchObject({track:'Monza',car:monza.car});
  await page.getByRole('button',{name:/Filtres avancés/}).click();
  await box.getByLabel('Température de piste minimale').fill('18');
  await box.getByLabel('Température de piste maximale').fill('30');
  expect(requests).toHaveLength(2);
  await box.getByRole('button',{name:'Appliquer'}).click();
  await expect(page).toHaveURL(/tmin=18/);
  expect(requests).toHaveLength(3);
  await page.getByRole('button',{name:/Filtres avancés/}).click();
  await box.getByRole('button',{name:'Réinitialiser'}).click();
  await box.getByRole('button',{name:'Fermer'}).click();
  expect(requests).toHaveLength(3);
  await expect(page).toHaveURL(/tmax=30/);
  await page.getByLabel('Autres actions').click();
  await page.getByRole('button',{name:'Accès rapides'}).click();
  await box.getByRole('button',{name:/Ferrari/}).click();
  await expect(page.locator('[data-picker=track]')).toContainText(combo.track);
});
