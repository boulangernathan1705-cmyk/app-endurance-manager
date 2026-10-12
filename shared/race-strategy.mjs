// A race's strategy, estimated lap by lap (the training's relay plan, the Mémo's « Stratégie de course »): how many
// laps a full tank or 100 % of energy lasts, the stops this takes with what is refilled at each one (only what the
// end of the race needs at the last), the tyres changed when the worst one would be too worn, the pit lane crossed,
// the out lap on cold tyres, and the lap the race ends on (the first line crossed once the time is over). An
// estimate to organise the crew: the race, its safety cars and its mistakes will change it.
import {stopTime} from './training.mjs';

// What is assumed when the site has not measured it yet; each one used is named in `assumed`.
export const STRATEGY_DEFAULTS = {lane:25, stopped:30, relayMinutes:50, wearLimit:60, coldTyres:2};
const round = (value, digits = 1) => value === null || value === undefined || !Number.isFinite(value) ? null : Math.round(value * 10 ** digits) / 10 ** digits;

// The figures of a Mémo sheet (server/training.mjs, memo) the strategy needs: the pilots' median, else the viewer's
// own, else the game's forecast, as the sheet's own stint does.
export function strategyInputs(sheet, lap) {
  const pick = item => item ? item.median ?? item.you ?? item.game ?? null : null;
  const tyre = sheet?.tyres?.[0];
  const wheels = tyre?.wheels?.map(wheel => wheel.wear).filter(value => value > 0) || [];
  return {lap:lap || null, fuel:pick(sheet?.fuel), ve:pick(sheet?.energy), capacity:sheet?.capacity || null, ratio:sheet?.fuel?.ratio || null,
    lane:sheet?.lane?.through || null, service:sheet?.service?.source === 'game' ? sheet.service : null, measuredStop:sheet?.service?.source === 'stops' ? sheet.service : null,
    wear:wheels.length ? Math.max(...wheels) : null, compound:tyre?.name || null};
}

// minutes: the race's length; lap: seconds; fuel: litres per lap; ve: % of energy per lap; capacity: litres;
// lane: seconds lost crossing the pit lane; service: the game's service times (shared/training.mjs, stopTime);
// wear: % the worst tyre loses per lap; driverChange: a new pilot at each stop (done during the refuel).
export function raceStrategy({minutes, lap, fuel = null, ve = null, capacity = null, ratio = null, lane = null, service = null, measuredStop = null,
  wear = null, driverChange = true, wearLimit = STRATEGY_DEFAULTS.wearLimit, coldTyres = STRATEGY_DEFAULTS.coldTyres}) {
  if (!(minutes > 0) || !(lap > 0)) return null;
  const race = minutes * 60, assumed = [];
  const byEnergy = ve > 0 ? Math.floor(100 / ve) : Infinity, byTank = fuel > 0 && capacity > 0 ? Math.floor(capacity / fuel) : Infinity;
  let stintLaps = Math.min(byEnergy, byTank), limit = byEnergy <= byTank ? 'energy' : 'tank';
  if (!Number.isFinite(stintLaps) || stintLaps < 1) {
    stintLaps = Math.max(1, Math.floor(STRATEGY_DEFAULTS.relayMinutes * 60 / lap)); limit = 'time';
    assumed.push(`relais de ${STRATEGY_DEFAULTS.relayMinutes} min, la consommation n’est pas encore mesurée`);
  }
  // Tyres: kept while the worst one stays under the limit, else changed at every stop.
  const tyreStints = wear > 0 ? Math.max(1, Math.floor(wearLimit / (wear * stintLaps))) : 1;
  if (!(wear > 0)) assumed.push('4 pneus à chaque arrêt, leur usure n’est pas encore mesurée');
  const crossing = lane > 0 ? lane : STRATEGY_DEFAULTS.lane;
  if (!(lane > 0)) assumed.push(`${STRATEGY_DEFAULTS.lane} s pour traverser les stands, pas encore mesuré`);
  if (!service && !measuredStop?.tyres4) assumed.push(`${STRATEGY_DEFAULTS.stopped} s à l’arrêt, les temps de service ne sont pas encore connus`);
  // Time stopped to put in what `laps` laps take, with or without tyres.
  const stoppedFor = (laps, tyres) => {
    const litres = fuel > 0 ? Math.min(capacity || Infinity, laps * fuel) : 0;
    const energy = ve > 0 ? Math.min(100, laps * ve) : 0;
    if (service) return stopTime(service, {fuel:litres || (energy && ratio && capacity ? energy * ratio * capacity / 100 : 0), energy, tyres:tyres ? 4 : 0, driver:driverChange});
    if (measuredStop?.tyres4 || measuredStop?.fuelRate) return round((litres && measuredStop.fuelRate ? litres / measuredStop.fuelRate : STRATEGY_DEFAULTS.stopped / 2) + (tyres ? measuredStop.tyres4 || 0 : 0), 1);
    return STRATEGY_DEFAULTS.stopped;
  };
  const relays = [], stops = [];
  let time = 0, laps = 0, onTyres = 0, freshTyres = false;
  for (let guard = 0; guard < 200; guard++) {
    const start = time;
    // The laps left if this relay went to the end: the race ends on the first line crossed after the time.
    const toEnd = Math.max(1, Math.ceil((race - time - (freshTyres ? coldTyres : 0)) / lap));
    const run = Math.min(stintLaps, toEnd);
    time += run * lap + (freshTyres ? coldTyres : 0); laps += run; onTyres++;
    relays.push({start:Math.round(start), laps:run, minutes:round((time - start) / 60, 1), fresh:freshTyres || !relays.length});
    if (run === toEnd || time >= race) break;
    // The stop: what the rest needs (a full relay, or less at the last), tyres when the next relay would wear them too much.
    const after = Math.max(0, race - time - crossing);
    const need = Math.min(stintLaps, Math.max(1, Math.ceil(after / lap)));
    const tyres = onTyres >= tyreStints;
    const stopped = stoppedFor(need, tyres);
    stops.push({lap:laps, at:Math.round(time), stopped, lane:round(crossing, 1), total:round(crossing + stopped, 1), tyres,
      fuel:fuel > 0 ? round(Math.min(capacity || Infinity, need * fuel), 1) : null, energy:ve > 0 ? Math.round(Math.min(100, need * ve)) : null, short:need < stintLaps});
    time += crossing + stopped;
    if (tyres) onTyres = 0;
    freshTyres = tyres;
  }
  // One stop less: the laps each relay would then need, and the consumption it takes.
  let saving = null;
  if (stops.length && limit !== 'time') {
    const perRelay = Math.ceil(laps / stops.length);
    saving = {laps:perRelay, percent:round((1 - stintLaps / perRelay) * 100, 1)};
  }
  return {laps, stintLaps, limit, tyreStints, relays, stops, pitTime:round(stops.reduce((sum, stop) => sum + stop.total, 0), 0),
    lap:round(lap, 3), assumed, saving};
}
