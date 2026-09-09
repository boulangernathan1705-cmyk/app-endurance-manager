const timelineEscape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const timelineTime = new Intl.DateTimeFormat('fr-FR', {timeZone:'Europe/Paris', hour:'2-digit', minute:'2-digit', hourCycle:'h23'});
const timelineDate = new Intl.DateTimeFormat('fr-FR', {timeZone:'Europe/Paris', day:'2-digit', month:'2-digit', timeZoneName:'short'});

export function raceHourLabel(departure, index) {
  return timelineTime.format(new Date(departure.startsAt + index * 3600000)).replace(':00', 'h').replace(':', 'h');
}

// Label density follows the containing card, independently of viewport size.
// Always leave at least one full step before the final label (odd durations too).
export function timelineLabelVisible(index, duration, capacity) {
  const step = Math.ceil(duration / capacity);
  return index === 0 || index === duration || (index % step === 0 && duration - index >= step);
}

export function renderAvailabilityTimeline({departure, duration, status = '', counts = null, interactive = false, label = 'Disponibilité'}) {
  const parts = new Set(status.split(','));
  const isCoverage = Array.isArray(counts);
  const hours = Array.from({length:duration + 1}, (_, i) => raceHourLabel(departure, i));
  const boundaries = hours.map((hour, i) => {
    const density = [4,6,10,16,24].filter(capacity => timelineLabelVisible(i, duration, capacity)).map(capacity => `ticks-${capacity}`).join(' ');
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
    const marker = isCoverage ? (count > 0 ? String(count) : '·') : (present ? '✓' : '·');
    const content = `<span aria-hidden="true">${marker}</span>`;
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
