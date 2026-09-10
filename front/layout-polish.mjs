import {categories} from '../shared/catalog.mjs';
import {renderAvailabilityTimeline} from './timeline.mjs';

const app = document.getElementById('app');
let queued = false;

const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

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

function decorate() {
  decorateEventHeaderCountdown();
  decorateDepartureHeaders();
  decorateCoursePilotAccordions();
  decorateRemainingPilots();
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
