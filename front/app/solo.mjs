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
// The simulator, then OPEN or SAFE.
export function accessBadge(event) {
  const safe = event.access === 'safe';
  return `<span class="event-badge-row">${simBadge(event)}<span class="event-access-badge ${safe ? 'is-safe' : 'is-open'}" title="${safe ? 'Réservé aux pilotes SAFE' : 'Ouvert à tous les pilotes connectés'}">${safe ? 'SAFE' : 'OPEN'}</span></span>`;
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
  if (event.access === 'safe' && !can('solo_safe')) return 'Événement réservé aux pilotes SAFE.';
  if (!can('solo_safe') && !can('solo_open')) return 'Tu n’as pas accès aux événements de cette communauté.';
  return '';
}

export function myWaitlistPosition(departure) {
  return (departure.availability || []).find(reg => reg.mine && reg.waitlistPosition)?.waitlistPosition || null;
}

// Category and car of each round (two-round races), or of the race.
function choicesCell(event, reg) {
  if (!reg.category && !reg.roundChoices?.length) return '';
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

export const WEATHERS = [['random','❓','Aléatoire'],['sun','☀️','Soleil'],['cloud','⛅','Nuageux'],['overcast','☁️','Couvert'],['rain','🌧️','Pluie']];
// « P5/Q10/C40 »: the session lengths of a round.
export function roundFormat(round) {
  return [round.practice ? `P${round.practice}` : '', round.qualifying ? `Q${round.qualifying}` : '', `C${round.durationMinutes}`].filter(Boolean).join('/');
}
export function roundExtras(round) {
  const weather = WEATHERS.find(([value]) => value === round.weather)?.[1];
  return [weather, round.fuel != null ? `carburant ×${round.fuel}` : '', round.tyres != null ? `usure pneus ×${round.tyres}` : ''].filter(Boolean).join(' · ');
}
// What the community's calendar shows: the end of an open session, the server password, the note, and per
// round its circuit, categories, session lengths, weather and multipliers.
export function soloEventInfo(event, departure = event.departures?.[0]) {
  const details = event.details || {}, rounds = event.rounds || [];
  const rows = [];
  if (details.endTime && departure) rows.push(['Horaire', `${departure.time}-${details.endTime}`]);
  if (details.password) rows.push(['Mot de passe', details.password]);
  rounds.forEach((round, index) => rows.push([rounds.length > 1 ? `Manche ${index + 1}` : 'Manche', [eventCircuitName(event, round.circuit), (round.categories || []).join(' ') || round.category, round.car, roundFormat(round), roundExtras(round)].filter(Boolean).join(' · ')]));
  if (details.note) rows.push(['Info', details.note]);
  return `<dl class="solo-event-info">${rows.map(([label, value]) => `<div><dt>${esc(label)}</dt><dd>${esc(value)}</dd></div>`).join('')}</dl>`;
}
