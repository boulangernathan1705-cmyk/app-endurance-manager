import {categories, EVENT_TYPES, CIRCUITS} from '../shared/catalog.mjs';
import {renderAvailabilityTimeline} from './timeline.mjs';

const app = document.getElementById('app');
const categoryOrder = new Map([
  ['Hypercar',0],
  ['LMP2 ELMS',1],
  ['LMP2 WEC',1],
  ['LMP3',2],
  ['GTE',3],
  ['GT3',4]
]);
const dateFormat = new Intl.DateTimeFormat('fr-FR', {
  timeZone:'Europe/Paris',
  weekday:'long',
  day:'numeric',
  month:'long',
  year:'numeric'
});

const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
}[char]));

function logo(category) {
  const config = categories[category];
  return config?.image
    ? `<img class="category-logo" src="/images/${esc(config.image)}" alt="">`
    : `<span class="category-text-logo" aria-hidden="true">${esc(category)}</span>`;
}

function categoryBadge(category) {
  return `<span class="event-category-badge ${categories[category]?.css || ''}">${logo(category)}<span>${esc(category)}</span></span>`;
}

function eventTypeBadge(type) {
  const item = EVENT_TYPES[type] || EVENT_TYPES.private;
  return `<span class="event-type-badge ${item.css}">${esc(item.label)}</span>`;
}

function circuitLabel(id) {
  return CIRCUITS.find(circuit => circuit.id === id)?.name || 'Circuit à préciser';
}

function registrationCarLabel(registration) {
  if (registration?.carAny) return 'N’importe quelle voiture';
  if (registration?.cars?.length) return registration.cars.join(' · ');
  return registration?.car || 'Pas de préférence';
}

function entryDate(departure) {
  try { return dateFormat.format(new Date(departure.startsAt)); }
  catch { return departure.date || ''; }
}

function pilotSort(a,b) {
  const categoryDelta = (categoryOrder.get(a.category) ?? 99) - (categoryOrder.get(b.category) ?? 99);
  if (categoryDelta) return categoryDelta;
  return String(a.name || '').localeCompare(String(b.name || ''), 'fr', {sensitivity:'base'});
}

function crewSort(a,b) {
  const categoryDelta = (categoryOrder.get(a.category) ?? 99) - (categoryOrder.get(b.category) ?? 99);
  if (categoryDelta) return categoryDelta;
  return String(a.name || '').localeCompare(String(b.name || ''), 'fr', {sensitivity:'base'});
}

function pilotGridClass(count) {
  return `ux-my-pilot-grid ux-my-pilot-grid-${Math.max(1, Math.min(3, count || 1))}`;
}

function pilotCard(event, departure, registration, highlighted = false) {
  const preference = registration.preferredPilot
    ? `<span class="pilot-preference">Souhaite rouler avec : <strong>${esc(registration.preferredPilot)}</strong></span>`
    : '';
  return `<article class="pilot-row ux-my-entry-pilot-card${highlighted ? ' is-own-pilot' : ''}">
    <div class="pilot-main">
      <span class="pilot-name">${esc(registration.name)}</span>
      <span class="pilot-category-logo">${logo(registration.category)}</span>
      <span class="pilot-car">${esc(registrationCarLabel(registration))}</span>
      ${preference}
    </div>
    ${renderAvailabilityTimeline({
      departure,
      duration:event.durationHours || 6,
      status:registration.status,
      label:`Disponibilités de ${registration.name}`
    })}
  </article>`;
}

function accordionSummary(title, count) {
  return `<summary class="ux-my-entry-accordion-summary"><span>${esc(title)}</span><strong>${count}</strong><span class="ux-my-entry-chevron" aria-hidden="true">›</span></summary>`;
}

function compactCrew(departure, crew) {
  const names = (crew.registrationIds || [])
    .map(id => departure.availability.find(registration => String(registration.id) === String(id))?.name)
    .filter(Boolean);
  return `<article class="ux-my-other-crew ${categories[crew.category]?.css || ''}">
    <div class="ux-my-other-crew-main">${logo(crew.category)}<div><strong>${esc(crew.name)}</strong><span>${esc(crew.car || 'Voiture à définir')}</span></div></div>
    <small>${names.length ? esc(names.join(' · ')) : 'Aucun pilote affecté'}</small>
  </article>`;
}

function ownCrewContent(event, departure, registration, crew) {
  const otherCrews = (departure.crews || []).filter(item => item.id !== crew?.id).sort(crewSort);
  let primary;

  if (crew) {
    const members = (crew.registrationIds || [])
      .map(id => departure.availability.find(item => String(item.id) === String(id)))
      .filter(Boolean);
    primary = `<article class="ux-my-own-crew ${categories[crew.category]?.css || ''}">
      <header class="ux-my-own-crew-head">
        <div class="ux-my-own-crew-identity">${logo(crew.category)}<div><strong>${esc(crew.name)}</strong><span>${esc(crew.car || 'Voiture à définir')}</span></div></div>
        <span class="ux-my-crew-state">${crew.locked ? 'Équipage complet' : 'Équipage ouvert'}</span>
      </header>
      <div class="${pilotGridClass(members.length)}">${members.map(member => pilotCard(event, departure, member, String(member.id) === String(registration.id))).join('')}</div>
    </article>`;
  } else {
    primary = `<article class="ux-my-awaiting-crew">
      <div class="ux-my-awaiting-copy"><strong>En attente d’affectation</strong><span>Cette inscription n’est pas encore rattachée à un équipage.</span></div>
      <div class="${pilotGridClass(1)}">${pilotCard(event, departure, registration, true)}</div>
    </article>`;
  }

  const others = `<section class="ux-my-other-crews">
    <div class="ux-my-other-crews-heading"><strong>Autres équipages</strong><span>${otherCrews.length}</span></div>
    ${otherCrews.length
      ? `<div class="ux-my-other-crews-grid">${otherCrews.map(item => compactCrew(departure, item)).join('')}</div>`
      : '<p class="muted">Aucun autre équipage sur ce départ.</p>'}
  </section>`;
  return primary + others;
}

function unassignedPilots(event, departure, highlightedRegistrationId) {
  const assigned = new Set((departure.crews || []).flatMap(crew => (crew.registrationIds || []).map(String)));
  const pilots = (departure.availability || [])
    .filter(registration => registration.status !== 'unavailable' && !assigned.has(String(registration.id)))
    .sort(pilotSort);
  return {
    count: pilots.length,
    html: pilots.length
      ? `<div class="${pilotGridClass(pilots.length)}">${pilots.map(registration => pilotCard(event, departure, registration, String(registration.id) === String(highlightedRegistrationId))).join('')}</div>`
      : '<p class="empty">Tous les pilotes disponibles sont déjà affectés à un équipage.</p>'
  };
}

function entryCard({event, departure, registration, managed}) {
  const crew = (departure.crews || []).find(item => (item.registrationIds || []).map(String).includes(String(registration.id)));
  const unassigned = unassignedPilots(event, departure, registration.id);
  const memberCount = crew?.registrationIds?.length || 0;

  return `<details class="native-my-entry-card event-type-${event.eventType || 'private'}">
    <summary class="native-my-entry-header">
      <span class="native-my-entry-toggle" aria-hidden="true">+</span>
      <div class="native-my-entry-title">
        ${managed ? `<strong class="ux-managed-entry-name">${esc(registration.name)}</strong>` : ''}
        <span class="ux-my-entry-departure">Départ ${esc(departure.time || '')}</span>
        <h2>${esc(event.name)}</h2>
        <span class="ux-my-entry-date">${esc(entryDate(departure))}</span>
        <div class="native-my-entry-meta">${eventTypeBadge(event.eventType)}${categoryBadge(registration.category)}<span>${esc(circuitLabel(event.circuit))}</span><span>${event.durationHours || 6} h</span></div>
      </div>
    </summary>
    <div class="native-my-entry-body">
      <div class="native-my-entry-actions"><button type="button" class="primary-button" data-action="open" data-id="${esc(event.id)}" data-departure="${esc(departure.id)}" data-registration="${esc(registration.id)}">Voir l’événement complet</button></div>
      <details class="ux-my-entry-content-accordion">
        ${accordionSummary('Mon équipage', memberCount)}
        <div class="ux-my-entry-content-body">${ownCrewContent(event, departure, registration, crew)}</div>
      </details>
      <details class="ux-my-entry-content-accordion">
        ${accordionSummary('Pilotes sans équipage', unassigned.count)}
        <div class="ux-my-entry-content-body">${unassigned.html}</div>
      </details>
    </div>
  </details>`;
}

function section(title, entries) {
  return `<section class="native-my-entries-group">
    <div class="native-my-entries-group-heading"><h2>${esc(title)}</h2><span>${entries.length} inscription${entries.length > 1 ? 's' : ''}</span></div>
    ${entries.length ? `<div class="native-my-entry-list">${entries.map(entryCard).join('')}</div>` : '<p class="empty">Aucune inscription.</p>'}
  </section>`;
}

async function renderNativeMyEntries() {
  if (!app) return;
  app.innerHTML = '<div class="native-my-entries-loading" role="status">Chargement de tes inscriptions…</div>';
  try {
    const response = await fetch('/api/events', {credentials:'same-origin', cache:'no-store'});
    if (!response.ok) throw new Error('Impossible de charger les inscriptions.');
    const result = await response.json();
    const events = Array.isArray(result.events) ? result.events : [];
    const entries = events.flatMap(event => (event.departures || []).flatMap(departure => (departure.availability || [])
      .filter(registration => registration.mine || registration.managed)
      .map(registration => ({event, departure, registration, managed:!!registration.managed}))));
    const personal = entries.filter(entry => entry.registration.mine);
    const managed = entries.filter(entry => entry.registration.managed);

    app.innerHTML = `<div class="native-my-entries-heading"><span class="creation-kicker">ESPACE PILOTE</span><h1 class="page-title">MES INSCRIPTIONS</h1><p>Retrouve ici tes courses, ton équipage et les pilotes inscrits sur le même départ.</p></div>
      ${section('Mes inscriptions personnelles', personal)}
      ${managed.length ? section('Inscriptions que je gère', managed) : ''}`;
  } catch (error) {
    app.innerHTML = `<h1 class="page-title">MES INSCRIPTIONS</h1><p class="creation-error" role="alert">${esc(error.message || 'Impossible de charger les inscriptions.')}</p>`;
  }
}

document.addEventListener('click', event => {
  const trigger = event.target.closest?.('[data-action="my-entries"]');
  if (!trigger) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  void renderNativeMyEntries();
}, true);
