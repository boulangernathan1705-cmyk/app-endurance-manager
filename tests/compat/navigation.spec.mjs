import {test, expect} from '@playwright/test';

const apiFailures = [];

async function expectApiHealthy(page, path) {
  const response = await page.request.get(path, {headers:{Accept:'application/json'}});
  expect(response.ok(), `${path} returned ${response.status()}`).toBeTruthy();
  const type = response.headers()['content-type'] || '';
  expect(type).toContain('application/json');
}

async function openAndCheck(page, path) {
  const failures = [];
  const onRequestFailed = request => {
    const url = request.url();
    if (url.includes('/api/')) failures.push(`${request.method()} ${url}: ${request.failure()?.errorText || 'request failed'}`);
  };
  page.on('requestfailed', onRequestFailed);
  const response = await page.goto(path, {waitUntil:'networkidle'});
  expect(response, `No navigation response for ${path}`).not.toBeNull();
  const navigationStatus = response.status();
  expect(response.ok() || navigationStatus === 304, `${path} returned ${navigationStatus}`).toBeTruthy();
  await expect(page.locator('body')).toBeVisible();
  await expect(page.locator('[data-ux-error-modal]')).toHaveCount(0);
  expect(failures, `API request failures while opening ${path}`).toEqual([]);
  page.off('requestfailed', onRequestFailed);
}

test.beforeEach(async ({page}) => {
  apiFailures.length = 0;
  page.on('requestfailed', request => {
    if (request.url().includes('/api/')) apiFailures.push(`${request.method()} ${request.url()}: ${request.failure()?.errorText || 'request failed'}`);
  });
});

test('public API responds', async ({page}) => {
  await expectApiHealthy(page, '/api/session');
  // The races are for the members of the community: a visitor is asked to sign in with Discord.
  const races = await page.request.get('/api/races', {headers:{Accept:'application/json'}});
  expect(races.status()).toBe(401);
  expect(races.headers()['content-type'] || '').toContain('application/json');
});

test('home loads without network error', async ({page}) => {
  await openAndCheck(page, '/');
  expect(apiFailures).toEqual([]);
});

test('language switch shows the current language, translates event counters and persists', async ({page}) => {
  // The former simulator choice ("/" now opens the « Accueil »).
  await openAndCheck(page, '/?accueil');
  const toggle = page.locator('[data-language-toggle]');
  await expect(toggle).toBeVisible();
  await expect(toggle).toContainText('🇫🇷');
  await expect(toggle).toHaveAttribute('data-current-language','fr');
  await expect(toggle).toHaveAttribute('data-language-placement','game-space');
  await toggle.click();
  await page.waitForLoadState('networkidle');
  await expect(page.locator('html')).toHaveAttribute('lang','en');
  await expect(page.getByText('Choose your simulator',{exact:true})).toBeVisible();
  await expect(page.locator('[data-language-toggle]')).toContainText('🇬🇧');
  await expect(page.locator('[data-language-toggle]')).toHaveAttribute('data-current-language','en');

  await openAndCheck(page, '/iracing/');
  await expect(page.locator('html')).toHaveAttribute('lang','en');
  await expect(page.getByRole('heading',{name:'ENDURANCE',exact:true}).or(page.locator('.community-gate h1'))).toBeVisible();
  await expect(page.locator('[data-language-toggle]')).toContainText('🇬🇧');
  await expect(page.locator('[data-language-toggle]')).toHaveAttribute('data-language-placement','game-space');
  const cards=page.locator('.event-card');
  if(await cards.count()) {
    const categoryCopy=(await cards.first().locator('.event-category-badges').allTextContents()).join(' ');
    expect(categoryCopy).not.toMatch(/\binscrit(?:s)?\b/i);
    expect(categoryCopy).not.toMatch(/\bpilote(?:s)?\b/i);
    const cardText=await cards.first().innerText();
    expect(cardText).not.toMatch(/\béquipage(?:s)?\s+engagé(?:s)?\b/i);
  }

  await openAndCheck(page, '/lmu/');
  await expect(page.locator('html')).toHaveAttribute('lang','en');
  await expect(page.getByRole('heading',{name:'ENDURANCE',exact:true}).or(page.locator('.community-gate h1'))).toBeVisible();
  await expect(page.locator('[data-language-toggle]')).toContainText('🇬🇧');
  await expect(page.locator('[data-language-toggle]')).toHaveAttribute('data-language-placement','game-space');
  expect(apiFailures).toEqual([]);
});

test('mobile interface stays compact without horizontal overflow across main pages', async ({page}) => {
  await page.setViewportSize({width:390,height:844});
  for (const path of ['/', '/lmu/', '/iracing/', '/members.html', '/help.html']) {
    await openAndCheck(page, path);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `${path} overflows horizontally`).toBeLessThanOrEqual(1);
  }

  await openAndCheck(page, '/lmu/');
  // A visitor sees the welcome screen without the navigation bar; a member sees a compact bar.
  if (!(await page.locator('.community-gate.is-visitor').count())) {
    const shell = await page.locator('.site-nav-shell').boundingBox();
    expect(shell).not.toBeNull();
    expect(shell.height).toBeLessThan(190);
  }
  await expect(page.locator('.page-title').or(page.locator('.community-gate'))).toBeVisible();
});

test('LMU space opens from home', async ({page}) => {
  await openAndCheck(page, '/?accueil');
  const link = page.locator('.game-hub-enter[href="/lmu/"]');
  await expect(link).toBeVisible();
  await Promise.all([page.waitForURL('**/lmu/'), link.click()]);
  await page.waitForLoadState('networkidle');
  await expect(page.locator('[data-ux-error-modal]')).toHaveCount(0);
  expect(apiFailures).toEqual([]);
});

test('iRacing space opens from home', async ({page}) => {
  await openAndCheck(page, '/?accueil');
  const link = page.locator('.game-hub-enter[href="/iracing/"]');
  await expect(link).toBeVisible();
  await Promise.all([page.waitForURL('**/iracing/'), link.click()]);
  await page.waitForLoadState('networkidle');
  await expect(page.locator('[data-ux-error-modal]')).toHaveCount(0);
  expect(apiFailures).toEqual([]);
});
test('the public information menu fits and its destinations can be opened', async ({page}) => {
  const session = {access:'anonymous', discordReady:true, community:{slug:'tdz', shortName:'TDZ', name:'Tondeuz Agazon'}};
  await page.route('**/api/session', route => route.fulfill({json:session}));
  for (const width of [340, 454, 1366]) {
    await page.setViewportSize({width,height:900});
    await page.goto('/privacy.html');
    for (const selector of ['.nav-game-switcher-lmu', '.nav-game-switcher-iracing', '.account-discord-login']) {
      const control = page.locator(selector);
      await expect(control).toBeInViewport({ratio:0.99});
    }
    const menu = page.locator('.nav-information');
    await menu.locator('summary').click();
    await expect(menu.getByRole('link',{name:'Crédits des circuits'})).toBeInViewport({ratio:0.99});
  }
});

test('the standalone help offers a retry when its module cannot load', async ({page}) => {
  await page.route('**/help.js*', route => route.abort());
  await page.goto('/help.html');
  await expect(page.getByRole('alert')).toHaveText('L’aide n’a pas pu se charger.');
  await page.unroute('**/help.js*');
  await page.getByRole('button',{name:'Réessayer',exact:true}).click();
  await expect(page.getByRole('heading',{name:/^aide$/i})).toBeVisible();
});

test('weekly multi-start cards show only one schedule at mobile and desktop widths', async ({page}) => {
  await page.goto('/');
  // Use the real bundled stylesheet with a deterministic multi-start card, without a Discord session.
  await page.evaluate(() => {
    const fixture=document.createElement('div');
    fixture.id='week-schedule-regression';
    fixture.innerHTML='<button class="week-block is-endurance is-lmu"><span class="week-block-band is-many"><span><b>3h</b><small> → 7h30</small></span><span><b>8h</b><small> → 12h30</small></span></span><span class="week-block-body"><span class="week-block-title"><span class="week-block-name">Endurance</span></span><span class="week-block-plan"><span class="week-plan-row">Départ 1 · 3h → 7h30</span><span class="week-plan-row">Départ 2 · 8h → 12h30</span></span></span></button>';
    document.body.append(fixture);
  });
  const card=page.locator('#week-schedule-regression .week-block');
  for (const width of [320,390,760,761,1366]) {
    await page.setViewportSize({width,height:900});
    const mobile=width<=760;
    await expect(card.locator('.week-block-band')).toHaveCSS('display',mobile?'none':'block');
    await expect(card.locator('.week-block-plan')).toHaveCSS('display',mobile?'grid':'none');
  }
});
