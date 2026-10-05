// Solo races: one entry per driver, limited places with a waiting list, one or two rounds and an
// OPEN / SAFE access. They reuse the race cards, the race page and the registration window; this module
// only holds what differs from endurance events.
import {state,esc,button,canManage,can,logo,badge,categories} from './core.mjs';
import {SIMS,simCatalog,simForEvent} from '../../shared/catalog.mjs';

export const ANY_CATEGORY = '*';
export const isSolo = event => event?.format === 'solo';

export function simBadge(event) {
  const sim = SIMS.find(item => item.id === simForEvent(event));
  return `<span class="event-sim-badge sim-${sim.id}" title="${esc(sim.name)}">${esc(sim.short)}</span>`;
}
// The simulator, the event type, then OPEN or SAFE (unless the type already says it).
export function accessBadge(event) {
  const safe = event.access === 'safe', type = event.details?.type || '';
  const typeBadge = type ? `<span class="event-type-badge">${esc(type)}</span>` : '';
  if (type.toLowerCase() === (safe ? 'safe' : 'open')) return `<span class="event-badge-row">${simBadge(event)}<span class="event-access-badge ${safe ? 'is-safe' : 'is-open'}">${esc(type)}</span></span>`;
  return `<span class="event-badge-row">${simBadge(event)}${typeBadge}<span class="event-access-badge ${safe ? 'is-safe' : 'is-open'}" title="${safe ? 'Réservé aux pilotes SAFE' : 'Ouvert à tous les pilotes connectés'}">${safe ? 'SAFE' : 'OPEN'}</span></span>`;
}

// Circuit of an event: from the catalog (LMU, older iRacing events), or as typed (AMS2, iRacing, ACE).
export function eventCircuitName(event, id) {
  const sim = simForEvent(event), circuit = simCatalog(sim)?.circuits.find(item => item.id === id);
  if (circuit) return circuit.random ? 'Circuit aléatoire' : circuit.name;
  return (sim !== 'lmu' && id) || 'Circuit à préciser';
}

// "Circuit de Spa-Francorchamps · 20 min + Circuit aléatoire · 20 min"
export function soloRoundsLabel(event) {
  const rounds = event.rounds || [];
  if (!rounds.length) return esc(eventCircuitName(event, event.circuit));
  return rounds.map(round => `${esc(eventCircuitName(event, round.circuit))} · ${Number(round.durationMinutes) || 0} min`).join(' + ');
}

// Line icons of the calendar card.
const ICONS = {
  time: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  format: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2M9 2h6M12 2v3"/>',
  fuel: '<path d="M4 21V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16M3 21h12M4 10h10M14 9h2a2 2 0 0 1 2 2v5a1.5 1.5 0 0 0 3 0V8l-3-3"/>',
  tyres: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3.5"/><path d="M12 3v5.5M12 15.5V21M3 12h5.5M15.5 12H21"/>',
  car: '<path d="M3 16v-3l2.5-5h13l2.5 5v3"/><path d="M3 16h18"/><circle cx="7.5" cy="16.5" r="2"/><circle cx="16.5" cy="16.5" r="2"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>',
};
const infoChip = (icon, value, title) => `<span class="solo-info-chip" title="${esc(title)}"><svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[icon]}</svg><span>${esc(value)}</span></span>`;
// The event's details on the calendar card: per round its sessions, weather, multipliers and car, then the
// schedule of an open session, the server password and the note.
export function soloCardInfo(event) {
  const details = event.details || {}, rounds = event.rounds?.length ? event.rounds : [{circuit: event.circuit, durationMinutes: event.durationMinutes}];
  const roundRow = round => {
    const weather = WEATHERS.find(([value]) => value === round.weather);
    const car = [(round.categories || []).length ? '' : round.category, round.car].filter(Boolean).join(' · ');
    const chips = [
      rounds.length > 1 ? `<span class="solo-info-circuit">${esc(eventCircuitName(event, round.circuit))}</span>` : '',
      round.randomCategory ? '<span class="solo-info-chip" title="Catégorie aléatoire"><span aria-hidden="true">❓</span><span>Catégorie aléatoire</span></span>' : '',
      ...(round.categories || []).map(category => `<span class="solo-info-category" title="${esc(category)}">${logo(category)}</span>`),
      infoChip('format', roundFormat(round).replaceAll('/', ' · '), 'Essais · Qualifs · Course (min)'),
      weather ? `<span class="solo-info-chip solo-info-weather" title="Météo : ${esc(weather[2])}"><span aria-hidden="true">${weather[1]}</span><span class="sr-only">${esc(weather[2])}</span></span>` : '',
      round.fuel != null ? infoChip('fuel', `×${round.fuel}`, 'Consommation de carburant') : '',
      round.tyres != null ? infoChip('tyres', `×${round.tyres}`, 'Usure des pneus') : '',
      car ? infoChip('car', car, 'Catégorie et voiture') : '',
    ].filter(Boolean);
    return `<span class="solo-info-row">${chips.join('')}</span>`;
  };
  // Several rounds: one aligned line each (number, circuit, categories, sessions); the rest is on the event page.
  const roundLine = (round, index) => `<span class="solo-round-line"><span class="solo-round-label">Manche ${index + 1}</span><span class="solo-round-name">${esc(eventCircuitName(event, round.circuit))}</span><span class="solo-round-cats">${round.randomCategory ? '<span class="solo-info-chip" title="Catégorie aléatoire">❓</span>' : (round.categories || []).map(category => `<span class="solo-info-category" title="${esc(category)}">${logo(category)}</span>`).join('')}</span>${infoChip('format', roundFormat(round).replaceAll('/', ' · '), 'Essais · Qualifs · Course (min)')}</span>`;
  // The server password is not on the card: on the event page, for its pilots only.
  const extra = [
    details.note ? infoChip('info', details.note, 'Info') : '',
  ].filter(Boolean);
  if (rounds.length > 1) return `<span class="solo-card-info"><span class="solo-round-lines">${rounds.map(roundLine).join('')}</span>${extra.length ? `<span class="solo-info-row">${extra.join('')}</span>` : ''}</span>`;
  return `<span class="solo-card-info">${rounds.map(roundRow).join('')}${extra.length ? `<span class="solo-info-row">${extra.join('')}</span>` : ''}</span>`;
}
// Pilots doing a round (a pilot may skip one round of a multi-round event).
export function roundPilots(event, index, departure = event.departures?.[0]) {
  return (departure?.availability || []).filter(reg => reg.status !== 'unavailable' && !reg.waitlistPosition && !reg.roundChoices?.[index]?.skip).length;
}
// Event page: every detail shown at once, one tile with its icon each (« Essais 5 min », « Usure des pneus ×1 »);
// several rounds side by side, each with its pilots.
const TILE_ICONS = {
  practice: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="2"/><path d="M12 14v7M10.2 11 3.5 9.5M13.8 11l6.7-1.5"/>',
  qualifying: '<circle cx="12" cy="14" r="7"/><path d="M12 10.5V14l2 1.5M10 3h4M12 3v4M18.5 7.5l1.5-1.5"/>',
  race: '<path d="M5 21V4M5 4h13l-2.5 4L18 12H5"/><path d="M9 4v8M13 4v8M5 8h11"/>',
};
// The server password: for the pilots entered (and whoever manages the event).
export function canSeePassword(event) {
  return canManage() || (event.departures || []).some(departure => (departure.availability || []).some(reg => reg.mine && reg.status !== 'unavailable'));
}
const detailSvg = path => `<svg viewBox="0 0 24 24" aria-hidden="true">${path}</svg>`;
const detailTile = (icon, label, value, extra = '') => value ? `<div class="solo-detail${extra}"><span class="solo-detail-icon">${icon}</span><span class="solo-detail-copy"><span class="solo-detail-label">${esc(label)}</span><strong>${value}</strong></span></div>` : '';
// The tiles of a round: sessions, weather, multipliers, category and car.
export function roundTiles(round) {
  const minutes = value => value ? `${Number(value)} min` : '';
  const weather = WEATHERS.find(([value]) => value === round.weather);
  const category = round.randomCategory ? 'Aléatoire' : (round.categories || []).length ? `<span class="solo-detail-logos">${round.categories.map(category => `<span title="${esc(category)}">${logo(category)}</span>`).join('')}</span>` : esc(round.category || '');
  return `<div class="solo-detail-grid">${
    detailTile(detailSvg(TILE_ICONS.practice), 'Essais', minutes(round.practice))}${detailTile(detailSvg(TILE_ICONS.qualifying), 'Qualifications', minutes(round.qualifying))}${detailTile(detailSvg(TILE_ICONS.race), 'Course', minutes(round.durationMinutes))}${
    detailTile(`<span class="solo-detail-emoji">${weather?.[1] || ''}</span>`, 'Météo', weather ? esc(weather[2]) : '')}${detailTile(detailSvg(ICONS.fuel), 'Consommation', round.fuel != null ? `×${esc(round.fuel)}` : '')}${detailTile(detailSvg(ICONS.tyres), 'Usure des pneus', round.tyres != null ? `×${esc(round.tyres)}` : '')}${
    detailTile(round.randomCategory ? '<span class="solo-detail-emoji">❓</span>' : detailSvg(ICONS.car), 'Catégorie', category)}${detailTile(detailSvg(ICONS.car), 'Voiture', esc(round.car || ''))}</div>`;
}
// Event page header: a single round shows its tiles; several rounds show theirs in their own cards, below.
// Then the note, and the password for the pilots entered.
export function soloEventDetails(event) {
  const details = event.details || {}, rounds = event.rounds?.length ? event.rounds : [{circuit: event.circuit, durationMinutes: event.durationMinutes}];
  const extra = `${canSeePassword(event) ? detailTile(detailSvg(ICONS.lock), 'Mot de passe', esc(details.password || '')) : ''}${detailTile(detailSvg(ICONS.info), 'Info', esc(details.note || ''), ' is-wide')}`;
  const tiles = rounds.length > 1 ? '' : roundTiles(rounds[0]);
  return tiles || extra ? `<div class="solo-event-details">${tiles}${extra ? `<div class="solo-detail-grid solo-detail-extra">${extra}</div>` : ''}</div>` : '';
}
// Above the card's details: the circuit, or the number of rounds.
export function soloCardMeta(event) {
  const rounds = event.rounds || [];
  return rounds.length > 1 ? `${rounds.length} manches` : esc(eventCircuitName(event, rounds[0]?.circuit ?? event.circuit));
}

export function soloCounts(event, departure) {
  const entries = (departure?.availability || []).filter(reg => reg.status !== 'unavailable');
  const waiting = entries.filter(reg => reg.waitlistPosition);
  return {entries, confirmed:entries.length - waiting.length, waiting:waiting.length, capacity:Number(event.capacity) || null};
}

// Places taken / places available, and the waiting list.
export function soloFill(event, departure = event.departures?.[0]) {
  const {confirmed, waiting, capacity} = soloCounts(event, departure);
  const ratio = capacity ? Math.min(1, confirmed / capacity) : 0;
  const full = capacity && confirmed >= capacity;
  return `<span class="solo-fill${full ? ' is-full' : ''}"><span class="solo-fill-copy"><strong>${confirmed}${capacity ? ` / ${capacity}` : ''}</strong> ${confirmed > 1 ? 'inscrits' : 'inscrit'}${waiting ? ` · <em>${waiting} en attente</em>` : ''}${full && !waiting ? ' · <em>complet</em>' : ''}</span><span class="solo-fill-bar" aria-hidden="true"><span style="width:${Math.round(ratio * 100)}%"></span></span></span>`;
}


// Why the driver cannot enter, or '' when they can.
export function soloEntryBlock(event) {
  if (!state.user) return 'Connecte-toi avec Discord pour participer.';
  if (event.access === 'safe' && !can('solo_safe')) return 'Événement réservé aux pilotes SAFE.';
  if (!can('solo_safe') && !can('solo_open')) return 'Tu n’as pas accès aux événements de cette communauté.';
  return '';
}

export function myWaitlistPosition(departure) {
  return (departure.availability || []).find(reg => reg.mine && reg.waitlistPosition)?.waitlistPosition || null;
}


// Participants of a solo race: the grid, then the waiting list, in order of arrival.
export function renderSoloEntries(event, departure) {
  const {entries} = soloCounts(event, departure);
  return soloEntryList(event, departure, entries, {title: 'Participants', capacity: event.capacity});
}
// The pilots of a solo event (or of one of its rounds): by category, in the order of the round (« Peu importe »
// last), and in each category in the order they entered; small cards, the category only (no car).
const EDIT_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4ZM14 6l4 4"/></svg>';
export function soloEntryList(event, departure, entries, {round = 0, title = 'Pilotes', capacity = null} = {}) {
  const current = (event.rounds || [])[round] || {}, order = current.randomCategory ? [] : current.categories?.length ? current.categories : event.categories || [];
  const categoryOf = reg => current.randomCategory ? '' : (reg.roundChoices?.[round]?.category ?? reg.category) || '';
  const edit = reg => reg.canEdit && departure.startsAt > Date.now() && reg.managed ? `<button type="button" class="solo-entry-edit" data-action="edit-registration" data-id="${reg.id}" data-departure="${departure.id}" data-tip="Modifier" aria-label="Modifier l’inscription de ${esc(reg.name)}">${EDIT_ICON}</button>` : '';
  const pill = (reg, rank, withLogo) => `<li class="solo-entry${reg.mine ? ' is-mine' : ''}"><span class="solo-entry-rank">${rank}</span><strong class="solo-entry-name">${esc(reg.name)}</strong>${withLogo && categoryOf(reg) && categoryOf(reg) !== ANY_CATEGORY ? `<span class="solo-entry-logo" title="${esc(categoryOf(reg))}">${logo(categoryOf(reg))}</span>` : ''}${edit(reg)}</li>`;
  const grid = entries.filter(reg => !reg.waitlistPosition), waiting = entries.filter(reg => reg.waitlistPosition);
  const keys = [...order, ANY_CATEGORY, ''];
  const groups = keys.map(key => [key, grid.filter(reg => (keys.includes(categoryOf(reg)) ? categoryOf(reg) : '') === key)]).filter(([, list]) => list.length);
  const head = key => key === ANY_CATEGORY ? '<span class="solo-entry-group-head"><span class="solo-any-logo" aria-hidden="true">✱</span>Peu importe' : `<span class="solo-entry-group-head ${categories[key]?.css || ''}">${logo(key)}${esc(key)}`;
  const gridList = !grid.length ? '<p class="empty">Aucun inscrit pour l’instant.</p>'
    : groups.length === 1 && !groups[0][0] ? `<ol class="solo-entries">${grid.map((reg, index) => pill(reg, index + 1, false)).join('')}</ol>`
    : `<div class="solo-entry-groups">${groups.map(([key, list]) => `<div class="solo-entry-group">${key ? `${head(key)}<em>${list.length}</em></span>` : ''}<ol class="solo-entries">${list.map((reg, index) => pill(reg, index + 1, false)).join('')}</ol></div>`).join('')}</div>`;
  const waitingList = waiting.length ? `<h3 class="solo-subtitle">Liste d’attente <span class="count-pill">${waiting.length}</span></h3><ol class="solo-entries is-waiting">${waiting.map(reg => pill(reg, reg.waitlistPosition, true)).join('')}</ol>` : '';
  return `<section class="solo-participants"><h3 class="solo-subtitle">${title} <span class="count-pill">${grid.length}${capacity ? ` / ${capacity}` : ''}</span></h3>${gridList}${waitingList}</section>`;
}

export const WEATHERS = [['random','❓','Aléatoire'],['sun','☀️','Soleil'],['cloud','⛅','Nuageux'],['overcast','☁️','Couvert'],['rain','🌧️','Pluie']];
// « P5/Q10/C40 »: the session lengths of a round.
export function roundFormat(round) {
  return [round.practice ? `P${round.practice}` : '', round.qualifying ? `Q${round.qualifying}` : '', `C${round.durationMinutes}`].filter(Boolean).join('/');
}
export function roundExtras(round) {
  const weather = WEATHERS.find(([value]) => value === round.weather)?.[1];
  return [weather, round.fuel != null ? `carburant ×${round.fuel}` : '', round.tyres != null ? `usure pneus ×${round.tyres}` : ''].filter(Boolean).join(' · ');
}
