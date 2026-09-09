import {CARS} from './shared/catalog.mjs';
import {dateLabel} from './front/schedule.mjs';
import {renderAvailabilityTimeline} from './front/timeline.mjs';

const app = document.getElementById('app');
let eventsCache = null;
let builderState = null;
let builderPanel = null;
let pendingMessage = null;
let observerTimer = null;
let submitting = false;

const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

async function api(path, method = 'GET', data) {
  const response = await fetch(path, {
    method,
    credentials: 'same-origin',
    cache: 'no-store',
    headers: method === 'GET' ? {} : {'Content-Type': 'application/json'},
    body: method === 'GET' ? undefined : JSON.stringify(data || {})
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'Cette action a échoué.');
  return result;
}

async function loadEvents(force = false) {
  if (!force && eventsCache) return eventsCache;
  const result = await api('/api/events');
  eventsCache = Array.isArray(result.events) ? result.events : [];
  return eventsCache;
}

function currentEventId() {
  return app?.querySelector('[data-action="edit-event"][data-id]')?.dataset.id || '';
}

function futureDepartures(event) {
  return (event?.departures || []).filter(departure => Number(departure.startsAt) > Date.now());
}

function currentOpenDepartureId() {
  const open = app?.querySelector('.departure-fold[open][id]');
  return open?.id?.replace(/^crew-departure-/, '').replace(/^departure-/, '') || '';
}

function defaultDeparture(event) {
  const future = futureDepartures(event);
  const visibleId = currentOpenDepartureId();
  return future.find(departure => departure.id === visibleId) || future[0] || null;
}

function registrationCarLabel(registration) {
  if (registration?.carAny) return 'N’importe quelle voiture';
  if (registration?.cars?.length) return registration.cars.join(' · ');
  return registration?.car || 'Pas de préférence';
}

function coversHour(registration, index) {
  return registration?.status === 'whole' || String(registration?.status || '').split(',').includes(`h${index + 1}`);
}

function availableCandidates(event, departure, category) {
  if (!departure) return [];
  const registrations = departure.availability || [];
  const assignedRegistrationIds = new Set((departure.crews || []).flatMap(crew => crew.registrationIds || []));
  const assignedParticipants = new Set(
    registrations
      .filter(registration => assignedRegistrationIds.has(registration.id) && registration.participantId)
      .map(registration => registration.participantId)
  );
  const seen = new Set();
  return registrations.filter(registration => {
    if (registration.status === 'unavailable' || registration.category !== category) return false;
    if (assignedRegistrationIds.has(registration.id)) return false;
    if (registration.participantId && assignedParticipants.has(registration.participantId)) return false;
    const key = registration.participantId || registration.id;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function coverageData(event, departure, registrationIds) {
  const duration = Number(event?.durationHours) || 6;
  const registrations = (registrationIds || [])
    .map(id => departure?.availability?.find(registration => registration.id === id))
    .filter(Boolean);
  const counts = Array.from({length: duration}, (_, index) => registrations.filter(registration => coversHour(registration, index)).length);
  const covered = counts.filter(Boolean).length;
  return {duration, registrations, counts, covered, missing: Math.max(0, duration - covered)};
}

function coverageMarkup(event, departure) {
  const coverage = coverageData(event, departure, builderState?.registrationIds || []);
  const selectedCount = coverage.registrations.length;
  const message = !selectedCount
    ? 'Aucun pilote sélectionné. L’équipage peut être créé vide et complété plus tard.'
    : coverage.missing
      ? `${coverage.missing} h de course ${coverage.missing > 1 ? 'ne sont' : 'n’est'} pas encore couverte${coverage.missing > 1 ? 's' : ''}.`
      : 'Toutes les heures de course sont couvertes par la sélection actuelle.';
  return `<div class="crew-builder-coverage-heading"><div><span class="crew-builder-step-label">COUVERTURE PRÉVUE</span><strong>${coverage.covered}/${coverage.duration} h couvertes</strong></div><span>${selectedCount} pilote${selectedCount > 1 ? 's' : ''}</span></div>
    ${renderAvailabilityTimeline({departure,duration:coverage.duration,counts:coverage.counts,label:'Couverture prévue de l’équipage'})}
    <p class="crew-builder-coverage-message ${coverage.missing && selectedCount ? 'needs-pilots' : ''}">${esc(message)}</p>`;
}

function pilotCard(event, departure, registration) {
  const checked = builderState.registrationIds.includes(registration.id);
  return `<label class="crew-builder-pilot ${checked ? 'is-selected' : ''}">
    <span class="crew-builder-pilot-head"><input type="checkbox" name="builderPilot" value="${registration.id}" ${checked ? 'checked' : ''}><span><strong>${esc(registration.name)}</strong><small>${esc(registrationCarLabel(registration))}</small></span></span>
    <span class="crew-builder-pilot-wish">Coéquipier souhaité : <strong>${esc(registration.preferredPilot || 'aucune préférence')}</strong></span>
    ${renderAvailabilityTimeline({departure,duration:event.durationHours || 6,status:registration.status,label:`Disponibilités de ${registration.name}`})}
  </label>`;
}

function panelMarkup(event) {
  const departures = futureDepartures(event);
  const departure = departures.find(item => item.id === builderState.departureId) || departures[0];
  if (!departure) return `<section class="crew-builder-panel"><div class="crew-builder-heading"><div><span class="creation-kicker">FORMATION D’ÉQUIPAGE</span><h2>Aucun départ disponible</h2></div><button type="button" class="secondary-button" data-crew-builder-cancel>Fermer</button></div><p class="creation-help">Tous les départs de cet événement sont déjà passés.</p></section>`;
  builderState.departureId = departure.id;
  if (!event.categories.includes(builderState.category)) builderState.category = event.categories[0] || '';
  if (!(CARS[builderState.category] || []).includes(builderState.car)) builderState.car = '';
  const candidates = availableCandidates(event, departure, builderState.category);
  builderState.registrationIds = builderState.registrationIds.filter(id => candidates.some(candidate => candidate.id === id));
  const pilotCount = builderState.registrationIds.length;

  return `<section class="crew-builder-panel" data-crew-builder-panel>
    <div class="crew-builder-heading"><div><span class="creation-kicker">FORMATION D’ÉQUIPAGE</span><h2>Créer un nouvel équipage</h2><p>Choisis le départ et la catégorie, puis compose immédiatement l’équipage avec les pilotes déjà inscrits.</p></div><button type="button" class="secondary-button" data-crew-builder-cancel>Annuler</button></div>
    <form class="crew-builder-form" data-crew-builder-form>
      <section class="crew-builder-card"><div class="crew-builder-card-title"><span>01</span><div><h3>Course et équipage</h3><p>Le départ filtre automatiquement les pilotes disponibles.</p></div></div>
        <div class="crew-builder-fields">
          <label>Départ<select name="builderDeparture">${departures.map(item => `<option value="${item.id}" ${item.id === departure.id ? 'selected' : ''}>${esc(dateLabel(item))} · ${esc(item.time)}</option>`).join('')}</select></label>
          <label>Catégorie<select name="builderCategory">${event.categories.map(category => `<option value="${esc(category)}" ${category === builderState.category ? 'selected' : ''}>${esc(category)}</option>`).join('')}</select></label>
          <label>Nom de l’équipage<input name="builderName" maxlength="60" required value="${esc(builderState.name)}" placeholder="Ex. FMT Racing 1"></label>
          <label>Voiture<select name="builderCar"><option value="">Voiture à définir</option>${(CARS[builderState.category] || []).map(car => `<option value="${esc(car)}" ${car === builderState.car ? 'selected' : ''}>${esc(car)}</option>`).join('')}</select></label>
        </div>
      </section>
      <section class="crew-builder-card"><div class="crew-builder-card-title"><span>02</span><div><h3>Pilotes</h3><p>Tu peux en sélectionner maintenant, ou créer l’équipage vide et revenir dessus plus tard.</p></div></div>
        <div class="crew-builder-pilots">${candidates.length ? candidates.map(registration => pilotCard(event,departure,registration)).join('') : '<p class="crew-builder-empty">Aucun pilote non affecté dans cette catégorie pour ce départ.</p>'}</div>
        <p class="crew-builder-warning">Lorsqu’un pilote est affecté à cet équipage, ses autres inscriptions sur ce même départ sont retirées, comme dans la page Équipages actuelle.</p>
      </section>
      <section class="crew-builder-card crew-builder-coverage" data-crew-builder-coverage>${coverageMarkup(event,departure)}</section>
      <div class="crew-builder-actions"><span class="crew-builder-submit-note">Tu pourras modifier la composition plus tard depuis l’onglet Équipages.</span><button type="submit" class="primary-button" data-crew-builder-submit>Créer l’équipage${pilotCount ? ` avec ${pilotCount} pilote${pilotCount > 1 ? 's' : ''}` : ' sans pilote'}</button></div>
      <p class="creation-error crew-builder-error" data-crew-builder-error hidden></p>
    </form>
  </section>`;
}

function renderPanel(event, {scroll = false} = {}) {
  const markup = panelMarkup(event);
  if (builderPanel?.isConnected) {
    const replacement = document.createElement('div');
    replacement.innerHTML = markup;
    const nextPanel = replacement.firstElementChild;
    builderPanel.replaceWith(nextPanel);
    builderPanel = nextPanel;
  } else {
    const toolbar = app?.querySelector('[data-action="edit-event"]')?.closest('.toolbar');
    if (!toolbar) return;
    toolbar.insertAdjacentHTML('afterend', markup);
    builderPanel = toolbar.nextElementSibling;
  }
  if (scroll) builderPanel?.scrollIntoView({behavior:'smooth',block:'start'});
}

function updateCoverage(event) {
  const departure = event?.departures?.find(item => item.id === builderState?.departureId);
  const coverage = builderPanel?.querySelector('[data-crew-builder-coverage]');
  if (coverage && departure) coverage.innerHTML = coverageMarkup(event, departure);
  const count = builderState?.registrationIds?.length || 0;
  const submit = builderPanel?.querySelector('[data-crew-builder-submit]');
  if (submit) submit.textContent = `Créer l’équipage${count ? ` avec ${count} pilote${count > 1 ? 's' : ''}` : ' sans pilote'}`;
}

function showBuilderError(message) {
  const box = builderPanel?.querySelector('[data-crew-builder-error]');
  if (!box) return;
  box.textContent = message;
  box.hidden = false;
}

function closeBuilder() {
  builderState = null;
  builderPanel?.remove();
  builderPanel = null;
}

function insertPendingMessage() {
  if (!pendingMessage) return;
  const toolbar = app?.querySelector('[data-action="edit-event"]')?.closest('.toolbar');
  if (!toolbar || app.querySelector('[data-crew-builder-message]')) return;
  const message = document.createElement('p');
  message.dataset.crewBuilderMessage = 'true';
  message.className = pendingMessage.error ? 'creation-error crew-builder-result' : 'creation-success crew-builder-result';
  message.textContent = pendingMessage.text;
  toolbar.insertAdjacentElement('afterend', message);
  pendingMessage = null;
}

function decorateEventView() {
  const editButton = app?.querySelector('[data-action="edit-event"][data-id]');
  if (!editButton) {
    closeBuilder();
    return;
  }
  const toolbar = editButton.closest('.toolbar');
  if (toolbar && !toolbar.querySelector('[data-crew-builder-open]')) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'primary-button crew-builder-open';
    button.dataset.crewBuilderOpen = 'true';
    button.textContent = '+ Ajouter un équipage';
    editButton.insertAdjacentElement('afterend', button);
  }
  insertPendingMessage();
  if (builderState?.eventId === editButton.dataset.id && !app.querySelector('[data-crew-builder-panel]')) {
    loadEvents().then(events => {
      const event = events.find(item => item.id === builderState?.eventId);
      if (event) renderPanel(event);
    }).catch(() => {});
  }
}

function scheduleDecorate() {
  clearTimeout(observerTimer);
  observerTimer = setTimeout(decorateEventView, 0);
}

async function refreshMainView() {
  eventsCache = null;
  const refresh = app?.querySelector('[data-action="refresh"]');
  if (refresh) refresh.click();
  else scheduleDecorate();
}

async function openBuilder() {
  const eventId = currentEventId();
  if (!eventId) return;
  try {
    const events = await loadEvents(true);
    const event = events.find(item => item.id === eventId);
    if (!event) throw new Error('Événement introuvable. Actualise la page.');
    const departure = defaultDeparture(event);
    if (!departure) throw new Error('Tous les départs de cet événement sont déjà passés.');
    builderState = {eventId, departureId:departure.id, category:event.categories[0] || '', car:'', name:'', registrationIds:[]};
    renderPanel(event,{scroll:true});
    builderPanel?.querySelector('[name="builderName"]')?.focus({preventScroll:true});
  } catch (error) {
    pendingMessage = {error:true,text:error?.message || 'Impossible d’ouvrir la création d’équipage.'};
    insertPendingMessage();
  }
}

async function submitBuilder(form) {
  if (submitting || !builderState) return;
  submitting = true;
  const submit = form.querySelector('[data-crew-builder-submit]');
  if (submit) submit.disabled = true;
  let createdId = null;
  try {
    builderState.name = form.elements.builderName.value.trim();
    builderState.car = form.elements.builderCar.value;
    if (!builderState.name) throw new Error('Indique le nom de l’équipage.');
    const createResult = await api(`/api/events/${builderState.eventId}/departures/${builderState.departureId}/crews`,'POST',{
      name:builderState.name,
      category:builderState.category,
      car:builderState.car
    });
    createdId = createResult.id;
    let removedRegistrations = 0;
    if (builderState.registrationIds.length) {
      const events = await loadEvents(true);
      const event = events.find(item => item.id === builderState.eventId);
      const departure = event?.departures?.find(item => item.id === builderState.departureId);
      const crew = departure?.crews?.find(item => item.id === createdId);
      if (!crew) throw new Error('L’équipage a été créé mais doit être actualisé avant d’y affecter les pilotes.');
      let version = crew.version;
      for (const registrationId of builderState.registrationIds) {
        const result = await api(`/api/crews/${createdId}/members`,'POST',{registrationId,version});
        removedRegistrations += Number(result.removedRegistrations) || 0;
        version += 1;
      }
    }
    pendingMessage = {error:false,text:`Équipage « ${builderState.name} » créé${builderState.registrationIds.length ? ` avec ${builderState.registrationIds.length} pilote${builderState.registrationIds.length > 1 ? 's' : ''}` : ' sans pilote'}.${removedRegistrations ? ` ${removedRegistrations} autre(s) inscription(s) du même départ ont été retirées.` : ''}`};
    closeBuilder();
    await refreshMainView();
  } catch (error) {
    if (createdId) {
      pendingMessage = {error:true,text:`L’équipage a bien été créé, mais tous les pilotes n’ont pas pu être affectés : ${error?.message || 'erreur inconnue'}. Termine la composition depuis l’onglet Équipages.`};
      closeBuilder();
      await refreshMainView();
    } else {
      showBuilderError(error?.message || 'Impossible de créer cet équipage.');
    }
  } finally {
    submitting = false;
    if (submit?.isConnected) submit.disabled = false;
  }
}

document.addEventListener('click', event => {
  if (event.target.closest('[data-crew-builder-open]')) {
    event.preventDefault();
    openBuilder();
    return;
  }
  if (event.target.closest('[data-crew-builder-cancel]')) {
    event.preventDefault();
    closeBuilder();
  }
});

document.addEventListener('input', event => {
  if (!builderState || !event.target.closest('[data-crew-builder-form]')) return;
  if (event.target.name === 'builderName') builderState.name = event.target.value;
});

document.addEventListener('change', async event => {
  const field = event.target;
  if (!builderState || !field.closest('[data-crew-builder-form]')) return;
  const events = await loadEvents().catch(() => []);
  const currentEvent = events.find(item => item.id === builderState.eventId);
  if (!currentEvent) return;
  if (field.name === 'builderDeparture') {
    builderState.departureId = field.value;
    builderState.registrationIds = [];
    renderPanel(currentEvent);
    return;
  }
  if (field.name === 'builderCategory') {
    builderState.category = field.value;
    builderState.car = '';
    builderState.registrationIds = [];
    renderPanel(currentEvent);
    return;
  }
  if (field.name === 'builderCar') {
    builderState.car = field.value;
    return;
  }
  if (field.name === 'builderPilot') {
    const ids = new Set(builderState.registrationIds);
    field.checked ? ids.add(field.value) : ids.delete(field.value);
    builderState.registrationIds = [...ids];
    field.closest('.crew-builder-pilot')?.classList.toggle('is-selected', field.checked);
    updateCoverage(currentEvent);
  }
});

document.addEventListener('submit', event => {
  const form = event.target.closest('[data-crew-builder-form]');
  if (!form) return;
  event.preventDefault();
  submitBuilder(form);
});

if (app) {
  decorateEventView();
  new MutationObserver(scheduleDecorate).observe(app,{childList:true,subtree:true});
}
