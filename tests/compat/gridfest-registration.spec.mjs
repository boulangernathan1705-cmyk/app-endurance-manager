import {test,expect} from '@playwright/test';

const EVENT='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',DEPARTURE='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
// Every request is mocked: these tests never register a pilot or send a real Discord MP.
for(const type of ['Grindfest','Gridfest'])test(`${type}: LMU name and streamer survive steps, recap, editing and submission`,async({page})=>{
  let saved=null;
  const departure={id:DEPARTURE,date:'2090-10-15',time:'21:00',startsAt:Date.now()+86400000,availability:[],crews:[]};
  const event={id:EVENT,name:'Lemans',format:'solo',sim:'lmu',eventType:'private',access:'open',capacity:30,categories:['Hypercar'],circuit:'lemans',
    durationMinutes:40,durationHours:1,version:1,details:{type,streamers:[{id:'alpha',name:'Alpha',capacity:15},{id:'bravo',name:'Bravo',capacity:15}]},
    rounds:[{circuit:'lemans',durationMinutes:30,practice:5,qualifying:5,categories:['Hypercar']}],departures:[departure]};
  await page.route('**/api/**',async route=>{
    const request=route.request(),url=new URL(request.url()),path=url.pathname;
    let data={ok:true};
    if(path==='/api/session')data={user:{id:'111111111111111111',name:'Nathan Boulanger',communityIntroSeen:true},access:'member',permissions:['access','solo_open'],
      discordReady:true,soloRaces:true,eventTdz:true,grindfest:true,soloLabel:'EVENT TDZ',eventTypes:['OPEN','SAFE','Bouboule','Gridfest'],
      community:{id:'tdz',slug:'tdz',name:'TDZ',shortName:'TDZ',appearance:{},discordInviteUrl:'https://discord.gg/tdz-test'},communities:[]};
    else if(['/api/races','/api/events'].includes(path))data={events:url.searchParams.get('scope')==='archived'?[]:[event]};
    else if(path==='/api/participants')data={participants:[]};
    else if(path.endsWith('/registrations')&&request.method()==='POST'){
      saved=request.postDataJSON();
      departure.availability=[{id:'cccccccc-cccc-4ccc-8ccc-cccccccccccc',name:'Nathan Boulanger',gameName:saved.gameName,streamerId:saved.streamerId,
        category:'Hypercar',status:'whole',mine:true,canEdit:true,version:1,roundChoices:saved.choices,waitlistPosition:null}];
      data={id:departure.availability[0].id};
    }else if(path.includes('/notifications'))data={notifications:[],unread:0};
    await route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
  });
  await page.addInitScript(()=>{localStorage.setItem('endurance_manager_locale','fr');document.cookie='em_sim=lmu; Path=/';});
  await page.goto(`/lmu/#event=${EVENT}`);
  await page.locator('[data-action="my-registration"]').first().click();
  const form=page.locator('form[data-kind="registration"]');
  await expect(form).toHaveClass(/registration-stepper/);
  await expect(form.locator('[name="gridfestGameName"]')).toBeVisible();
  await expect(form.locator('[name="gridfestGameName"]')).toHaveAttribute('required','');
  await expect(form.locator('[name="registrationStreamer"]')).toBeVisible();
  await form.locator('[name="gridfestGameName"]').fill('Nathan LMU');
  await form.locator('[name="registrationStreamer"]').selectOption('bravo');
  await form.getByRole('button',{name:'Continuer',exact:true}).click();
  await expect(form.locator('.registration-step-label')).toContainText('Étape 2 sur 2');
  const summary=form.locator('.registration-summary');
  await expect(summary).toContainText('Nathan Boulanger');
  await expect(summary).toContainText('Nathan LMU');
  await expect(summary).toContainText('Bravo');
  await expect(summary).toContainText('Hypercar');
  await summary.locator('.registration-summary-row').filter({hasText:'Nom sur LMU'}).click();
  await expect(form.locator('[name="gridfestGameName"]')).toHaveValue('Nathan LMU');
  await expect(form.locator('[name="registrationStreamer"]')).toHaveValue('bravo');
  await form.getByRole('button',{name:'Revenir au récapitulatif',exact:true}).click();
  await form.getByRole('button',{name:'JE PARTICIPE',exact:true}).click();
  await expect.poll(()=>saved).toMatchObject({name:'Nathan Boulanger',gameName:'Nathan LMU',streamerId:'bravo'});
  await expect(form).toHaveCount(0);
  expect(saved.choices).toMatchObject([{category:'Hypercar'}]);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
});
