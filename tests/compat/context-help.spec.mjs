import {test, expect} from '@playwright/test';

const EVENT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const START = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

async function setup(page, {permissions = ['access', 'endurance'], locale = 'fr'} = {}) {
  const writes = [], errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(locale => localStorage.setItem('endurance_manager_locale', locale), locale);
  const departure = {id:START, date:'2090-10-15', time:'14:00', startsAt:Date.now()+86400000, endsAt:Date.now()+108000000, availability:[], crews:[]};
  const race = {id:EVENT, name:'6h de Spa', format:'endurance', circuit:'spa', eventType:'private', categories:['GT3'], durationHours:6, durationMinutes:360, version:1, departures:[departure]};
  await page.route('**/api/**', async route => {
    const request = route.request(), path = new URL(request.url()).pathname;
    if (request.method() !== 'GET') writes.push(path);
    let data = {ok:true};
    if (path === '/api/session') data = {user:{id:'111111111111111111', name:'Nathan', role:permissions.includes('admin')?'admin':'pilot', communityIntroSeen:true}, permissions, access:'member', discordReady:true, community:{id:'test', name:'Test', slug:'test', appearance:{}}, communities:[]};
    if (['/api/events','/api/races'].includes(path)) data = {events:[race]};
    if (path.includes('notifications')) data = {notifications:[], unread:0};
    if (path === '/api/participants') data = {participants:[]};
    await route.fulfill({contentType:'application/json', body:JSON.stringify(data)});
  });
  await page.goto('/lmu/');
  await page.waitForFunction(async () => (await import('/front/app/core.mjs')).state.user?.name === 'Nathan');
  return {race, writes, errors};
}

test('help follows the registration step and Escape preserves the form and draft', async ({page}) => {
  const {race, writes, errors} = await setup(page);
  await page.evaluate(async race => {
    const {state} = await import('/front/app/core.mjs');
    const {draftFor} = await import('/front/app/registration.mjs');
    state.currentEventId = race.id;
    state.registrationOpen.add(race.departures[0].id);
    Object.assign(draftFor(race.departures[0]), {step:3, category:'GT3', carAny:true, cars:[], status:'h1,h2', comment:'Mon commentaire'});
    (await import('/front/app/event-view.mjs')).renderEvent();
  }, race);
  const help = page.locator('[data-context-help="entry-hours"]');
  await expect(page.locator('button[data-context-help]')).toHaveCount(1);
  await expect(page.locator('.registration-workspace-head > button[data-context-help]')).toHaveCount(1);
  await help.click();
  await expect(page.locator('dialog.context-help-dialog')).toContainText('tu ne conduiras pas forcément tout le temps');
  await page.keyboard.press('Tab');
  expect(await page.evaluate(() => !!document.activeElement?.closest('dialog.context-help-dialog'))).toBe(true);
  await page.keyboard.press('Escape');
  await expect(page.locator('dialog.context-help-dialog')).toHaveCount(0);
  await expect(page.locator('[data-kind="registration"][data-step="3"]')).toBeVisible();
  await expect(help).toBeFocused();
  expect(await page.evaluate(async id => {
    const {state} = await import('/front/app/core.mjs');
    return {status:state.drafts[id].status, comment:state.drafts[id].comment};
  }, START)).toEqual({status:'h1,h2', comment:'Mon commentaire'});
  await page.locator('[data-action="registration-step"][data-step="4"]').click();
  await expect(page.locator('[data-context-help="entry-summary"]')).toBeVisible();
  expect(writes).toEqual([]);
  expect(errors).toEqual([]);
});

test('race help only explains crew management to people with that permission', async ({page}) => {
  const {race, writes, errors} = await setup(page);
  await page.goto(`/lmu/#event=${EVENT}`);
  const help = page.locator('[data-context-help="race"]');
  await help.click();
  await expect(page.locator('dialog.context-help-dialog')).not.toContainText('Créer ou gérer un équipage');
  await page.getByRole('button', {name:'Fermer l’aide'}).click();
  await page.evaluate(async race => {
    const {state} = await import('/front/app/core.mjs');
    state.permissions.push('crews'); state.currentEventId = race.id;
    (await import('/front/app/event-view.mjs')).renderEvent();
  }, race);
  await help.click();
  await expect(page.locator('dialog.context-help-dialog')).toContainText('Créer ou gérer un équipage');
  expect(writes).toEqual([]);
  expect(errors).toEqual([]);
});

test('mobile help fits the viewport, uses the selected language and closes by touch', async ({page}) => {
  await page.setViewportSize({width:390, height:700});
  const {errors} = await setup(page, {locale:'en'});
  const help = page.locator('[data-context-help="calendar"]');
  await expect(page.locator('button[data-context-help]')).toHaveCount(1);
  await expect(page.locator('.account-bar .context-help-button + .notif-wrap')).toHaveCount(1);
  await expect(page.locator('#app button[data-context-help]')).toHaveCount(0);
  await help.click();
  const dialog = page.locator('dialog.context-help-dialog');
  await expect(dialog).toContainText('Find a race');
  const box = await dialog.boundingBox();
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(390);
  expect(box.y + box.height).toBeLessThanOrEqual(700);
  await page.getByRole('button', {name:'Close help'}).click();
  await expect(dialog).toHaveCount(0);
  await expect(help).toBeFocused();
  expect(errors).toEqual([]);
});

test('administration help follows the selected tab', async ({page}) => {
  const {errors} = await setup(page, {permissions:['access','admin']});
  await page.route('**/api/members', route => route.fulfill({json:{members:[], permissions:['access','admin']}}));
  await page.route('**/api/community/settings', route => route.fulfill({json:{community:{name:'Test'}, modules:{}, permissions:['access','admin'], roles:[], crews:{}}}));
  await page.route('**/api/community/setup', route => route.fulfill({json:{community:{name:'Test'}, siteUrl:'https://site.example', guild:{id:'900000000000000001', name:'Test', botPresent:true}, rolesConfigured:true, recapSetupRequired:true, discordInviteUrl:'https://discord.gg/example'}}));
  await page.goto('/members.html');
  await page.locator('.account-trigger').click();
  await expect(page.locator('.account-popover a[href="/help.html"]')).toHaveCount(0);
  await expect(page.locator('.site-footer a[href="/help.html"]')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await page.getByRole('tab', {name:'Membres et rôles', exact:true}).click();
  await page.locator('[data-context-help="admin-people"]').click();
  await expect(page.locator('dialog.context-help-dialog')).toContainText('Accès Endurance Manager');
  await page.keyboard.press('Escape');
  await page.getByRole('tab', {name:'Modules', exact:true}).click();
  await page.locator('[data-context-help="admin-modules"]').click();
  await expect(page.locator('dialog.context-help-dialog')).toContainText('Activer un module');
  await expect(page.locator('dialog.context-help-dialog')).not.toContainText('Attribue le rôle');
  expect(errors).toEqual([]);
});

test('one compact help control follows endurance creation steps and returns to the bell', async ({page}) => {
  const {writes, errors} = await setup(page, {permissions:['access','admin','create_race','manage_races']});
  await page.evaluate(async () => (await import('/front/app/event-form.mjs')).renderEventForm());
  const help = page.locator('button.context-help-button');
  await expect(help).toHaveAttribute('data-context-help', 'create-race-1');
  await page.locator('[name="eventName"]').fill('Course guidée');
  await page.locator('[name="eventCircuit"]').selectOption({index:1});
  await help.click();
  await expect(page.locator('dialog ol li')).toHaveCount(5);
  await page.keyboard.press('Escape');
  await expect(page.locator('[name="eventName"]')).toHaveValue('Course guidée');
  await page.locator('[data-action="event-step"][data-step="next"]').click();
  await expect(help).toHaveAttribute('data-context-help', 'create-race-2');
  await page.locator('[name="eventCategory"][value="GT3"]').check();
  await page.locator('[data-action="event-step"][data-step="next"]').click();
  await expect(help).toHaveAttribute('data-context-help', 'create-race-3');
  await help.click();
  await expect(page.locator('dialog')).toContainText('Heure (Paris)');
  await expect(page.locator('dialog')).toContainText('Ajouter plusieurs départs');
  await page.keyboard.press('Escape');
  await page.locator('.departure-field [name="date"]').fill('2090-10-15');
  await page.locator('[data-action="event-step"][data-step="next"]').click();
  await expect(help).toHaveAttribute('data-context-help', 'create-race-4');
  await page.locator('[data-action="close-form"]').click();
  await expect(page.locator('.account-bar .context-help-button + .notif-wrap')).toHaveCount(1);
  await expect(page.locator('button[data-context-help]')).toHaveCount(1);
  expect(writes).toEqual([]);
  expect(errors).toEqual([]);
});
