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
