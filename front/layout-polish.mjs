import {categories} from '../shared/catalog.mjs';
import {renderAvailabilityTimeline} from './timeline.mjs';

const app = document.getElementById('app');
const entryCategoryOrder = new Map(['Hypercar','LMP2','LMP3','GTE','GT3'].map((name,index)=>[name,index]));
const entryDateFormat = new Intl.DateTimeFormat('fr-FR', {timeZone:'Europe/Paris', weekday:'long', day:'numeric', month:'long', year:'numeric'});
let queued = false;
let entriesEventsPromise = null;

const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[char]));

function currentEvent() {
  const eventId = app?.querySelector('[data-event-id]')?.dataset.eventId;
  return app?.eventViewData?.events?.find(event => event.id === eventId) || null;
}

function departureIdFromFold(fold) {
  return fold?.id?.replace(/^crew-departure-/, '').replace(/^departure-/, '') || '';
}

function registrationCarLabel(registration) {
  if (registration?.carAny) return 'N’importe quelle voiture';
  if (registration?.cars?.length) return registration.cars.join(' · ');
  return registration?.car || 'Pas de préférence';
}

function logo(category) {
  const config = categories[category];
  return config?.image
    ? `<img class="category-logo" src="/images/${esc(config.image)}" alt="">`
    : `<span class="category-text-logo" aria-hidden="true">${esc(category)}</span>`;
}

function accordionSummary(title, count) {
  return `<summary class="ux-content-accordion-summary"><span class="ux-content-accordion-title">${esc(title)}</span><span class="ux-content-accordion-count">${count}</span><span class="ux-content-accordion-chevron" aria-hidden="true">›</span></summary>`;
}

function decorateEventHeaderCountdown() {
  const header = app?.querySelector('.event-header[data-event-id]');
  const timer = header?.querySelector('.event-header-countdown');
  const copy = header?.querySelector('.event-heading-copy');
  if (!timer || !copy) return;

  const subtitle = copy.querySelector('.event-subtitle');
  if (timer.parentElement !== copy) {
    if (subtitle) subtitle.insertAdjacentElement('afterend', timer);
    else copy.append(timer);
  }

  const value = timer.querySelector('[data-countdown]');
  if (value && timer.dataset.uxHeaderCountdown !== 'true') {
    timer.dataset.uxHeaderCountdown = 'true';
    timer.replaceChildren(document.createTextNode('Prochain départ dans '), value);
  }
}

function decorateDepartureHeaders() {
  app?.querySelectorAll('.departure-fold[id]').forEach(fold => {
    const summary = fold.querySelector(':scope > summary');
    const dateBlock = summary?.querySelector(':scope > .fold-date');
    if (!summary || !dateBlock || dateBlock.dataset.uxCompactDeparture === 'true') return;

    const dateText = dateBlock.querySelector('strong')?.textContent.trim() || '';
    const rawTime = dateBlock.querySelector('span')?.textContent.trim() || '';
    const timeText = rawTime.split('·')[0].trim();
    const past = /départ passé/i.test(rawTime);

    dateBlock.dataset.uxCompactDeparture = 'true';
    dateBlock.innerHTML = `<strong class="ux-departure-title">Départ ${esc(timeText)}</strong><span class="ux-departure-date">${esc(dateText)}${past ? ' · Départ passé' : ''}</span>`;
    summary.classList.add('ux-compact-departure-summary');
  });
}

function decorateCoursePilotAccordions() {
  const event = currentEvent();
  if (!event) return;

  app.querySelectorAll('.departure-fold[id^="departure-"]').forEach(fold => {
    const departure = event.departures?.find(item => item.id === departureIdFromFold(fold));
    const pilotSection = fold.querySelector('.pilot-section');
    if (!departure || !pilotSection || pilotSection.dataset.uxSplitAccordions === 'true') return;

    const section = pilotSection.closest('.fold-section');
    const heading = section?.querySelector(':scope > h2');
    const overview = pilotSection.querySelector(':scope > .ux-course-overview');
    if (!section || !heading || heading.textContent.trim() !== 'Pilotes inscrits' || !overview) return;

    const unassignedSection = overview.querySelector(':scope > .ux-unassigned-section');
    const unavailableBucket = overview.querySelector(':scope > .ux-unavailable-bucket');
    const crewBuckets = [...overview.querySelectorAll(':scope > .ux-crew-bucket:not(.ux-unavailable-bucket)')];
    if (!unassignedSection) return;

    const pilotCount = unassignedSection.querySelectorAll('.pilot-row').length;
    const crewCount = (departure.crews || []).length;

    const pilotsAccordion = document.createElement('details');
    pilotsAccordion.className = 'ux-course-pilots-accordion';
    pilotsAccordion.innerHTML = accordionSummary('Pilotes inscrits', pilotCount);
    const pilotsBody = document.createElement('div');
    pilotsBody.className = 'ux-course-pilots-body';
    pilotsBody.append(unassignedSection);
    if (unavailableBucket) pilotsBody.append(unavailableBucket);
    pilotsAccordion.append(pilotsBody);

    const crewsAccordion = document.createElement('details');
    crewsAccordion.className = 'ux-course-crews-accordion';
    crewsAccordion.innerHTML = accordionSummary('Équipages', crewCount);
    const crewsBody = document.createElement('div');
    crewsBody.className = 'ux-course-crews-body';
    crewBuckets.forEach(bucket => crewsBody.append(bucket));
    crewsAccordion.append(crewsBody);

    heading.remove();
    section.classList.add('ux-course-split-section');
    overview.classList.add('ux-course-split-overview');
    overview.replaceChildren(pilotsAccordion, crewsAccordion);
    pilotSection.dataset.uxSplitAccordions = 'true';
  });
}

function remainingPilotCard(event, departure, registration) {
  const preference = registration.preferredPilot
    ? `<span class="pilot-preference">Souhaite rouler avec : <strong>${esc(registration.preferredPilot)}</strong></span>`
    : '';
  return `<article class="pilot-row ux-remaining-pilot-card">
    <div class="pilot-main">
      <span class="pilot-name">${esc(registration.name)}</span>
      <span class="pilot-category-logo">${logo(registration.category)}</span>
      <span class="pilot-car">${esc(registrationCarLabel(registration))}</span>
      ${preference}
    </div>
    ${renderAvailabilityTimeline({departure,duration:event.durationHours || 6,status:registration.status,label:`Disponibilités de ${registration.name}`})}
  </article>`;
}

function decorateRemainingPilots() {
  const event = currentEvent();
  if (!event) return;

  app.querySelectorAll('.crew-page-accordion .departure-fold[id^="crew-departure-"]').forEach(fold => {
    const departure = event.departures?.find(item => item.id === departureIdFromFold(fold));
    const crewSection = fold.querySelector('.crew-section');
    const legacy = crewSection?.querySelector(':scope > .unassigned-list');
    if (!departure || !crewSection || !legacy) return;

    legacy.classList.add('ux-legacy-unassigned-hidden');

    const assigned = new Set((departure.crews || []).flatMap(crew => crew.registrationIds || []));
    const remaining = (departure.availability || []).filter(registration => registration.status !== 'unavailable' && !assigned.has(registration.id));
    const signature = JSON.stringify(remaining.map(registration => [registration.id, registration.version, registration.status, registration.category, registration.preferredPilot, registration.carAny, registration.cars]));

    let section = crewSection.querySelector(':scope > .ux-remaining-pilots-section');
    if (!remaining.length) {
      section?.remove();
      return;
    }

    if (section && section.tagName !== 'DETAILS') {
      const replacement = document.createElement('details');
      replacement.className = section.className;
      section.replaceWith(replacement);
      section = replacement;
    }

    if (!section) {
      section = document.createElement('details');
      section.className = 'ux-remaining-pilots-section';
      crewSection.append(section);
    }

    if (section.dataset.signature === signature) return;
    const wasOpen = section.open;
    section.dataset.signature = signature;
    section.innerHTML = `${accordionSummary('Pilotes restants à affecter', remaining.length)}<div class="ux-remaining-pilot-grid">${remaining.map(registration => remainingPilotCard(event, departure, registration)).join('')}</div>`;
    section.open = wasOpen;
  });
}

function loadEntriesEvents() {
  if (!entriesEventsPromise) {
    entriesEventsPromise = fetch('/api/events', {credentials:'same-origin', cache:'no-store'})
      .then(response => response.ok ? response.json() : Promise.reject(new Error('events')))
      .then(result => Array.isArray(result.events) ? result.events : [])
      .catch(() => {
        entriesEventsPromise = null;
        return [];
      });
  }
  return entriesEventsPromise;
}

function entryAccordionSummary(title, count) {
  return `<summary class="ux-my-entry-accordion-summary"><span>${esc(title)}</span><strong>${count}</strong><span class="ux-my-entry-chevron" aria-hidden="true">›</span></summary>`;
}

function entryPilotGridClass(count) {
  return `ux-my-pilot-grid ux-my-pilot-grid-${Math.max(1,Math.min(3,count || 1))}`;
}

function entryPilotCard(event, departure, registration, own = false) {
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

function entryCrewSort(a,b) {
  const categoryDelta = (entryCategoryOrder.get(a.category) ?? 99) - (entryCategoryOrder.get(b.category) ?? 99);
  if (categoryDelta) return categoryDelta;
  return String(a.name || '').localeCompare(String(b.name || ''), 'fr', {sensitivity:'base'});
}

function entryCompactCrew(departure, crew) {
  const names = (crew.registrationIds || [])
    .map(id => departure.availability.find(registration => registration.id === id)?.name)
    .filter(Boolean);
  return `<article class="ux-my-other-crew ${categories[crew.category]?.css || ''}">
    <div class="ux-my-other-crew-main">${logo(crew.category)}<div><strong>${esc(crew.name)}</strong><span>${esc(crew.car || 'Voiture à définir')}</span></div></div>
    <small>${names.length ? esc(names.join(' · ')) : 'Aucun pilote affecté'}</small>
  </article>`;
}

function entryOwnCrewBody(event, departure, registration, crew) {
  const otherCrews = (departure.crews || []).filter(item => item.id !== crew?.id).sort(entryCrewSort);
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
      <div class="${entryPilotGridClass(members.length)}">${members.map(member => entryPilotCard(event,departure,member,member.id === registration.id)).join('') || '<p class="empty">Aucun pilote affecté.</p>'}</div>
    </article>`;
  } else {
    main = `<article class="ux-my-awaiting-crew"><div class="ux-my-awaiting-copy"><strong>En attente d’affectation</strong><span>Cette inscription n’est pas encore rattachée à un équipage.</span></div><div class="${entryPilotGridClass(1)}">${entryPilotCard(event,departure,registration,true)}</div></article>`;
  }

  const others = `<section class="ux-my-other-crews"><div class="ux-my-other-crews-heading"><strong>Autres équipages</strong><span>${otherCrews.length}</span></div>${otherCrews.length ? `<div class="ux-my-other-crews-grid">${otherCrews.map(item => entryCompactCrew(departure,item)).join('')}</div>` : '<p class="muted">Aucun autre équipage sur ce départ.</p>'}</section>`;
  return main + others;
}

function entryUnassignedPilots(event, departure, ownRegistrationId) {
  const assigned = new Set((departure.crews || []).flatMap(crew => crew.registrationIds || []));
  const pilots = (departure.availability || [])
    .filter(registration => registration.status !== 'unavailable' && !assigned.has(registration.id))
    .sort((a,b) => {
      const categoryDelta = (entryCategoryOrder.get(a.category) ?? 99) - (entryCategoryOrder.get(b.category) ?? 99);
      if (categoryDelta) return categoryDelta;
      return String(a.name || '').localeCompare(String(b.name || ''), 'fr', {sensitivity:'base'});
    });
  return {
    count: pilots.length,
    html: pilots.length ? `<div class="${entryPilotGridClass(pilots.length)}">${pilots.map(item => entryPilotCard(event,departure,item,item.id === ownRegistrationId)).join('')}</div>` : '<p class="empty">Tous les pilotes disponibles sont déjà affectés à un équipage.</p>'
  };
}

function entryFormatDate(departure) {
  try { return entryDateFormat.format(new Date(departure.startsAt)); }
  catch { return departure.date || ''; }
}

function decorateMyEntryHeader(card, event, departure, registration, managed) {
  const title = card.querySelector(':scope > .my-entry-header .my-entry-title');
  if (!title) return;
  const oldMeta = title.querySelector('.my-entry-meta');
  const typeBadge = oldMeta?.querySelector('.event-type-badge')?.outerHTML || '';
  const categoryBadge = oldMeta?.querySelector('.event-category-badge')?.outerHTML || '';
  const circuitText = [...oldMeta?.querySelectorAll(':scope > span:not(.event-type-badge):not(.event-category-badge)') || []]
    .map(node => node.textContent.trim())
    .find(text => text && !/^·?\s*\d+\s*h$/i.test(text) && !/^·/.test(text)) || '';
  title.innerHTML = `${managed ? `<strong class="ux-managed-entry-name">${esc(registration.name)}</strong>` : ''}<span class="ux-my-entry-departure">Départ ${esc(departure.time || '')}</span><h2>${esc(event.name)}</h2><span class="ux-my-entry-date">${esc(entryFormatDate(departure))}</span><div class="my-entry-meta">${typeBadge}${categoryBadge}${circuitText ? `<span>${esc(circuitText)}</span>` : ''}<span>${event.durationHours || 6} h</span></div>`;
  card.classList.toggle('ux-managed-entry', managed);
}

function decorateMyEntryCard(card, events) {
  const openButton = card.querySelector('[data-action="open"][data-id][data-departure][data-registration]');
  if (!openButton) return;
  const event = events.find(item => item.id === openButton.dataset.id);
  const departure = event?.departures?.find(item => item.id === openButton.dataset.departure);
  const registration = departure?.availability?.find(item => item.id === openButton.dataset.registration);
  if (!event || !departure || !registration) return;

  const managed = /Inscriptions que je gère/i.test(card.closest('.my-entries-group')?.querySelector('.my-entries-group-heading h2')?.textContent || '');
  const crew = (departure.crews || []).find(item => (item.registrationIds || []).includes(registration.id));
  const unassigned = entryUnassignedPilots(event,departure,registration.id);
  const signature = JSON.stringify([event.version,departure.version,registration.id,registration.version,managed,(departure.crews || []).map(item => [item.id,item.version,item.locked,item.name,item.category,item.car,item.registrationIds]),(departure.availability || []).map(item => [item.id,item.version,item.status,item.name,item.category,item.carAny,item.cars,item.preferredPilot])]);
  if (card.dataset.uxMainEntriesSignature === signature) return;

  decorateMyEntryHeader(card,event,departure,registration,managed);
  const body = card.querySelector(':scope > .my-entry-accordion-body');
  if (!body) return;
  const actions = body.querySelector('.my-entry-actions-top');

  const crewDetails = document.createElement('details');
  crewDetails.className = 'ux-my-entry-content-accordion ux-my-entry-crew-accordion';
  crewDetails.innerHTML = `${entryAccordionSummary('Mon équipage', crew?.registrationIds?.length || 0)}<div class="ux-my-entry-content-body">${entryOwnCrewBody(event,departure,registration,crew)}</div>`;

  const pilotsDetails = document.createElement('details');
  pilotsDetails.className = 'ux-my-entry-content-accordion ux-my-entry-pilots-accordion';
  pilotsDetails.innerHTML = `${entryAccordionSummary('Pilotes sans équipage', unassigned.count)}<div class="ux-my-entry-content-body">${unassigned.html}</div>`;

  body.replaceChildren();
  if (actions) body.append(actions);
  body.append(crewDetails,pilotsDetails);
  card.dataset.uxMainEntriesSignature = signature;
}

async function decorateMyEntries() {
  const cards = [...app?.querySelectorAll('.my-entry-card') || []];
  if (!cards.length) return;
  const events = await loadEntriesEvents();
  if (!events.length || !app?.querySelector('.my-entry-card')) return;
  cards.forEach(card => decorateMyEntryCard(card,events));
}

function decorate() {
  decorateEventHeaderCountdown();
  decorateDepartureHeaders();
  decorateCoursePilotAccordions();
  decorateRemainingPilots();
  void decorateMyEntries();
}

function scheduleDecorate() {
  if (queued) return;
  queued = true;
  queueMicrotask(() => {
    queued = false;
    decorate();
  });
}

if (app) {
  decorate();
  new MutationObserver(scheduleDecorate).observe(app, {childList:true, subtree:true});
}
