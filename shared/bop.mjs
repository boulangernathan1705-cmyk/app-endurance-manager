// The Balance of Performance of a car on a circuit, from LMU's latest BoP (shared/lmu-bop.mjs, extracted from
// its PDF by scripts/bop-extract.mjs). LMU applies a car's line to all its versions (evos, jokers): the car is the
// BoP line whose every word is in the name LMU writes for it, the longest one when several fit (9x8 / 9x8 Evo).
import {circuitOf, normal} from './training.mjs';

// The class LMU writes for a car, as the BoP names its tables.
const BOP_CLASS = {Hyper:'Hypercar', Hypercar:'Hypercar', LMH:'Hypercar', LMDh:'Hypercar', GT3:'GT3', LMGT3:'GT3', GTE:'GTE', LMGTE:'GTE',
  LMP2:'LMP2', LMP2_ELMS:'LMP2', LMP2_WEC:'LMP2', LMP3:'LMP3'};
const words = value => normal(value).split(' ').filter(Boolean);

export function bopFor(bop, circuit, car, carClass) {
  const bopClass = BOP_CLASS[carClass];
  // The circuit's main layout: the shortest name among the BoP's pages for it (Le Mans before Le Mans Mulsanne).
  const layout = bop.layouts.filter(item => circuitOf(item.name) === circuit).sort((a, b) => a.name.length - b.name.length)[0];
  if (!layout || !bopClass) return null;
  const name = new Set(words(car));
  // The two LMP2 lines are the same car: the class LMU writes says which one (ELMS, else WEC).
  if (bopClass === 'LMP2') name.add(/ELMS/.test(carClass) ? 'elms' : 'wec');
  const line = layout.cars.filter(item => item.carClass === bopClass && words(item.car).every(word => name.has(word)))
    .sort((a, b) => words(b.car).length - words(a.car).length)[0];
  if (!line) return null;
  return {version:bop.version, date:bop.date, url:bop.url, layout:layout.name, compounds:bopClass === 'Hypercar' ? layout.compounds : [], ...line};
}
