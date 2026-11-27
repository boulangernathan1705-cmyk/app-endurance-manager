import {test,expect} from '@playwright/test';
const start=Date.now()+3600000;
const title='Audit & essais <GT3> « chrono »';
const id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', departureId='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
async function setup(page) {
  let entries=1, reads=0;
  await page.clock.install();
  await page.route('**/api/**',route=>{
    const url=new URL(route.request().url());
    let data={ok:true};
    if(url.pathname==='/api/session') data={access:'member',user:{id:'1',name:'Compte de test',communityIntroSeen:true},permissions:['access','endurance','crews'],crewRequests:[],community:{id:'fake',name:'Test',slug:'test',appearance:{}}};
    if(url.pathname==='/api/participants') data={participants:[]};
    if(url.pathname==='/api/crew-requests') data={requests:[]};
    if(url.pathname.includes('notifications')) data={notifications:[],unread:0};
    if(['/api/races','/api/events'].includes(url.pathname)){
      if(url.searchParams.get('game')==='iracing') data={events:[]};
      else {
        reads++;
        data={events:[{id,name:title,format:'endurance',circuit:'spa',eventType:'private',categories:['GT3'],durationHours:2,durationMinutes:120,version:1,
          departures:[{id:departureId,date:new Date(start).toISOString().slice(0,10),time:'12:00',startsAt:start,endsAt:start+7200000,crews:[],availability:Array.from({length:entries},(_,i)=>({id:'reg'+i,participantId:'p'+i,name:'Pilote de test '+(i+1),category:'GT3',status:'whole'}))}]}]};
      }
    }
    return route.fulfill({json:data});
  });
  return {reads:()=>reads,add:()=>{entries++;}};
}
test('Équipages refreshes after a minute and retains collapsed departures',async({page})=>{
  const mock=await setup(page);
  await page.goto('/lmu/#equipages');
  await expect(page.getByRole('heading',{name:'ÉQUIPAGES',exact:true})).toBeVisible();
  await expect(page.getByText('1 sans équipage',{exact:true})).toBeVisible();
  const departure=page.locator('.crews-start').first();
  await departure.locator('summary').evaluate(summary=>summary.click());
  await expect(departure).not.toHaveAttribute('open','');
  const initial=mock.reads();
  mock.add();
  await page.clock.fastForward(65000);
  await expect(page.getByText('2 sans équipage',{exact:true})).toBeVisible();
  expect(mock.reads()).toBe(initial+1);
  await expect(departure).not.toHaveAttribute('open','');
});
test('the error dialog keeps focus, closes on Escape and restores focus',async({page})=>{
  await setup(page);
  await page.goto('/lmu/#event='+id);
  await expect(page.getByRole('heading',{name:title,exact:true})).toBeVisible();
  const help=page.locator('[data-context-help]').first();
  await help.focus();
  await page.evaluate(async title=>(await import('/front/app/core.mjs')).showError(new Error(title)),title);
  const dialog=page.getByRole('alertdialog');
  await expect(dialog.getByText(title,{exact:true})).toBeVisible();
  const close=dialog.getByRole('button');
  await expect(close).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(close).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(close).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(help).toBeFocused();
});

test('a newer build reloads once the pilot finishes editing',async({page})=>{
  await setup(page);
  let releaseVersion;
  const versionGate=new Promise(resolve=>{releaseVersion=resolve;});
  let notices=0;
  await page.route('**/front/version.json',async route=>{
    if(++notices===1)await versionGate;
    await route.fulfill({json:{build:'compat-next-build'}});
  });
  await page.goto('/lmu/#equipages');
  await expect(page.getByRole('heading',{name:'ÉQUIPAGES',exact:true})).toBeVisible();

  const checking=page.waitForRequest('**/front/version.json');
  await page.clock.fastForward(65000);
  await checking;
  const draft=await page.evaluateHandle(()=>{
    const input=document.createElement('input');
    document.body.append(input);
    input.focus();
    input.value='Saisie en cours';
    return input;
  });
  const versionReceived=page.waitForResponse('**/front/version.json');
  releaseVersion();
  await versionReceived;
  await expect.poll(()=>draft.evaluate(input=>input.value)).toBe('Saisie en cours');
  await draft.evaluate(input=>input.blur());

  const reloaded=page.waitForEvent('framenavigated',frame=>frame===page.mainFrame());
  await page.clock.fastForward(65000);
  await reloaded;
  await expect(page.getByRole('heading',{name:'ÉQUIPAGES',exact:true})).toBeVisible();
});
