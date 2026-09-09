import {renderAvailabilityTimeline} from './front/timeline.mjs';

const app = document.getElementById('app');
let eventsCache = null;
let activeEventId = '';
let decorateTimer = null;
const openFolds = new Set();
const visibleRegistrations = new Set();
let lastError = '';

const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

async function loadEvents(force = false) {
  if (!force && eventsCache) return eventsCache;
  const response = await fetch('/api/events', {credentials:'same-origin', cache:'no-store'});
  if (!response.ok) throw new Error('Impossible de charger les données de l’événement.');
  const result = await response.json();
  eventsCache = Array.isArray(result.events) ? result.events : [];
  return eventsCache;
}

function currentEventId() {
  return app?.querySelector('[data-action="edit-event"][data-id]')?.dataset.id || '';
}

function departureIdFromFold(fold) {
  return fold?.id?.replace(/^crew-departure-/, '').replace(/^departure-/, '') || '';
}

function registrationCarLabel(registration) {
  if (registration?.carAny) return 'N’importe quelle voiture';
  if (registration?.cars?.length) return registration.cars.join(' · ');
  return registration?.car || 'Pas de préférence';
}

function showBlockingError(message) {
  const text = String(message || '').trim();
  if (!text || (text === lastError && document.querySelector('[data-ux-error-modal]'))) return;
  lastError = text;
  document.querySelector('[data-ux-error-modal]')?.remove();
  const overlay = document.createElement('div');
  overlay.className = 'ux-error-overlay';
  overlay.dataset.uxErrorModal = 'true';
  overlay.innerHTML = `<section class="ux-error-dialog" role="alertdialog" aria-modal="true" aria-labelledby="ux-error-title" aria-describedby="ux-error-message"><span class="ux-error-icon" aria-hidden="true">!</span><h2 id="ux-error-title">Action impossible</h2><p id="ux-error-message">${esc(text)}</p><button type="button" class="primary-button" data-ux-error-ok>OK, j’ai compris</button></section>`;
  document.body.append(overlay);
  overlay.querySelector('[data-ux-error-ok]')?.focus();
}

function consumeErrors() {
  const boxes = [...app.querySelectorAll('#error:not([hidden]), [data-crew-builder-error]:not([hidden])')].filter(box => box.textContent.trim());
  const box = boxes.at(-1);
  if (!box) return;
  const message = box.textContent.trim();
  box.hidden = true;
  showBlockingError(message);
}

function syncEventState() {
  const eventId = currentEventId();
  if (eventId === activeEventId) return eventId;
  activeEventId = eventId;
  openFolds.clear();
  visibleRegistrations.clear();
  eventsCache = null;
  return eventId;
}

function activeSection() {
  return app.querySelector('[data-action="event-section"][aria-pressed="true"]')?.dataset.section || 'race';
}

function refineBuilderVisibility() {
  const crewsActive = activeSection() === 'crews';
  app.querySelectorAll('[data-crew-builder-open]').forEach(button => {
    const hidden = !crewsActive;
    if (button.hidden !== hidden) button.hidden = hidden;
  });
  app.querySelectorAll('[data-crew-builder-panel]').forEach(panel => {
    const hidden = !crewsActive;
    if (panel.hidden !== hidden) panel.hidden = hidden;
  });
  app.querySelectorAll('[data-action="new-crew"]').forEach(button => {
    if (!button.hidden) button.hidden = true;
  });
}

function refineFoldState() {
  app.querySelectorAll('.departure-fold[id]').forEach(fold => {
    fold.open = openFolds.has(fold.id);
  });
}

function ownRegistrationExists(fold) {
  const save = fold.querySelector('.fold-registration .save-button');
  return save?.textContent?.trim().toUpperCase() === 'ENREGISTRER';
}

function refineRegistration(fold) {
  if (!fold.id.startsWith('departure-')) return;
  const departureId = departureIdFromFold(fold);
  const toolbar = fold.querySelector('.fold-toolbar');
  const section = fold.querySelector('.fold-registration');
  toolbar?.querySelector('[data-action="focus-registration"]')?.remove();
  if (!toolbar || !section) return;

  let toggle = toolbar.querySelector('[data-ux-registration-toggle]');
  if (!toggle) {
    toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.dataset.uxRegistrationToggle = 'true';
    toggle.dataset.departure = departureId;
    toolbar.append(toggle);
  }
  const editing = visibleRegistrations.has(departureId);
  toggle.className = editing ? 'secondary-button ux-registration-toggle is-open' : 'primary-button ux-registration-toggle';
  toggle.textContent = editing ? 'Fermer l’inscription' : (ownRegistrationExists(fold) ? 'Modifier mon inscription' : 'S’inscrire');
  if (section.hidden === editing) section.hidden = !editing;
}

function groupCoursePilots(fold) {
  if (!fold.id.startsWith('departure-')) return;
  const pilotSection = fold.querySelector('.pilot-section');
  if (!pilotSection || pilotSection.dataset.uxGrouped === 'true') return;

  const crewGroups = [...pilotSection.querySelectorAll('.category-group > .crew-pilot-accordion')];
  if (crewGroups.some(group => !group.dataset.crewLocked)) return;

  const unassigned = [...pilotSection.querySelectorAll('.category-group > .pilot-row')];
  const unavailable = [...pilotSection.querySelectorAll(':scope > .pilot-row')];
  const incomplete = crewGroups.filter(group => group.dataset.crewLocked !== 'true');
  const ready = crewGroups.filter(group => group.dataset.crewLocked === 'true');

  const replacement = document.createElement('div');
  replacement.className = 'ux-course-overview';
  replacement.innerHTML = `<section class="ux-unassigned-section"><div class="ux-section-heading"><div><span class="creation-kicker">À AFFECTER</span><h3>Pilotes sans équipage</h3></div><span class="ux-count">${unassigned.length}</span></div><div class="ux-unassigned-grid" data-ux-unassigned></div></section>
    <details class="ux-crew-bucket"><summary><span>Équipages incomplets</span><strong>${incomplete.length}</strong></summary><div class="ux-crew-bucket-body" data-ux-incomplete></div></details>
    <details class="ux-crew-bucket"><summary><span>Équipages prêts à partir</span><strong>${ready.length}</strong></summary><div class="ux-crew-bucket-body" data-ux-ready></div></details>
    ${unavailable.length ? `<details class="ux-crew-bucket ux-unavailable-bucket"><summary><span>Pilotes indisponibles</span><strong>${unavailable.length}</strong></summary><div class="ux-crew-bucket-body" data-ux-unavailable></div></details>` : ''}`;

  const unassignedTarget = replacement.querySelector('[data-ux-unassigned]');
  if (unassigned.length) unassigned.forEach(row => unassignedTarget.append(row));
  else unassignedTarget.innerHTML = '<p class="empty">Tous les pilotes disponibles sont déjà affectés à un équipage.</p>';

  const incompleteTarget = replacement.querySelector('[data-ux-incomplete]');
  incomplete.length ? incomplete.forEach(group => incompleteTarget.append(group)) : incompleteTarget.innerHTML = '<p class="empty">Aucun équipage incomplet.</p>';
  const readyTarget = replacement.querySelector('[data-ux-ready]');
  ready.length ? ready.forEach(group => readyTarget.append(group)) : readyTarget.innerHTML = '<p class="empty">Aucun équipage prêt à partir.</p>';
  const unavailableTarget = replacement.querySelector('[data-ux-unavailable]');
  unavailable.forEach(row => unavailableTarget?.append(row));

  pilotSection.replaceChildren(replacement);
  pilotSection.dataset.uxGrouped = 'true';
}

function candidateCard(event, departure, crew, registration) {
  return `<button type="button" class="ux-crew-candidate" data-ux-add-crew-pilot data-crew="${crew.id}" data-departure="${departure.id}" data-registration="${registration.id}"><span class="ux-candidate-head"><strong>${esc(registration.name)}</strong><span>+ Ajouter</span></span><small>${esc(registrationCarLabel(registration))}</small><small>Coéquipier souhaité : ${esc(registration.preferredPilot || 'aucune préférence')}</small>${renderAvailabilityTimeline({departure,duration:event.durationHours || 6,status:registration.status,label:`Disponibilités de ${registration.name}`})}</button>`;
}

function refineCrewCard(event, departure, crew, card) {
  const assignment = card.querySelector('.crew-assignment');
  if (!assignment || card.dataset.crewLocked === 'true') {
    card.querySelector('[data-ux-candidate-grid]')?.remove();
    return;
  }
  const select = assignment.querySelector(`#assign-${CSS.escape(crew.id)}`);
  const add = assignment.querySelector('[data-action="add-crew-pilot"]');
  if (!select || !add) return;
  assignment.classList.add('ux-original-assignment');
  if (!select.hidden) select.hidden = true;
  if (!add.hidden) add.hidden = true;
  const wishes = assignment.querySelector('.assignment-wishes');
  if (wishes && !wishes.hidden) wishes.hidden = true;

  let grid = card.querySelector('[data-ux-candidate-grid]');
  if (!grid) {
    grid = document.createElement('div');
    grid.className = 'ux-crew-candidate-wrap';
    grid.dataset.uxCandidateGrid = 'true';
    assignment.insertAdjacentElement('afterend', grid);
  }
  const ids = [...select.options].map(option => option.value).filter(Boolean);
  const signature = ids.join('|');
  if (grid.dataset.signature === signature) return;
  grid.dataset.signature = signature;
  const registrations = ids.map(id => departure.availability.find(registration => registration.id === id)).filter(Boolean);
  grid.innerHTML = `<div class="ux-candidate-title"><strong>Pilotes disponibles · ${esc(crew.category)}</strong><span>Clique sur un pilote pour l’ajouter</span></div><div class="ux-crew-candidate-grid">${registrations.length ? registrations.map(registration => candidateCard(event,departure,crew,registration)).join('') : '<p class="empty">Aucun pilote à affecter dans cette catégorie.</p>'}</div>`;
}

async function refineCrewPage() {
  if (activeSection() !== 'crews') return;
  const eventId = currentEventId();
  if (!eventId) return;
  const events = await loadEvents().catch(() => []);
  const event = events.find(item => item.id === eventId);
  if (!event) return;
  app.querySelectorAll('.crew-card[data-crew]').forEach(card => {
    const departureId = departureIdFromFold(card.closest('.departure-fold'));
    const departure = event.departures.find(item => item.id === departureId);
    const crew = departure?.crews?.find(item => item.id === card.dataset.crew);
    if (departure && crew) refineCrewCard(event,departure,crew,card);
  });
}

function decorate() {
  clearTimeout(decorateTimer);
  syncEventState();
  consumeErrors();
  if (!currentEventId()) return;
  refineBuilderVisibility();
  refineFoldState();
  app.querySelectorAll('.departure-fold').forEach(fold => refineRegistration(fold));
  if (activeSection() === 'race') app.querySelectorAll('.departure-fold').forEach(groupCoursePilots);
  refineCrewPage();
}

function scheduleDecorate(delay = 15) {
  clearTimeout(decorateTimer);
  decorateTimer = setTimeout(decorate, delay);
}

document.addEventListener('click', event => {
  if (event.target.closest('[data-ux-error-ok]')) {
    document.querySelector('[data-ux-error-modal]')?.remove();
    lastError = '';
    return;
  }

  const registrationToggle = event.target.closest('[data-ux-registration-toggle]');
  if (registrationToggle) {
    event.preventDefault();
    const departureId = registrationToggle.dataset.departure;
    const fold = document.getElementById(`departure-${departureId}`);
    if (visibleRegistrations.has(departureId)) visibleRegistrations.delete(departureId);
    else {
      visibleRegistrations.add(departureId);
      openFolds.add(`departure-${departureId}`);
    }
    refineFoldState();
    refineRegistration(fold);
    if (visibleRegistrations.has(departureId)) fold?.querySelector('.fold-registration')?.scrollIntoView({behavior:'smooth',block:'start'});
    return;
  }

  const candidate = event.target.closest('[data-ux-add-crew-pilot]');
  if (candidate) {
    event.preventDefault();
    const card = candidate.closest('.crew-card');
    const select = card?.querySelector(`#assign-${CSS.escape(candidate.dataset.crew)}`);
    const add = card?.querySelector('[data-action="add-crew-pilot"]');
    if (select && add && !add.disabled) {
      select.value = candidate.dataset.registration;
      add.click();
    }
    return;
  }

  const summary = event.target.closest('.departure-fold > summary');
  if (summary) {
    const fold = summary.parentElement;
    setTimeout(() => {
      fold.open ? openFolds.add(fold.id) : openFolds.delete(fold.id);
    }, 0);
  }

  const action = event.target.closest('[data-action]');
  if (!action) return;
  if (action.dataset.action === 'open') {
    openFolds.clear();
    visibleRegistrations.clear();
    if (action.dataset.departure) {
      openFolds.add(`departure-${action.dataset.departure}`);
      if (action.dataset.registration) visibleRegistrations.add(action.dataset.departure);
    }
  }
  if (action.dataset.action === 'event-section') openFolds.clear();
  if (['edit-registration','my-registration','new-registration'].includes(action.dataset.action) && action.dataset.departure) {
    visibleRegistrations.add(action.dataset.departure);
    openFolds.add(`departure-${action.dataset.departure}`);
  }
}, true);

document.addEventListener('submit', event => {
  const form = event.target.closest('.registration-form');
  if (!form) return;
  const departureId = form.dataset.departure;
  setTimeout(() => {
    const success = [...app.querySelectorAll('.creation-success')].some(item => item.textContent.includes('Inscription enregistrée'));
    if (success && departureId) {
      visibleRegistrations.delete(departureId);
      scheduleDecorate();
    }
  }, 500);
}, true);

if (app) {
  scheduleDecorate(0);
  new MutationObserver(() => scheduleDecorate()).observe(app,{childList:true,subtree:true,attributes:true,attributeFilter:['hidden','aria-pressed','data-crew-locked']});
}
