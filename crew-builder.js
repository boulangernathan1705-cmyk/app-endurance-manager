import {CARS} from './shared/catalog.mjs';
import {dateLabel} from './front/schedule.mjs';
import {renderAvailabilityTimeline} from './front/timeline.mjs';

const app = document.getElementById('app');
let eventsCache = null;
let sessionCache = null;
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

async function loadSession() {
  if (!sessionCache) sessionCache = await api('/api/session');
  return sessionCache;
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
  return open?.id?.replace(/^departure-/, '') || '';
}

function defaultDeparture(event, preferredId = '') {
  const future = futureDepartures(event);
  const visibleId = preferredId || currentOpenDepartureId();
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

function assignedIds(departure, exceptCrewId = null) {
  return new Set((departure?.crews || []).filter(crew => crew.id !== exceptCrewId).flatMap(crew => crew.registrationIds || []));
}

function ownAvailableRegistrations(departure) {
  const assigned = assignedIds(departure);
  return (departure?.availability || []).filter(registration => registration.mine && registration.status !== 'unavailable' && !assigned.has(registration.id));
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
    ? 'Aucun pilote sélectionné.'
    : coverage.missing
      ? `${coverage.missing} h de course ${coverage.missing > 1 ? 'ne sont' : 'n’est'} pas encore couverte${coverage.missing > 1 ? 's' : ''}.`
      : 'Toutes les heures de course sont couvertes par la sélection actuelle.';
  return `<div class="crew-builder-coverage-heading"><div><span class="crew-builder-step-label">COUVERTURE PRÉVUE</span><strong>${coverage.covered}/${coverage.duration} h couvertes</strong></div><span>${selectedCount} pilote${selectedCount > 1 ? 's' : ''}</span></div>
    ${renderAvailabilityTimeline({departure,duration:coverage.duration,counts:coverage.counts,label:'Couverture prévue de l’équipage'})}
    <p class="crew-builder-coverage-message ${coverage.missing && selectedCount ? 'needs-pilots' : ''}">${esc(message)}</p>`;
}

function pilotCard(event, departure, registration, disabled = false, required = false) {
  const checked = builderState.registrationIds.includes(registration.id);
  const lock = disabled || required;
  return `<label class="crew-builder-pilot ${checked ? 'is-selected' : ''}${lock ? ' is-locked' : ''}">
    <span class="crew-builder-pilot-head"><input type="checkbox" name="builderPilot" value="${registration.id}" ${checked ? 'checked' : ''} ${lock ? 'disabled' : ''}><span><strong>${esc(registration.name)}</strong>${required?'<em>Responsable de l’équipage</em>':''}<small>${esc(registrationCarLabel(registration))}</small></span></span>
    <span class="crew-builder-pilot-wish">Coéquipier souhaité : <strong>${esc(registration.preferredPilot || 'aucune préférence')}</strong></span>
    ${renderAvailabilityTimeline({departure,duration:event.durationHours || 6,status:registration.status,label:`Disponibilités de ${registration.name}`})}
  </label>`;
}

function submitLabel() {
  const count = builderState?.registrationIds?.length || 0;
  if (builderState?.mode === 'edit') return `Enregistrer l’équipage${count ? ` · ${count} pilote${count > 1 ? 's' : ''}` : ''}`;
  return `Créer l’équipage${count ? ` · ${count} pilote${count > 1 ? 's' : ''}` : ''}`;
}

function createCategories(event, departure) {
  if (builderState.manager) return event.categories;
  return [...new Set(ownAvailableRegistrations(departure).map(reg => reg.category))];
}

function panelMarkup(event) {
  const editMode = builderState.mode === 'edit';
  const departure = futureDepartures(event).find(item => item.id === builderState.departureId);
  if (!departure) return `<section class="crew-builder-panel"><div class="crew-builder-heading"><div><span class="creation-kicker">FORMATION D’ÉQUIPAGE</span><h2>Aucun départ disponible</h2></div><button type="button" class="secondary-button" data-crew-builder-cancel>Fermer</button></div><p class="creation-help">Ce départ est déjà passé.</p></section>`;
  const categories = editMode ? event.categories : createCategories(event,departure);
  if (!categories.includes(builderState.category)) builderState.category = categories[0] || '';
  if (!(CARS[builderState.category] || []).includes(builderState.car)) builderState.car = '';
  if (!builderState.category) return `<section class="crew-builder-panel"><div class="crew-builder-heading"><div><span class="creation-kicker">FORMATION D’ÉQUIPAGE</span><h2>Inscription nécessaire</h2><p>Inscris-toi d’abord sur ce départ pour pouvoir créer ton équipage.</p></div><button type="button" class="secondary-button" data-crew-builder-cancel>Fermer</button></div></section>`;
  const candidates = availableCandidates(event, departure, builderState.category, editMode ? builderState.crewId : null);
  const ownerRegistration = !builderState.manager && !editMode ? candidates.find(reg => reg.mine) : null;
  if (ownerRegistration) builderState.ownerRegistrationId = ownerRegistration.id;
  if (!builderState.locked) {
    builderState.registrationIds = builderState.registrationIds.filter(id => candidates.some(candidate => candidate.id === id));
    if (builderState.ownerRegistrationId && candidates.some(candidate => candidate.id === builderState.ownerRegistrationId) && !builderState.registrationIds.includes(builderState.ownerRegistrationId)) builderState.registrationIds.unshift(builderState.ownerRegistrationId);
  }
  const memberCategoryLocked = editMode && builderState.originalRegistrationIds.length > 0;
  const categoryDisabled = builderState.locked || memberCategoryLocked;
  const title = editMode ? `Gérer « ${esc(builderState.name || 'Équipage')} »` : builderState.manager ? 'Créer un nouvel équipage' : 'Créer mon équipage';
  const description = editMode
    ? 'Modifie le nom, la voiture et la composition. Les organisateurs gardent toujours un droit de supervision.'
    : builderState.manager
      ? 'Crée l’équipage sur ce départ puis choisis les pilotes déjà inscrits.'
      : 'Tu deviens responsable de l’équipage et tu y es ajouté automatiquement.';
  const lockedNote = builderState.locked ? '<p class="crew-builder-warning">Cet équipage est marqué complet. Rouvre-le depuis sa carte avant de modifier sa composition.</p>' : '';
  const categoryNote = memberCategoryLocked && !builderState.locked ? '<p class="crew-builder-help">Pour changer de catégorie, retire d’abord tous les pilotes de cet équipage.</p>' : '';

  return `<section class="crew-builder-panel" data-crew-builder-panel>
    <div class="crew-builder-heading"><div><span class="creation-kicker">FORMATION D’ÉQUIPAGE</span><h2>${title}</h2><p>${description}</p></div><button type="button" class="secondary-button" data-crew-builder-cancel>Annuler</button></div>
    <form class="crew-builder-form" data-crew-builder-form>
      <section class="crew-builder-card"><div class="crew-builder-card-title"><span>01</span><div><h3>Équipage</h3><p>${esc(dateLabel(departure))} · départ ${esc(departure.time)}</p></div></div>
        <div class="crew-builder-fields">
          <label>Départ<input value="${esc(dateLabel(departure))} · ${esc(departure.time)}" disabled></label>
          <label>Catégorie<select name="builderCategory" ${categoryDisabled?'disabled':''}>${categories.map(category => `<option value="${esc(category)}" ${category === builderState.category ? 'selected' : ''}>${esc(category)}</option>`).join('')}</select></label>
          <label>Nom de l’équipage<input name="builderName" maxlength="60" required value="${esc(builderState.name)}" placeholder="Ex. FMT Racing 1"></label>
          <label>Voiture<select name="builderCar"><option value="">Voiture à définir</option>${(CARS[builderState.category] || []).map(car => `<option value="${esc(car)}" ${car === builderState.car ? 'selected' : ''}>${esc(car)}</option>`).join('')}</select></label>
        </div>${categoryNote}
      </section>
      <section class="crew-builder-card"><div class="crew-builder-card-title"><span>02</span><div><h3>Composition</h3><p>${editMode?'Coche ou décoche les pilotes que tu veux dans cet équipage.':'Tu peux ajouter dès maintenant d’autres pilotes inscrits dans la même catégorie.'}</p></div></div>
        ${lockedNote}
        <div class="crew-builder-pilots">${candidates.length ? candidates.map(registration => pilotCard(event,departure,registration,builderState.locked,registration.id===builderState.ownerRegistrationId)).join('') : '<p class="crew-builder-empty">Aucun pilote disponible dans cette catégorie pour ce départ.</p>'}</div>
        ${!builderState.locked ? '<p class="crew-builder-warning">Un pilote ne peut appartenir qu’à un équipage sur un même départ. Son affectation remplace ses autres inscriptions de catégorie sur ce départ.</p>' : ''}
      </section>
      <section class="crew-builder-card crew-builder-coverage" data-crew-builder-coverage>${coverageMarkup(event,departure)}</section>
      <div class="crew-builder-actions"><span class="crew-builder-submit-note">Les inscriptions des pilotes restent conservées lorsqu’ils quittent un équipage.</span><button type="submit" class="primary-button" data-crew-builder-submit>${submitLabel()}</button></div>
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

async function openBuilder(crewId = null, preferredDepartureId = '') {
  const eventId = currentEventId();
  if (!eventId) return;
  try {
    const [events,session] = await Promise.all([loadEvents(),loadSession()]);
    const event = events.find(item => item.id === eventId);
    if (!event) throw new Error('Événement introuvable. Actualise la page.');
    if (!session.user) throw new Error('Connecte-toi avec Discord pour gérer un équipage.');
    const manager=['admin','organizer'].includes(session.user.role);

    if (crewId) {
      let found = null;
      for (const departure of event.departures || []) {
        const crew = (departure.crews || []).find(item => item.id === crewId);
        if (crew) { found = {departure,crew}; break; }
      }
      if (!found) throw new Error('Équipage introuvable. Actualise la page.');
      if (!found.crew.canManage) throw new Error('Tu n’es pas responsable de cet équipage.');
      if (found.departure.startsAt <= Date.now()) throw new Error('Ce départ est passé. L’équipage est verrouillé.');
      builderState = {
        mode:'edit', eventId, manager, crewId:found.crew.id, version:found.crew.version,
        departureId:found.departure.id, category:found.crew.category, car:found.crew.car || '',
        name:found.crew.name, locked:!!found.crew.locked, ownerRegistrationId:null,
        registrationIds:[...(found.crew.registrationIds || [])], originalRegistrationIds:[...(found.crew.registrationIds || [])]
      };
    } else {
      const departure = defaultDeparture(event,preferredDepartureId);
      if (!departure) throw new Error('Tous les départs de cet événement sont déjà passés.');
      const own=ownAvailableRegistrations(departure);
      if (!manager && !own.length) throw new Error('Inscris-toi d’abord sur ce départ avant de créer ton équipage.');
      const category=manager ? (event.categories[0] || '') : own[0].category;
      const ownerRegistrationId=manager ? null : own.find(reg=>reg.category===category)?.id || null;
      builderState = {mode:'create',eventId,manager,departureId:departure.id,category,car:'',name:'',locked:false,ownerRegistrationId,registrationIds:ownerRegistrationId?[ownerRegistrationId]:[],originalRegistrationIds:[]};
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
  let removedRegistrations = Number(result.removedRegistrations) || 0;
  const alreadyAdded = new Set(result.joined && builderState.ownerRegistrationId ? [builderState.ownerRegistrationId] : []);
  const wanted = builderState.registrationIds.filter(id => !alreadyAdded.has(id));
  if (wanted.length) {
    const events = await loadEvents(true);
    const event = events.find(item => item.id === builderState.eventId);
    const departure = event?.departures?.find(item => item.id === builderState.departureId);
    const crew = departure?.crews?.find(item => item.id === createdId);
    if (!crew) throw new Error('L’équipage a été créé mais doit être actualisé avant d’y ajouter les autres pilotes.');
    let version = crew.version;
    for (const registrationId of wanted) {
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
  if (!crew.canManage) throw new Error('Tu n’es pas responsable de cet équipage.');

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
  let removedRegistrations = 0;

  for (const registrationId of wanted) {
    if (current.has(registrationId)) continue;
    const memberResult = await api(`/api/crews/${crew.id}/members`,'POST',{registrationId,version});
    removedRegistrations += Number(memberResult.removedRegistrations) || 0;
    version += 1;
  }
  for (const registrationId of current) {
    if (wanted.has(registrationId)) continue;
    await api(`/api/crews/${crew.id}/members/${registrationId}`,'DELETE',{version});
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
    void openBuilder(null,create.dataset.departure || '');
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
  if (field.name === 'builderCategory' && !builderState.locked) {
    builderState.category = field.value;
    builderState.car = '';
    const departure=currentEvent.departures.find(item=>item.id===builderState.departureId);
    builderState.ownerRegistrationId=!builderState.manager&&builderState.mode==='create'?ownAvailableRegistrations(departure).find(reg=>reg.category===field.value)?.id||null:null;
    builderState.registrationIds=builderState.ownerRegistrationId?[builderState.ownerRegistrationId]:[];
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
    if(builderState.ownerRegistrationId)ids.add(builderState.ownerRegistrationId);
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
