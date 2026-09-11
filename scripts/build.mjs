import './validate-image-assets.mjs';
import {mkdir, copyFile, cp, writeFile, rm, readFile} from 'node:fs/promises';
import {posix} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const out = new URL('../public/', import.meta.url);
const workers = process.argv.includes('--workers');
const stylesheetTagPattern = /<link\b[^>]*\brel=["']stylesheet["'][^>]*>/gi;
const cssImportPattern = /@import\s+url\(\s*(["']?)([^"')]+)\1\s*\)\s*;/gi;
const cssUrlPattern = /url\(\s*(["']?)([^"')]+)\1\s*\)/gi;

function localAssetPath(href, fromPath = '') {
  const clean = String(href || '').trim();
  if (!clean || /^(?:[a-z]+:|\/\/|#)/i.test(clean)) return null;
  const pathname = clean.split(/[?#]/, 1)[0];
  const resolved = pathname.startsWith('/')
    ? pathname.slice(1)
    : posix.normalize(posix.join(posix.dirname(fromPath), pathname));
  if (!resolved || resolved === '..' || resolved.startsWith('../')) throw new Error(`Chemin asset invalide : ${href}`);
  return resolved;
}

function rewriteCssUrls(source, fromPath) {
  return source.replace(cssUrlPattern, (full, quote, href) => {
    if (!localAssetPath(href, fromPath)) return full;
    const match = href.match(/^([^?#]*)(.*)$/);
    const assetPath = localAssetPath(match[1], fromPath);
    return `url(${quote}/${assetPath}${match[2]}${quote})`;
  });
}

async function inlineCss(path, stack = []) {
  if (stack.includes(path)) throw new Error(`Import CSS circulaire : ${[...stack, path].join(' -> ')}`);
  const source = await readFile(root + path, 'utf8');
  const pattern = new RegExp(cssImportPattern.source, cssImportPattern.flags);
  let output = '';
  let cursor = 0;
  for (const match of source.matchAll(pattern)) {
    output += rewriteCssUrls(source.slice(cursor, match.index), path);
    const importedPath = localAssetPath(match[2], path);
    if (!importedPath) throw new Error(`Import CSS externe non pris en charge dans ${path} : ${match[2]}`);
    output += `\n/* ${importedPath} */\n${await inlineCss(importedPath, [...stack, path])}\n`;
    cursor = match.index + match[0].length;
  }
  output += rewriteCssUrls(source.slice(cursor), path);
  return output;
}

function stylesheetPaths(source, sourceName) {
  const tags = [...source.matchAll(new RegExp(stylesheetTagPattern.source, stylesheetTagPattern.flags))];
  if (!tags.length) throw new Error(`Aucune feuille de style trouvée dans ${sourceName}.`);
  return tags.map(({0: tag}) => {
    const href = tag.match(/\bhref=["']([^"']+)["']/i)?.[1];
    const path = localAssetPath(href);
    if (!path) throw new Error(`Feuille de style non locale non prise en charge : ${href || tag}`);
    return path;
  });
}

function productionHtml(source) {
  let firstStylesheet = true;
  return source.replace(new RegExp(stylesheetTagPattern.source, stylesheetTagPattern.flags), () => {
    if (!firstStylesheet) return '';
    firstStylesheet = false;
    return '<link rel="stylesheet" href="/app.css">';
  });
}

await rm(out, {recursive: true, force: true});
await mkdir(out, {recursive: true});
await mkdir(new URL('lmu/', out), {recursive: true});
await mkdir(new URL('iracing/', out), {recursive: true});

const sourceIndex = await readFile(root + 'index.html', 'utf8');
const sourceGame = await readFile(root + 'game.html', 'utf8');
const sourceMembers = await readFile(root + 'members.html', 'utf8');
const sourceHelp = await readFile(root + 'help.html', 'utf8');
const paths = [
  ...stylesheetPaths(sourceIndex,'index.html'),
  ...stylesheetPaths(sourceGame,'game.html'),
  ...stylesheetPaths(sourceMembers,'members.html'),
  ...stylesheetPaths(sourceHelp,'help.html')
];
const uniqueStylesheetPaths = [...new Set(paths)];

const cssParts = [];
for (const path of uniqueStylesheetPaths) cssParts.push(`/* ${path} */\n${await inlineCss(path)}`);
await writeFile(new URL('app.css', out), cssParts.join('\n\n') + '\n');

await writeFile(new URL('index.html', out), productionHtml(sourceIndex));
await writeFile(new URL('members.html', out), productionHtml(sourceMembers));
await writeFile(new URL('help.html', out), productionHtml(sourceHelp));
const gameHtml = productionHtml(sourceGame);
await writeFile(new URL('lmu/index.html', out), gameHtml);
await writeFile(new URL('iracing/index.html', out), gameHtml);

for (const file of ['app.js', 'crew-accordion.js', 'crew-builder.js', 'ux-refinement.js', 'help.js', 'privacy.html', 'privacy.css', 'legal.html', 'circuit-credits.html']) {
  await copyFile(root + file, new URL(file, out));
}
await copyFile(root + 'help.css', new URL('help.css', out));
await cp(root + 'images', new URL('images/', out), {recursive: true});
await cp(root + 'front', new URL('front/', out), {recursive: true});
await cp(root + 'shared', new URL('shared/', out), {recursive: true});

if (!workers) {
  await copyFile(root + 'server/worker.mjs', new URL('_worker.js', out));
  await writeFile(new URL('_routes.json', out), JSON.stringify({version: 1, include: ['/api/*'], exclude: []}, null, 2) + '\n');
}

await writeFile(new URL('_headers', out), `/*
  Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' https://commons.wikimedia.org https://upload.wikimedia.org https://cdn.discordapp.com; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'
  X-Content-Type-Options: nosniff
  Referrer-Policy: no-referrer
  X-Frame-Options: DENY
  Permissions-Policy: camera=(), microphone=(), geolocation=()
`);

console.log(`Build ready: public/ (${workers ? 'Workers' : 'Pages'}, accueil + LMU + iRacing + membres + aide, ${uniqueStylesheetPaths.length} feuilles CSS -> app.css)`);
