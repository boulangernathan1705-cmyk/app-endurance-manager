import {durationLabel} from '../shared/duration.mjs';
import {gameForEvent} from '../shared/catalog.mjs';

// Use the stored race duration, not the schedule (which includes practice/qualifying).
// Hide it only when the title actually contains the same duration.
export function enduranceDuration(event) {
  const minutes = Number(event?.durationMinutes) || Number(event?.durationHours) * 60;
  if (!Number.isFinite(minutes) || minutes <= 0) return '';
  const title = String(event?.name || '').normalize('NFKC').toLowerCase();
  const hours = /(?:^|[^\p{L}\p{N}])(\d{1,3})\s*(?:heures?|hours?|hrs?|h)(?:\s*(\d{1,2})(?:\s*(?:minutes?|mins?|m))?)?(?![\p{L}\p{N}])/gu;
  const mins = /(?:^|[^\p{L}\p{N}])(\d{1,4})\s*(?:minutes?|mins?|m)(?![\p{L}\p{N}])/gu;
  const shown = [...title.matchAll(hours)].some(m => Number(m[1])*60 + Number(m[2] || 0) === minutes)
    || (minutes < 60 && [...title.matchAll(mins)].some(m => Number(m[1]) === minutes));
  return shown ? '' : durationLabel(minutes).toUpperCase().replace(/\s+/g,'');
}

export const enduranceSim = (event, game = event?.otherGame || gameForEvent(event)) => game === 'iracing' ? 'iracing' : 'lmu';
export function enduranceHeader(event, game) {
  const sim = enduranceSim(event, game), label = sim === 'iracing' ? 'iRacing' : 'LMU';
  const duration = enduranceDuration(event);
  return `<span class="endurance-card-head endurance-sim-${sim}"><span class="endurance-card-label"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 22V3m0 1c5-4 10 4 16 0v11c-6 4-11-4-16 0" /></svg><span>Endurance ${label}</span></span>${duration ? `<span class="endurance-card-duration">${duration}</span>` : ''}</span>`;
}
