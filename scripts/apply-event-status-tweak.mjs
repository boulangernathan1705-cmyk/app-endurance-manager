import fs from 'node:fs';

const appPath='app.js';
const cssPath='styles/foundation.css';
const testPath='tests/interface.test.mjs';

let app=fs.readFileSync(appPath,'utf8');
if(!app.includes("running?'Le dernier est encore en course.':'Dates à confirmer'")) throw new Error('Expected running sentence not found');
app=app.replace("running?'Le dernier est encore en course.':'Dates à confirmer'", "running?'':'Dates à confirmer'");
fs.writeFileSync(appPath,app);

let css=fs.readFileSync(cssPath,'utf8');
if(!css.includes('font-size: clamp(22px, 3vw, 32px);')) throw new Error('Expected primary status size not found');
css=css.replace('font-size: clamp(22px, 3vw, 32px);','font-size: clamp(30px, 4.5vw, 46px);');
if(!css.includes('.event-countdown:empty')) css=css.replace('.event-countdown.upcoming { color: var(--green); }','.event-countdown:empty { display: none; }\n.event-countdown.upcoming { color: var(--green); }');
fs.writeFileSync(cssPath,css);

let tests=fs.readFileSync(testPath,'utf8');
tests=tests.replace(/assert\.match\(appSource, \/Le dernier est encore en course\\\.\/\);?\n?/g,'assert.doesNotMatch(appSource, /Le dernier est encore en course\\./);\n');
tests=tests.replace(/clamp\(22px, 3vw, 32px\)/g,'clamp(30px, 4.5vw, 46px)');
fs.writeFileSync(testPath,tests);
