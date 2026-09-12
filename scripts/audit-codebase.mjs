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

async function readable(path) {
  try { return await readFile(path, 'utf8'); }
  catch { return ''; }
}

async function exists(path) {
  try { await access(path); return true; }
  catch { return false; }
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
const {CATEGORIES, EVENT_TYPES, CIRCUITS, CIRCUIT_IDS, categories, CARS, GAME_CATALOGS} = await import(pathToFileURL(catalogPath).href + `?audit=${Date.now()}`);

if (!CATEGORIES.length || new Set(CATEGORIES).size !== CATEGORIES.length) warnings.push('Le catalogue contient des catégories absentes ou dupliquées.');
if (CATEGORIES.some(category => !categories[category] || !Array.isArray(CARS[category]))) warnings.push('Chaque catégorie doit avoir un style et une liste de voitures.');
if (!Object.keys(EVENT_TYPES).length) warnings.push('Aucun type d’événement n’est défini.');
if (new Set(CIRCUIT_IDS).size !== CIRCUIT_IDS.length) warnings.push('Les identifiants de circuits ne sont pas uniques.');
if (!GAME_CATALOGS?.lmu || !GAME_CATALOGS?.iracing) warnings.push('Les catalogues LMU et iRacing doivent tous les deux être définis.');

for (const [game,catalog] of Object.entries(GAME_CATALOGS || {})) {
  const gameCategories = Object.keys(catalog.categories || {});
  if (!gameCategories.length) warnings.push(`Le catalogue ${game} ne contient aucune catégorie.`);
  if (gameCategories.some(category => !Array.isArray(catalog.cars?.[category]))) warnings.push(`Chaque catégorie ${game} doit avoir une liste de voitures.`);
  const ids = (catalog.circuits || []).map(circuit => circuit.id);
  if (!ids.length || new Set(ids).size !== ids.length) warnings.push(`Les circuits ${game} sont absents ou dupliqués.`);
}

for (const circuit of CIRCUITS) {
  try { await access(resolve(root, 'images/circuits', circuit.file)); }
  catch { warnings.push(`Image de circuit manquante : ${circuit.id} -> ${circuit.file}`); }
}

const app = searchable.find(item => item.path === 'app.js')?.content || '';
const appCore = searchable.find(item => item.path === 'front/app/core.mjs')?.content || '';
const worker = searchable.find(item => item.path === 'server/worker.mjs')?.content || '';
const workerCore = searchable.find(item => item.path === 'server/core.mjs')?.content || '';
const gameTemplate = searchable.find(item => item.path === 'game.html')?.content || '';
const hub = searchable.find(item => item.path === 'index.html')?.content || '';
const accountMenu = searchable.find(item => item.path === 'front/account-menu.mjs')?.content || '';
const trustPage = searchable.find(item => item.path === 'about.html')?.content || '';
if (!app.includes("./front/app/actions.mjs")) warnings.push('app.js doit rester le point d’entrée de la base front modulaire.');
if (!appCore.includes("../../shared/catalog.mjs")) warnings.push('La base front commune n’utilise pas le catalogue partagé.');
if (!appCore.includes("../schedule.mjs")) warnings.push('La base front commune n’utilise pas le module de calendrier partagé.');
if (!hub.includes('href="/lmu/"') || !hub.includes('href="/iracing/"')) warnings.push('Le portail doit proposer les espaces LMU et iRacing.');
if (!gameTemplate.includes('/front/game-context.js') || !gameTemplate.includes('/app.js')) warnings.push('Le gabarit de jeu doit charger le contexte puis l’application partagée.');
const rootCss = searchable.find(item => item.path === 'styles.css')?.content || '';
if (!rootCss.includes("/styles/foundation.css") || !rootCss.includes("/styles/application.css")) warnings.push('Les feuilles CSS modulaires ne sont pas chargées dans le bon point d’entrée.');
if (!worker.includes("from '../shared/catalog.mjs'") && !workerCore.includes("from '../shared/catalog.mjs'")) {
  warnings.push('Le serveur n’utilise pas le catalogue partagé.');
}

/* Réputation / sécurité : empêcher les régressions les plus susceptibles de déclencher
   des alertes navigateur ou de fragiliser l’authentification. */
const executableSources = searchable.filter(item => ['.js','.mjs','.cjs'].includes(item.ext) && item.path !== 'scripts/audit-codebase.mjs');
for (const item of executableSources) {
  if (/\beval\s*\(/.test(item.content)) warnings.push(`Exécution dynamique interdite (eval) : ${item.path}`);
  if (/\bnew\s+Function\s*\(/.test(item.content)) warnings.push(`Exécution dynamique interdite (Function) : ${item.path}`);
  if (/document\.write\s*\(/.test(item.content)) warnings.push(`document.write interdit : ${item.path}`);
}
for (const item of searchable.filter(item => item.ext === '.html')) {
  if (/type\s*=\s*["']password["']/i.test(item.content)) warnings.push(`Champ mot de passe détecté alors que l’authentification doit rester Discord OAuth : ${item.path}`);
}
const insecureReferences = searchable
  .filter(item => ['.html','.js','.mjs','.cjs'].includes(item.ext))
  .flatMap(item => [...item.content.matchAll(/http:\/\/[^\s"'`<)]+/g)].map(match => ({path:item.path,url:match[0]})))
  .filter(item => item.url !== 'http://www.sitemaps.org/schemas/sitemap/0.9');
for (const item of insecureReferences) warnings.push(`Référence HTTP non chiffrée : ${item.path} -> ${item.url}`);
if (!worker.includes("scope:'identify'") && !worker.includes("scope: 'identify'")) warnings.push('Discord OAuth doit rester limité au scope identify.');
if (!workerCore.includes("const COOKIE_SESSION = '__Host-fmt_session'")) warnings.push('Le cookie de session doit conserver le préfixe __Host-.');
if (!workerCore.includes('HttpOnly; Secure; SameSite=Lax')) warnings.push('Les cookies sensibles doivent rester HttpOnly, Secure et SameSite=Lax.');
if (!accountMenu.includes('aucun mot de passe transmis à Endurance Manager')) warnings.push('La connexion Discord doit expliquer visiblement qu’aucun mot de passe n’est transmis au site.');
if (!trustPage.includes('Discord OAuth') || !trustPage.includes('ne demande, ne reçoit et ne stocke jamais ton mot de passe Discord')) warnings.push('La page publique de confiance doit expliquer clairement Discord OAuth et l’absence de collecte de mot de passe.');

const wrangler = await readable(resolve(root, 'wrangler.jsonc'));
const wranglerProd = await readable(resolve(root, 'wrangler.prod.jsonc'));
if (/"binding"\s*:\s*"ASSETS"/.test(wrangler)) warnings.push('Le binding ASSETS est inutile tant que le Worker ne fait pas env.ASSETS.fetch().');
if (!/"minify"\s*:\s*true/.test(wrangler)) warnings.push('Wrangler doit minifier le Worker avant déploiement.');
if (!wrangler.includes('"/api/*"')) warnings.push('Cloudflare doit exécuter le Worker en priorité uniquement sur les routes /api/*.');
if (!wranglerProd.includes('"APP_ORIGIN": "https://endurance-manager.app"')) warnings.push('La production doit conserver endurance-manager.app comme origine canonique HTTPS.');

const publicDir = resolve(root, 'public');
const publicCss = await readable(resolve(publicDir, 'app.css'));
const publicHeaders = await readable(resolve(publicDir, '_headers'));
const publicRobots = await readable(resolve(publicDir, 'robots.txt'));
const publicSitemap = await readable(resolve(publicDir, 'sitemap.xml'));
const publicSecurity = await readable(resolve(publicDir, '.well-known/security.txt'));
const builtPages = [
  ['accueil',resolve(publicDir,'index.html')],
  ['LMU',resolve(publicDir,'lmu/index.html')],
  ['iRacing',resolve(publicDir,'iracing/index.html')]
];
for (const [label,path] of builtPages) {
  const page = await readable(path);
  if (!page) {
    warnings.push(`Le build ${label} est absent. Lance npm run build:workers avant l’audit strict.`);
    continue;
  }
  const stylesheetLinks = page.match(/<link\b[^>]*\brel=["']stylesheet["'][^>]*>/gi) || [];
  if (stylesheetLinks.length !== 1 || !stylesheetLinks[0].includes('/app.css')) warnings.push(`Le build ${label} doit charger une seule feuille /app.css.`);
  if (!/<meta\s+name=["']description["']/i.test(page)) warnings.push(`Le build ${label} doit exposer une description publique claire.`);
}
if (!publicCss.trim()) warnings.push('Le bundle public/app.css est absent ou vide.');
const residualImports = publicCss.split(/\r?\n/).filter(line => /^\s*@import\s+url\(/i.test(line));
if (residualImports.length) warnings.push(`public/app.css contient encore de vrais imports CSS : ${residualImports.slice(0,5).join(' | ')}`);
if (await exists(resolve(publicDir, 'styles'))) warnings.push('Le dossier CSS source ne doit pas être publié séparément dans public/.');
if (await exists(resolve(publicDir, 'styles.css'))) warnings.push('styles.css est une source de build et ne doit pas être publié séparément.');
if (/^\s*Cache-Control:/mi.test(publicHeaders)) warnings.push('Le cache statique doit rester géré par Workers Static Assets et ses ETag natifs.');
const requiredHeaderFragments = [
  "Content-Security-Policy: default-src 'self'",
  "script-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  'Strict-Transport-Security: max-age=63072000; includeSubDomains',
  'X-Content-Type-Options: nosniff',
  'Referrer-Policy: no-referrer',
  'X-Frame-Options: DENY',
  'Permissions-Policy:',
  'Cross-Origin-Opener-Policy: same-origin',
  'Cross-Origin-Resource-Policy: same-site'
];
for (const fragment of requiredHeaderFragments) if (!publicHeaders.includes(fragment)) warnings.push(`En-tête de sécurité manquant dans le build : ${fragment}`);
if (!publicRobots.includes('Disallow: /api/') || !publicRobots.includes('Sitemap: https://endurance-manager.app/sitemap.xml')) warnings.push('robots.txt doit exclure les API et déclarer le sitemap canonique.');
if (!publicSitemap.includes('https://endurance-manager.app/about.html')) warnings.push('Le sitemap doit référencer la page publique À propos & sécurité.');
if (!publicSecurity.includes('Canonical: https://endurance-manager.app/.well-known/security.txt')) warnings.push('security.txt doit déclarer son URL canonique.');
if (!publicSecurity.includes('Policy: https://endurance-manager.app/about.html#security')) warnings.push('security.txt doit renvoyer vers la politique de sécurité publique.');
if (!(await exists(resolve(publicDir,'about.html')))) warnings.push('La page publique À propos & sécurité doit être publiée.');

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
  console.log('Catalogues, build Cloudflare, réputation publique et garde-fous sécurité : OK.');
}

if (process.argv.includes('--strict') && warnings.length) process.exitCode = 1;
