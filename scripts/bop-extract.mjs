// Reads LMU's Balance of Performance PDF, as text (pdftotext -layout), into shared/lmu-bop.mjs: per circuit layout,
// the dry compounds of the Hypercars and, per class and car, the figures of its table with the change since the
// previous version. LMU publishes it as a PDF only, on each important update:
//   pdftotext -layout LMU_BOP_x.y.z.pdf bop.txt && node scripts/bop-extract.mjs bop.txt <pdf url>
// The script stops on any row it cannot read, rather than writing a wrong figure.
import {readFileSync, writeFileSync} from 'node:fs';

const [file, url] = process.argv.slice(2);
if (!file || !url) { console.error('usage: node scripts/bop-extract.mjs bop.txt <pdf url>'); process.exit(1); }

// The columns of each class's table, in the PDF's order.
const COLUMNS = {
  Hypercar:['weight', 'power', 'stage1End', 'stage2Start', 'power2', 'deploySpeed', 'energy', 'docking'],
  GT3:['weight', 'power', 'stage1End', 'stage2Start', 'power2', 'energy', 'wingMin', 'wingMax', 'rideHeight'],
  GTE:['weight', 'power', 'tank', 'refuel', 'aero'],
  LMP2:['weight', 'power', 'maxRpm', 'tank', 'aero', 'frontDivePlanes', 'engineCoverGurney', 'rearWingGurney', 'diffuserStrakes'],
  LMP3:['weight', 'frontDivePlane', 'engineCoverGurney']
};
const HEADERS = {HYPERCAR:'Hypercar', LMGT3:'GT3', LMGTE:'GTE', LMP2:'LMP2', LMP3:'LMP3'};
const MANUFACTURER_COLUMN = 15;

const text = readFileSync(file, 'utf8');
const version = text.match(/Version\s+(\d+(?:\.\d+)+)/)?.[1];
const [day, month, year] = text.match(/Date\s+(\d{2})\/(\d{2})\/(\d{4})/)?.slice(1) ?? [];
if (!version || !year) throw Error('version or date not found');

const fail = (message, line) => { throw Error(`${message}: ${JSON.stringify(line)}`); };
const cell = raw => {
  const match = raw.trim().replace(/[¹²³⁴⁵⁶⁷]/g, '').match(/^(.*?)(?:\s*\(([+-][\d.]+)\))?$/);
  const value = /^-?\d+(\.\d+)?$/.test(match[1]) ? Number(match[1]) : match[1] === '-' ? null : match[1];
  return {value, change:match[2] ? Number(match[2]) : null};
};

const layouts = [];
let layout = null, block = null, variants = [];
const finish = () => {
  if (!block) return;
  const {rows, fragments} = block;
  // Names written over two lines: the model's first half above its row, the second half below; a manufacturer
  // alone on its line belongs to the rows around it that have none.
  for (const fragment of fragments) {
    const before = rows.filter(row => row.at < fragment.at).at(-1), after = rows.find(row => row.at > fragment.at);
    if (fragment.manufacturer) { for (const row of [before, after]) if (row && !row.manufacturer) row.manufacturer = fragment.text; continue; }
    if (after && !after.model) after.top = [...(after.top || []), fragment.text];
    else if (before && before.top) before.bottom = [...(before.bottom || []), fragment.text];
    else fail('name fragment without its row', fragment.text);
  }
  for (const row of rows) {
    row.model = row.model || [...(row.top || []), ...(row.bottom || [])].join(' ');
    if (!row.manufacturer || !row.model) fail('car without a name', row);
    const changes = Object.fromEntries(row.cells.flatMap((item, index) => item.change === null ? [] : [[COLUMNS[block.carClass][index], item.change]]));
    layout.cars.push({carClass:block.carClass, car:`${row.manufacturer} ${row.model}`,
      ...Object.fromEntries(row.cells.map((item, index) => [COLUMNS[block.carClass][index], item.value])), ...(Object.keys(changes).length ? {changes} : {})});
  }
  block = null;
};

for (const [at, rawLine] of text.split('\n').entries()) {
  const line = rawLine.replace(/\s{5,}[¹²³⁴⁵⁶⁷⁸] ?[A-Z].*$/, '').replace(/\s+Page \| \d+\s*$/, '').replace(/\f/g, '');
  // The page's first line: the game's layouts this page applies to, then the date.
  const dated = line.match(/^\s*(.*?)\s*Date\s+\d{2}\/\d{2}\/\d{4}/);
  if (dated) { finish(); variants = dated[1] && !/new track/i.test(dated[1]) ? dated[1].split(/,\s*/) : []; continue; }
  const head = line.match(/^\s*(\S.*?)\s{2,}(?:Dry Tyre Compounds\s+(.*?)\s{2,})?Version\s/);
  if (head) {
    finish();
    const name = /^[A-Z]+ [A-Z ]+$/.test(head[1]) ? head[1].toLowerCase().replace(/\b\w/g, letter => letter.toUpperCase()) : head[1];
    layout = layouts.find(item => item.name === name);
    if (!layout) layouts.push(layout = {name, variants:[], compounds:[], cars:[]});
    if (variants.length) layout.variants = variants;
    if (head[2]) layout.compounds = head[2].split(/\s+/);
    continue;
  }
  const header = line.match(/^\s*(HYPERCAR|LMGT3|LMGTE|LMP2|LMP3)\s{3,}Minimum\b/);
  if (header) { finish(); block = {carClass:HEADERS[header[1]], rows:[], fragments:[], open:false}; continue; }
  if (/^\s*Vehicles\s/.test(line)) { finish(); continue; }
  if (!block) continue;
  if (/\[kg\]/.test(line)) { block.open = true; continue; }
  if (!block.open || /^\s*$/.test(line)) continue;
  if (/^\s*[¹²³⁴⁵⁶⁷⁸]/.test(line) || /^\s*[\d.]+\s*$/.test(line)) continue;
  const parts = [...line.matchAll(/\S+(?: \S+)*/g)].map(match => ({text:match[0], at:match.index}));
  // A row ends with one cell per column; what comes before is the car's name (a model can be a number: 963).
  const size = COLUMNS[block.carClass].length;
  if (parts.length < size) {
    if (parts.length !== 1) fail('unreadable line', line);
    block.fragments.push({at, text:parts[0].text, manufacturer:parts[0].at < MANUFACTURER_COLUMN});
    continue;
  }
  const names = parts.slice(0, parts.length - size), cells = parts.slice(parts.length - size).map(part => cell(part.text));
  if (names.length > 2 || typeof cells[0].value !== 'number') fail(`unreadable ${block.carClass} row`, line);
  const manufacturer = names.find(part => part.at < MANUFACTURER_COLUMN)?.text, model = names.find(part => part.at >= MANUFACTURER_COLUMN)?.text;
  block.rows.push({at, manufacturer, model, cells});
}
finish();

const data = {version, date:`${year}-${month}-${day}`, url, layouts};
const out = `// LMU Balance of Performance ${version} (${data.date}), read from ${url}
// by scripts/bop-extract.mjs. Do not edit by hand: extract the next version the same way.
export const BOP = ${JSON.stringify(data, null, 0).replace(/\{"name"/g, '\n{"name"')};
`;
writeFileSync(new URL('../shared/lmu-bop.mjs', import.meta.url), out);
const count = (carClass) => layouts.map(item => item.cars.filter(car => car.carClass === carClass).length);
console.log(`${version} ${data.date}: ${layouts.length} layouts`);
for (const carClass of Object.keys(COLUMNS)) console.log(carClass, count(carClass).join(' '));
