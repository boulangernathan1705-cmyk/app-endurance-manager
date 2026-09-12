import {GAME_CATALOGS, gameForEvent} from '../shared/catalog.mjs';

const grid = document.getElementById('game-grid');
const formatter = new Intl.DateTimeFormat('fr-FR', {
  timeZone:'Europe/Paris',
  weekday:'short',
  day:'numeric',
  month:'short',
  year:'numeric'
});

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

function categoryLogo(catalog, category) {
  const item = catalog.categories?.[category];
  if (!item?.image) return `<span class="hub-category-text-logo" aria-hidden="true">${esc(category)}</span>`;
  return `<img class="hub-category-logo" src="/images/${esc(item.image)}" alt="">`;
}

function departureCategoryMarkup(departure, catalog) {
  const categories = [...new Set((departure.availability || []).filter(registration => registration.status !== 'unavailable').map(registration => registration.category).filter(Boolean))];
  return categories.map(category => {
    const registrations = (departure.availability || []).filter(registration => registration.status !== 'unavailable' && registration.category === category);
    const crews = (departure.crews || []).filter(crew => {
      const registrationIds = new Set(crew.registrationIds || []);
      return (crew.category === category || registrations.some(registration => registrationIds.has(registration.id))) && registrations.some(registration => registrationIds.has(registration.id));
    });
    return `<div class="hub-category-card ${esc(catalog.categories?.[category]?.css || '')}">
      ${categoryLogo(catalog, category)}
      <div class="hub-category-copy">
        <div class="hub-category-heading"><strong>${esc(category)}</strong><small>${registrations.length} inscrit${registrations.length > 1 ? 's' : ''}</small></div>
        ${crews.length ? `<div class="hub-category-crews">${crews.map(crew => `<span>${esc(crew.name || 'Équipage')}</span>`).join('')}</div>` : '<div class="hub-category-crews hub-category-crews-empty"><span>Aucun équipage formé</span></div>'}
      </div>
    </div>`;
  }).join('');
}

function enduranceMarkup(item, game) {
  if (!item) return `<div class="hub-empty"><strong>Aucune endurance avec pilote inscrit</strong><span>Le prochain départ apparaîtra ici dès qu’un pilote sera inscrit.</span></div>`;
  const {event,departure} = item;
  const catalog = GAME_CATALOGS[game];
  const circuit = catalog.circuits.find(item => item.id === event.circuit)?.name || 'Circuit à préciser';
  const running = Number(departure.startsAt) <= Date.now();
  return `<section class="hub-next-race" aria-label="Prochaine endurance ${esc(catalog.name)}">
    <span class="hub-next-label">${running ? 'COURSE EN COURS' : 'PROCHAINE ENDURANCE'}</span>
    <h3>${esc(event.name)}</h3>
    <p class="hub-race-meta"><strong>${esc(formatter.format(new Date(Number(departure.startsAt))))} · ${esc(displayTime(departure.time))}</strong><span>${esc(circuit)} · ${Number(event.durationHours) || 6} h</span></p>
    <div class="hub-category-grid">${departureCategoryMarkup(departure,catalog)}</div>
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
