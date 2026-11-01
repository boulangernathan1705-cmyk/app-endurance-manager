import {test,expect} from '@playwright/test';
const EVENT='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
for(const width of [1440,390])test(`stream creation, live card and edit preserve free content at ${width}px`,async({page})=>{
  // The whole flow (create, show, edit again in three steps) runs past 30 s on the emulated iPhone's WebKit.
  test.setTimeout(60000);
  await page.setViewportSize({width,height:1000});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  let events=[],saved=null;
  await page.route('**/api/**',route=>{
    const request=route.request(),pathname=new URL(request.url()).pathname;
    let data={ok:true};
    if(pathname==='/api/session')data={user:{id:'111111111111111111',name:'Streamer',communityIntroSeen:true},access:'member',permissions:['access','admin','create_race','manage_races','endurance','solo_open'],soloRaces:true,eventTdz:false,community:{id:'alpha',slug:'alpha',name:'Alpha',appearance:{}},communities:[]};
    else if(['/api/events','/api/races'].includes(pathname)&&request.method()==='GET')data={events};
    else if((pathname==='/api/races'||pathname===`/api/races/${EVENT}`)&&['POST','PATCH'].includes(request.method())){
      saved=request.postDataJSON();events=[{...saved,id:EVENT,version:(events[0]?.version||0)+1,eventType:'private',createdByMe:true,
        departures:saved.departures.map(start=>({...start,id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',startsAt:Date.parse(`${start.date}T18:00:00Z`),crews:[],availability:[]}))}];data={id:EVENT};
    }else if(pathname.endsWith('/edit-details'))data={details:events[0]?.details};
    else if(pathname.includes('notifications'))data={notifications:[],unread:0};
    return route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
  });
  await page.addInitScript(()=>localStorage.setItem('endurance_manager_locale','fr'));
  await page.goto('/events/');
  await page.getByRole('button',{name:/Annoncer un stream/}).click();
  const form=page.locator('form[data-kind="stream-event"]'),preview=form.locator('[data-stream-card-preview]');
  await expect(form.locator('[name="streamerName"]')).toHaveValue('Streamer');
  await expect(form.locator('select,[name="raceSim"]')).toHaveCount(0);
  // One step at a time, as every creation: the stream, the meeting, the preview of its card.
  await expect(form.locator('[data-stream-step-label]')).toHaveText('Étape 1 sur 3 · Le stream');
  await form.locator('[data-stream-step="next"]').click();
  await expect(form.locator('[data-stream-step-label]')).toHaveText('Étape 1 sur 3 · Le stream');
  await form.locator('[name="eventName"]').fill('Découverte avec le chat');
  await form.locator('[name="streamerName"]').fill('Ma chaîne');
  await form.locator('[name="streamUrl"]').fill('javascript:alert(1)');
  await expect(preview.locator('a')).toHaveCount(0);
  await form.locator('[name="streamUrl"]').fill('https://www.twitch.tv/ma_chaine');
  await form.locator('[data-stream-logo-file]').setInputFiles('images/endurance-manager-logo.webp');
  await expect(form.locator('[data-stream-logo-status]')).toHaveText('Logo prêt.');
  await expect(preview.locator('.stream-logo')).toHaveCount(1);
  const logo=await form.locator('[name="logoUrl"]').inputValue();expect(logo.length).toBeLessThanOrEqual(12000);
  await form.locator('[data-stream-logo-file]').setInputFiles({name:'broken.png',mimeType:'image/png',buffer:Buffer.from('broken')});
  await expect(form.locator('[data-stream-logo-status]')).toContainText('ne peut pas être lue');
  await expect(form.locator('[name="logoUrl"]')).toHaveValue(logo);
  await form.locator('[data-stream-step="next"]').click();
  await expect(form.locator('[data-stream-step-label]')).toHaveText('Étape 2 sur 3 · Le rendez-vous');
  await form.locator('[name="activity"]').fill('Euro Truck Simulator 2');
  await form.locator('[name="description"]').fill('On découvre ensemble.\nTous les jeux sont bienvenus. <b>texte</b>');
  await form.locator('[name="streamDate"]').fill('2090-10-15');
  await expect(preview.locator('.stream-description')).toContainText('<b>texte</b>');
  await expect(preview.locator('.stream-description b')).toHaveCount(0);
  await form.locator('.stream-race-toggle').click();await form.locator('[name="raceTime"]').fill('20:00');
  await expect(preview).toContainText('Départ 20h00');
  await form.locator('.stream-race-toggle').click();await expect(preview).not.toContainText('Départ');
  await expect(form.locator('[name="activity"]')).toBeEnabled();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);
  // No time yet: Continuer stays on this step (last click of the step: the browser's message sits on the time field).
  await form.locator('[data-stream-step="next"]').click();
  await expect(form.locator('[data-stream-step-label]')).toHaveText('Étape 2 sur 3 · Le rendez-vous');
  await form.locator('[name="streamTime"]').fill('19:45');
  await form.locator('[data-stream-step="next"]').click();
  await expect(form.locator('[data-stream-step-label]')).toHaveText('Étape 3 sur 3 · Aperçu');
  await expect(preview).toBeVisible();
  await expect(preview).toContainText('Découverte avec le chat');
  await form.locator('[type="submit"]').click();
  await expect.poll(()=>saved?.details.activity).toBe('Euro Truck Simulator 2');expect(saved.details.isRace).toBe(false);expect(saved.details.raceTime).toBe('');expect(saved.details.logoUrl).toBe(logo);
  await expect(page.locator('.event-list .stream-event-card')).toContainText('On découvre ensemble.');
  await page.getByRole('button',{name:'Découverte avec le chat',exact:true}).click();
  await expect(page.locator('.race-header .stream-logo')).toHaveCount(1);
  await expect(page.locator('.race-header .stream-description')).toContainText('Tous les jeux sont bienvenus.');
  // Reopen via the same production form used by the edit action.
  await page.evaluate(async()=>{const {state}=await import('/front/app/core.mjs');const {renderStreamForm}=await import('/front/app/stream-form.mjs');renderStreamForm(state.events[0]);});
  // Editing opens on the preview; Retour leads to the fields.
  await expect(form.locator('[data-stream-step-label]')).toHaveText('Étape 3 sur 3 · Aperçu');
  await expect(form.locator('[name="activity"]')).toHaveValue('Euro Truck Simulator 2');
  await expect(form.locator('[name="description"]')).toContainText('On découvre ensemble.');
  await form.locator('[data-stream-step="back"]').click();
  await form.locator('[name="activity"]').fill('Discussion');await form.locator('[name="description"]').fill('');
  await form.locator('[data-stream-step="back"]').click();
  await form.locator('[data-stream-logo-remove]').click();await expect(form.locator('[name="logoUrl"]')).toHaveValue('');
  await form.locator('[data-stream-step="next"]').click();await form.locator('[data-stream-step="next"]').click();
  await form.locator('[type="submit"]').click();
  await expect.poll(()=>saved?.details.activity).toBe('Discussion');expect(saved.version).toBe(1);expect(saved.details.logoUrl).toBe('');expect(saved.details.description).toBe('');
  expect(errors).toEqual([]);
});
