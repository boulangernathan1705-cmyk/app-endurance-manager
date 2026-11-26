// Calculations for the drivers shown on a combo sheet.
export const known = value => value !== null && value !== undefined && Number.isFinite(Number(value));
const CREW = {id:'crew', name:'Équipage', color:'#f0f3f2', crew:true};

const mean = values => { const list = values.filter(known).map(Number); return list.length ? list.reduce((a, b) => a + b, 0) / list.length : null; };
const meanOf = (rows, key) => mean(rows.map(row => row[key]));
const meanFour = (rows, key) => [0, 1, 2, 3].map(index => mean(rows.map(row => row[key]?.[index])));
const minOf = values => { const list = values.filter(known).map(Number); return list.length ? Math.min(...list) : null; };

export function paceStats(drivers, who, hidden) {
  const rows = drivers.filter(row => !hidden.has(row.id) && who.has(row.id))
    .map(row => ({...row, ...who.get(row.id), laps:row.laps}));
  if (rows.length < 2) return rows;
  const sectors = rows.filter(row => row.sectors);
  return [{...CREW, laps:rows.reduce((sum, row) => sum + row.laps, 0), ve:meanOf(rows, 've'), fuel:meanOf(rows, 'fuel'), avg:meanOf(rows, 'avg'),
    best:minOf(rows.map(row => row.best)), slope:meanOf(rows, 'slope'),
    sectors:sectors.length ? {laps:sectors.reduce((sum, row) => sum + row.sectors.laps, 0), avg:[0, 1, 2].map(index => mean(sectors.map(row => row.sectors.avg[index]))),
      best:[0, 1, 2].map(index => minOf(sectors.map(row => row.sectors.best[index])))} : null}, ...rows];
}

export function tyreStats(drivers, who, hidden) {
  const rows = drivers.filter(row => !hidden.has(row.id) && who.has(row.id))
    .map(row => ({...row, ...who.get(row.id), laps:row.laps}));
  if (rows.length < 2) return rows;
  return [{...CREW, laps:rows.reduce((sum, row) => sum + row.laps, 0), wear:meanFour(rows, 'wear'), temp:meanFour(rows, 'temp'), kpa:meanFour(rows, 'kpa'), brake:meanFour(rows, 'brake')}, ...rows];
}

// The best pilot of a column, in violet as on a timing screen: the lowest (or highest) value among the pilots shown,
// two pilots at least and not all level; the crew row is never marked.
export function bestOf(rows, get, lower = true) {
  const values = rows.filter(row => !row.crew).map(get).filter(known).map(Number);
  if (values.length < 2 || Math.min(...values) === Math.max(...values)) return null;
  return lower ? Math.min(...values) : Math.max(...values);
}
export const isBest = (row, value, best) => !row.crew && known(value) && known(best) && Math.abs(Number(value) - best) < 1e-9;

// Calendar bounds must use the next local midnight, including DST changes.
export function localDayEnd(value) {
  const [year, month, day] = String(value).split('-').map(Number);
  return new Date(year, month - 1, day + 1).getTime() - 1;
}

export function stintProjection(capacity, consumption, reserve = 0) {
  if (![capacity, consumption, reserve].every(known) || capacity <= 0 || consumption <= 0 || reserve < 0 || reserve >= capacity) return null;
  return Math.floor((capacity - reserve) / consumption);
}

// Missing rates must not look like an instantaneous pit stop.
export function refuelDuration({fuel, energy, fuelRate, energyRate, connect}) {
  if (!known(energy) || energy < 0) return null;
  if (energy === 0) return 0;
  if (!known(fuel) || fuel < 0 || (fuel > 0 && (!known(fuelRate) || fuelRate <= 0 || !known(connect))) || !known(energyRate) || energyRate <= 0) return null;
  return Math.max(fuel > 0 ? Number(connect) + fuel / fuelRate : 0, energy / energyRate);
}

// Use all measured limits; never assume unknown fuel capacity or consumption.
export function availableLaps(capacity, fuel, energy, reservePercent = 0) {
  if (!known(reservePercent) || reservePercent < 0 || reservePercent >= 100) return null;
  const values = [stintProjection(100,energy,reservePercent), known(capacity) ? stintProjection(capacity,fuel,capacity*reservePercent/100) : null].filter(known);
  return values.length ? Math.min(...values) : null;
}
export function tyreRemaining(initial, wear, laps) {
  if (![initial,wear,laps].every(known) || initial<0 || initial>100 || wear<0 || laps<0) return null;
  return Math.max(0,initial-wear*laps);
}
