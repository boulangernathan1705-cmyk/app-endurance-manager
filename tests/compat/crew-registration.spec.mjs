import {test,expect} from '@playwright/test';

const EVENT='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',START='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
// Mock all API requests: these flows never change real crews or registrations.
for(const identity of ['member','external'])test(`crew registration: category cards and ${identity} pilot wishes survive adding, removing and saving`,async({page})=>{
  let saved=null;
  const start=Date.now()+86400000;
  const departure={id:START,date:'2090-10-15',time:'09:00',startsAt:start,endsAt:start+14400000,availability:[],crews:[]};
  const event={id:EVENT,name:'Crew regression',format:'endurance',circuit:'portimao',eventType:'private',createdByMe:true,
    categories:['LMP3','LMP2 ELMS','GT3'],durationHours:4,durationMinutes:240,version:1,departures:[departure]};
  await page.route('**/api/**',async route=>{
    const request=route.request(),path=new URL(request.url()).pathname;
    let data={ok:true};
    if(path==='/api/session')data={user:{id:'111111111111111111',name:'Nathan',communityIntroSeen:true},access:'member',discordReady:true,
      permissions:['access','endurance','crews','manage_registrations','manage_races'],community:{id:'test',slug:'test',name:'Test',appearance:{}},communities:[]};
    else if(['/api/events','/api/races'].includes(path))data={events:[event]};
    else if(path==='/api/participants')data={participants:[{id:'222222222222222222',name:'Alex'},{id:'333333333333333333',name:'Bob'}]};
    else if(path.endsWith('/registrations')&&request.method()==='POST'){
      saved=request.postDataJSON();
      departure.availability.push({...saved,id:'cccccccc-cccc-4ccc-8ccc-cccccccccccc',participantId:'dddddddd-dddd-4ddd-8ddd-dddddddddddd',mine:false,canEdit:true,version:1});
      data={id:departure.availability.at(-1).id};
    }else if(path.includes('/notifications'))data={notifications:[],unread:0};
    await route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
  });
  await page.addInitScript(()=>{localStorage.setItem('endurance_manager_locale','fr');document.cookie='em_sim=lmu; Path=/';});
  await page.goto(`/lmu/#event=${EVENT}`);
  // An organiser's race button leads to the « Équipages » page (Nathan 2026-11-01); its « Créer un équipage »
  // opens this same builder, so the test opens it directly on the start.
  await expect(page.locator('[data-action="crews-page"]').first()).toBeAttached();
  await page.evaluate(start=>{const button=document.createElement('button');button.type='button';button.dataset.crewBuilderOpen='';button.dataset.departure=start;button.id='open-builder';document.body.append(button);},START);
  await page.locator('#open-builder').click();
  const crew=page.locator('[data-crew-builder-panel]');
  await crew.getByRole('textbox',{name:'Nom de l’équipage'}).fill('Team test');
  await crew.locator('[data-crew-builder-category="LMP2 ELMS"]').click();
  await crew.getByRole('radio',{name:'Oreca 07 Gibson ELMS',exact:true}).check();
  await crew.getByRole('button',{name:'Continuer',exact:true}).click();
  await crew.getByRole('button',{name:'Inscrire un autre pilote',exact:true}).click();
  const modal=page.locator('[data-registration-modal]');
  await modal.getByRole('combobox',{name:'Pilote',exact:true}).selectOption(identity==='member'?'222222222222222222':'__manual__');
  if(identity==='external')await modal.getByRole('textbox',{name:'Pseudo de l’autre pilote'}).fill('External driver');
  await modal.locator('[name="preferredPilotEntry"]').fill('Bob');
  await modal.getByRole('button',{name:'Ajouter',exact:true}).click();
  await expect(modal.getByRole('button',{name:'Retirer Bob',exact:true})).toBeVisible();
  await modal.locator('[name="preferredPilotEntry"]').fill('Max');
  await modal.locator('[name="preferredPilotEntry"]').press('Enter');
  await modal.getByRole('button',{name:'Retirer Max',exact:true}).click();
  await expect(modal.getByRole('button',{name:'Retirer Max',exact:true})).toHaveCount(0);
  await modal.getByRole('button',{name:'TOUTE LA COURSE',exact:true}).click();
  await expect(modal.getByRole('button',{name:'Retirer Bob',exact:true})).toBeVisible();
  await modal.getByRole('checkbox',{name:'Oreca 07 Gibson ELMS',exact:true}).check();
  await modal.getByRole('textbox',{name:'Commentaire (facultatif)'}).fill('With Bob');
  await modal.getByRole('button',{name:'INSCRIRE LE PILOTE',exact:true}).click();
  await expect.poll(()=>saved).toMatchObject({name:identity==='member'?'Alex':'External driver',preferredPilot:'Bob',comment:'With Bob',category:'LMP2 ELMS',cars:['Oreca 07 Gibson ELMS'],forOther:true});
  expect(saved.participantUserId).toBe(identity==='member'?'222222222222222222':null);
  await expect(modal).toHaveCount(0);
  await expect(crew.locator('[name="builderPilot"]')).toBeChecked();
  await expect(crew).toContainText('Bob');
  await crew.getByRole('button',{name:'Continuer',exact:true}).click();
  await expect(crew.locator('.registration-summary')).toContainText('Team test');
  await expect(crew.locator('.registration-summary')).toContainText('Oreca 07 Gibson ELMS');
  await expect(crew.locator('.registration-summary')).toContainText(identity==='member'?'Alex':'External driver');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
});
