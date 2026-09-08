import {readdir, readFile, stat} from 'node:fs/promises';
import {extname, relative, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = resolve(fileURLToPath(new URL('../', import.meta.url)));
const ignored = new Set(['.git', 'node_modules', 'public']);
const textExtensions = new Set(['.js', '.mjs', '.cjs', '.css', '.html', '.md', '.json', '.jsonc', '.sql']);
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

function extractArray(source, name) {
  const match = source.match(new RegExp(`const\\s+${name}\\s*=\\s*\\[([^;]+?)\\];`, 's'));
  if (!match) return null;
  return [...match[1].matchAll(/['\"]([^'\"]+)['\"]/g)].map(item => item[1]);
}

const app = searchable.find(item => item.path === 'app.js')?.content || '';
const worker = searchable.find(item => item.path === 'server/worker.mjs')?.content || '';
const appCategories = extractArray(app, 'CATEGORIES');
const workerCategories = extractArray(worker, 'CATEGORIES');
const appCircuitIds = [...app.matchAll(/\{id:['\"]([^'\"]+)['\"]/g)].map(item => item[1]);
const workerCircuits = extractArray(worker, 'CIRCUITS');

const warnings = [];
if (appCategories && workerCategories && JSON.stringify(appCategories) !== JSON.stringify(workerCategories)) {
  warnings.push('Les catégories front et Worker ne sont pas identiques.');
}
if (appCircuitIds.length && workerCircuits) {
  const onlyFront = appCircuitIds.filter(value => !workerCircuits.includes(value));
  const onlyWorker = workerCircuits.filter(value => !appCircuitIds.includes(value));
  if (onlyFront.length || onlyWorker.length) warnings.push(`Circuits incohérents — front uniquement: ${onlyFront.join(', ') || 'aucun'} ; Worker uniquement: ${onlyWorker.join(', ') || 'aucun'}.`);
}

console.log('=== Audit FMT Endurance Manager ===');
console.log(`Fichiers analysés : ${rows.length}`);
console.log(`Fichiers texte >= ${Math.round(LARGE_FILE_BYTES/1000)} Ko : ${large.length}`);
for (const item of large) console.log(`  - ${item.path}: ${(item.size/1024).toFixed(1)} KiB`);
console.log(`Assets potentiellement inutilisés : ${unusedAssets.length}`);
for (const item of unusedAssets) console.log(`  - ${item.path}`);
if (warnings.length) {
  console.log('Incohérences détectées :');
  for (const warning of warnings) console.log(`  - ${warning}`);
} else {
  console.log('Aucune incohérence de catalogue détectée.');
}

if (process.argv.includes('--strict') && warnings.length) process.exitCode = 1;
