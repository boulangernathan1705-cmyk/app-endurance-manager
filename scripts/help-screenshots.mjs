// Regenerates the help screenshots (images/help/*.jpg) from a local `wrangler dev` with the showcase data
// (server/demo.mjs: « 6h de Spa » with crews, drivers without a crew and free starts, « Sprint GT3 du jeudi »).
// Data: `npm run seed:local` (scripts/seed-local.mjs), with `wrangler dev` stopped, then restart it with
// `npx wrangler dev --var ADMIN_DISCORD_IDS:100000000000000001` (Max is then an admin).
// Usage: node scripts/help-screenshots.mjs [baseURL]   (default http://localhost:8787)
// Uses the locally installed Chrome through Playwright (or CHROME_PATH): nothing is downloaded.
import {chromium} from 'playwright';
import {mkdir} from 'node:fs/promises';

const BASE = process.argv[2] || 'http://localhost:8787';
const OUT = new URL('../images/help/', import.meta.url);
const SESSIONS = {pilot:'b'.repeat(64), admin:'a'.repeat(64)};
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

await mkdir(OUT, {recursive:true});
const browser = await chromium.launch(process.env.CHROME_PATH ? {executablePath:process.env.CHROME_PATH, headless:true} : {channel:'chrome', headless:true});

async function pageAs(role, width = 1280, height = 900) {
  const context = await browser.newContext({viewport:{width, height}, deviceScaleFactor:1, locale:'fr-FR', timezoneId:'Europe/Paris'});
  // Session cookie of the seed account (set from the page: __Host- cookies cannot be added over http://localhost).
  await context.addInitScript(token => {
    document.cookie = `__Host-em_session=${token}; path=/; secure`;
    try { localStorage.setItem('endurance_manager_locale', 'fr'); } catch {}
    // The local test banner is not part of the real site.
    document.addEventListener('DOMContentLoaded', () => document.querySelectorAll('.dev-site-banner, .test-site-banner').forEach(item => item.remove()));
  }, SESSIONS[role]);
  // Without internet access (OFFLINE_MAPS=1), the circuit drawings are replaced by the local placeholder.
  if (process.env.OFFLINE_MAPS) await context.route('https://commons.wikimedia.org/**', route => route.fulfill({path:new URL('../images/circuits/track-placeholder.svg', import.meta.url).pathname, contentType:'image/svg+xml'}));
  return context.newPage();
}

async function shot(locator, name, options = {}) {
  await locator.scrollIntoViewIfNeeded();
  await wait(400);
  await locator.screenshot({path:new URL(`${name}.jpg`, OUT).pathname, type:'jpeg', quality:78, animations:'disabled', ...options});
  console.log('✓', name);
}

// Top part of a long element (a list): screenshot of at most maxHeight pixels.
async function shotTop(page, locator, name, maxHeight) {
  await page.evaluate(() => scrollTo(0, 0));
  await wait(300);
  const box = await locator.boundingBox();
  await page.screenshot({path:new URL(`${name}.jpg`, OUT).pathname, type:'jpeg', quality:78, fullPage:true, animations:'disabled',
    clip:{x:box.x, y:box.y, width:box.width, height:Math.min(box.height, maxHeight)}});
  console.log('✓', name);
}

async function openRace(page, name, list = '') {
  await page.goto(`${BASE}/lmu/${list}`, {waitUntil:'networkidle'});
  await page.locator('.race-card', {hasText:name}).first().click();
  await page.waitForSelector('.race-header');
  await wait(500);
}

// ---------- Pilot views (Leo) ----------
{
  const page = await pageAs('pilot');
  await page.goto(`${BASE}/lmu/`, {waitUntil:'networkidle'});
  await wait(600);
  await shot(page.locator('.site-nav-shell'), 'nav');
  await shotTop(page, page.locator('#app'), 'endurance-list', 560);

  await openRace(page, '6h de Spa');
  await shot(page.locator('.planning-start').first().locator('xpath=..'), 'endurance-starts');
  // A start with a crew, opened: its crews and the drivers without a crew.
  const withCrew = page.locator('.planning-start:has(.crew-card-shell)').last();
  if (!(await withCrew.evaluate(el => el.open))) await withCrew.locator(':scope > summary').click();
  await wait(400);
  const tile = withCrew.locator('.crew-card-shell details').first();
  if (await tile.count() && !(await tile.evaluate(el => el.open))) await tile.locator(':scope > summary').first().click();
  await wait(400);
  await shot(withCrew, 'crews');

  // The entry window, at the hours step.
  await page.locator('[data-action="my-registration"]').first().click();
  const sheet = page.locator('.registration-sheet').first();
  await sheet.waitFor();
  await sheet.locator('.category-button').first().click();
  await sheet.locator('.registration-next').click();
  await wait(300);
  await sheet.locator('label', {hasText:'Peu importe'}).first().click();
  await sheet.locator('.registration-next').click();
  await wait(300);
  for (const hour of ['h1', 'h2', 'h3']) await sheet.locator(`.registration-step:not([hidden]) [data-value="${hour}"]`).click();
  await wait(300);
  await shot(sheet, 'register-hours');
  await sheet.locator('.registration-close-button').click();

  await openRace(page, 'Sprint GT3 du jeudi', '#solo');
  await shotTop(page, page.locator('#app'), 'event-page', 760);
  await page.context().close();
}

// ---------- Admin views (Max) ----------
{
  const page = await pageAs('admin');
  // My entries (Max rides in Apex Racing #7 at Spa).
  await page.goto(`${BASE}/lmu/#inscriptions`, {waitUntil:'networkidle'});
  await wait(600);
  await shot(page.locator('.native-my-entry-card').first(), 'my-entries');

  await page.goto(`${BASE}/lmu/`, {waitUntil:'networkidle'});
  await page.locator('[data-action="create"]').click();
  const form = page.locator('.form-sheet').first();
  await form.waitFor();
  await wait(300);
  await shot(form, 'admin-create-endurance');
  await page.keyboard.press('Escape');

  await page.goto(`${BASE}/lmu/#solo`, {waitUntil:'networkidle'});
  await page.locator('[data-action="create"]').click();
  const solo = page.locator('.form-sheet').first();
  await solo.waitFor();
  await solo.locator('input').first().fill('Sprint du mardi');
  await wait(300);
  await shot(solo, 'admin-create-event');

  await page.goto(`${BASE}/members.html`, {waitUntil:'networkidle'});
  await page.locator('.admin-nav', {hasText:'Modules'}).click();
  await wait(500);
  await shot(page.locator('.admin-shell'), 'admin-modules');
  await page.context().close();
}

await browser.close();
