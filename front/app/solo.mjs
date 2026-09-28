// Solo races: one entry per driver, limited places with a waiting list, one or two rounds and an
// OPEN / SAFE access. They reuse the race cards, the race page and the registration window; this module
// only holds what differs from endurance events.
import {state,esc,button,canManage,logo,badge,categories,circuitLabel} from './core.mjs';

export const ANY_CATEGORY = '*';
export const isSolo = event => event?.format === 'solo';

export function accessBadge(event) {
  const safe = event.access === 'safe';
  return `<span class="event-access-badge ${safe ? 'is-safe' : 'is-open'}" title="${safe ? 'Réservée aux pilotes SAFE' : 'Ouverte à tous les pilotes connectés'}">${safe ? 'SAFE' : 'OPEN'}</span>`;
}

function roundCircuit(round) {
  return circuitLabel(round.circuit);
}

// "Circuit de Spa-Francorchamps · 20 min + Circuit aléatoire · 20 min"
export function soloRoundsLabel(event) {
  const rounds = event.rounds || [];
  if (!rounds.length) return esc(circuitLabel(event.circuit));
  return rounds.map(round => `${esc(roundCircuit(round))} · ${Number(round.durationMinutes) || 0} min`).join(' + ');
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

function categoryCell(category) {
  if (category === ANY_CATEGORY) return '<span class="solo-any-category">Peu importe</span>';
  return `<span class="solo-category ${categories[category]?.css || ''}">${logo(category)}<span>${esc(category)}</span></span>`;
}
function carCell(reg) {
  if (reg.carAny || !(reg.cars || []).length) return '<span class="solo-muted">Peu importe</span>';
  return esc(reg.cars.join(', '));
}

// Why the driver cannot enter, or '' when they can.
export function soloEntryBlock(event) {
  if (!state.user) return 'Connecte-toi avec Discord pour participer.';
  if (event.access === 'safe' && !state.user.safe && !canManage()) return 'Course réservée aux pilotes SAFE.';
  return '';
}

export function myWaitlistPosition(departure) {
  return (departure.availability || []).find(reg => reg.mine && reg.waitlistPosition)?.waitlistPosition || null;
}

// Category and car of each round (two-round races), or of the race.
function choicesCell(event, reg) {
  const rounds = event.rounds || [];
  const choices = reg.roundChoices?.length ? reg.roundChoices : [{category:reg.category, cars:reg.cars, carAny:reg.carAny}];
  if (rounds.length < 2) return `${categoryCell(choices[0].category)}<span class="solo-entry-car">${carCell(choices[0])}</span>`;
  return `<span class="solo-entry-rounds">${choices.map((choice, index) => `<span class="solo-entry-round"><em>M${index + 1}</em>${categoryCell(choice.category)}<span class="solo-entry-car">${carCell(choice)}</span></span>`).join('')}</span>`;
}

// Participants of a solo race: the grid, then the waiting list, in order of arrival.
export function renderSoloEntries(event, departure) {
  const {entries} = soloCounts(event, departure);
  const row = (reg, index) => {
    const edit = reg.canEdit && departure.startsAt > Date.now() && reg.managed ? button('edit-registration', 'Modifier', `data-id="${reg.id}" data-departure="${departure.id}" aria-label="Modifier l’inscription de ${esc(reg.name)}"`, 'link-button') : '';
    return `<li class="solo-entry${reg.mine ? ' is-mine' : ''}"><span class="solo-entry-rank">${reg.waitlistPosition ? `${reg.waitlistPosition}` : index + 1}</span><strong class="solo-entry-name">${esc(reg.name)}</strong>${choicesCell(event, reg)}${edit}</li>`;
  };
  const grid = entries.filter(reg => !reg.waitlistPosition), waiting = entries.filter(reg => reg.waitlistPosition);
  const gridList = grid.length ? `<ol class="solo-entries">${grid.map(row).join('')}</ol>` : '<p class="empty">Aucun inscrit pour l’instant.</p>';
  const waitingList = waiting.length ? `<h3 class="solo-subtitle">Liste d’attente <span class="count-pill">${waiting.length}</span></h3><p class="solo-help">Le premier en attente prend automatiquement la place d’un pilote qui se désinscrit.</p><ol class="solo-entries is-waiting">${waiting.map(row).join('')}</ol>` : '';
  return `<section class="solo-participants"><h3 class="solo-subtitle">Participants <span class="count-pill">${grid.length}${event.capacity ? ` / ${event.capacity}` : ''}</span></h3>${gridList}${waitingList}</section>`;
}

// Race header: the categories of each round (no counters, the places gauge gives the entries).
export function soloCategoriesSummary(event) {
  const rounds = event.rounds || [];
  if (rounds.length < 2) return `<div class="event-header-stats event-category-badges">${event.categories.map(category => badge(category)).join('')}</div>`;
  return `<div class="event-header-stats solo-round-badges">${rounds.map((round, index) => `<span class="solo-round-badge-group"><em>Manche ${index + 1}</em>${(round.categories?.length ? round.categories : event.categories).map(category => badge(category)).join('')}</span>`).join('')}</div>`;
}
