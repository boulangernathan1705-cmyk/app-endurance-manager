import {CARS} from './shared/catalog.mjs';
import {dateLabel} from './front/schedule.mjs';
import {renderAvailabilityTimeline} from './front/timeline.mjs';

const app = document.getElementById('app');
let eventsCache = null;
let builderState = null;
let builderPanel = null;
let pendingMessage = null;
let submitting = false;

const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

async function api(path, method = 'GET', data) {
  const response = await fetch(path, {
    method,
    credentials: 'same-origin',
    cache: 'no-store',
    headers: method === 'GET' ? {} : {'Content-Type':'application/json'},
    body: method === 'GET' ? undefined : JSON.stringify(data || {})
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'Cette action a échoué.');
  return result;
}

async function loadEvents(force = false) {
  if (!force && app?.querySelector('[data-event-id]') && app.eventViewData) return app.eventViewData.events;
  if (!force && eventsCache) return eventsCache;
  const result = await api('/api/events');
  eventsCache = Array.isArray(result.events) ? result.events : [];
  return eventsCache;
}

function currentEventId() {
  return app?.querySelector('[data-event-id]')?.dataset.eventId || '';
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

function availableCandidates(event, departure, category, editingCrewId = null) {
  if (!departure) return [];
  const registrations = departure.availability || [];
  const otherCrews = (departure.crews || []).filter(crew => crew.id !== editingCrewId);
  const assignedRegistrationIds = new Set(otherCrews.flatMap(crew => crew.registrationIds || []));
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
    ? 'Aucun pilote sélectionné. L’équipage peut rester vide et être complété plus tard.'
    : coverage.missing
      ? `${coverage.missing} h de course ${coverage.missing > 1 ? 'ne sont' : 'n’est'} pas encore couverte${coverage.missing > 1 ? 's' : ''}.`
      : 'Toutes les heures de course sont couvertes par la sélection actuelle.';
  return `<div class="crew-builder-coverage-heading"><div><span class="crew-builder-step-label">COUVERTURE PRÉVUE</span><strong>${coverage.covered}/${coverage.duration} h couvertes</strong></div><span>${selectedCount} pilote${selectedCount > 1 ? 's' : ''}</span></div>
    ${renderAvailabilityTimeline({departure,duration:coverage.duration,counts:coverage.counts,label:'Couverture prévue de l’équipage'})}
    <p class="crew-builder-coverage-message ${coverage.missing && selectedCount ? 'needs-pilots' : ''}">${esc(message)}</p>`;
}

function pilotCard(event, departure, registration, locked = false) {
  const checked = builderState.registrationIds.includes(registration.id);
  return `<label class="crew-builder-pilot ${checked ? 'is-selected' : ''}${locked ? ' is-locked' : ''}">
    <span class="crew-builder-pilot-head"><input type="checkbox" name="builderPilot" value="${registration.id}" ${checked ? 'checked' : ''} ${locked ? 'disabled' : ''}><span><strong>${esc(registration.name)}</strong><small>${esc(registrationCarLabel(registration))}</small></span></span>
    <span class="crew-builder-pilot-wish">Coéquipier souhaité : <strong>${esc(registration.preferredPilot || 'aucune préférence')}</strong></span>
    ${renderAvailabilityTimeline({departure,duration:event.durationHours || 6,status:registration.status,label:`Disponibilités de ${registration.name}`})}
  </label>`;
}

function submitLabel() {
  const count = builderState?.registrationIds?.length || 0;
  if (builderState?.mode === 'edit') return `Enregistrer l’équipage${count ? ` · ${count} pilote${count > 1 ? 's' : ''}` : ''}`;
  return `Créer l’équipage${count ? ` avec ${count} pilote${count > 1 ? 's' : ''}` : ' sans pilote'}`;
}

function panelMarkup(event) {
  const editMode = builderState.mode === 'edit';
  const departures = editMode
    ? futureDepartures(event).filter(item => item.id === builderState.departureId)
    : futureDepartures(event);
  const departure = departures.find(item => item.id === builderState.departureId) || departures[0];
  if (!departure) return `<section class="crew-builder-panel"><div class="crew-builder-heading"><div><span class="creation-kicker">FORMATION D’ÉQUIPAGE</span><h2>Aucun départ disponible</h2></div><button type="button" class="secondary-button" data-crew-builder-cancel>Fermer</button></div><p class="creation-help">Tous les départs de cet événement sont déjà passés.</p></section>`;
  builderState.departureId = departure.id;
  if (!event.categories.includes(builderState.category)) builderState.category = event.categories[0] || '';
  if (!(CARS[builderState.category] || []).includes(builderState.car)) builderState.car = '';
  const candidates = availableCandidates(event, departure, builderState.category, editMode ? builderState.crewId : null);
  if (!builderState.locked) builderState.registrationIds = builderState.registrationIds.filter(id => candidates.some(candidate => candidate.id === id));
  const title = editMode ? `Modifier « ${esc(builderState.name || 'Équipage')} »` : 'Créer un nouvel équipage';
  const description = editMode
    ? 'Le même éditeur sert à modifier le nom, la voiture et la composition de l’équipage.'
    : 'Choisis le départ et la catégorie, puis compose immédiatement l’équipage avec les pilotes déjà inscrits.';
  const lockedNote = builderState.locked ? '<p class="crew-builder-warning">Cet équipage est complet. Rouvre-le depuis l’onglet Équipages pour modifier sa catégorie ou sa composition.</p>' : '';

  return `<section class="crew-builder-panel" data-crew-builder-panel>
    <div class="crew-builder-heading"><div><span class="creation-kicker">FORMATION D’ÉQUIPAGE</span><h2>${title}</h2><p>${description}</p></div><button type="button" class="secondary-button" data-crew-builder-cancel>Annuler</button></div>
    <form class="crew-builder-form" data-crew-builder-form>
      <section class="crew-builder-card"><div class="crew-builder-card-title"><span>01</span><div><h3>Course et équipage</h3><p>${editMode ? 'Le départ d’un équipage existant ne change pas.' : 'Le départ filtre automatiquement les pilotes disponibles.'}</p></div></div>
        <div class="crew-builder-fields">
          <label>Départ<select name="builderDeparture" ${editMode ? 'disabled' : ''}>${departures.map(item => `<option value="${item.id}" ${item.id === departure.id ? 'selected' : ''}>${esc(dateLabel(item))} · ${esc(item.time)}</option>`).join('')}</select></label>
          <label>Catégorie<select name="builderCategory" ${builderState.locked ? 'disabled' : ''}>${event.categories.map(category => `<option value="${esc(category)}" ${category === builderState.category ? 'selected' : ''}>${esc(category)}</option>`).join('')}</select></label>
          <label>Nom de l’équipage<input name="builderName" maxlength="60" required value="${esc(builderState.name)}" placeholder="Ex. FMT Racing 1"></label>
          <label>Voiture<select name="builderCar"><option value="">Voiture à définir</option>${(CARS[builderState.category] || []).map(car => `<option value="${esc(car)}" ${car === builderState.car ? 'selected' : ''}>${esc(car)}</option>`).join('')}</select></label>
        </div>
      </section>
      <section class="crew-builder-card"><div class="crew-builder-card-title"><span>02</span><div><h3>Pilotes</h3><p>${editMode ? 'La sélection affichée correspond à la composition enregistrée.' : 'Tu peux en sélectionner maintenant, ou créer l’équipage vide et revenir dessus plus tard.'}</p></div></div>
        ${lockedNote}
        <div class="crew-builder-pilots">${candidates.length ? candidates.map(registration => pilotCard(event,departure,registration,builderState.locked)).join('') : '<p class="crew-builder-empty">Aucun pilote disponible dans cette catégorie pour ce départ.</p>'}</div>
        ${!builderState.locked ? '<p class="crew-builder-warning">Lorsqu’un pilote est affecté à cet équipage, ses autres inscriptions sur ce même départ sont retirées.</p>' : ''}
      </section>
      <section class="crew-builder-card crew-builder-coverage" data-crew-builder-coverage>${coverageMarkup(event,departure)}</section>
      <div class="crew-builder-actions"><span class="crew-builder-submit-note">Les changements sont appliqués directement à cet équipage.</span><button type="submit" class="primary-button" data-crew-builder-submit>${submitLabel()}</button></div>
      <p class="creation-error crew-builder-error" data-crew-builder-error hidden></p>
    </form>
  </section>`;
}

function renderPanel(event, {scroll = false} = {}) {
  const root = app?.querySelector('#crew-builder-root');
  if (!root) return;
  root.innerHTML = panelMarkup(event);
  builderPanel = root.querySelector('[data-crew-builder-panel]');
  if (scroll) builderPanel?.scrollIntoView({behavior:'smooth',block:'start'});
}

function updateCoverage(event) {
  const departure = event?.departures?.find(item => item.id === builderState?.departureId);
  const coverage = builderPanel?.querySelector('[data-crew-builder-coverage]');
  if (coverage && departure) coverage.innerHTML = coverageMarkup(event, departure);
  const submit = builderPanel?.querySelector('[data-crew-builder-submit]');
  if (submit) submit.textContent = submitLabel();
}

function showBuilderError(message) {
  const box = builderPanel?.querySelector('[data-crew-builder-error]');
  if (!box) return;
  box.textContent = message;
  box.hidden = false;
}

function closeBuilder() {
  builderState = null;
  const root = app?.querySelector('#crew-builder-root');
  if (root) root.replaceChildren();
  builderPanel = null;
}

function insertPendingMessage() {
  if (!pendingMessage) return;
  const root = app?.querySelector('#crew-builder-root');
  if (!root) return;
  const message = document.createElement('p');
  message.dataset.crewBuilderMessage = 'true';
  message.className = pendingMessage.error ? 'creation-error crew-builder-result' : 'creation-success crew-builder-result';
  message.textContent = pendingMessage.text;
  root.replaceChildren(message);
  pendingMessage = null;
}

function decorateEventView() {
  const eventId = currentEventId();
  if (!eventId) {
    builderState = null;
    builderPanel = null;
    return;
  }
  insertPendingMessage();
  if (builderState && builderState.eventId !== eventId) {
    closeBuilder();
    return;
  }
  if (builderState?.eventId === eventId && !app.querySelector('[data-crew-builder-panel]')) {
    loadEvents().then(events => {
      const event = events.find(item => item.id === builderState?.eventId);
      if (event && currentEventId() === event.id && builderState?.eventId === event.id) renderPanel(event);
    }).catch(() => {});
  }
}

async function refreshMainView() {
  eventsCache = null;
  const refresh = app?.querySelector('[data-action="refresh"]');
  if (refresh) refresh.click();
}

async function openBuilder(crewId = null) {
  const eventId = currentEventId();
  if (!eventId) return;
  try {
    const events = await loadEvents();
    const event = events.find(item => item.id === eventId);
    if (!event) throw new Error('Événement introuvable. Actualise la page.');

    if (crewId) {
      let found = null;
      for (const departure of event.departures || []) {
        const crew = (departure.crews || []).find(item => item.id === crewId);
        if (crew) { found = {departure,crew}; break; }
      }
      if (!found) throw new Error('Équipage introuvable. Actualise la page.');
      if (found.departure.startsAt <= Date.now()) throw new Error('Ce départ est passé. L’équipage est verrouillé.');
      builderState = {
        mode:'edit', eventId, crewId:found.crew.id, version:found.crew.version,
        departureId:found.departure.id, category:found.crew.category, car:found.crew.car || '',
        name:found.crew.name, locked:!!found.crew.locked,
        registrationIds:[...(found.crew.registrationIds || [])]
      };
    } else {
      const departure = defaultDeparture(event);
      if (!departure) throw new Error('Tous les départs de cet événement sont déjà passés.');
      builderState = {mode:'create',eventId,departureId:departure.id,category:event.categories[0] || '',car:'',name:'',locked:false,registrationIds:[]};
    }

    renderPanel(event,{scroll:true});
    builderPanel?.querySelector('[name="builderName"]')?.focus({preventScroll:true});
  } catch (error) {
    pendingMessage = {error:true,text:error?.message || 'Impossible d’ouvrir l’éditeur d’équipage.'};
    insertPendingMessage();
  }
}

async function createCrew() {
  const result = await api(`/api/events/${builderState.eventId}/departures/${builderState.departureId}/crews`,'POST',{
    name:builderState.name,
    category:builderState.category,
    car:builderState.car
  });
  const createdId = result.id;
  let removedRegistrations = 0;
  if (builderState.registrationIds.length) {
    const events = await loadEvents(true);
    const event = events.find(item => item.id === builderState.eventId);
    const departure = event?.departures?.find(item => item.id === builderState.departureId);
    const crew = departure?.crews?.find(item => item.id === createdId);
    if (!crew) throw new Error('L’équipage a été créé mais doit être actualisé avant d’y affecter les pilotes.');
    let version = crew.version;
    for (const registrationId of builderState.registrationIds) {
      const memberResult = await api(`/api/crews/${createdId}/members`,'POST',{registrationId,version});
      removedRegistrations += Number(memberResult.removedRegistrations) || 0;
      version += 1;
    }
  }
  return {createdId,removedRegistrations};
}

async function editCrew() {
  const events = await loadEvents(true);
  const event = events.find(item => item.id === builderState.eventId);
  const departure = event?.departures?.find(item => item.id === builderState.departureId);
  const crew = departure?.crews?.find(item => item.id === builderState.crewId);
  if (!crew) throw new Error('Équipage introuvable. Actualise la page.');

  await api(`/api/crews/${crew.id}`,'PATCH',{
    name:builderState.name,
    category:builderState.category,
    car:builderState.car,
    version:crew.version
  });

  if (crew.locked) return {removedRegistrations:0};

  let version = crew.version + 1;
  const current = new Set(crew.registrationIds || []);
  const wanted = new Set(builderState.registrationIds || []);
  for (const registrationId of current) {
    if (wanted.has(registrationId)) continue;
    await api(`/api/crews/${crew.id}/members/${registrationId}`,'DELETE',{version});
    version += 1;
  }

  let removedRegistrations = 0;
  for (const registrationId of wanted) {
    if (current.has(registrationId)) continue;
    const memberResult = await api(`/api/crews/${crew.id}/members`,'POST',{registrationId,version});
    removedRegistrations += Number(memberResult.removedRegistrations) || 0;
    version += 1;
  }
  return {removedRegistrations};
}

async function submitBuilder(form) {
  if (submitting || !builderState) return;
  submitting = true;
  const submit = form.querySelector('[data-crew-builder-submit]');
  if (submit) submit.disabled = true;
  const mode = builderState.mode;
  try {
    builderState.name = form.elements.builderName.value.trim();
    builderState.car = form.elements.builderCar.value;
    if (!builderState.name) throw new Error('Indique le nom de l’équipage.');
    const result = mode === 'edit' ? await editCrew() : await createCrew();
    const suffix = result.removedRegistrations ? ` ${result.removedRegistrations} autre(s) inscription(s) du même départ ont été retirées.` : '';
    pendingMessage = {error:false,text:mode === 'edit' ? `Équipage « ${builderState.name} » mis à jour.${suffix}` : `Équipage « ${builderState.name} » créé.${suffix}`};
    closeBuilder();
    await refreshMainView();
  } catch (error) {
    showBuilderError(error?.message || `Impossible de ${mode === 'edit' ? 'modifier' : 'créer'} cet équipage.`);
  } finally {
    submitting = false;
    if (submit?.isConnected) submit.disabled = false;
  }
}

document.addEventListener('click', event => {
  const create = event.target.closest('[data-crew-builder-open]');
  if (create) {
    event.preventDefault();
    void openBuilder();
    return;
  }
  const edit = event.target.closest('[data-action="edit-crew"]');
  if (edit) {
    event.preventDefault();
    event.stopPropagation();
    void openBuilder(edit.dataset.id);
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
  if (field.name === 'builderDeparture' && builderState.mode !== 'edit') {
    builderState.departureId = field.value;
    builderState.registrationIds = [];
    renderPanel(currentEvent);
    return;
  }
  if (field.name === 'builderCategory' && !builderState.locked) {
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
  if (field.name === 'builderPilot' && !builderState.locked) {
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
  void submitBuilder(form);
});

document.addEventListener('endurance:render', decorateEventView);
if (app) queueMicrotask(decorateEventView);
