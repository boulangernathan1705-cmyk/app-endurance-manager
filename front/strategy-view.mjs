// The race's strategy on screen (shared/race-strategy.mjs): one line to read, the stops one by one when unfolded.
// Used by the training's relay plan and the Mémo.
import {timeAt} from './dates.mjs';

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num = (value, digits = 0) => Number(value).toFixed(digits).replace('.', ',');
export const lapShort = seconds => Math.floor(seconds / 60) + ':' + (seconds % 60).toFixed(1).padStart(4, '0');
const duration = seconds => { const minutes = Math.round(seconds / 60); return minutes < 60 ? minutes + ' min' : Math.floor(minutes / 60) + ' h ' + String(minutes % 60).padStart(2, '0'); };
const stopped = seconds => seconds >= 60 ? Math.floor(seconds / 60) + ' min ' + String(Math.round(seconds % 60)).padStart(2, '0') : Math.round(seconds) + ' s';
// The clock to five minutes when the start is known, else the race's elapsed time.
export const raceClock = (startsAt, at) => startsAt ? timeAt(startsAt + Math.round(at / 300) * 300000) : 'après ' + duration(at);

export function strategySummary(plan) {
  const full = plan.relays.filter(relay => relay.laps === plan.stintLaps).length;
  return plan.relays.length + ' relais' + (full ? ' de ' + plan.stintLaps + ' tours' : '') + ' · ' + plan.stops.length + ' arrêt' + (plan.stops.length > 1 ? 's' : '') + ' · ' + plan.laps + ' tours en ' + lapShort(plan.lap);
}

export function strategyDetails(plan, {startsAt = null, open = false} = {}) {
  const limit = plan.limit === 'energy' ? 'avec 100 % d’énergie' : plan.limit === 'tank' ? 'avec un plein' : 'estimés sur 50 min de relais';
  const stops = plan.stops.map((stop, index) => {
    const refill = [stop.energy !== null ? stop.energy + ' % d’énergie' : '', stop.fuel !== null ? num(stop.fuel) + ' L' : ''].filter(Boolean).join(' · ');
    return '<li><b>Arrêt ' + (index + 1) + '</b><span>' + esc(raceClock(startsAt, stop.at)) + ' · tour ' + stop.lap + '</span><span>' + esc((stop.short ? 'Fin de course : ' : '') + (refill || 'Ravitaillement')) + (stop.tyres ? ' · 4 pneus' : '') + '</span><span>' + esc(stopped(stop.total)) + ' au stand</span></li>';
  }).join('');
  return '<details class="strategy"' + (open ? ' open' : '') + '><summary>Détail de l’estimation</summary>' +
    '<p>' + plan.stintLaps + ' tours ' + limit + (plan.tyreStints > 1 ? ', pneus changés tous les ' + plan.tyreStints + ' relais' : '') + '. Arrêts : ' + esc(stopped(plan.pitTime)) + ' au total.</p>' +
    (stops ? '<ol class="strategy-stops">' + stops + '</ol>' : '<p>Pas d’arrêt : la course tient sur un relais.</p>') +
    (plan.saving && plan.saving.percent > 0 && plan.saving.percent < 25 ? '<p>Un arrêt de moins : ' + plan.saving.laps + ' tours par relais, soit ' + num(plan.saving.percent, 1) + ' % de consommation en moins.</p>' : '') +
    (plan.assumed.length ? '<p class="strategy-assumed">Supposé : ' + esc(plan.assumed.join(' ; ')) + '.</p>' : '') +
    '<p class="strategy-assumed">Une estimation : voiture de sécurité, erreurs et météo la changeront.</p></details>';
}
