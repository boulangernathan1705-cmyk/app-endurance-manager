import {categories} from '../shared/catalog.mjs';
import {renderAvailabilityTimeline} from './timeline.mjs';

const app = document.getElementById('app');
const categoryOrder = new Map(['Hypercar','LMP2','LMP3','GTE','GT3'].map((name,index)=>[name,index]));
const dateFormat = new Intl.DateTimeFormat('fr-FR', {timeZone:'Europe/Paris', weekday:'long', day:'numeric', month:'long', year:'numeric'});
let eventsPromise = null;
let wasOnEntriesPage = false;
let queued = false;

const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

function loadEvents() {
  if (!eventsPromise) {
    eventsPromise = fetch('/api/events', {credentials:'same-origin', cache:'no-store'})
      .then(response => {
        if (!response.ok) throw new Error('Impossible de charger les événements.');
        return response.json();
      })
      .then(result => Array.isArray(result.events) ? result.events : [])
      .catch(error => {
        eventsPromise = null;
        throw error;
      });
  }
  return eventsPromise;
}

function logo(category) {
  const config = categories[category];
  return config?.image
    ? `<img class="category-logo" src="/images/${esc(config.image)}" alt="">`
    : `<span class="category-text-logo" aria-hidden="true">${esc(category)}</span>`;
}

function registrationCarLabel(registration) {
  if (registration?.carAny) return 'N’importe quelle voiture';
  if (registration?.cars?.length) return registration.cars.join(' · ');
  return registration?.car || 'Pas de préférence';
}

function accordionSummary(title, count) {
  return `<summary class="ux-my-entry-accordion-summary"><span>${esc(title)}</span><strong>${count}</strong><span class="ux-my-entry-chevron" aria-hidden="true">›</span></summary>`;
}

function pilotGridClass(count) {
  return `ux-my-pilot-grid ux-my-pilot-grid-${Math.max(1,Math.min(3,count || 1))}`;
}

function pilotCard(event, departure, registration, own = false) {
  const preference = registration.preferredPilot
    ? `<span class="pilot-preference">Souhaite rouler avec : <strong>${esc(registration.preferredPilot)}</strong></span>`
    : '';
  return `<article class="pilot-row ux-my-entry-pilot-card${own ? ' is-own-pilot' : ''}">
    <div class="pilot-main">
      <span class="pilot-name">${esc(registration.name)}</span>
      <span class="pilot-category-logo">${logo(registration.category)}</span>
      <span class="pilot-car">${esc(registrationCarLabel(registration))}</span>
      ${preference}
    </div>
    ${renderAvailabilityTimeline({departure,duration:event.durationHours || 6,status:registration.status,label:`Disponibilités de ${registration.name}`})}
  </article>`;
}

function crewSort(a,b) {
  const categoryDelta = (categoryOrder.get(a.category) ?? 99) - (categoryOrder.get(b.category) ?? 99);
  if (categoryDelta) return categoryDelta;
  return String(a.name || '').localeCompare(String(b.name || ''), 'fr', {sensitivity:'base'});
}

function compactCrew(departure, crew) {
  const names = (crew.registrationIds || [])
    .map(id => departure.availability.find(registration => registration.id === id)?.name)
    .filter(Boolean);
  return `<article class="ux-my-other-crew ${categories[crew.category]?.css || ''}">
    <div class="ux-my-other-crew-main">${logo(crew.category)}<div><strong>${esc(crew.name)}</strong><span>${esc(crew.car || 'Voiture à définir')}</span></div></div>
    <small>${names.length ? esc(names.join(' · ')) : 'Aucun pilote affecté'}</small>
  </article>`;
}

function ownCrewBody(event, departure, registration, crew) {
  const otherCrews = (departure.crews || []).filter(item => item.id !== crew?.id).sort(crewSort);
  let main;

  if (crew) {
    const members = (crew.registrationIds || [])
      .map(id => departure.availability.find(item => item.id === id))
      .filter(Boolean);
    main = `<article class="ux-my-own-crew ${categories[crew.category]?.css || ''}">
      <header class="ux-my-own-crew-head">
        <div class="ux-my-own-crew-identity">${logo(crew.category)}<div><strong>${esc(crew.name)}</strong><span>${esc(crew.car || 'Voiture à définir')}</span></div></div>
        <span class="ux-my-crew-state">${crew.locked ? 'Équipage complet' : 'Équipage ouvert'}</span>
      </header>
      <div class="${pilotGridClass(members.length)}">${members.map(member => pilotCard(event,departure,member,member.id === registration.id)).join('') || '<p class="empty">Aucun pilote affecté.</p>'}</div>
    </article>`;
  } else {
    main = `<article class="ux-my-awaiting-crew">
      <div class="ux-my-awaiting-copy"><strong>En attente d’affectation</strong><span>Ton inscription n’est pas encore rattachée à un équipage.</span></div>
      <div class="${pilotGridClass(1)}">${pilotCard(event,departure,registration,true)}</div>
    </article>`;
  }

  const others = `<section class="ux-my-other-crews"><div class="ux-my-other-crews-heading"><strong>Autres équipages</strong><span>${otherCrews.length}</span></div>${otherCrews.length ? `<div class="ux-my-other-crews-grid">${otherCrews.map(item => compactCrew(departure,item)).join('')}</div>` : '<p class="muted">Aucun autre équipage sur ce départ.</p>'}</section>`;
  return main + others;
}

function unassignedPilotsBody(event, departure, ownRegistrationId) {
  const assigned = new Set((departure.crews || []).flatMap(crew => crew.registrationIds || []));
  const pilots = (departure.availability || [])
    .filter(registration => registration.status !== 'unavailable' && !assigned.has(registration.id))
    .sort((a,b) => {
      const categoryDelta = (categoryOrder.get(a.category) ?? 99) - (categoryOrder.get(b.category) ?? 99);
      if (categoryDelta) return categoryDelta;
      return String(a.name || '').localeCompare(String(b.name || ''), 'fr', {sensitivity:'base'});
    });
  return {
    count: pilots.length,
    html: pilots.length
      ? `<div class="${pilotGridClass(pilots.length)}">${pilots.map(registration => pilotCard(event,departure,registration,registration.id === ownRegistrationId)).join('')}</div>`
      : '<p class="empty">Tous les pilotes disponibles sont déjà affectés à un équipage.</p>'
  };
}

function formatDate(departure) {
  try { return dateFormat.format(new Date(departure.startsAt)); }
  catch { return departure.date || ''; }
}

function decorateHeader(card, event, departure, registration, managed) {
  const header = card.querySelector(':scope > .my-entry-header');
  const title = header?.querySelector('.my-entry-title');
  if (!header || !title) return;

  const oldMeta = title.querySelector('.my-entry-meta');
  const typeBadge = oldMeta?.querySelector('.event-type-badge')?.outerHTML || '';
  const categoryBadge = oldMeta?.querySelector('.event-category-badge')?.outerHTML || '';
  const metaTexts = [...oldMeta?.querySelectorAll(':scope > span:not(.event-type-badge):not(.event-category-badge)') || []]
    .map(node => node.textContent.trim())
    .filter(Boolean);
  const circuitText = metaTexts.find(text => !/^·?\s*\d+\s*h$/i.test(text) && !/^·/.test(text)) || '';

  title.innerHTML = `${managed ? `<strong class="ux-managed-entry-name">${esc(registration.name)}</strong>` : ''}
    <span class="ux-my-entry-departure">Départ ${esc(departure.time || '')}</span>
    <h2>${esc(event.name)}</h2>
    <span class="ux-my-entry-date">${esc(formatDate(departure))}</span>
    <div class="my-entry-meta">${typeBadge}${categoryBadge}${circuitText ? `<span>${esc(circuitText)}</span>` : ''}<span>${event.durationHours || 6} h</span></div>`;
  card.classList.toggle('ux-managed-entry', managed);
}

function decorateCard(card, events) {
  const openButton = card.querySelector('[data-action="open"][data-id][data-departure][data-registration]');
  if (!openButton) return;
  const event = events.find(item => item.id === openButton.dataset.id);
  const departure = event?.departures?.find(item => item.id === openButton.dataset.departure);
  const registration = departure?.availability?.find(item => item.id === openButton.dataset.registration);
  if (!event || !departure || !registration) return;

  const managed = /Inscriptions que je gère/i.test(card.closest('.my-entries-group')?.querySelector('.my-entries-group-heading h2')?.textContent || '');
  const crew = (departure.crews || []).find(item => (item.registrationIds || []).includes(registration.id));
  const unassigned = unassignedPilotsBody(event,departure,registration.id);
  const signature = JSON.stringify([
    event.version,event.durationHours,departure.version,registration.id,registration.version,managed,
    (departure.crews || []).map(item => [item.id,item.version,item.locked,item.name,item.category,item.car,item.registrationIds]),
    (departure.availability || []).map(item => [item.id,item.version,item.status,item.name,item.category,item.carAny,item.cars,item.preferredPilot])
  ]);
  if (card.dataset.uxMyEntriesSignature === signature) return;

  decorateHeader(card,event,departure,registration,managed);
  const body = card.querySelector(':scope > .my-entry-accordion-body');
  if (!body) return;
  const actions = body.querySelector('.my-entry-actions-top');

  const crewDetails = document.createElement('details');
  crewDetails.className = 'ux-my-entry-content-accordion ux-my-entry-crew-accordion';
  const crewMemberCount = crew?.registrationIds?.length || 0;
  crewDetails.innerHTML = `${accordionSummary('Mon équipage', crewMemberCount)}<div class="ux-my-entry-content-body">${ownCrewBody(event,departure,registration,crew)}</div>`;

  const pilotsDetails = document.createElement('details');
  pilotsDetails.className = 'ux-my-entry-content-accordion ux-my-entry-pilots-accordion';
  pilotsDetails.innerHTML = `${accordionSummary('Pilotes sans équipage', unassigned.count)}<div class="ux-my-entry-content-body">${unassigned.html}</div>`;

  body.replaceChildren();
  if (actions) body.append(actions);
  body.append(crewDetails,pilotsDetails);
  card.dataset.uxMyEntriesSignature = signature;
}

async function decorate() {
  const cards = [...app?.querySelectorAll('.my-entry-card') || []];
  const onEntriesPage = cards.length > 0;
  if (!onEntriesPage) {
    if (wasOnEntriesPage) eventsPromise = null;
    wasOnEntriesPage = false;
    return;
  }
  wasOnEntriesPage = true;
  const events = await loadEvents().catch(() => []);
  if (!app?.querySelector('.my-entry-card')) return;
  cards.forEach(card => decorateCard(card,events));
}

function scheduleDecorate() {
  if (queued) return;
  queued = true;
  queueMicrotask(async () => {
    queued = false;
    await decorate();
  });
}

if (app) {
  scheduleDecorate();
  new MutationObserver(scheduleDecorate).observe(app,{childList:true,subtree:true});
}
