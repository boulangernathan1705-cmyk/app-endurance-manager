// Safety net for CSS work: the computed style and place of every element of the main pages, at PC and phone width,
// before and after a change. Nothing may move unless it is meant to.
//   1. the local site running (CLAUDE.md, « Tester en local ») ;
//   2. node scripts/css-compare.mjs snap before.json   (before the change: build, restart wrangler, snap)
//   3. node scripts/css-compare.mjs snap after.json    (after the change, same steps)
//   4. node scripts/css-compare.mjs diff before.json after.json
import {mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {createRequire} from 'node:module';

const [mode, first, second] = process.argv.slice(2);
const BASE = new URL(process.env.SITE || 'http://localhost:8787');
const DEFAULT_VIEWPORTS = '1366x900,390x844';
const launchers = createRequire(import.meta.url)('playwright');

function viewports(value = DEFAULT_VIEWPORTS) {
  return value.split(',').map(part => {
    if (!/^\d{3,4}x\d{3,4}$/.test(part)) throw new Error(`Invalid viewport: ${part}`);
    const [width, height] = part.split('x').map(Number);
    return {width, height};
  });
}

function diff(beforeFile, afterFile) {
  const [a, b] = [beforeFile, afterFile].map(file => JSON.parse(readFileSync(file, 'utf8')));
  let total = 0;
  for (const page of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (!Object.hasOwn(a,page) || !Object.hasOwn(b,page)) {
      console.log(`## ${page} (${a[page] ? 'capture manquante après' : 'capture manquante avant'})`);
      total++;
      continue;
    }
    const A = a[page], B = b[page], lines = [];
    for (const element of new Set([...Object.keys(A), ...Object.keys(B)])) {
      if (!A[element] || !B[element]) { lines.push(`${A[element] ? '-' : '+'} ${element.slice(-120)}`); continue; }
      for (const property of new Set([...Object.keys(A[element]), ...Object.keys(B[element])]))
        if (A[element][property] !== B[element][property]) lines.push(`${element.slice(-90)} ${property}: ${A[element][property]} → ${B[element][property]}`);
    }
    total += lines.length;
    if (lines.length) console.log(`## ${page} (${lines.length})\n${lines.slice(0, 15).join('\n')}`);
  }
  console.log(total ? `${total} différence(s)` : 'Aucune différence.');
  process.exitCode = total ? 1 : 0;
}

async function snap(file) {
  // These demonstration credentials belong exclusively to the seeded local database.
  if (!['localhost','127.0.0.1','[::1]'].includes(BASE.hostname)) throw new Error('The CSS comparison requires the seeded local site.');
  const engine = process.env.CSS_COMPARE_BROWSER || 'chromium';
  if (!['chromium','firefox','webkit'].includes(engine)) throw new Error(`Invalid browser: ${engine}`);
  const screenshotDir = process.env.CSS_COMPARE_SCREENSHOTS;
  const sizes = viewports(process.env.CSS_COMPARE_VIEWPORTS);
  const admin = 'a'.repeat(64), pilot = 'b'.repeat(64);
  const response = await fetch(new URL('/api/races?game=lmu&scope=upcoming',BASE), {
    headers:{Cookie:`__Host-em_session=${admin}`},signal:AbortSignal.timeout(10000)
  });
  if (!response.ok) throw new Error(`Could not read local fixture races (HTTP ${response.status}). Run npm run seed:local first.`);
  const {events:races} = await response.json();
  const race = name => {
    const match = races?.find(item => name ? item.name === name : item.format === 'solo');
    if (!match) throw new Error(`Missing local fixture: ${name || 'solo event'}.`);
    return match.id;
  };
  const pages = [['/lmu/', admin], ['/lmu/', pilot], [`/lmu/#event=${race('24h du Mans')}`, admin], [`/lmu/#event=${race('6h de Spa')}`, pilot],
    [`/lmu/#event=${race()}`, pilot], ['/lmu/#inscriptions', pilot], ['/lmu/#semaine', admin], ['/lmu/#equipages', admin],
    ['/events/', admin], ['/iracing/', admin], ['/members.html', admin], ['/charte.html', admin], ['/help.html', pilot], ['/diagnostics.html', admin],
    ['/demande-communaute.html', pilot], ['/fiches-combo.html', admin], ['/simhub.html', admin], ['/mur-des-stands.html', admin], ['/mur.html', admin], ['/', null]];
  // CHROMIUM permits using a locally installed Chromium executable.
  const options = engine === 'chromium' && process.env.CHROMIUM ? {executablePath:process.env.CHROMIUM} : {};
  const out = {};
  if (screenshotDir) mkdirSync(screenshotDir, {recursive:true});
  const browser = await launchers[engine].launch(options);
  try {
    for (const {width,height} of sizes) for (const [index,[path,session]] of pages.entries()) {
      const context = await browser.newContext({viewport:{width,height}, serviceWorkers:'block', timezoneId:'Europe/Paris', locale:'fr-FR'});
      try {
        const page = await context.newPage();
        if (session) {
          await page.goto(new URL('/offline.html',BASE).href);
          const signedIn = await page.evaluate(async value => {
            document.cookie = `__Host-em_session=${value}; path=/; secure; SameSite=Lax`;
            const response = await fetch('/api/session');
            return response.ok && (await response.json()).access === 'member';
          },session);
          if (!signedIn) throw new Error(`The local fixture account could not sign in for ${path}.`);
        }
        await page.clock.setFixedTime(new Date('2026-11-14T10:00:00Z'));
        const loaded = await page.goto(new URL(path,BASE).href,{waitUntil:'networkidle'});
        if (!loaded?.ok()) throw new Error(`Could not open ${path}: HTTP ${loaded?.status()}.`);
        await page.addStyleTag({content:'*,*::before,*::after{transition:none!important;animation:none!important;caret-color:transparent!important}'});
        await page.evaluate(() => document.fonts.ready);
        if (screenshotDir) {
          const path = join(screenshotDir,`${engine}-${width}x${height}-${String(index+1).padStart(2,'0')}.png`);
          await page.screenshot({path,fullPage:true});
        }
        out[`${engine} ${width}x${height} ${session === admin ? 'admin' : session ? 'pilote' : 'anonyme'} ${path}`] = await page.evaluate(() => {
          const result = {};
          const pathOf = element => { const parts = []; for (let e = element; e && e.nodeType === 1; e = e.parentElement) { let index = 0, s = e; while ((s = s.previousElementSibling)) index++;
            parts.unshift(`${e.tagName.toLowerCase()}${typeof e.className === 'string' && e.className.trim() ? '.' + e.className.trim().split(/\s+/).sort().join('.') : ''}:${index}`); } return parts.join('>'); };
          for (const element of document.querySelectorAll('body *')) {
            // Pictures from other sites (circuit maps) come or not with the network: not a matter of style.
            if (['SCRIPT', 'STYLE', 'LINK', 'META'].includes(element.tagName) || (element.tagName === 'IMG' && /^https?:/.test(element.getAttribute('src') || ''))) continue;
            const entry = {};
            for (const pseudo of [null, '::before', '::after']) {
              const style = getComputedStyle(element, pseudo);
              if (pseudo && ['none', 'normal'].includes(style.content)) continue;
              for (let i = 0; i < style.length; i++) if (!/^(transition|animation|caret-color)/.test(style[i])) entry[(pseudo || '') + style[i]] = style.getPropertyValue(style[i]);
            }
            const box = element.getBoundingClientRect();
            entry.rect = [box.x, box.y, box.width, box.height].map(value => Number(value.toFixed(3))).join(',');
            result[pathOf(element)] = entry;
          }
          return result;
        });
      } finally { await context.close(); }
    }
  } finally { await browser.close(); }
  writeFileSync(file, JSON.stringify(out));
  console.log(`${Object.keys(out).length} pages enregistrées dans ${file}`);
}

if (mode === 'snap' && first) await snap(first);
else if (mode === 'diff' && first && second) diff(first, second);
else console.log('node scripts/css-compare.mjs snap fichier.json | diff avant.json apres.json');
