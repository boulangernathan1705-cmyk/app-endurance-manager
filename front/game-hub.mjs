import {GAME_CATALOGS, gameForEvent} from '../shared/catalog.mjs';
import {eventSchedule} from './schedule.mjs';

const grid = document.getElementById('game-grid');
const formatter = new Intl.DateTimeFormat('fr-FR', {
  timeZone:'Europe/Paris',
  weekday:'short',
  day:'numeric',
  month:'short',
  year:'numeric'
});

const CREW_COLORS = ['#52d3d8','#f3b33d','#ec5b67','#75d66b','#8b7cf6','#e47adf','#58a6ff','#f28f45'];
const MAX_HOME_ITEMS = 3;
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

function displayTime(value) {
  const match = String(value || '').match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return String(value || '').trim();
  return match[2] === '00' ? `${Number(match[1])}h` : `${Number(match[1])}h${match[2]}`;
}

function activeRegistrations(departure) {
  return (departure?.availability || []).filter(registration => registration.status !== 'unavailable');
}

function activePilotCount(departure) {
  return new Set(activeRegistrations(departure).map(registration => registration.participantId || registration.id)).size;
}

function hasVisibleActivity(departure) {
  return activeRegistrations(departure).length > 0 || (departure?.crews || []).length > 0;
}

function hasCrew(departure) {
  return (departure?.crews || []).length > 0;
}

function eventBounds(event) {
  const duration = (Number(event.durationHours) || 6) * 3600000;
  const starts = (event.departures || [])
    .map(item => Number(item.startsAt))
    .filter(Number.isFinite)
    .sort((a,b) => a-b);
  if (!starts.length) return null;
  return {start:starts[0],end:starts[starts.length-1]+duration,duration};
}

function remainingDepartures(event, timestamp=Date.now()) {
  const bounds = eventBounds(event);
  if (!bounds) return [];
  return [...(event.departures || [])]
    .filter(item => Number.isFinite(Number(item.startsAt)) && Number(item.startsAt) + bounds.duration > timestamp)
    .sort((a,b) => Number(a.startsAt) - Number(b.startsAt));
}

function orderedEvents(events, game, timestamp=Date.now()) {
  return events
    .filter(event => gameForEvent(event) === game)
    .map(event => ({event,schedule:eventSchedule(event,timestamp),bounds:eventBounds(event)}))
    .filter(item => item.bounds && !item.schedule.archived && item.schedule.timestamp !== null)
    .sort((a,b) => Number(!!b.schedule.running)-Number(!!a.schedule.running)
      || (a.schedule.timestamp ?? Infinity)-(b.schedule.timestamp ?? Infinity)
      || a.event.name.localeCompare(b.event.name,'fr'));
}

function homeQueue(events, game, timestamp=Date.now()) {
  const queue=[];
  for (const item of orderedEvents(events,game,timestamp)) {
    const remaining=remainingDepartures(item.event,timestamp);
    if (!remaining.length) continue;
    const active=remaining.filter(hasVisibleActivity);

    // An event with nobody registered must still remain visible until it is over.
    if (!active.length) {
      queue.push({...item,departure:remaining[0]});
      break;
    }

    for (const departure of active) {
      queue.push({...item,departure});
      if (hasCrew(departure) || queue.length >= MAX_HOME_ITEMS) return queue;
    }

    if (queue.length >= MAX_HOME_ITEMS) return queue;
  }
  return queue.slice(0,MAX_HOME_ITEMS);
}

function crewIcon(color) {
  return `<span class="crew-summary-icon" aria-hidden="true" style="--crew-color:${color}"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="7" r="2.2"/><circle cx="6.8" cy="10" r="1.7"/><circle cx="17.2" cy="10" r="1.7"/><path d="M8.5 17.2c.4-2.7 1.6-4.2 3.5-4.2s3.1 1.5 3.5 4.2"/><path d="M3.8 17c.3-2.2 1.3-3.4 3-3.4.7 0 1.3.2 1.8.6"/><path d="M20.2 17c-.3-2.2-1.3-3.4-3-3.4-.7 0-1.3.2-1.8.6"/></svg></span>`;
}

function crewMarkup(crew, departure, index=0) {
  const pilots = (crew.registrationIds || [])
    .map(id => (departure.availability || []).find(registration => registration.id === id)?.name)
    .filter(Boolean);
  const color = CREW_COLORS[index % CREW_COLORS.length];
  return `<span class="crew-summary-card ${crew.locked ? 'is-complete' : 'is-open'}">
    ${crewIcon(color)}
    <span class="crew-summary-main"><span class="crew-summary-title"><strong style="color:${color}">${esc(crew.name || 'Équipage')}</strong></span><small>${esc(crew.category || '')}${crew.car ? ` · ${esc(crew.car)}` : ''}</small></span>
    <span class="crew-summary-pilots">${pilots.length ? esc(pilots.join(' · ')) : 'Aucun pilote affecté'}</span>
  </span>`;
}

function participationMarkup(departure) {
  const crews = [...(departure.crews || [])];
  const pilotCount = activePilotCount(departure);
  if (crews.length) {
    return `<span class="crew-summary-heading"><strong>${crews.length} équipage${crews.length > 1 ? 's' : ''} engagé${crews.length > 1 ? 's' : ''}</strong><span>${pilotCount ? `${pilotCount} pilote${pilotCount > 1 ? 's' : ''} inscrit${pilotCount > 1 ? 's' : ''}` : 'Aucun pilote inscrit'}</span></span>
      <span class="crew-summary-list">${crews.map((crew,index) => crewMarkup(crew,departure,index)).join('')}</span>`;
  }
  if (pilotCount) {
    return `<span class="crew-summary-heading"><strong>${pilotCount} pilote${pilotCount > 1 ? 's' : ''} inscrit${pilotCount > 1 ? 's' : ''}</strong><span>Aucun équipage formé</span></span>`;
  }
  return '<span class="crew-summary-heading"><strong>Aucun participant</strong><span>Aucune inscription pour ce départ</span></span>';
}

function enduranceMarkup(item, game) {
  const {event,departure,bounds,schedule} = item;
  const catalog = GAME_CATALOGS[game];
  const circuit = catalog.circuits.find(item => item.id === event.circuit)?.name || 'Circuit à préciser';
  const departureRunning = Number(departure.startsAt) <= Date.now() && Number(departure.startsAt) + bounds.duration > Date.now();
  const eventStarted = schedule?.event?.departures?.some(item => Number(item.startsAt) <= Date.now()) || bounds.start <= Date.now();
  const label = departureRunning ? 'COURSE EN COURS' : eventStarted ? 'PROCHAIN DÉPART' : 'PROCHAINE ENDURANCE';
  return `<section class="hub-next-race" aria-label="${esc(event.name)} · départ ${esc(displayTime(departure.time))}">
    <span class="hub-next-label">${label}</span>
    <h3>${esc(event.name)}</h3>
    <p class="hub-race-meta"><strong>${esc(formatter.format(new Date(Number(departure.startsAt))))} · ${esc(displayTime(departure.time))}</strong><span>${esc(circuit)} · ${Number(event.durationHours) || 6} h</span></p>
    ${participationMarkup(departure)}
  </section>`;
}

function enduranceQueueMarkup(items, game) {
  if (!items.length) return `<div class="hub-empty"><strong>Aucune endurance à venir</strong><span>Le prochain événement apparaîtra ici dès qu’il sera créé.</span></div>`;
  return `<div class="hub-race-queue">${items.map(item=>enduranceMarkup(item,game)).join('')}</div>`;
}

function gameCard(game, events) {
  const catalog = GAME_CATALOGS[game];
  const href = game === 'lmu' ? '/lmu/' : '/iracing/';
  const badge = game === 'lmu' ? 'LMU' : 'iR';
  return `<article class="game-hub-card game-${game}">
    <div class="game-hub-heading"><div class="game-title-line"><span class="game-badge" aria-hidden="true">${badge}</span><h2>${esc(catalog.name)}</h2></div><p>${game === 'lmu' ? 'Hypercar, prototypes et GT de Le Mans Ultimate.' : 'GTP, LMP2, GT3, GT4 et TCR avec un catalogue de circuits étendu.'}</p></div>
    <a class="game-hub-enter" href="${href}">Accéder à ${esc(catalog.shortName)} <span aria-hidden="true">→</span></a>
    ${enduranceQueueMarkup(homeQueue(events,game),game)}
  </article>`;
}

async function fetchGameEvents(game) {
  const response = await fetch(`/api/events?game=${encodeURIComponent(game)}`, {credentials:'same-origin',cache:'no-store'});
  if (!response.ok) throw new Error(`events-${game}`);
  const result = await response.json();
  return Array.isArray(result.events) ? result.events : [];
}

async function load() {
  try {
    const [lmuEvents,iracingEvents] = await Promise.all([fetchGameEvents('lmu'),fetchGameEvents('iracing')]);
    grid.innerHTML = gameCard('lmu',lmuEvents) + gameCard('iracing',iracingEvents);
  } catch {
    grid.innerHTML = gameCard('lmu',[]) + gameCard('iracing',[]);
    const notice = document.getElementById('hub-status');
    if (notice) notice.textContent = 'Le récapitulatif des prochaines endurances est momentanément indisponible. Les espaces restent accessibles.';
  }
}

void load();
