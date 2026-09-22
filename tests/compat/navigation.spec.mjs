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
  await expectApiHealthy(page, '/api/events');
});

test('home loads without network error', async ({page}) => {
  await openAndCheck(page, '/');
  expect(apiFailures).toEqual([]);
});

test('language switch shows the current language, translates event counters and persists', async ({page}) => {
  await openAndCheck(page, '/');
  const toggle = page.locator('[data-language-toggle]');
  await expect(toggle).toBeVisible();
  await expect(toggle).toContainText('🇫🇷');
  await expect(toggle).toHaveAttribute('data-current-language','fr');
  await expect(toggle).toHaveAttribute('data-language-placement','hub-topbar');
  await toggle.click();
  await page.waitForLoadState('networkidle');
  await expect(page.locator('html')).toHaveAttribute('lang','en');
  await expect(page.getByText('Choose your simulator',{exact:true})).toBeVisible();
  await expect(page.locator('[data-language-toggle]')).toContainText('🇬🇧');
  await expect(page.locator('[data-language-toggle]')).toHaveAttribute('data-current-language','en');

  await openAndCheck(page, '/iracing/');
  await expect(page.locator('html')).toHaveAttribute('lang','en');
  await expect(page.getByRole('heading',{name:'EVENTS',exact:true})).toBeVisible();
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
  await expect(page.getByRole('heading',{name:'EVENTS',exact:true})).toBeVisible();
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
  const shell = await page.locator('.site-nav-shell').boundingBox();
  expect(shell).not.toBeNull();
  expect(shell.height).toBeLessThan(190);
  await expect(page.locator('.page-title')).toBeVisible();
});

test('community directory opens for a guest without requiring Discord membership', async ({page}) => {
  await page.setViewportSize({width:390,height:844});
  await openAndCheck(page, '/lmu/');
  const communities = page.getByRole('button',{name:'Communautés',exact:true}).first();
  await expect(communities).toBeVisible();
  await communities.click();
  await expect(page.getByRole('heading',{name:'Trouve ton paddock',exact:true})).toBeVisible();
  await expect(page.getByRole('heading',{name:'Communautés disponibles',exact:true})).toBeVisible();
  await expect(page.getByText('sans obligation de passer par Discord',{exact:false})).toBeVisible();
  await expect(page.locator('[data-ux-error-modal]')).toHaveCount(0);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow,'community directory overflows horizontally').toBeLessThanOrEqual(1);
  expect(apiFailures).toEqual([]);
});

test('LMU space opens from home', async ({page}) => {
  await openAndCheck(page, '/');
  const link = page.locator('a[href="/lmu/"]');
  await expect(link).toBeVisible();
  await Promise.all([page.waitForURL('**/lmu/'), link.click()]);
  await page.waitForLoadState('networkidle');
  await expect(page.locator('[data-ux-error-modal]')).toHaveCount(0);
  expect(apiFailures).toEqual([]);
});

test('iRacing space opens from home', async ({page}) => {
  await openAndCheck(page, '/');
  const link = page.locator('a[href="/iracing/"]');
  await expect(link).toBeVisible();
  await Promise.all([page.waitForURL('**/iracing/'), link.click()]);
  await page.waitForLoadState('networkidle');
  await expect(page.locator('[data-ux-error-modal]')).toHaveCount(0);
  expect(apiFailures).toEqual([]);
});