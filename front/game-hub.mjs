import {GAME_CATALOGS, gameForEvent} from '../shared/catalog.mjs';

const grid = document.getElementById('game-grid');
const formatter = new Intl.DateTimeFormat('fr-FR', {
  timeZone:'Europe/Paris',
  weekday:'short',
  day:'numeric',
  month:'short',
  year:'numeric'
});

const CREW_COLORS = ['#52d3d8','#f3b33d','#ec5b67','#75d66b','#8b7cf6','#e47adf','#58a6ff','#f28f45'];
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

function displayTime(value) {
  const match = String(value || '').match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return String(value || '').trim();
  return match[2] === '00' ? `${Number(match[1])}h` : `${Number(match[1])}h${match[2]}`;
}

function hasRegisteredPilot(departure) {
  return (departure?.availability || []).some(registration => registration.status !== 'unavailable');
}

function selectedDeparture(event, timestamp=Date.now()) {
  const duration = (Number(event.durationHours) || 6) * 3600000;
  const departures = [...(event.departures || [])]
    .filter(item => Number.isFinite(Number(item.startsAt)) && hasRegisteredPilot(item))
    .sort((a,b) => Number(a.startsAt) - Number(b.startsAt));
  return departures.find(item => Number(item.startsAt) <= timestamp && Number(item.startsAt) + duration > timestamp)
    || departures.find(item => Number(item.startsAt) > timestamp)
    || null;
}

function nextEndurance(events, game, timestamp=Date.now()) {
  const candidates = events
    .filter(event => gameForEvent(event) === game)
    .map(event => ({event,departure:selectedDeparture(event,timestamp)}))
    .filter(item => item.departure)
    .sort((a,b) => {
      const aRunning = Number(a.departure.startsAt) <= timestamp;
      const bRunning = Number(b.departure.startsAt) <= timestamp;
      if (aRunning !== bRunning) return aRunning ? -1 : 1;
      return Number(a.departure.startsAt) - Number(b.departure.startsAt);
    });
  return candidates[0] || null;
}

function crewMarkup(crew, departure, index=0) {
  const pilots = (crew.registrationIds || [])
    .map(id => (departure.availability || []).find(registration => registration.id === id)?.name)
    .filter(Boolean);
  const color = CREW_COLORS[index % CREW_COLORS.length];
  const teamMark = `<span class="hub-crew-status" aria-hidden="true" style="display:grid;place-items:center;width:24px;height:24px;border:1px solid ${color};border-radius:7px;color:${color}"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="${color}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="7" r="2.2"/><circle cx="6.8" cy="10" r="1.7"/><circle cx="17.2" cy="10" r="1.7"/><path d="M8.5 17.2c.4-2.7 1.6-4.2 3.5-4.2s3.1 1.5 3.5 4.2"/><path d="M3.8 17c.3-2.2 1.3-3.4 3-3.4.7 0 1.3.2 1.8.6"/><path d="M20.2 17c-.3-2.2-1.3-3.4-3-3.4-.7 0-1.3.2-1.8.6"/></svg></span>`;
  return `<li class="hub-crew ${crew.locked ? 'is-complete' : 'is-open'}">
    ${teamMark}
    <span class="hub-crew-main"><strong style="color:${color}">${esc(crew.name)}</strong><small>${esc(crew.category)}${crew.car ? ` · ${esc(crew.car)}` : ''}</small></span>
    <span class="hub-crew-pilots">${pilots.length ? esc(pilots.join(' · ')) : 'Aucun pilote affecté'}</span>
  </li>`;
}

function enduranceMarkup(item, game) {
  if (!item) return `<div class="hub-empty"><strong>Aucune endurance avec pilote inscrit</strong><span>Le prochain départ apparaîtra ici dès qu’un pilote sera inscrit.</span></div>`;
  const {event,departure} = item;
  const catalog = GAME_CATALOGS[game];
  const circuit = catalog.circuits.find(item => item.id === event.circuit)?.name || 'Circuit à préciser';
  const crews = departure.crews || [];
  const running = Number(departure.startsAt) <= Date.now();
  return `<section class="hub-next-race" aria-label="Prochaine endurance ${esc(catalog.name)}">
    <span class="hub-next-label">${running ? 'COURSE EN COURS' : 'PROCHAINE ENDURANCE'}</span>
    <h3>${esc(event.name)}</h3>
    <p class="hub-race-meta"><strong>${esc(formatter.format(new Date(Number(departure.startsAt))))} · ${esc(displayTime(departure.time))}</strong><span>${esc(circuit)} · ${Number(event.durationHours) || 6} h</span></p>
    <div class="hub-crews-heading"><strong>${crews.length} équipage${crews.length > 1 ? 's' : ''}</strong><span>${crews.length ? 'engagé'+(crews.length > 1 ? 's' : '') : 'formé'}</span></div>
    ${crews.length ? `<ul class="hub-crews">${crews.map((crew,index) => crewMarkup(crew,departure,index)).join('')}</ul>` : '<p class="hub-no-crews">Des pilotes sont inscrits, mais aucun équipage n’est encore formé pour ce départ.</p>'}
  </section>`;
}

function gameCard(game, events) {
  const catalog = GAME_CATALOGS[game];
  const href = game === 'lmu' ? '/lmu/' : '/iracing/';
  const badge = game === 'lmu' ? 'LMU' : 'iR';
  return `<article class="game-hub-card game-${game}">
    <div class="game-hub-heading"><div class="game-title-line"><span class="game-badge" aria-hidden="true">${badge}</span><h2>${esc(catalog.name)}</h2></div><p>${game === 'lmu' ? 'Hypercar, prototypes et GT de Le Mans Ultimate.' : 'GTP, LMP2, GT3, GT4 et TCR avec un catalogue de circuits étendu.'}</p></div>
    <a class="game-hub-enter" href="${href}">Accéder à ${esc(catalog.shortName)} <span aria-hidden="true">→</span></a>
    ${enduranceMarkup(nextEndurance(events,game),game)}
  </article>`;
}

async function load() {
  try {
    const response = await fetch('/api/events', {credentials:'same-origin',cache:'no-store'});
    if (!response.ok) throw new Error('events');
    const result = await response.json();
    const events = Array.isArray(result.events) ? result.events : [];
    grid.innerHTML = gameCard('lmu',events) + gameCard('iracing',events);
  } catch {
    grid.innerHTML = gameCard('lmu',[]) + gameCard('iracing',[]);
    const notice = document.getElementById('hub-status');
    if (notice) notice.textContent = 'Le récapitulatif des prochaines endurances est momentanément indisponible. Les espaces restent accessibles.';
  }
}

void load();
