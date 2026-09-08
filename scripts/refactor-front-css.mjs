import {readFile, writeFile, mkdir, rm} from 'node:fs/promises';

const appPath='app.js';
let app=await readFile(appPath,'utf8');
const scheduleStart=app.indexOf('function countdown(');
const scheduleEnd=app.indexOf('function renderEventCard(');
if(scheduleStart<0||scheduleEnd<0||scheduleEnd<=scheduleStart) throw new Error('Schedule helper boundaries not found');
let schedule=app.slice(scheduleStart,scheduleEnd).trim();
for(const name of ['countdown','dateLabel','parisCalendar','eventSchedule','groupEvents']) {
  schedule=schedule.replace(`function ${name}(`,`export function ${name}(`);
}
await mkdir('front',{recursive:true});
await writeFile('front/schedule.mjs',schedule+'\n');
app=app.slice(0,scheduleStart)+app.slice(scheduleEnd);
const catalogImport="import {CATEGORIES, EVENT_TYPES, CIRCUITS, categories, CARS} from './shared/catalog.mjs';\n";
if(!app.startsWith(catalogImport)) throw new Error('Catalog import not found');
app=app.replace(catalogImport,catalogImport+"import {countdown, dateLabel, groupEvents} from './front/schedule.mjs';\n");
await writeFile(appPath,app);

const cssPath='styles.css';
const css=await readFile(cssPath,'utf8');
const marker='/* =========================================================\n   MOBILE\n========================================================= */';
const split=css.indexOf(marker);
if(split<0) throw new Error('CSS split marker not found');
await mkdir('styles',{recursive:true});
await writeFile('styles/foundation.css',css.slice(0,split).trimEnd()+'\n');
await writeFile('styles/application.css',css.slice(split).trimStart()+'\n');
await writeFile(cssPath,"@import url('/styles/foundation.css');\n@import url('/styles/application.css');\n");

let build=await readFile('scripts/build.mjs','utf8');
const copyImages="await cp(root+'images',new URL('images/',out),{recursive:true});";
if(!build.includes(copyImages)) throw new Error('Build assets marker not found');
build=build.replace(copyImages,copyImages+"\nawait cp(root+'styles',new URL('styles/',out),{recursive:true});\nawait cp(root+'front',new URL('front/',out),{recursive:true});");
await writeFile('scripts/build.mjs',build);

let audit=await readFile('scripts/audit-codebase.mjs','utf8');
const auditMarker="if (!app.includes(\"from './shared/catalog.mjs'\")) warnings.push('Le front n’utilise pas le catalogue partagé.');";
if(!audit.includes(auditMarker)) throw new Error('Audit marker not found');
audit=audit.replace(auditMarker,auditMarker+"\nif (!app.includes(\"from './front/schedule.mjs'\")) warnings.push('Le front n’utilise pas le module de calendrier partagé.');\nconst rootCss = searchable.find(item => item.path === 'styles.css')?.content || '';\nif (!rootCss.includes(\"/styles/foundation.css\") || !rootCss.includes(\"/styles/application.css\")) warnings.push('Les feuilles CSS modulaires ne sont pas chargées dans le bon point d’entrée.');");
await writeFile('scripts/audit-codebase.mjs',audit);

await rm('scripts/refactor-front-css.mjs',{force:true});
await rm('.github/workflows/refactor-front-css.yml',{force:true});
console.log('Front schedule helpers and CSS split completed.');
