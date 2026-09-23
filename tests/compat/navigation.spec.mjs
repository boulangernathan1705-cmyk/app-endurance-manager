import {test, expect} from '@playwright/test';

const apiFailures = [];
const remoteBaseURL = String(process.env.COMPAT_REMOTE_BASE_URL || '').replace(/\/$/, '');

async function mockGameApi(page,{organizations={communities:[],discoverableCommunities:[],preferredCommunityId:null,discordBotReady:false,discordBotInviteUrl:''}}={}) {
  await page.route('**/api/**', async route => {
    const request=route.request();
    if(request.method()!=='GET'){await route.continue();return;}
    const path=new URL(request.url()).pathname;
    const payload=path==='/api/session'
      ? {user:null,discordReady:true,adminConfigured:true,organizations}
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

async function expectApiHealthy(page, target) {
  const response = await page.request.get(target, {headers:{Accept:'application/json'}});
  expect(response.ok(), `${target} returned ${response.status()}`).toBeTruthy();
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
    const target=remoteBaseURL ? `${remoteBaseURL}${path}` : path;
    const response=await page.request.get(target,{headers:{Accept:'application/json'}});
    expect(response.ok(),`${target} returned ${response.status()}`).toBeTruthy();
    const type=response.headers()['content-type']||'';
    if(type.includes('application/json'))await expectApiHealthy(page,target);
    else {
      expect(type).toContain('text/html');
      test.info().annotations.push({type:'cloudflare',description:`${path} returned HTML to the GitHub runner; browser UI tests use mocked API responses.`});
    }
  }
});

test('home loads without network error', async ({page}) => {
  await mockGameApi(page);
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
  await expect(page.getByText('Choose your simulator',{exact:true})).toBeHidden();
  await expect(page.locator('[data-language-toggle]')).toContainText('🇬🇧');
  await expect(page.locator('[data-language-toggle]')).toHaveAttribute('data-current-language','en');
  await page.locator('[data-hub-community=""]').click();
  await expect(page.getByText('Choose your simulator',{exact:true})).toBeVisible();

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

test('community and simulator choices are separate successive screens', async ({page}) => {
  await mockGameApi(page);
  await openAndCheck(page, '/');
  await expect(page.locator('#community-stage')).toBeVisible();
  await expect(page.locator('#simulator-stage')).toBeHidden();
  await page.locator('[data-hub-community=""]').click();
  await expect(page.locator('#community-stage')).toBeHidden();
  await expect(page.locator('#simulator-stage')).toBeVisible();
  await expect(page).toHaveURL(/community=general/);
  await page.locator('[data-hub-back]').click();
  await expect(page.locator('#community-stage')).toBeVisible();
  await expect(page.locator('#simulator-stage')).toBeHidden();
});

test('a preferred community opens directly on its branded simulator choice', async ({page}) => {
  const id='123e4567-e89b-12d3-a456-426614174000';
  const community={id,name:'Les Tondeuz à gazon',role:'member',branding:{logoUrl:'',bannerUrl:'',accentColor:'#59D3D8'}};
  await mockGameApi(page,{organizations:{communities:[community],discoverableCommunities:[],preferredCommunityId:id,discordBotReady:true,discordBotInviteUrl:''}});
  await openAndCheck(page,'/');
  await expect(page.locator('#community-stage')).toBeHidden();
  await expect(page.locator('#simulator-stage')).toBeVisible();
  await expect(page.locator('#hub-selected-community')).toContainText('Les Tondeuz à gazon');
  await expect(page.locator('[data-hub-game="lmu"]')).toHaveAttribute('href',new RegExp(`community=${id}`));
  await expect(page.locator('[data-hub-game="iracing"]')).toHaveAttribute('href',new RegExp(`community=${id}`));
});

test('LMU space opens from home', async ({page}) => {
  await mockGameApi(page);
  await openAndCheck(page, '/');
  await page.locator('[data-hub-community=""]').click();
  const link = page.locator('[data-hub-game="lmu"]');
  await expect(link).toBeVisible();
  await Promise.all([page.waitForURL('**/lmu/?**'), link.click()]);
  await page.waitForLoadState('networkidle');
  await expect(page.locator('[data-ux-error-modal]')).toHaveCount(0);
  expect(apiFailures).toEqual([]);
});

test('iRacing space opens from home', async ({page}) => {
  await mockGameApi(page);
  await openAndCheck(page, '/');
  await page.locator('[data-hub-community=""]').click();
  const link = page.locator('[data-hub-game="iracing"]');
  await expect(link).toBeVisible();
  await Promise.all([page.waitForURL('**/iracing/?**'), link.click()]);
  await page.waitForLoadState('networkidle');
  await expect(page.locator('[data-ux-error-modal]')).toHaveCount(0);
  expect(apiFailures).toEqual([]);
});
