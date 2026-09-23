import {test, expect} from '@playwright/test';

const apiFailures = [];

async function mockGameApi(page) {
  await page.route('**/api/**', async route => {
    const request=route.request();
    if(request.method()!=='GET'){await route.continue();return;}
    const path=new URL(request.url()).pathname;
    const payload=path==='/api/session'
      ? {user:null,discordReady:true,adminConfigured:true,organizations:{team:null,communities:[],discoverableCommunities:[],preferredCommunityId:null,discordBotReady:false,discordBotInviteUrl:''}}
      : path==='/api/events'
        ? {events:[]}
        : path==='/api/participants'
          ? {participants:[]}
          : path==='/api/members'
            ? {members:[]}
            : null;
    if(payload===null){await route.continue();return;}
    await route.fulfill({status:200,contentType:'application/json; charset=utf-8',body:JSON.stringify(payload)});
  });
}

async function expectApiHealthy(page, path) {
  const response = await page.request.get(path, {headers:{Accept:'application/json'}});
  expect(response.ok(), `${path} returned ${response.status()}`).toBeTruthy();
  const type = response.headers()['content-type'] || '';
  expect(type).toContain('application/json');
}

async function openAndCheck(page, path) {
  const failures = [];
  const pageErrors = [];
  const onPageError = error => pageErrors.push(String(error?.stack || error?.message || error));
  page.on('pageerror', onPageError);
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
  expect(pageErrors, `JavaScript errors while opening ${path}`).toEqual([]);
  page.off('pageerror', onPageError);
  page.off('requestfailed', onRequestFailed);
}

test.beforeEach(async ({page}) => {
  apiFailures.length = 0;
  page.on('requestfailed', request => {
    if (request.url().includes('/api/')) apiFailures.push(`${request.method()} ${request.url()}: ${request.failure()?.errorText || 'request failed'}`);
  });
});

test('public endpoints are reachable; JSON is validated when Cloudflare does not challenge the runner', async ({page}) => {
  for(const path of ['/api/session','/api/events']){
    const response=await page.request.get(path,{headers:{Accept:'application/json'}});
    expect(response.ok(),`${path} returned ${response.status()}`).toBeTruthy();
    const type=response.headers()['content-type']||'';
    if(type.includes('application/json'))await expectApiHealthy(page,path);
    else {
      expect(type).toContain('text/html');
      test.info().annotations.push({type:'cloudflare',description:`${path} returned HTML to the GitHub runner; browser UI tests use mocked API responses.`});
    }
  }
});

test('home loads without network error', async ({page}) => {
  await openAndCheck(page, '/');
  expect(apiFailures).toEqual([]);
});

test('language switch shows the current language, translates event counters and persists', async ({page}) => {
  await mockGameApi(page);
  await openAndCheck(page, '/');
  const toggle = page.locator('[data-language-toggle]');
  await expect(toggle).toBeVisible();
  await expect(toggle).toContainText('🇫🇷');
  await expect(toggle).toHaveAttribute('data-current-language','fr');
  await expect(toggle).toHaveAttribute('data-language-placement','hub-topbar');
  await toggle.click();
  await page.waitForLoadState('networkidle');
  await expect(page.locator('html')).toHaveAttribute('lang','en');
  await expect(page.getByText('Choose your community',{exact:true})).toBeVisible();
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
  await mockGameApi(page);
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

test('community management stays secondary behind the active-space selector', async ({page}) => {
  await mockGameApi(page);
  await page.setViewportSize({width:390,height:844});
  await openAndCheck(page, '/lmu/');
  const context = page.locator('.nav-community-context').first();
  await expect(context).toBeVisible();
  await context.locator('summary').click();
  const manage = context.getByRole('button',{name:'Gérer ou découvrir des communautés',exact:true});
  await expect(manage).toBeVisible();
  await manage.click();
  await expect(page.getByRole('heading',{name:'Communautés',exact:true})).toBeVisible();
  await expect(page.getByText('Ton espace actif se choisit depuis la barre principale',{exact:false})).toBeVisible();
  await expect(page.getByText('Découvrir d’autres communautés',{exact:false})).toBeVisible();
  await expect(page.locator('[data-ux-error-modal]')).toHaveCount(0);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow,'community management overflows horizontally').toBeLessThanOrEqual(1);
  expect(apiFailures).toEqual([]);
});

test('community selection comes before simulator selection', async ({page}) => {
  await mockGameApi(page);
  await openAndCheck(page, '/');
  const order=await page.evaluate(()=>({
    community:document.getElementById('community-picker')?.getBoundingClientRect().top ?? Infinity,
    simulator:document.getElementById('game-grid')?.getBoundingClientRect().top ?? -Infinity
  }));
  expect(order.community).toBeLessThan(order.simulator);
});

test('LMU space opens from home', async ({page}) => {
  await mockGameApi(page);
  await openAndCheck(page, '/');
  const link = page.locator('a[href="/lmu/"]');
  await expect(link).toBeVisible();
  await Promise.all([page.waitForURL('**/lmu/'), link.click()]);
  await page.waitForLoadState('networkidle');
  await expect(page.locator('[data-ux-error-modal]')).toHaveCount(0);
  expect(apiFailures).toEqual([]);
});

test('iRacing space opens from home', async ({page}) => {
  await mockGameApi(page);
  await openAndCheck(page, '/');
  const link = page.locator('a[href="/iracing/"]');
  await expect(link).toBeVisible();
  await Promise.all([page.waitForURL('**/iracing/'), link.click()]);
  await page.waitForLoadState('networkidle');
  await expect(page.locator('[data-ux-error-modal]')).toHaveCount(0);
  expect(apiFailures).toEqual([]);
});