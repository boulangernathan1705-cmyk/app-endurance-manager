// Regenerates the help screenshots (images/help/*.jpg) from a local `wrangler dev` with the seed data.
// Usage: node scripts/help-screenshots.mjs [baseURL]   (default http://localhost:8787)
// Uses the locally installed Chrome through Playwright: nothing is downloaded.
import {chromium} from 'playwright';
import {mkdir} from 'node:fs/promises';

const BASE = process.argv[2] || 'http://localhost:8787';
const OUT = new URL('../images/help/', import.meta.url);
const SESSIONS = {pilot:'b'.repeat(64), admin:'a'.repeat(64)};
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

await mkdir(OUT, {recursive:true});
const browser = await chromium.launch({channel:'chrome', headless:true});

async function pageAs(role, width = 1280, height = 900) {
  const context = await browser.newContext({viewport:{width, height}, deviceScaleFactor:1, locale:'fr-FR', timezoneId:'Europe/Paris'});
  // Session cookie of the seed account (set from the page: __Host- cookies cannot be added over http://localhost).
  await context.addInitScript(token => {
    document.cookie = `__Host-fmt_session=${token}; path=/; secure`;
    try { localStorage.setItem('endurance_manager_locale', 'fr'); } catch {}
    // The local dev banner is not part of the real site.
    document.addEventListener('DOMContentLoaded', () => document.querySelector('.dev-site-banner')?.remove());
  }, SESSIONS[role]);
  const page = await context.newPage();
  return page;
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

async function openRace(page, name) {
  await page.goto(`${BASE}/lmu/`, {waitUntil:'networkidle'});
  await page.locator('.race-card', {hasText:name}).first().click();
  await page.waitForSelector('.race-header');
  await wait(500);
}

async function firstFreeDeparture(page) {
  // A start where the pilot is not registered yet: its main action is "S'inscrire".
  return page.locator('.departure-fold').filter({has:page.locator('button', {hasText:/^S’inscrire$/})}).first();
}

// ---------- Pilot views ----------
{
  const page = await pageAs('pilot');
  await page.goto(`${BASE}/lmu/`, {waitUntil:'networkidle'});
  await wait(600);
  await shot(page.locator('.site-nav-shell'), 'pilot-navigation');
  await shotTop(page, page.locator('#app'), 'pilot-events', 640);

  await openRace(page, '12h du Mans');
  await shot(page.locator('.race-header'), 'pilot-race');
  const withCrews = page.locator('.departure-accordion > .departure-fold:has(.crew-card-shell)').first();
  if (!(await withCrews.evaluate(el => el.open))) await withCrews.locator(':scope > summary').click();
  await wait(400);
  // Overview with several crews: the first 12h du Mans start (already started, kept under "Départs passés").
  const pastFold = page.locator('.past-departures-fold');
  if (await pastFold.count()) {
    if (!(await pastFold.evaluate(el => el.open))) await pastFold.locator(':scope > summary').click();
    const pastStart = pastFold.locator('.departure-fold').first();
    if (!(await pastStart.evaluate(el => el.open))) await pastStart.locator(':scope > summary').click();
    await wait(400);
    await shot(pastStart.locator('.ux-course-crews-block'), 'pilot-crews');
  }
  const tile = withCrews.locator('.crew-card-shell details').first();
  if (await tile.count()) {
    if (!(await tile.evaluate(el => el.open))) await tile.locator(':scope > summary').first().click();
    await wait(400);
    await shot(withCrews.locator('.crew-card-shell').first(), 'pilot-crew-open');
  }
  await shot(withCrews.locator('.ux-course-pilots-accordion'), 'pilot-unassigned');

  await openRace(page, '6h de Spa');
  const free = await firstFreeDeparture(page);
  await shot(free.locator(':scope > summary'), 'pilot-departure');
  await free.locator('button', {hasText:/^S’inscrire$/}).click();
  const sheet = page.locator('.fold-registration:not([hidden]) .registration-sheet');
  await sheet.waitFor();
  await shot(sheet, 'pilot-register-category');
  await sheet.locator('.category-button').first().click();
  await sheet.locator('.registration-next').click();
  await wait(300);
  await shot(sheet, 'pilot-register-cars');
  await sheet.locator('label', {hasText:'Peu importe'}).first().click();
  await sheet.locator('.registration-next').click();
  await wait(300);
  for (const hour of ['h1','h2','h3']) await sheet.locator(`.registration-step:not([hidden]) [data-value="${hour}"]`).click();
  await wait(300);
  await shot(sheet, 'pilot-register-hours');
  await sheet.locator('.registration-next').click();
  await wait(300);
  await shot(sheet, 'pilot-register-summary');
  await sheet.locator('.registration-close-button').click();

  await page.context().close();
}

// ---------- Organizer / administrator views ----------
{
  const page = await pageAs('admin');
  await openRace(page, '12h du Mans');
  await shot(page.locator('.race-header'), 'org-race-actions');

  await page.goto(`${BASE}/lmu/`, {waitUntil:'networkidle'});
  await page.locator('[data-action="create"]').click();
  const form = page.locator('form[data-kind="event"]');
  await form.waitFor();
  await wait(300);
  await shot(form, 'org-create-event');
  await form.locator('[name="eventName"]').fill('6h de Portimão');
  await form.locator('[name="eventCircuit"]').selectOption('portimao');
  const next = form.locator('[data-action="event-step"][data-step="next"]');
  await next.click();
  await wait(300);
  await form.locator('[name="eventCategory"]').first().check();
  await next.click();
  await wait(300);
  const start = form.locator('.departure-field').first();
  await start.locator('input[name="date"]').fill('2026-10-17');
  await start.locator('select').first().selectOption('20');
  await wait(200);
  await shot(form, 'org-create-departures');

  await openRace(page, '6h de Spa');
  const departure = page.locator('.departure-fold').first();
  await departure.locator('button, a', {hasText:'Créer un équipage'}).first().click();
  const builder = page.locator('[data-crew-builder-overlay] .registration-sheet, [data-crew-builder-overlay] [role="dialog"]').first();
  await builder.waitFor();
  await wait(400);
  await shot(builder, 'org-create-crew');
  await page.locator('[data-crew-builder-cancel]').first().click();

  await departure.locator('button, a', {hasText:'Inscrire un autre pilote'}).first().click();
  const other = page.locator('.fold-registration:not([hidden]) .registration-sheet');
  await other.waitFor();
  await wait(300);
  await shot(other, 'org-add-pilot');
  await other.locator('.registration-close-button').click();

  // My entries (the pilot seed account has none; the page looks the same for every role).
  await page.goto(`${BASE}/lmu/`, {waitUntil:'networkidle'});
  await page.locator('.nav-section-button', {hasText:'Mes inscriptions'}).click();
  await page.waitForSelector('.native-my-entry-card');
  await wait(600);
  const entry = page.locator('.native-my-entry-card').first();
  if (!(await entry.evaluate(el => el.open))) await entry.locator(':scope > summary').click();
  await wait(400);
  await shot(entry, 'pilot-my-entries');
  await page.goto(`${BASE}/members.html`, {waitUntil:'networkidle'});
  await wait(600);
  await shotTop(page, page.locator('.members-panel'), 'admin-members', 460);
  await page.context().close();
}

await browser.close();
