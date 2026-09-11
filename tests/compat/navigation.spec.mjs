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
  expect(response.ok(), `${path} returned ${response.status()}`).toBeTruthy();
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
