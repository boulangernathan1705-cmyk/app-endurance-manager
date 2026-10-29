import {test,expect} from '@playwright/test';
import {eveningDemo} from '../../shared/discord-evening-demo.mjs';

test('an administrator can send this exact concept to the selected channel only after clicking',async ({page})=>{
  const channel='1558551791824805949',guild='900000000000000001',message='900000000000000002',sent=[];
  await page.route('**/api/session',route=>route.fulfill({json:{user:{id:'333333333333333333'},permissions:['admin']}}));
  await page.route('**/api/community/recap/destinations',route=>route.fulfill({json:{destinations:[{id:channel,name:'test-annonces',type:0,announceMissing:[]}]}}));
  await page.route('**/api/community/discord/announcement-preview',route=>route.fulfill({json:{previews:[{payload:eveningDemo({url:'https://site.example'})}]}}));
  await page.route('**/api/community/discord/announcement-test',route=>{
    sent.push(route.request().postDataJSON());
    return route.fulfill({json:{ok:true,url:`https://discord.com/channels/${guild}/${channel}/${message}`}});
  });
  await page.goto(`/discord-preview.html?channel=${channel}`);
  const button=page.getByRole('button',{name:'Envoyer la maquette sur Discord',exact:true});
  await expect(button).toBeEnabled();expect(sent).toHaveLength(0);
  await expect(page.locator('select[name=channel]')).toHaveValue(channel);
  await button.click();
  await expect(page.getByRole('link',{name:'Ouvrir le message dans Discord'})).toHaveAttribute('href',`https://discord.com/channels/${guild}/${channel}/${message}`);
  expect(sent).toEqual([{channel,variant:'evening'}]);
});

test('the evening concept is readable on desktop and mobile without activating announcements',async ({page})=>{
  await page.goto('/discord-preview.html');
  await expect(page.getByRole('heading',{name:'Le programme du soir.'})).toBeVisible();
  await expect(page.getByText('20:00 · 6 HEURES DE SPA',{exact:true})).toBeVisible();
  await expect(page.getByText('21:00 · SAFE’S RACE',{exact:true})).toBeVisible();
  await expect(page.getByText('LA SOIRÉE AVEC LA PRALINE',{exact:true})).toBeVisible();
  const cards=page.locator('.dc-container');await expect(cards).toHaveCount(3);
  for(const button of await page.locator('.dc-button').all())await expect(button).toBeDisabled();
  await page.getByRole('button',{name:'Mobile',exact:true}).click();
  await expect(page.locator('#evening-preview')).toHaveClass(/is-mobile/);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await page.getByRole('button',{name:'Ordinateur',exact:true}).click();
  await expect(page.locator('#evening-preview')).not.toHaveClass(/is-mobile/);
  const downloaded=page.waitForEvent('download');
  await page.getByRole('button',{name:'Exporter le JSON',exact:true}).click();
  expect((await downloaded).suggestedFilename()).toBe('programme-du-soir-exemple.json');
});
