import {timeLabel} from './dates.mjs';
const timelineEscape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const timelineTime = new Intl.DateTimeFormat('fr-FR', {timeZone:'Europe/Paris', hour:'2-digit', minute:'2-digit', hourCycle:'h23'});
const timelineDate = new Intl.DateTimeFormat('fr-FR', {timeZone:'Europe/Paris', day:'2-digit', month:'2-digit', timeZoneName:'short'});

export function raceHourLabel(departure, index) {
  // Start time not known yet: hours of race ("0 h", "1 h"…).
  if (departure.tbd || departure.hideClock) return `${index} h`;
  return timeLabel(timelineTime.format(new Date(departure.startsAt + index * 3600000)));
}

// Finish time of a departure (its real end when the duration has minutes).
export function raceEndLabel(departure) {
  if (departure.tbd || departure.hideClock) return `${Math.round((Number(departure.endsAt) - departure.startsAt) / 60000 / 60 * 10) / 10} h`.replace('.', ',');
  return timeLabel(timelineTime.format(new Date(Number(departure.endsAt))));
}

// Label density follows the containing card, independently of viewport size.
// Always leave at least one full step before the final label (odd durations too).
export function timelineLabelVisible(index, duration, capacity) {
  const step = Math.ceil(duration / capacity);
  return index === 0 || index === duration || (index % step === 0 && duration - index >= step);
}

const timelineDayKey = new Intl.DateTimeFormat('en-CA', {timeZone:'Europe/Paris', year:'numeric', month:'2-digit', day:'2-digit'});
const timelineDayName = new Intl.DateTimeFormat('fr-FR', {timeZone:'Europe/Paris', weekday:'long', day:'numeric'});
const timelineDayShort = new Intl.DateTimeFormat('fr-FR', {timeZone:'Europe/Paris', weekday:'short'});
// A long race is chosen day by day (more than 12 hours): the single line of small cells no longer fits a phone.
export const LONG_RACE_HOURS = 12;
// The hours of a race grouped by Paris day: [{key, name, short, hours:[index…]}]; one group while the time is unknown.
export function raceDayGroups(departure, duration) {
  if (departure.tbd || departure.hideClock) return [{key:'', name:'', short:'', hours:Array.from({length:duration}, (_, i) => i)}];
  const groups = [];
  for (let i = 0; i < duration; i++) {
    const at = new Date(departure.startsAt + i * 3600000), key = timelineDayKey.format(at);
    if (groups.at(-1)?.key !== key) groups.push({key, name:timelineDayName.format(at), short:timelineDayShort.format(at), hours:[]});
    groups.at(-1).hours.push(i);
  }
  return groups;
}
// The hours of a long race, one block per day, the hour written in each cell.
function renderHourPicker({departure, duration, status, label}) {
  const parts = new Set(status.split(',')), groups = raceDayGroups(departure, duration);
  const end = index => index + 1 === duration && Number(departure.endsAt) ? raceEndLabel(departure) : raceHourLabel(departure, index + 1);
  return `<div class="presence-days" role="group" aria-label="${timelineEscape(label)}">${groups.map(group => {
    const head = group.name ? `<p class="presence-day-head"><strong>${timelineEscape(group.name)}</strong><small>${raceHourLabel(departure, group.hours[0])} → ${end(group.hours.at(-1))}</small></p>` : '';
    const cells = group.hours.map(i => {
      const present = status === 'whole' || parts.has(`h${i+1}`);
      const description = timelineEscape(`${group.name ? `${group.name} · ` : ''}${raceHourLabel(departure, i)} → ${end(i)} · ${present ? 'Disponible' : 'Non sélectionné'}`);
      return `<button type="button" class="presence-hour${present?' is-present':''}" aria-label="${description}" data-action="availability" data-departure="${timelineEscape(departure.id)}" data-value="h${i+1}" aria-pressed="${present}">${raceHourLabel(departure, i)}</button>`;
    }).join('');
    return `<div class="presence-day">${head}<div class="presence-day-grid">${cells}</div></div>`;
  }).join('')}</div>`;
}

export function renderAvailabilityTimeline({departure, duration, status = '', counts = null, interactive = false, label = 'Disponibilité'}) {
  if (interactive && duration > LONG_RACE_HOURS) return renderHourPicker({departure, duration, status, label});
  const parts = new Set(status.split(','));
  const isCoverage = Array.isArray(counts);
  const hours = Array.from({length:duration + 1}, (_, i) => raceHourLabel(departure, i));
  // A race of 2 h 30 has 3 slots; its finish is the real end, not the end of the third hour.
  const endsAt = Number(departure.endsAt);
  if (endsAt > departure.startsAt + (duration - 1) * 3600000 && endsAt < departure.startsAt + duration * 3600000) hours[duration] = raceEndLabel(departure);
  // ticks-N classes are width tiers (see timeline.css). Wide labels such as "15h30" get fewer per tier so they never touch.
  const tiers = [4,6,10,16,24];
  const capacities = hours.some(hour => /[h:]\d/.test(hour)) ? [3,5,8,12,20] : tiers;
  const boundaries = hours.map((hour, i) => {
    const density = tiers.filter((tier, t) => timelineLabelVisible(i, duration, capacities[t])).map(tier => `ticks-${tier}`).join(' ');
    return `<span class="presence-boundary boundary-${i} ${i===duration?'is-finish':''}"><span class="presence-time ${density}">${hour}</span></span>`;
  }).join('');
  const segments = Array.from({length:duration}, (_, i) => {
    const count = isCoverage ? Math.max(0, Number(counts[i]) || 0) : null;
    const present = isCoverage ? count > 0 : status === 'whole' || parts.has(`h${i+1}`);
    const timestamp = departure.startsAt + i * 3600000;
    const range = `${hours[i]} → ${hours[i+1]}`;
    const detail = isCoverage ? `${count} pilote(s) disponible(s)` : present ? 'Disponible' : 'Non sélectionné';
    const description = timelineEscape(`${range} · ${timelineDate.format(new Date(timestamp))} · ${detail}`);
    const coverageClass = isCoverage ? (count >= 2 ? ' coverage-two' : count === 1 ? ' coverage-one' : ' coverage-none') : '';
    const attributes = `class="presence-segment${present?' is-present':''}${coverageClass}" title="${description}" aria-label="${description}"`;
    const marker = isCoverage ? (count > 0 ? String(count) : '') : '';
    const content = marker ? `<span aria-hidden="true">${marker}</span>` : '';
    return interactive
      ? `<button type="button" ${attributes} data-action="availability" data-departure="${timelineEscape(departure.id)}" data-value="h${i+1}" aria-pressed="${present}">${content}</button>`
      : `<span ${attributes} role="img">${content}</span>`;
  }).join('');
  return `<div class="presence-timeline duration-${duration}${interactive?' is-interactive':''}${isCoverage?' is-coverage':''}" role="group" aria-label="${timelineEscape(label)}">
    <div class="presence-scale" aria-hidden="true">${boundaries}</div>
    <div class="presence-track">${segments}</div>
    <div class="presence-edges" aria-hidden="true"><span>DÉPART</span><span>ARRIVÉE</span></div>
  </div>`;
}
