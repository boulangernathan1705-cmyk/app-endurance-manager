import {catalogForGame, simForEvent} from './catalog.mjs';

// Deliberately conservative: never send a pilot to a different circuit or car.
const normal = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
const aliases = {
  'le-mans':['Le Mans','Circuit de la Sarthe','Le Mans 24h','24 Heures du Mans'],
  spa:['Spa','Spa-Francorchamps','Circuit de Spa Francorchamps'],
  monza:['Monza'], imola:['Imola','Autodromo Internazionale Enzo e Dino Ferrari'],
  portimao:['Portimao','Algarve International Circuit'], bahrain:['Bahrain'],
  barcelona:['Barcelona','Barcelona Catalunya'], cota:['COTA','Circuit of the Americas'],
  daytona:['Daytona'], fuji:['Fuji'], interlagos:['Interlagos','Autodromo Jose Carlos Pace'],
  'laguna-seca':['Laguna Seca'], 'long-beach':['Long Beach'], lusail:['Lusail','Losail International Circuit'],
  'paul-ricard':['Paul Ricard'], 'road-atlanta':['Road Atlanta'], sebring:['Sebring'], silverstone:['Silverstone']
};

// Artwork only: these observed LMU names share a venue photo, never memo data.
// TrackCourse names checked against local LMU results; keep exact aliases rather
// than prefix matching so unknown layouts still use the empty artwork fallback.
const imageAliases = {
  monza:['Monza Curva Grande Circuit'],
  'paul-ricard':['Paul Ricard Circuit','Paul Ricard - ELMS','Paul Ricard - 1A','Paul Ricard - 1A-V2'],
  sebring:['Sebring School Circuit'],
  spa:['Circuit de Spa-Francorchamps Endurance'],
  fuji:['Fuji Speedway Classic'],
  silverstone:['Silverstone Grand Prix Circuit - ELMS','Silverstone International Circuit'],
  barcelona:['Circuit de Barcelona'],
  imola:['Autodromo Enzo e Dino Ferrari'],
  daytona:['Daytona International Speedway Road Course'],
  'long-beach':['Grand Prix of Long Beach']
};
const trackImages = new Map(catalogForGame('lmu').circuits.filter(item => !item.random).flatMap(item =>
  [item.id,item.name,...(aliases[item.id] || []),...(imageAliases[item.id] || [])]
    .map(name => [normal(name),'/images/endurance/lmu-pano/'+item.id+'.webp'])
));
export function memoTrackImage(track, game = 'lmu') {
  return game === 'lmu' ? trackImages.get(normal(track)) || '' : '';
}

// Representative LMU liveries, keyed by model only (not the pilot's selected skin).
// Exact catalogue/telemetry aliases; provenance: images/memo-cars/sources.json.
const carImages = new Map([
  ["alpine-a424", "Alpine A424"],
  ["aston-valkyrie", "Aston Martin Valkyrie AMR LMH", "Aston Martin Valkyrie LMH"],
  ["bmw-hybrid", "BMW M Hybrid V8"],
  ["cadillac", "Cadillac V-Series.R"],
  ["ferrari-499p", "Ferrari 499P"],
  ["genesis", "Genesis GMR-001 LMDh", "Genesis GMR-001", "Genesis GMR001"],
  ["glickenhaus", "Glickenhaus SCG 007", "Glickenhaus SCG007"],
  ["isotta", "Isotta Fraschini Tipo 6-C", "Isotta Fraschini TIPO6"],
  ["lamborghini-sc63", "Lamborghini SC63"],
  ["peugeot-9x8", "Peugeot 9X8", "Peugeot 9x8"],
  ["peugeot-9x8-evo", "Peugeot 9X8 Evo"],
  ["porsche-963", "Porsche 963"],
  ["toyota-gr010", "Toyota GR010 Hybrid", "Toyota GR010"],
  ["vanwall", "Vanwall Vandervell 680", "Vanwall 680"],
  ["oreca-elms", "Oreca 07 Gibson ELMS"],
  ["oreca-wec", "Oreca 07 Gibson", "Oreca 07"],
  ["ligier", "Ligier JS P325"],
  ["ginetta", "Ginetta G61-LT-P3", "Ginetta G61-LT-P325 Evo"],
  ["duqueine", "Duqueine D09", "Duqueine D09 P3"],
  ["adess", "Adess AD25", "ADESS AD25 LMP3"],
  ["aston-gt3", "Aston Martin Vantage AMR LMGT3"],
  ["bmw-gt3", "BMW M4 LMGT3"],
  ["corvette-gt3", "Chevrolet Corvette Z06 LMGT3.R"],
  ["ferrari-296", "Ferrari 296 LMGT3"],
  ["ford", "Ford Mustang LMGT3"],
  ["lamborghini-gt3", "Lamborghini Huracán LMGT3", "Lamborghini Huracan LMGT3 Evo2"],
  ["lexus", "Lexus RC F LMGT3", "Lexus RCF LMGT3"],
  ["mercedes", "Mercedes-AMG LMGT3"],
  ["mclaren", "McLaren 720S LMGT3", "McLaren 720S LMGT3 Evo"],
  ["porsche-gt3", "Porsche 911 GT3 R LMGT3"],
  ["aston-gte", "Aston Martin Vantage GTE", "Aston Martin Vantage AMR"],
  ["corvette-gte", "Chevrolet Corvette C8.R", "Corvette C8.R GTE"],
  ["ferrari-488", "Ferrari 488 GTE", "Ferrari 488 GTE EVO"],
  ["porsche-gte", "Porsche 911 RSR-19"],
].flatMap(([id,...names]) => names.map(name => [normal(name),'/images/memo-cars/'+id+'.webp'])));
export function memoCarImage(car, game = 'lmu') {
  return game === 'lmu' ? carImages.get(normal(car)) || '' : '';
}

export function memoHref(event, car = '', crew = '') {
  if (!event || simForEvent(event) !== 'lmu' || event.format === 'solo' || !catalogForGame('lmu').circuits.some(item => item.id === event.circuit && !item.random)) return '';
  const q = new URLSearchParams({circuit:event.circuit});
  if (car) q.set('car', car);
  if (/^[a-f0-9-]{36}$/i.test(event.id || '')) q.set('race',event.id);
  if (/^[a-f0-9-]{36}$/i.test(crew || '')) q.set('crew', crew);
  return '/simhub.html?' + q.toString() + '#memo';
}
export function memoCandidates(combos, params) {
  const circuit = params.get('circuit'), track = params.get('track'), car = params.get('car');
  const item = catalogForGame('lmu').circuits.find(c => c.id === circuit && !c.random);
  const names = circuit ? new Set([item?.name, ...(aliases[circuit] || [])].filter(Boolean).map(normal)) : null;
  return combos.filter(combo => (!circuit || names.has(normal(combo.track))) && (!track || combo.track === track) && (!car || normal(combo.car) === normal(car)));
}
export function memoRequestLabel(params) {
  const circuit = params.get('circuit');
  const item = catalogForGame('lmu').circuits.find(c => c.id === circuit);
  return [item?.name || circuit || params.get('track'), params.get('car')].filter(Boolean).join(' · ');
}

export const NOTE_THEMES = {strategy:'Stratégie',tyres:'Pneus',consumption:'Consommation',track:'Circuit',pit:'Stands',setup:'Réglages'};
