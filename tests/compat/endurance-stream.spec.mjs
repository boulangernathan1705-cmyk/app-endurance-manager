import {test,expect} from '@playwright/test';
// « Je streame ce départ » (Nathan 2026-11-02): an admin entering himself on an endurance says he streams the start.
const EVENT='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',START='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
for(const admin of [true,false])test(`endurance entry: stream choice ${admin?'offered to an admin':'hidden from a pilot'}`,async({page})=>{
  let saved=null;
  const start=Date.parse('2090-10-15T18:00:00Z');
  const departure={id:START,date:'2090-10-15',time:'20:00',startsAt:start,endsAt:start+3*3600000,availability:[],crews:[]};
  const event={id:EVENT,name:'3h de Spa',format:'endurance',circuit:'spa',eventType:'private',categories:['GT3'],durationHours:3,durationMinutes:180,version:1,absences:[],createdByMe:true,departures:[departure]};
  await page.route('**/api/**',async route=>{
    const request=route.request(),path=new URL(request.url()).pathname;let data={ok:true};
    if(path==='/api/session')data={user:{id:'111111111111111111',name:'Streamer',communityIntroSeen:true},access:'member',discordReady:true,communityStreamUrl:'https://www.twitch.tv/lapraline_tdz',
      permissions:['access','endurance',...(admin?['admin']:[])],community:{id:'test',slug:'test',name:'Test',appearance:{}},communities:[]};
    else if(['/api/events','/api/races'].includes(path))data={events:[event]};
    else if(path==='/api/participants')data={participants:[]};
    else if(path.endsWith('/registrations')&&request.method()==='POST'){saved=request.postDataJSON();data={id:'cccccccc-cccc-4ccc-8ccc-cccccccccccc'};}
    else if(path.includes('/notifications'))data={notifications:[],unread:0};
    await route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
  });
  await page.addInitScript(()=>{localStorage.setItem('endurance_manager_locale','fr');document.cookie='em_sim=lmu; Path=/';});
  await page.goto(`/lmu/#event=${EVENT}`);
  await page.getByRole('button',{name:/M’inscrire|M'inscrire/}).first().click();
  const form=page.locator('form[data-kind="registration"]');
  // Each choice moves on by itself (Nathan 2026-11-03): category → cars, « Peu importe » → hours, « Toute la course » → summary.
  await form.locator('[data-action="category"]').first().click();
  await form.locator('[name="carAny"]').check();
  await form.locator('[data-action="availability"][data-value="whole"]').click();
  await expect(form.locator('.registration-step-label')).toContainText('Récapitulatif');
  const box=form.locator('[data-registration-stream]');
  if(!admin){await expect(box).toHaveCount(0);return;}
  await expect(form.locator('[data-registration-stream-times]')).toBeHidden();
  await expect(box).toContainText('📺 Je streame ce départ');
  await box.locator('[name="registrationStream"]').check();
  await expect(form.locator('[data-registration-stream-times]')).toBeVisible();
  await expect(form.locator('[name="registrationStreamStart"]')).toHaveValue('20:00');
  await expect(form.locator('[name="registrationStreamEnd"]')).toHaveValue('23:30');
  await expect(box).toContainText('twitch.tv/lapraline_tdz');
  await form.locator('[name="registrationStreamStart"]').locator('xpath=..').locator('[data-clock-minute]').selectOption('45');
  await form.locator('[name="registrationStreamStart"]').locator('xpath=..').locator('[data-clock-hour]').selectOption('19');
  await form.locator('button[type="submit"]').click();
  await expect.poll(()=>saved).not.toBeNull();
  expect(saved.stream).toEqual({start:'19:45',end:'23:30'});
});
