// Safety net for CSS work: the computed style and place of every element of the main pages, at PC and phone width,
// before and after a change. Nothing may move unless it is meant to.
//   1. the local site running (CLAUDE.md, « Tester en local ») ;
//   2. node scripts/css-compare.mjs snap before.json   (before the change: build, restart wrangler, snap)
//   3. node scripts/css-compare.mjs snap after.json    (after the change, same steps)
//   4. node scripts/css-compare.mjs diff before.json after.json
import {readFileSync, writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';

const [mode, first, second] = process.argv.slice(2);
const BASE = process.env.SITE || 'http://localhost:8787';

function diff(beforeFile, afterFile) {
  const [a, b] = [beforeFile, afterFile].map(file => JSON.parse(readFileSync(file, 'utf8')));
  let total = 0;
  for (const page of Object.keys(a)) {
    const A = a[page], B = b[page] || {}, lines = [];
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
  const {chromium} = createRequire(import.meta.url)('playwright');
  const admin = 'a'.repeat(64), pilot = 'b'.repeat(64);
  const races = (await (await fetch(`${BASE}/api/races?game=lmu&scope=upcoming`, {headers:{Cookie:`__Host-em_session=${admin}`}})).json()).events || [];
  const race = name => races.find(item => item.name === name)?.id || 'none';
  const pages = [['/lmu/', admin], ['/lmu/', pilot], [`/lmu/#event=${race('24h du Mans')}`, admin], [`/lmu/#event=${race('6h de Spa')}`, pilot],
    [`/lmu/#event=${races.find(item => item.format === 'solo')?.id}`, pilot], ['/lmu/#inscriptions', pilot], ['/lmu/#semaine', admin], ['/lmu/#equipages', admin],
    ['/events/', admin], ['/iracing/', admin], ['/members.html', admin], ['/charte.html', admin], ['/help.html', pilot], ['/diagnostics.html', admin],
    ['/demande-communaute.html', pilot], ['/fiches-combo.html', admin], ['/mur-des-stands.html', admin], ['/mur.html', admin], ['/', null]];
  // CHROMIUM: another browser than the one of the repo's Playwright (a cloud machine: /opt/pw-browsers/chromium).
  const browser = await chromium.launch(process.env.CHROMIUM ? {executablePath:process.env.CHROMIUM} : {}), out = {};
  for (const [width, height] of [[1366, 900], [390, 844]]) for (const [path, session] of pages) {
    const context = await browser.newContext({viewport:{width, height}, serviceWorkers:'block', timezoneId:'Europe/Paris', locale:'fr-FR'});
    const page = await context.newPage();
    await page.addInitScript(() => { const fixed = Date.parse('2026-11-14T10:00:00Z'); Date.now = () => fixed; });
    if (session) { await page.goto(`${BASE}/404`); await page.evaluate(value => { document.cookie = `__Host-em_session=${value}; path=/; secure`; }, session); }
    await page.goto(BASE + path, {waitUntil:'networkidle'}).catch(() => {});
    await page.waitForTimeout(1200);
    await page.addStyleTag({content:'*,*::before,*::after{transition:none!important;animation:none!important;caret-color:transparent!important}'});
    out[`${width} ${session === admin ? 'admin' : session ? 'pilote' : 'anonyme'} ${path}`] = await page.evaluate(() => {
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
        entry.rect = [box.x, box.y, box.width, box.height].map(Math.round).join(',');
        result[pathOf(element)] = entry;
      }
      return result;
    });
    await context.close();
  }
  await browser.close();
  writeFileSync(file, JSON.stringify(out));
  console.log(`${Object.keys(out).length} pages enregistrées dans ${file}`);
}

if (mode === 'snap' && first) await snap(first);
else if (mode === 'diff' && first && second) diff(first, second);
else console.log('node scripts/css-compare.mjs snap fichier.json | diff avant.json apres.json');
