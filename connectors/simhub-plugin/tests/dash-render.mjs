// Un dash SimHub dessiné hors de SimHub, pour voir le rendu sans le PC : les éléments du dash (rectangles et textes de
// Dash Studio, avec leurs formules) et les valeurs des propriétés (par exemple out/<séance>.mur.json du rejeu) donnent
// une page HTML à la taille du dash ; avec --png, une capture (Playwright). Les formules utilisées par nos dashs sont
// simples ([propriété], 'texte', if, blink, + - * /, comparaisons, && || !) : elles sont traduites en JavaScript.
// Les polices de Windows (Bahnschrift, Consolas) manquent ailleurs : une police proche les remplace.
//   node dash-render.mjs <éléments.json> <valeurs.json> <sortie.html> [--png sortie.png] [--prefix EnduranceManagerPlugin.]
import {readFileSync, writeFileSync} from 'node:fs';

const args = process.argv.slice(2);
const [itemsFile, valuesFile, output] = args;
const option = name => { const k = args.indexOf(name); return k > 0 ? args[k + 1] : null; };
const prefix = option('--prefix') ?? 'EnduranceManagerPlugin.';
const items = JSON.parse(readFileSync(itemsFile, 'utf8'));
const values = Object.fromEntries(Object.entries(JSON.parse(readFileSync(valuesFile, 'utf8'))).map(([k, v]) => [prefix + k, v]));

// SimHub's colours are #AARRGGBB.
function color(argb) {
  if (typeof argb !== 'string' || !argb.startsWith('#')) return 'transparent';
  const hex = argb.slice(1);
  if (hex.length === 6) return '#' + hex;
  const a = parseInt(hex.slice(0, 2), 16) / 255;
  return `rgba(${parseInt(hex.slice(2, 4), 16)},${parseInt(hex.slice(4, 6), 16)},${parseInt(hex.slice(6, 8), 16)},${a.toFixed(3)})`;
}

const missing = new Set();
function evaluate(expression) {
  const js = expression
    .replace(/\[([^\]]+)\]/g, (_, name) => `v(${JSON.stringify(name)})`)
    .replace(/'((?:[^'\\]|\\.)*)'/g, (_, text) => JSON.stringify(text.replace(/\\'/g, "'")))
    .replace(/\bif\(/g, 'IF(')
    .replace(/\bblink\(/g, 'BLINK(');
  const v = name => { if (!(name in values)) missing.add(name); return values[name] ?? null; };
  // A frame in alert is drawn lit (the picture is one moment of the blink).
  const IF = (c, a, b) => (c ? a : b), BLINK = (_name, _ms, on) => !!on;
  try { return Function('v', 'IF', 'BLINK', `"use strict"; return (${js});`)(v, IF, BLINK); }
  catch { return undefined; }
}

const fonts = {Bahnschrift: "'Bahnschrift', 'Barlow Semi Condensed', 'DejaVu Sans Condensed', 'Arial Narrow', sans-serif", Consolas: "'Consolas', 'DejaVu Sans Mono', monospace"};
const weights = {Normal: 400, SemiBold: 600, Bold: 700, Light: 300};
let width = 0, height = 0;
const parts = [];

function draw(item, dx = 0, dy = 0) {
  const b = item.Bindings || {};
  const bound = key => (b[key] ? evaluate(b[key].Formula.Expression) : undefined);
  const visible = bound('Visible');
  if (item.Visible === false || visible === false || (b.Visible && !visible)) return;
  const num = (key, fallback) => { const x = bound(key); return typeof x === 'number' && Number.isFinite(x) ? x : fallback; };
  const left = num('Left', item.Left ?? 0) + dx, top = num('Top', item.Top ?? 0) + dy, w = num('Width', item.Width ?? 0), h = num('Height', item.Height ?? 0);
  width = Math.max(width, left + w); height = Math.max(height, top + h);
  if (item.Childrens) { for (const child of item.Childrens) draw(child, left, top); return; }
  const background = color(bound('BackgroundColor') ?? item.BackgroundColor);
  const box = `left:${left}px;top:${top}px;width:${w}px;height:${h}px;background:${background};`;
  if (item.IsRectangleItem) {
    const s = item.BorderStyle || {};
    const border = s.BorderColor && s.BorderTop ? `border:${s.BorderTop}px solid ${color(s.BorderColor)};` : '';
    parts.push(`<div style="${box}${border}border-radius:${s.RadiusTopLeft ?? 0}px;box-sizing:border-box"></div>`);
  } else if (item.IsTextItem) {
    let text = bound('Text');
    if (text === undefined) text = item.Text ?? '';
    if (text === null) text = '';
    const align = ['flex-start', 'center', 'flex-end'][item.HorizontalAlignment ?? 0];
    const css = `${box}color:${color(bound('TextColor') ?? item.TextColor)};font-family:${fonts[item.Font] ?? item.Font};font-size:${item.FontSize}px;`
      + `font-weight:${weights[item.FontWeight] ?? 400};${item.FontStyle === 'Italic' ? 'font-style:italic;' : ''}justify-content:${align};`;
    const safe = String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;');
    parts.push(`<div class="t" style="${css}">${safe}</div>`);
  }
}

for (const item of items) draw(item);
writeFileSync(output, `<!doctype html><meta charset="utf-8"><title>Dash</title>
<style>body{margin:0;background:#000}#d{position:relative;width:${width}px;height:${height}px;overflow:hidden}
#d>div{position:absolute}.t{display:flex;align-items:center;white-space:nowrap;overflow:hidden;line-height:1}</style>
<div id="d">${parts.join('\n')}</div>`);
console.log(`${parts.length} éléments dessinés (${width} × ${height}) → ${output}`);
if (missing.size) console.log(`Propriétés sans valeur : ${[...missing].slice(0, 20).join(', ')}${missing.size > 20 ? '…' : ''}`);

const png = option('--png');
if (png) {
  const {chromium} = await import('playwright');
  const browser = await chromium.launch(process.env.CHROMIUM_PATH ? {executablePath: process.env.CHROMIUM_PATH} : {});
  const page = await browser.newPage({viewport: {width: Math.ceil(width), height: Math.ceil(height)}, deviceScaleFactor: 1});
  await page.goto('file://' + (await import('node:path')).resolve(output));
  await page.screenshot({path: png});
  await browser.close();
  console.log('Capture : ' + png);
}
