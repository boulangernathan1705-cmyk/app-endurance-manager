// Builds the SimHub dash « Endurance Manager · Mur » from dash/mur.html (the approved mockup): Chromium lays the page out,
// every box, text and drawing is read where the browser put it, with its colours and font, and written as Dash Studio
// items to dash/mur.json (embedded in the plugin, WallDash.cs). The data-* attributes of the page become the bindings
// to the plugin's EnduranceManagerPlugin.Mur.* properties (see the comment at the top of mur.html).
//
//   node connectors/simhub-plugin/dash/build.mjs                       writes mur.json, and mur-sample.png (the mockup's sample) in the temp folder
//   node connectors/simhub-plugin/dash/build.mjs values.json out.png   draws mur.json with these property values
//                                                                      (add « alert » to show the flashing frames on)
// Run where Chromium and Playwright are installed (the cloud sessions have them); the result is committed.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../..');
const WIDTH = 2560, HEIGHT = 1440;
const TYPES = { '.html': 'text/html', '.css': 'text/css', '.woff2': 'font/woff2', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml' };

async function open(browser) {
  const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT } });
  await page.route('https://dash.local/**', route => {
    const url = new URL(route.request().url());
    const file = url.pathname === '/mur.html' ? path.join(here, 'mur.html') : path.join(root, decodeURIComponent(url.pathname));
    if (!file.startsWith(root) || !fs.existsSync(file)) return route.fulfill({ status: 404, body: '' });
    route.fulfill({ status: 200, contentType: TYPES[path.extname(file)] || 'application/octet-stream', body: fs.readFileSync(file) });
  });
  return page;
}

// ---------- Reading the page (runs in the browser) ----------

function readPage() {
  const PREFIX = 'EnduranceManagerPlugin.Mur.';
  // A property name, or a formula starting with « = » where {Name} is a property.
  const expr = value => value.startsWith('=') ? value.slice(1).replace(/\{([^}]+)\}/g, (m, name) => `[${PREFIX}${name}]`) : `[${PREFIX}${value}]`;
  const probe = document.createElement('i');
  document.body.appendChild(probe);
  // Any CSS colour as [r, g, b, a], resolved by the browser (color-mix included).
  const rgba = text => {
    probe.style.color = '';
    probe.style.color = text;
    const c = getComputedStyle(probe).color;
    let m = c.match(/^rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)$/);
    if (m) return [+m[1], +m[2], +m[3], m[4] === undefined ? 1 : +m[4]];
    m = c.match(/^color\(srgb ([\d.e-]+) ([\d.e-]+) ([\d.e-]+)(?: \/ ([\d.]+))?\)$/);
    if (m) return [m[1] * 255, m[2] * 255, m[3] * 255, m[4] === undefined ? 1 : +m[4]];
    return [0, 0, 0, 0];
  };
  // The colours inside a gradient (the dash draws flat colours: their average).
  const gradient = text => {
    const found = [];
    const re = /(color-mix\((?:[^()]|\([^()]*\))*\)|rgba?\([^)]*\)|color\([^)]*\)|#[0-9a-f]{3,8})/gi;
    let m;
    while ((m = re.exec(text))) found.push(rgba(m[1]));
    if (!found.length) return null;
    return [0, 1, 2, 3].map(k => found.reduce((sum, c) => sum + c[k], 0) / found.length);
  };
  const argb = (c, opacity = 1) => {
    const a = Math.round(Math.max(0, Math.min(1, c[3] * opacity)) * 255);
    return '#' + [a, c[0], c[1], c[2]].map(v => Math.round(v).toString(16).padStart(2, '0')).join('').toUpperCase();
  };
  const visible = c => c && c[3] > 0.004;
  const px = v => parseFloat(v) || 0;

  const items = [];
  let count = 0;
  // ctx: what an element passes to what is inside: shown (formulas), off (hidden in the sample), opacity, move, blink.
  const add = (item, ctx) => {
    item.name = `${item.kind === 'text' ? 'T' : 'R'}${++count}${item.label ? ' ' + item.label : ''}`;
    delete item.label;
    item.bind ||= {};
    if (ctx.shown.length) item.bind.Visible = ctx.shown.map(s => `(${s})`).join(' && ');
    if (ctx.move) {
      const moves = ctx.move.map(m => `(${m.value} - ${m.sample}) * ${m.width.toFixed(1)}`).join(' + ');
      item.bind.Left = item.bind.Left ? `${item.bind.Left} + ${moves}` : `${item.x.toFixed(1)} + ${moves}`;
    }
    item.off = ctx.off;
    items.push(item);
  };
  const contentBox = el => {
    const r = el.getBoundingClientRect(), s = getComputedStyle(el);
    const l = r.left + px(s.borderLeftWidth) + px(s.paddingLeft), t = r.top + px(s.borderTopWidth) + px(s.paddingTop);
    return { x: l, y: t, w: r.width - px(s.borderLeftWidth) - px(s.borderRightWidth) - px(s.paddingLeft) - px(s.paddingRight),
      h: r.height - px(s.borderTopWidth) - px(s.borderBottomWidth) - px(s.paddingTop) - px(s.paddingBottom) };
  };
  const radius = (s, w, h) => ['borderTopLeftRadius', 'borderTopRightRadius', 'borderBottomRightRadius', 'borderBottomLeftRadius']
    .map(k => { const v = s[k]; const r = v.endsWith('%') ? parseFloat(v) / 100 * Math.min(w, h) : px(v); return Math.round(Math.min(r, w / 2, h / 2)); });
  const font = s => ({
    font: s.fontFamily.split(',')[0].replace(/["']/g, '').trim(),
    size: Math.round(px(s.fontSize) * 10) / 10,
    weight: { 100: 'Thin', 200: 'ExtraLight', 300: 'Light', 400: 'Normal', 500: 'Medium', 600: 'SemiBold', 700: 'Bold', 800: 'ExtraBold', 900: 'Black' }[Math.min(700, Math.round(+s.fontWeight / 100) * 100)] || 'Normal'
  });
  const transform = (text, s) => s.textTransform === 'uppercase' ? text.toUpperCase() : s.textTransform === 'lowercase' ? text.toLowerCase() : text;

  // Where a text sits in its parent: right, centre or left, and the room it may grow into.
  function placeText(box, el, s, dynamic) {
    const parent = el.parentElement, pc = contentBox(parent), ps = getComputedStyle(parent);
    let align = s.textAlign === 'right' || s.textAlign === 'end' ? 2 : s.textAlign === 'center' ? 1 : 0;
    const gapLeft = box.x - pc.x, gapRight = pc.x + pc.w - (box.x + box.w);
    if (align === 0 && ps.display.includes('flex') && ps.flexDirection.startsWith('row') && ps.justifyContent === 'space-between' && gapRight < 2 && gapLeft > 2) align = 2;
    if (align === 0 && ps.display.includes('grid') && gapRight < 2 && gapLeft > 4) align = 2;
    if (align === 0 && Math.abs(gapLeft - gapRight) < 2 && gapLeft > 3) align = 1;
    if (align === 0 && el.dataset.t !== undefined && /center/.test(s.justifyItems + s.justifyContent + s.placeItems)) align = 1;
    if (el.dataset.a) align = +el.dataset.a;
    const grow = dynamic ? Math.max(box.w * 0.6 + 24, 0) : box.w * 0.15 + 8;
    let { x, w } = box;
    if (align === 0) w = dynamic ? Math.max(w + grow, pc.x + pc.w - x) : w + grow;
    else if (align === 2) { const room = dynamic ? Math.max(grow, x - pc.x) : grow; x -= room; w += room; }
    else { x -= grow / 2; w += grow; }
    return { x, w, align };
  }

  function text(content, box, el, s, ctx, dynamic, binds = {}) {
    const color = rgba(s.color);
    const place = placeText(box, el, s, dynamic);
    add({ kind: 'text', label: (el.dataset.t || content).slice(0, 40), x: place.x, y: box.y, w: place.w, h: box.h, text: content, ...font(s), color: argb(color, ctx.opacity), align: place.align, bind: binds }, ctx);
  }

  function rect(box, s, ctx, el, binds = {}) {
    const bg = s.backgroundImage !== 'none' ? gradient(s.backgroundImage) : rgba(s.backgroundColor);
    const widths = ['borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth'].map(k => s.borderStyle === 'none' ? 0 : px(s[k]));
    const edge = rgba(s.borderTopColor === 'rgba(0, 0, 0, 0)' ? s.borderLeftColor : s.borderTopColor);
    const hasBorder = widths.some(w => w > 0) && visible(edge);
    if (!visible(bg) && !hasBorder && !binds.BackgroundColor) return;
    const r = radius(s, box.w, box.h);
    // A bound border colour (data-bc): the border as a coloured shape under a shape of the background colour.
    if (el?.dataset.bc && hasBorder) {
      add({ kind: 'rect', label: el.dataset.bc, x: box.x, y: box.y, w: box.w, h: box.h, bg: argb(edge, ctx.opacity), radius: r, bind: { BackgroundColor: expr(el.dataset.bc) } }, ctx);
      const k = widths[0];
      add({ kind: 'rect', x: box.x + k, y: box.y + k, w: box.w - 2 * k, h: box.h - 2 * k, bg: argb(bg, ctx.opacity), radius: r.map(v => Math.max(0, v - k)), bind: binds }, ctx);
      return;
    }
    add({ kind: 'rect', label: binds.BackgroundColor ? el?.dataset.bg : '', x: box.x, y: box.y, w: box.w, h: box.h, bg: argb(bg, ctx.opacity), radius: r,
      border: hasBorder ? { color: argb(edge, ctx.opacity), widths } : null, bind: binds }, ctx);
  }

  // Rings drawn by box-shadow (0 0 0 Npx colour), outermost first, under the element.
  function rings(box, s, ctx, r) {
    if (!s.boxShadow || s.boxShadow === 'none') return;
    const list = s.boxShadow.split(/,(?![^(]*\))/).map(part => {
      const color = part.match(/(rgba?\([^)]*\)|color\([^)]*\))/);
      const nums = part.replace(color ? color[0] : '', '').trim().split(/\s+/).filter(v => v.endsWith('px')).map(px);
      return { inset: part.includes('inset'), color: color ? rgba(color[0]) : null, nums };
    }).filter(sh => !sh.inset && sh.color && sh.nums.length === 4 && sh.nums[0] === 0 && sh.nums[1] === 0 && sh.nums[2] === 0 && sh.nums[3] > 0);
    for (const sh of list.reverse()) {
      const k = sh.nums[3];
      add({ kind: 'rect', x: box.x - k, y: box.y - k, w: box.w + 2 * k, h: box.h + 2 * k, bg: argb(sh.color, ctx.opacity), radius: r.map(v => v + k) }, ctx);
    }
  }

  // An SVG drawing: rectangles as boxes, lines as a row of small round dots along the path.
  function svg(node, ctx) {
    for (const el of node.querySelectorAll('rect, path')) {
      const s = getComputedStyle(el), m = el.getScreenCTM(), scale = Math.sqrt(m.a * m.a + m.b * m.b);
      const stroke = s.stroke === 'none' ? null : rgba(s.stroke), fill = s.fill === 'none' ? null : rgba(s.fill);
      const width = px(s.strokeWidth) * scale;
      const binds = el.dataset.c ? { BackgroundColor: expr(el.dataset.c) } : {};
      if (el.tagName === 'rect') {
        const r = el.getBoundingClientRect(), rx = px(el.getAttribute('rx')) * scale;
        const box = { x: r.left + width / 2, y: r.top + width / 2, w: r.width - width, h: r.height - width };
        if (stroke && visible(stroke) && width > 0) {
          add({ kind: 'rect', label: el.dataset.c, x: box.x - width / 2, y: box.y - width / 2, w: box.w + width, h: box.h + width, bg: argb(stroke, ctx.opacity), radius: Array(4).fill(Math.round(rx + width / 2)), bind: binds }, ctx);
          add({ kind: 'rect', x: box.x + width / 2, y: box.y + width / 2, w: box.w - width, h: box.h - width, bg: argb(fill && visible(fill) ? fill : [19, 23, 34, 1], ctx.opacity), radius: Array(4).fill(Math.max(0, Math.round(rx - width / 2))) }, ctx);
        } else if (fill && visible(fill)) add({ kind: 'rect', x: box.x, y: box.y, w: box.w, h: box.h, bg: argb(fill, ctx.opacity), radius: Array(4).fill(Math.round(rx)) }, ctx);
        continue;
      }
      if (!stroke || !visible(stroke) || width <= 0) continue;
      const length = el.getTotalLength(), step = Math.max(1.5, width * 0.5);
      // A path with jumps (M inside): split where two points are far apart.
      for (let at = 0; at <= length + 0.01; at += step) {
        const p = el.getPointAtLength(Math.min(at, length)), x = m.a * p.x + m.c * p.y + m.e, y = m.b * p.x + m.d * p.y + m.f;
        add({ kind: 'rect', label: el.dataset.c, x: x - width / 2, y: y - width / 2, w: width, h: width, bg: argb(stroke, ctx.opacity), radius: Array(4).fill(Math.round(width / 2)), bind: { ...binds } }, ctx);
      }
    }
  }

  function walk(el, ctx) {
    const s = getComputedStyle(el);
    if (s.display === 'none' || s.visibility === 'hidden' || el === probe) return;
    if (el.tagName === 'SCRIPT' || el.tagName === 'STYLE' || el.tagName === 'HEAD') return;
    const r = el.getBoundingClientRect();
    const box = { x: r.left, y: r.top, w: r.width, h: r.height };
    const d = el.dataset;
    ctx = { ...ctx, opacity: ctx.opacity * (+s.opacity) };
    if (d.v) ctx.shown = [...ctx.shown, expr(d.v)];
    if ('off' in d) ctx.off = true;
    if (d.xf !== undefined) {
      const ref = el.parentElement.closest('[data-xref]') || el.parentElement;
      ctx.move = [...(ctx.move || []), { value: expr(d.xf), sample: +d.xs || 0, width: contentBox(ref).w }];
    }
    const own = {};
    if (d.bg) own.BackgroundColor = expr(d.bg);
    if (d.wf) own.Width = `(${expr(d.wf)}) * ${contentBox(el.parentElement).w.toFixed(1)}`;
    if (d.hf) {
      const pc = contentBox(el.parentElement);
      own.Height = `(${expr(d.hf)}) * ${pc.h.toFixed(1)}`;
      own.Top = `${(pc.y + pc.h).toFixed(1)} - (${expr(d.hf)}) * ${pc.h.toFixed(1)}`;
    }
    if (d.trace) {
      const [pedal, k] = d.trace.split('.'), area = contentBox(el.parentElement);
      const before = `[${PREFIX}Entrees.Trace.${pedal}.${+k - 1}]`, now = `[${PREFIX}Entrees.Trace.${pedal}.${k}]`;
      own.Top = `${area.y.toFixed(1)} + (1 - Max(${before}, ${now})) * ${area.h.toFixed(1)}`;
      own.Height = `Abs(${now} - ${before}) * ${area.h.toFixed(1)} + 3`;
    }
    if (el.tagName.toLowerCase() === 'svg') { svg(el, ctx); return; }
    if (box.w > 0 && box.h > 0 && el !== document.body && el !== document.documentElement) {
      const rr = radius(s, box.w, box.h);
      rings(box, s, ctx, rr);
      rect(box, s, ctx, el, own);
    }
    if (d.t !== undefined) {
      const binds = { Text: expr(d.t) };
      if (d.c) binds.TextColor = expr(d.c);
      const cb = contentBox(el);
      // An inline element's box is its line: keep it; a block (a cell) gives its content box.
      const line = s.display === 'inline' ? box : cb;
      if (s.textTransform === 'uppercase') console.warn(`en capitales par la page, à envoyer en capitales : ${d.t}`);
      text(transform(el.textContent.trim(), s), line, el, s, ctx, true, binds);
    } else {
      for (const child of el.childNodes) {
        if (child.nodeType === 3) {
          const content = child.textContent.replace(/\s+/g, ' ').trim();
          if (!content) continue;
          const range = document.createRange();
          // Only the visible characters: a leading space would shift the text.
          const raw0 = child.textContent, startAt = raw0.search(/\S/), endAt = raw0.length - (raw0.match(/\s*$/)[0].length);
          range.setStart(child, startAt); range.setEnd(child, endAt);
          const rects = [...range.getClientRects()].filter(q => q.width > 0);
          if (!rects.length) continue;
          const binds = d.c ? { TextColor: expr(d.c) } : {};
          // A text the page wraps: one item per line (its words grouped by the line they sit on).
          const lines = [];
          if (rects.length > 1) {
            const raw = child.textContent;
            const re = /\S+/g;
            let m;
            while ((m = re.exec(raw))) {
              const word = document.createRange();
              word.setStart(child, m.index); word.setEnd(child, m.index + m[0].length);
              const q = word.getBoundingClientRect();
              const line = lines.find(l => Math.abs(l.top - q.top) < 2);
              if (line) { line.words.push(m[0]); line.right = q.right; line.bottom = Math.max(line.bottom, q.bottom); }
              else lines.push({ words: [m[0]], left: q.left, top: q.top, right: q.right, bottom: q.bottom });
            }
          } else lines.push({ words: [content], left: rects[0].left, top: rects[0].top, right: rects[0].right, bottom: rects[0].bottom });
          for (const l of lines) text(transform(l.words.join(' '), s), { x: l.left, y: l.top, w: l.right - l.left, h: l.bottom - l.top }, el, s, ctx, false, binds);
        } else if (child.nodeType === 1) walk(child, ctx);
      }
    }
    // The frame flashes while the alert is on (an outline over the frame only).
    if (d.blink) {
      const rr = radius(s, box.w, box.h);
      add({ kind: 'rect', label: 'alerte ' + d.blink, x: box.x - 2, y: box.y - 2, w: box.w + 4, h: box.h + 4, bg: '#2EFF3366', radius: rr.map(v => v + 2),
        border: { color: '#FFFF3366', widths: [3, 3, 3, 3] }, bind: { Visible: `blink('${d.blink.replace(/\W/g, '')}${count}', 400, ${expr(d.blink)})` } }, { ...ctx, off: true });
    }
  }
  walk(document.body, { shown: [], off: false, opacity: 1, move: null });
  probe.remove();
  return items;
}

// ---------- Dash Studio items ----------

const TEXT = 'SimHub.Plugins.OutputPlugins.GraphicalDash.Models.TextItem, SimHub.Plugins';
const RECT = 'SimHub.Plugins.OutputPlugins.GraphicalDash.Models.RectangleItem, SimHub.Plugins';
const bind = (target, expression) => ({ Formula: { Expression: expression }, Mode: 2, TargetPropertyName: target });
const r1 = v => Math.round(v * 10) / 10;

function toDash(item) {
  const bindings = {};
  for (const [target, expression] of Object.entries(item.bind || {})) bindings[target] = bind(target, expression);
  const base = { Name: item.name, Left: r1(item.x), Top: r1(item.y), Width: r1(Math.max(1, item.w)), Height: r1(Math.max(1, item.h)), Visible: true };
  if (item.kind === 'text') return {
    $type: TEXT, IsTextItem: true, ...base, Font: item.font, FontSize: item.size, FontWeight: item.weight, Text: item.text, TextColor: item.color,
    HorizontalAlignment: item.align, VerticalAlignment: 1, BackgroundColor: '#00FFFFFF', Bindings: bindings
  };
  const [tl, tr, br, bl] = item.radius;
  const [bt, brw, bb, blw] = item.border ? item.border.widths : [0, 0, 0, 0];
  return {
    $type: RECT, IsRectangleItem: true, ...base, BackgroundColor: item.bg,
    BorderStyle: { BorderColor: item.border ? item.border.color : '#00000000', BorderTop: bt, BorderRight: brw, BorderBottom: bb, BorderLeft: blw,
      RadiusTopLeft: tl, RadiusTopRight: tr, RadiusBottomRight: br, RadiusBottomLeft: bl },
    Bindings: bindings
  };
}

// ---------- Drawing the dash items (the preview: what SimHub should show) ----------

// The few NCalc formulas the dash uses (properties, numbers, 'texts', + - * /, comparisons, ! && ||, if, blink, Max,
// Min, Abs), read by a small parser: the preview never runs the formula as code.
function evaluate(expression, values, alert) {
  const tokens = expression.match(/\[[^\]]+\]|'(?:[^'\\]|\\.)*'|\d+(?:\.\d+)?|[A-Za-z_]\w*|&&|\|\||==|!=|<=|>=|[-+*/(),!<>]/g) || [];
  let at = 0;
  const peek = () => tokens[at], take = () => tokens[at++];
  const calls = { if: (c, a, b) => (c ? a : b), blink: (id, ms, on) => Boolean(on) && alert, Max: Math.max, Min: Math.min, Abs: Math.abs };
  function primary() {
    const t = take();
    if (t === undefined) throw new Error('fin');
    if (t === '(') { const v = or(); take(); return v; }
    if (t === '!') return !primary();
    if (t === '-') return -primary();
    if (t[0] === '[') return values[t.slice(1, -1).replace('EnduranceManagerPlugin.', '')] ?? null;
    if (t[0] === "'") return t.slice(1, -1).replace(/\\'/g, "'");
    if (/^\d/.test(t)) return Number(t);
    if (t === 'true' || t === 'false') return t === 'true';
    if (calls[t]) {
      take();
      const args = [];
      while (peek() !== ')') { args.push(or()); if (peek() === ',') take(); }
      take();
      return calls[t](...args);
    }
    throw new Error(t);
  }
  const level = (next, ops) => () => {
    let v = next();
    while (ops[peek()]) { const op = take(); v = ops[op](v, next()); }
    return v;
  };
  const product = level(primary, { '*': (a, b) => a * b, '/': (a, b) => a / b });
  const sum = level(product, { '+': (a, b) => a + b, '-': (a, b) => a - b });
  const compare = level(sum, { '<': (a, b) => a < b, '>': (a, b) => a > b, '<=': (a, b) => a <= b, '>=': (a, b) => a >= b, '==': (a, b) => a === b, '!=': (a, b) => a !== b });
  const and = level(compare, { '&&': (a, b) => a && b });
  const or = level(and, { '||': (a, b) => a || b });
  try { return or(); } catch { return undefined; }
}

function drawHtml(items, values, alert) {
  const argb = c => (c && c[0] === '#' && c.length === 9 ? `rgba(${parseInt(c.slice(3, 5), 16)},${parseInt(c.slice(5, 7), 16)},${parseInt(c.slice(7, 9), 16)},${(parseInt(c.slice(1, 3), 16) / 255).toFixed(3)})` : 'transparent');
  const esc = t => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;');
  let html = '';
  for (const it of items) {
    const b = it.Bindings || {};
    const get = (key, fallback) => (values && b[key] ? evaluate(b[key].Formula.Expression, values, alert) : fallback);
    const shown = get('Visible', values ? true : !it.off);
    if (shown === false || shown === null || (values === null && it.off)) continue;
    const left = get('Left', it.Left), top = get('Top', it.Top), width = get('Width', it.Width), height = get('Height', it.Height);
    const st = `position:absolute;left:${left}px;top:${top}px;width:${width}px;height:${height}px;box-sizing:border-box;`;
    if (it.IsTextItem) {
      html += `<div style="${st}color:${argb(get('TextColor', it.TextColor))};font-family:'${it.Font}';font-size:${it.FontSize}px;font-weight:${{ Normal: 400, Medium: 500, SemiBold: 600, Bold: 700 }[it.FontWeight] || 400};display:flex;align-items:center;justify-content:${['flex-start', 'center', 'flex-end'][it.HorizontalAlignment]};white-space:nowrap">${esc(get('Text', it.Text))}</div>`;
    } else {
      const bs = it.BorderStyle;
      html += `<div style="${st}background:${argb(get('BackgroundColor', it.BackgroundColor))};border-style:solid;border-color:${argb(bs.BorderColor)};border-width:${bs.BorderTop}px ${bs.BorderRight}px ${bs.BorderBottom}px ${bs.BorderLeft}px;border-radius:${bs.RadiusTopLeft}px ${bs.RadiusTopRight}px ${bs.RadiusBottomRight}px ${bs.RadiusBottomLeft}px"></div>`;
    }
  }
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
@font-face { font-family: "Chakra Petch"; font-weight: 400; src: url("/images/fonts/chakra-petch-400.woff2"); }
@font-face { font-family: "Chakra Petch"; font-weight: 600; src: url("/images/fonts/chakra-petch-600.woff2"); }
@font-face { font-family: "Chakra Petch"; font-weight: 700; src: url("/images/fonts/chakra-petch-700.woff2"); }
@font-face { font-family: "JetBrains Mono"; font-weight: 400 700; src: url("/images/fonts/jetbrains-mono.woff2"); }
body { margin: 0; width: ${WIDTH}px; height: ${HEIGHT}px; background: #0a0c10; position: relative; overflow: hidden; }</style></head><body>${html}</body></html>`;
}

async function draw(browser, items, values, alert, out) {
  const page = await open(browser);
  await page.route('https://dash.local/preview.html', route => route.fulfill({ status: 200, contentType: 'text/html', body: drawHtml(items, values, alert) }));
  await page.goto('https://dash.local/preview.html');
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300);
  await page.screenshot({ path: out });
  await page.close();
}

const browser = await chromium.launch();
try {
  const [valuesFile, out, mode] = process.argv.slice(2);
  if (valuesFile) {
    const items = JSON.parse(fs.readFileSync(path.join(here, 'mur.json'), 'utf8'));
    await draw(browser, items, JSON.parse(fs.readFileSync(valuesFile, 'utf8')), mode === 'alert', out);
  } else {
    const page = await open(browser);
    await page.goto('https://dash.local/mur.html');
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(300);
    const read = await page.evaluate(readPage);
    const items = read.map(toDash);
    // The sample preview needs to know what the sample hides: kept beside, never in the dash.
    const sample = path.join(os.tmpdir(), 'mur-sample.png');
    const hidden = new Set(read.filter(item => item.off).map(item => item.name));
    fs.writeFileSync(path.join(here, 'mur.json'), JSON.stringify(items, null, 0).replace(/\},\{"\$type"/g, '},\n{"$type"') + '\n');
    await draw(browser, items.map(it => ({ ...it, off: hidden.has(it.Name) })), null, false, sample);
    console.log(`${items.length} éléments, ${items.filter(it => Object.keys(it.Bindings).length).length} liés ; aperçu : ${sample}`);
  }
} finally {
  await browser.close();
}
