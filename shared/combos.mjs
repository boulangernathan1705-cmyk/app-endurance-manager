// Fiches combo (module "combos"): what the SimHub plugin sends for one session, checked before it is kept, and
// how a lap is sorted into a track condition. Shared by the server (server/combos.mjs) and the pages.

// Track condition of a lap, from the game's rain (0 to 1) and how wet the racing line is (0 to 1): the higher of
// the two. To be adjusted once the team has compared with what it saw on track.
export const CONDITIONS = Object.freeze(['dry', 'damp', 'rain']);
export const DAMP_FROM = 0.1;
export const RAIN_FROM = 0.5;
export const conditionOf = (rain, wet) => {
  const level = Math.max(Number(rain) || 0, Number(wet) || 0);
  return level >= RAIN_FROM ? 'rain' : level >= DAMP_FROM ? 'damp' : 'dry';
};
export const CONDITION_SQL = `CASE WHEN MAX(COALESCE(rain,0),COALESCE(wet,0))>=${RAIN_FROM} THEN 'rain' WHEN MAX(COALESCE(rain,0),COALESCE(wet,0))>=${DAMP_FROM} THEN 'damp' ELSE 'dry' END`;

// A lap counts on the sheet when it is timed, valid, away from the pits and within this ratio of the pilot's best
// in the same condition (no lap behind a slower car, no spin).
export const CLEAN_RATIO = 1.07;

export const WHEELS = Object.freeze(['fl', 'fr', 'rl', 'rr']);
export const MAX_LAPS = 600;
export const MAX_STOPS = 60;
export const SETUP_MAX = 80;

const finite = (value, min, max) => { const parsed = Number(value); return value !== null && value !== '' && Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : null; };
const four = (value, min, max) => Array.isArray(value) && value.length === 4 ? value.map(item => finite(item, min, max)) : [null, null, null, null];
const label = (value, size) => String(value ?? '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, size);
const optional = (value, check) => value && typeof value === 'object' && !Array.isArray(value) ? check(value) : null;

// The game's service times for the car (seconds, litres and percent of energy per second).
export function cleanService(input) {
  const out = {};
  for (const key of ['fuelRate', 'energyRate', 'connect', 'tyres4', 'tyres2', 'wing', 'brakes', 'driver']) {
    const value = finite(input[key], 0, 600);
    if (value !== null) out[key] = value;
  }
  return Object.keys(out).length ? out : null;
}
// The game's forecast for one lap (litres, percent of energy) and the compound's ideal temperature (°C).
export function cleanGame(input) {
  const out = {fuel:finite(input.fuel, 0, 200), ve:finite(input.ve, 0, 100), ideal:finite(input.ideal, -50, 250)};
  return Object.values(out).some(value => value !== null) ? out : null;
}

// LMU names a setup with its track folder (« Lemans\HYMO 1.4.1 9X8EVO LM ER »): the sheet is already per track.
const setupName = value => label(String(value ?? '').split(/[\\/]/).pop(), SETUP_MAX);

// The three sectors of a lap (seconds), all or none.
function sectors(lap) {
  const values = [lap?.s1, lap?.s2, lap?.s3].map(value => finite(value, 0.5, 1800));
  const [s1, s2, s3] = values.every(value => value !== null) ? values : [null, null, null];
  return {s1, s2, s3};
}

// One session as the plugin sends it (connectors/simhub-plugin/Live.cs): bounded numbers, short texts, nothing else.
export function cleanSession(input) {
  if (!input || typeof input !== 'object' || !Array.isArray(input.laps) || !Array.isArray(input.stops)) throw Error('Séance illisible.');
  const at = finite(input.at, 1_500_000_000_000, 4_000_000_000_000);
  const track = label(input.track, 120), car = label(input.car, 120);
  if (!at || !track || !car) throw Error('Séance incomplète : date, circuit ou voiture manquant.');
  const seen = new Set();
  const laps = input.laps.slice(0, MAX_LAPS).map(lap => ({n:finite(lap?.n, 0, 10000), t:finite(lap?.t, 1, 3600), ...sectors(lap), top:finite(lap?.top, 0, 500),
    fuel:finite(lap?.fuel, 0, 200), ve:finite(lap?.ve, 0, 100), wear:four(lap?.wear, 0, 100), temp:four(lap?.temp, -50, 250),
    brake:four(lap?.brake, -50, 1500), kpa:four(lap?.kpa, 0, 1000), compound:label(lap?.compound, 40), track:finite(lap?.track, -30, 80),
    air:finite(lap?.air, -30, 60), rain:finite(lap?.rain, 0, 1), wet:finite(lap?.wet, 0, 1), invalid:lap?.invalid === true, pit:lap?.pit === true,
    setup:setupName(lap?.setup)}))
    // A lap LMU counted without a time still tells its fuel and tyres; the same lap number twice is kept once.
    .filter(lap => lap.n !== null && !seen.has(lap.n) && seen.add(lap.n) && (lap.t || lap.fuel || lap.ve || lap.wear.some(value => value > 0)));
  if (!laps.length) throw Error('Aucun tour roulé dans cette séance.');
  const stops = input.stops.slice(0, MAX_STOPS).map(stop => ({lap:finite(stop?.lap, 0, 10000) ?? 0, lane:finite(stop?.lane, 0, 600),
    stopped:finite(stop?.stopped, 0, 600), fuel:finite(stop?.fuel, 0, 200) ?? 0, ve:finite(stop?.ve, 0, 100) ?? 0,
    tyres:finite(stop?.tyres, 0, 4) ?? 0, repair:stop?.repair === true})).filter(stop => stop.lane && stop.stopped !== null);
  return {at, track, car, carClass:label(input.class, 60), driver:label(input.driver, 60), capacity:finite(input.capacity, 1, 300),
    laps, stops, service:optional(input.service, cleanService), game:optional(input.game, cleanGame)};
}

// The code the site gives a pilot for his plugin: the site's address and his key.
export const LINK_PREFIX = 'EMCOMBO1';
export const linkCode = (origin, key) => `${LINK_PREFIX} ${origin} ${key} ${LINK_PREFIX}`;

// Colours offered to the pilots; a pilot who has not chosen gets one by his place on the sheet.
export const COLORS = Object.freeze(['#b98cff', '#ff9a3d', '#45d4d0', '#ff6ad5', '#f2e35c', '#ff5d5d', '#9be15d', '#c9a27a', '#8fa8ff', '#e0e0e0']);
