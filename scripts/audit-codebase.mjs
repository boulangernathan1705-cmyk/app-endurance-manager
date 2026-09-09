import {access, readdir, readFile, stat} from 'node:fs/promises';
import {extname, relative, resolve} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const root = resolve(fileURLToPath(new URL('../', import.meta.url)));
const ignored = new Set(['.git', 'node_modules', 'public']);
const textExtensions = new Set(['.js', '.mjs', '.cjs', '.css', '.html', '.md', '.json', '.jsonc', '.sql', '.yml', '.yaml']);
const assetExtensions = new Set(['.png', '.jpg', '.jpeg', '.webp', '.svg', '.gif']);
const LARGE_FILE_BYTES = 40_000;

async function walk(dir) {
  const entries = await readdir(dir, {withFileTypes: true});
  const files = [];
  for (const entry of entries) {
    if (ignored.has(entry.name)) continue;
    const full = resolve(dir, entry.name);
    if (entry.isDirectory()) files.push(...await walk(full));
    else files.push(full);
  }
  return files;
}

async function readVp8Dimensions(file) {
  const data = await readFile(file);
  if (data.length < 32 || data.toString('ascii',0,4) !== 'RIFF' || data.toString('ascii',8,12) !== 'WEBP') return null;
  const marker = data.indexOf(Buffer.from([0x9d,0x01,0x2a]));
  if (marker < 0 || marker + 7 > data.length) return null;
  return {
    width: data.readUInt16LE(marker + 3) & 0x3fff,
    height: data.readUInt16LE(marker + 5) & 0x3fff
  };
}

const files = await walk(root);
const rows = [];
for (const file of files) {
  const info = await stat(file);
  rows.push({path: relative(root, file).replaceAll('\\', '/'), size: info.size, ext: extname(file).toLowerCase(), file});
}

const large = rows.filter(item => textExtensions.has(item.ext) && item.size >= LARGE_FILE_BYTES).sort((a,b) => b.size-a.size);
const textRows = rows.filter(item => textExtensions.has(item.ext));
const searchable = await Promise.all(textRows.map(async item => ({...item, content: await readFile(item.file, 'utf8')})));
const allText = searchable.map(item => item.content).join('\n');
const assets = rows.filter(item => assetExtensions.has(item.ext));
const unusedAssets = assets.filter(item => {
  const relativeAsset = item.path.replace(/^images\//, '');
  const basename = relativeAsset.split('/').at(-1);
  return !allText.includes(relativeAsset) && !allText.includes(basename);
});

const warnings = [];
const catalogPath = resolve(root, 'shared/catalog.mjs');
const {CATEGORIES, EVENT_TYPES, CIRCUITS, CIRCUIT_IDS, categories, CARS} = await import(pathToFileURL(catalogPath).href + `?audit=${Date.now()}`);

if (!CATEGORIES.length || new Set(CATEGORIES).size !== CATEGORIES.length) warnings.push('Le catalogue contient des catégories absentes ou dupliquées.');
if (CATEGORIES.some(category => !categories[category] || !Array.isArray(CARS[category]))) warnings.push('Chaque catégorie doit avoir un style et une liste de voitures.');
if (!Object.keys(EVENT_TYPES).length) warnings.push('Aucun type d’événement n’est défini.');
if (new Set(CIRCUIT_IDS).size !== CIRCUIT_IDS.length) warnings.push('Les identifiants de circuits ne sont pas uniques.');

for (const circuit of CIRCUITS) {
  try { await access(resolve(root, 'images/circuits', circuit.file)); }
  catch { warnings.push(`Image de circuit manquante : ${circuit.id} -> ${circuit.file}`); }
}

const heroBannerPath = resolve(root, 'images/endurance-manager-banner.webp');
try {
  const dimensions = await readVp8Dimensions(heroBannerPath);
  if (!dimensions || dimensions.width <= 0 || dimensions.height <= 0) {
    warnings.push('La bannière principale WebP est invalide ou possède des dimensions nulles.');
  }
} catch {
  warnings.push('La bannière principale est manquante ou illisible.');
}

const app = searchable.find(item => item.path === 'app.js')?.content || '';
const worker = searchable.find(item => item.path === 'server/worker.mjs')?.content || '';
const workerCore = searchable.find(item => item.path === 'server/core.mjs')?.content || '';
if (!app.includes("from './shared/catalog.mjs'")) warnings.push('Le front n’utilise pas le catalogue partagé.');
if (!app.includes("from './front/schedule.mjs'")) warnings.push('Le front n’utilise pas le module de calendrier partagé.');
const rootCss = searchable.find(item => item.path === 'styles.css')?.content || '';
if (!rootCss.includes("/styles/foundation.css") || !rootCss.includes("/styles/application.css")) warnings.push('Les feuilles CSS modulaires ne sont pas chargées dans le bon point d’entrée.');
if (!worker.includes("from '../shared/catalog.mjs'") && !workerCore.includes("from '../shared/catalog.mjs'")) {
  warnings.push('Le serveur n’utilise pas le catalogue partagé.');
}

console.log('=== Audit App Endurance Manager ===');
console.log(`Fichiers analysés : ${rows.length}`);
console.log(`Fichiers texte >= ${Math.round(LARGE_FILE_BYTES/1000)} Ko : ${large.length}`);
for (const item of large) console.log(`  - ${item.path}: ${(item.size/1024).toFixed(1)} KiB`);
console.log(`Assets potentiellement inutilisés : ${unusedAssets.length}`);
for (const item of unusedAssets) console.log(`  - ${item.path}`);
if (warnings.length) {
  console.log('Incohérences détectées :');
  for (const warning of warnings) console.log(`  - ${warning}`);
} else {
  console.log('Catalogue partagé et assets référencés : OK.');
}

if (process.argv.includes('--strict') && warnings.length) process.exitCode = 1;
