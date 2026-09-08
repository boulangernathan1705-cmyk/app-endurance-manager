import {readFile, writeFile, mkdir, rm} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = path => readFile(root + path, 'utf8');
const write = (path, content) => writeFile(root + path, content);

const catalog = `export const CATEGORIES = ['Hypercar','LMP2 ELMS','LMP2 WEC','LMP3','GT3','GTE'];

export const EVENT_TYPES = {
  special:{label:'Special event',css:'special'},
  lmu:{label:'Championnat LMU',css:'lmu'},
  private:{label:'Championnat privé',css:'private'}
};
export const EVENT_TYPE_IDS = Object.keys(EVENT_TYPES);

export const CIRCUITS = [
  {id:'bahrain',name:'Bahrain International Circuit',file:'bahrain.png'},
  {id:'barcelona',name:'Circuit de Barcelona-Catalunya',file:'barcelone.png'},
  {id:'cota',name:'Circuit of the Americas',file:'cota.png'},
  {id:'daytona',name:'Daytona International Speedway',file:'daytona.png'},
  {id:'fuji',name:'Fuji Speedway',file:'fuji.png'},
  {id:'imola',name:'Autodromo Enzo e Dino Ferrari (Imola)',file:'imola.png'},
  {id:'interlagos',name:'Interlagos',file:'interlagos.png'},
  {id:'laguna-seca',name:'WeatherTech Raceway Laguna Seca',file:'laguna_seca.png'},
  {id:'le-mans',name:'Circuit de la Sarthe (Le Mans)',file:'le_mans.png'},
  {id:'lusail',name:'Lusail International Circuit',file:'lusail_international.png'},
  {id:'monza',name:'Autodromo Nazionale Monza',file:'monza.png'},
  {id:'nurburgring',name:'Nürburgring',file:'nurburgring.png'},
  {id:'paul-ricard',name:'Circuit Paul Ricard',file:'paul_ricard_elms.png'},
  {id:'portimao',name:'Algarve International Circuit (Portimão)',file:'algarve.png'},
  {id:'sebring',name:'Sebring International Raceway',file:'sebring.png'},
  {id:'silverstone',name:'Silverstone Circuit',file:'silverstone.png'},
  {id:'spa',name:'Circuit de Spa-Francorchamps',file:'spa_francorchamps.png'}
];
export const CIRCUIT_IDS = CIRCUITS.map(circuit => circuit.id);

export const categories = {
  Hypercar:{image:'HC.png',css:'hyper'},
  'LMP2 ELMS':{image:'LMP2.png',css:'lmp2'},
  'LMP2 WEC':{image:'LMP2.png',css:'lmp2'},
  LMP3:{image:'P3.png',css:'lmp3'},
  GT3:{image:'GT3.png',css:'gt3'},
  GTE:{image:'GTE.png',css:'gte'}
};

export const CARS = {
  Hypercar: ['Alpine A424','Aston Martin Valkyrie AMR LMH','BMW M Hybrid V8','Cadillac V-Series.R','Ferrari 499P','Genesis GMR-001 LMDh','Glickenhaus SCG 007','Isotta Fraschini Tipo 6-C','Lamborghini SC63','Peugeot 9X8','Porsche 963','Toyota GR010 Hybrid','Vanwall Vandervell 680'],
  'LMP2 ELMS': ['Oreca 07 Gibson ELMS'],
  'LMP2 WEC': ['Oreca 07 Gibson'],
  LMP3: ['Ligier JS P325','Ginetta G61-LT-P3','Duqueine D09','Adess AD25'],
  GT3: ['Aston Martin Vantage AMR LMGT3','BMW M4 LMGT3','Chevrolet Corvette Z06 LMGT3.R','Ferrari 296 LMGT3','Ford Mustang LMGT3','Lamborghini Huracán LMGT3','Lexus RC F LMGT3','Mercedes-AMG LMGT3','McLaren 720S LMGT3','Porsche 911 GT3 R LMGT3'],
  GTE: ['Aston Martin Vantage GTE','Chevrolet Corvette C8.R','Ferrari 488 GTE','Porsche 911 RSR-19']
};
`;

await mkdir(root + 'shared', {recursive:true});
await write('shared/catalog.mjs', catalog);

let app = await read('app.js');
const appMarker = "const app = document.getElementById('app');";
const appIndex = app.indexOf(appMarker);
if (appIndex < 0) throw new Error('app.js marker not found');
app = `import {CATEGORIES, EVENT_TYPES, CIRCUITS, categories, CARS} from './shared/catalog.mjs';\n${app.slice(appIndex)}`;
await write('app.js', app);

let worker = await read('server/worker.mjs');
const workerMarker = 'const LEGACY_CAR_ALIASES = new Map([';
const workerIndex = worker.indexOf(workerMarker);
if (workerIndex < 0) throw new Error('worker marker not found');
worker = `import {CATEGORIES, EVENT_TYPE_IDS as EVENT_TYPES, CIRCUIT_IDS as CIRCUITS, CARS} from '../shared/catalog.mjs';\n${worker.slice(workerIndex)}`;
await write('server/worker.mjs', worker);

let build = await read('scripts/build.mjs');
const imageCopy = "await cp(root+'images',new URL('images/',out),{recursive:true});";
if (!build.includes(imageCopy)) throw new Error('build marker not found');
build = build.replace(imageCopy, `${imageCopy}\nawait cp(root+'shared',new URL('shared/',out),{recursive:true});`);
await write('scripts/build.mjs', build);

let tests = await read('tests/interface.test.mjs');
const oldHarness = "  vm.runInContext(readFileSync(new URL('../app.js',import.meta.url),'utf8').replace(/start\\(\\);\\s*$/,''),context);";
if (!tests.includes(oldHarness)) throw new Error('interface harness marker not found');
const newHarness = "  const catalog=readFileSync(new URL('../shared/catalog.mjs',import.meta.url),'utf8').replace(/\\bexport\\s+/g,'');\n  const source=readFileSync(new URL('../app.js',import.meta.url),'utf8').replace(/^import[^\\n]+\\n/,'').replace(/start\\(\\);\\s*$/,'');\n  vm.runInContext(catalog+'\\n'+source,context);";
tests = tests.replace(oldHarness, newHarness);
await write('tests/interface.test.mjs', tests);

// This one-time migration removes itself and its workflow after producing the refactor commit.
await rm(root + 'scripts/refactor-shared-catalog.mjs', {force:true});
await rm(root + '.github/workflows/refactor-shared-catalog.yml', {force:true});

console.log('Shared catalog refactor applied.');
