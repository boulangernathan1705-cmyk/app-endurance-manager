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
    if (!section) {
      section = document.createElement('section');
      section.className = 'ux-remaining-pilots-section';
      crewSection.append(section);
    }
    if (section.dataset.signature === signature) return;
    section.dataset.signature = signature;
    section.innerHTML = `<div class="ux-remaining-heading"><h3>Pilotes restants à affecter</h3><span>${remaining.length}</span></div><div class="ux-remaining-pilot-grid">${remaining.map(registration => remainingPilotCard(event, departure, registration)).join('')}</div>`;
  });
}

function decorate() {
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
