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
