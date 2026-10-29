import {test,expect} from '@playwright/test';

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
