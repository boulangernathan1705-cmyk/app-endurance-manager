import {CARS, categories} from '../shared/catalog.mjs';

const app = document.getElementById('app');
let sessionUser = null;
let participants = [];
let decorateQueued = false;
const editorStates = new Map();

const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

async function api(path, method = 'GET', data) {
  const response = await fetch(path, {
    method,
    credentials:'same-origin',
    cache:'no-store',
    headers:method === 'GET' ? {} : {'Content-Type':'application/json'},
    body:method === 'GET' ? undefined : JSON.stringify(data || {})
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'Cette action a échoué.');
  return result;
}

function eventContext(departureId) {
  const data = app?.eventViewData;
  const event = data?.events?.find(item => item.id === data.eventId);
  const departure = event?.departures?.find(item => item.id === departureId);
  return {event, departure};
}

function registrationById(departureId, registrationId) {
  return eventContext(departureId).departure?.availability?.find(reg => reg.id === registrationId) || null;
}

function statusHours(status, duration) {
  if (status === 'whole') return new Set(Array.from({length:duration}, (_, index) => index + 1));
  return new Set(String(status || '').split(',').map(part => /^h\d+$/.test(part) ? Number(part.slice(1)) : 0).filter(hour => hour >= 1 && hour <= duration));
}

function statusFromHours(hours, duration) {
  if (hours.size === duration) return 'whole';
  return [...hours].sort((a,b) => a-b).map(hour => `h${hour}`).join(',');
}

function stateForAdd(event, departure) {
  return {
    mode:'add',
    departureId:departure.id,
    eventId:event.id,
    participantUserId:'',
    name:'',
    category:'',
    cars:[],
    carAny:false,
    status:'',
    preferredPilot:''
  };
}

function stateForEdit(event, departure, reg) {
  return {
    mode:'edit',
    departureId:departure.id,
    eventId:event.id,
    id:reg.id,
    version:reg.version,
    participantId:reg.participantId,
    discordLinked:!!reg.discordLinked,
    name:reg.name,
    category:reg.category,
    cars:[...(reg.cars || [])],
    carAny:!!reg.carAny,
    status:reg.status,
    preferredPilot:reg.preferredPilot || '',
    addedByName:reg.addedByName || ''
  };
}

function categoryButtons(event, state) {
  return event.categories.map(category => {
    const css = categories[category]?.css || '';
    return `<button type="button" class="category-button ${css} ${state.category === category ? 'active' : ''}" data-registration-category="${esc(category)}" aria-pressed="${state.category === category}"><span>${esc(category)}</span></button>`;
  }).join('');
}

function carChoices(state) {
  if (!state.category) return '';
  const cars = CARS[state.category] || [];
  return `<fieldset class="car-preference-panel registration-sharing-cars"><legend class="form-label">Voiture(s) souhaitée(s)</legend>
    <label class="car-any-option"><input type="checkbox" data-registration-car-any ${state.carAny ? 'checked' : ''}><span>Peu importe la voiture</span></label>
    <div class="car-preference-grid">${cars.map(car => `<label class="car-preference-option"><input type="checkbox" data-registration-car value="${esc(car)}" ${state.cars.includes(car) && !state.carAny ? 'checked' : ''} ${state.carAny ? 'disabled' : ''}><span>${esc(car)}</span></label>`).join('')}</div>
  </fieldset>`;
}

function availabilityChoices(state, departure, duration) {
  const hours = statusHours(state.status, duration);
  return `<div class="registration-sharing-availability"><span class="form-label">Heures de présence (${duration} h)</span><p class="availability-hint">Sélectionne les créneaux où le pilote sera disponible.</p>
    <div class="registration-sharing-hours">${Array.from({length:duration}, (_, index) => {
      const hour = index + 1;
      return `<button type="button" class="registration-sharing-hour ${hours.has(hour) ? 'active' : ''}" data-registration-hour="${hour}" aria-pressed="${hours.has(hour)}"><span>H${hour}</span><small>Heure ${hour}</small></button>`;
    }).join('')}</div>
    <button type="button" class="special-button whole ${hours.size === duration ? 'active' : ''}" data-registration-whole aria-pressed="${hours.size === duration}">TOUTE LA COURSE</button>
  </div>`;
}

function identityFields(state) {
  if (state.mode === 'edit') {
    return state.discordLinked
      ? `<div class="registration-sharing-identity is-linked"><span>Compte Discord</span><strong>${esc(state.name)}</strong></div>`
      : `<label class="form-label">Pseudo du pilote<input name="sharingPilotName" maxlength="30" value="${esc(state.name)}" required autocomplete="nickname"></label>`;
  }

  const options = participants.filter(participant => participant.id !== sessionUser?.id);
  const selected = options.find(participant => participant.id === state.participantUserId);
  return `<section class="registration-sharing-identity-picker">
    <label class="form-label">Pilote<select data-registration-person><option value="">Autre pilote · pseudo manuel</option>${options.map(participant => `<option value="${esc(participant.id)}" ${participant.id === state.participantUserId ? 'selected' : ''}>${esc(participant.name)}</option>`).join('')}</select></label>
    ${selected
      ? `<div class="registration-sharing-identity is-linked"><span>Compte Discord sélectionné</span><strong>${esc(selected.name)}</strong><small>Le pilote et toi pourrez modifier cette inscription.</small></div>`
      : `<label class="form-label">Pseudo du pilote<input name="sharingPilotName" maxlength="30" value="${esc(state.name)}" required autocomplete="nickname" placeholder="Pseudo du pilote"></label>`}
  </section>`;
}

function editorMarkup(event, departure, state) {
  const duration = event.durationHours || 6;
  const title = state.mode === 'edit' ? `Modifier l’inscription · ${state.name}` : 'Ajouter un pilote';
  const origin = state.addedByName ? `<span class="registration-origin-info" title="Inscription ajoutée par ${esc(state.addedByName)}" aria-label="Inscription ajoutée par ${esc(state.addedByName)}">ⓘ</span>` : '';
  return `<form class="form-section registration-form registration-sharing-editor" data-registration-sharing-editor data-departure="${esc(departure.id)}">
    <div class="registration-sharing-editor-head"><div><span class="registration-sharing-kicker">${state.mode === 'edit' ? 'MODIFICATION' : 'NOUVELLE INSCRIPTION'}</span><h3>${esc(title)} ${origin}</h3></div><button type="button" class="secondary-button" data-registration-editor-close>Annuler</button></div>
    ${identityFields(state)}
    <label class="form-label">Pilote souhaité dans le même équipage <span class="muted">(facultatif)</span><input name="sharingPreferredPilot" maxlength="30" value="${esc(state.preferredPilot)}" placeholder="Pseudo du pilote souhaité"></label>
    ${availabilityChoices(state, departure, duration)}
    <div class="category-area"><span class="form-label">Catégorie</span><div class="categories">${categoryButtons(event, state)}</div>${carChoices(state)}</div>
    <p class="creation-error" data-registration-editor-error role="alert" hidden></p>
    <div class="save-row"><button type="submit" class="save-button">${state.mode === 'edit' ? 'ENREGISTRER LES MODIFICATIONS' : 'AJOUTER LE PILOTE'}</button></div>
  </form>`;
}

function registrationSection(departureId) {
  return document.getElementById(`departure-${departureId}`)?.querySelector('.fold-registration') || null;
}

function renderEditor(departureId) {
  const state = editorStates.get(departureId);
  if (!state) return;
  const {event, departure} = eventContext(departureId);
  const section = registrationSection(departureId);
  const legacyForm = section?.querySelector(':scope > .registration-form:not(.registration-sharing-editor)');
  if (!event || !departure || !section || !legacyForm) return;

  section.querySelector(':scope > .registration-sharing-editor')?.remove();
  legacyForm.hidden = true;
  section.dataset.registrationSharingEditing = 'true';
  const toolbar = section.querySelector(':scope > .registration-workspace-actions');
  toolbar?.setAttribute('data-editor-open', 'true');
  legacyForm.insertAdjacentHTML('beforebegin', editorMarkup(event, departure, state));
  section.querySelector('[data-registration-sharing-editor] input, [data-registration-sharing-editor] select')?.focus({preventScroll:true});
}

function closeEditor(departureId) {
  editorStates.delete(departureId);
  const section = registrationSection(departureId);
  if (!section) return;
  section.querySelector(':scope > .registration-sharing-editor')?.remove();
  const legacy = section.querySelector(':scope > .registration-form');
  if (legacy) legacy.hidden = false;
  delete section.dataset.registrationSharingEditing;
  section.querySelector(':scope > .registration-workspace-actions')?.removeAttribute('data-editor-open');
}

function openAddEditor(departureId) {
  const {event, departure} = eventContext(departureId);
  if (!event || !departure || departure.startsAt <= Date.now()) return;
  editorStates.set(departureId, stateForAdd(event, departure));
  renderEditor(departureId);
}

function openEditEditor(departureId, registrationId) {
  const {event, departure} = eventContext(departureId);
  const reg = registrationById(departureId, registrationId);
  if (!event || !departure || !reg?.canEdit || departure.startsAt <= Date.now()) return;
  editorStates.set(departureId, stateForEdit(event, departure, reg));
  renderEditor(departureId);
}

function nativeAction(action, departureId) {
  const proxy = document.createElement('button');
  proxy.type = 'button';
  proxy.hidden = true;
  proxy.dataset.action = action;
  proxy.dataset.departure = departureId;
  app.append(proxy);
  proxy.click();
  proxy.remove();
}

function decorateRegistrationSection(section) {
  if (!(section instanceof HTMLElement)) return;
  const fold = section.closest('.departure-fold');
  const departureId = fold?.id?.replace(/^departure-/, '') || '';
  if (!departureId) return;
  const {departure} = eventContext(departureId);
  const form = section.querySelector(':scope > .registration-form:not(.registration-sharing-editor)');
  if (!form || !departure) return;

  const title = section.querySelector(':scope > h2');
  const oldActions = form.querySelector('.registration-form-actions');
  if (!sessionUser) {
    if (title) title.textContent = 'Mon inscription';
    return;
  }
  if (title) title.textContent = 'Inscriptions';

  let toolbar = section.querySelector(':scope > .registration-workspace-actions');
  if (!toolbar) {
    toolbar = document.createElement('div');
    toolbar.className = 'registration-workspace-actions';
    toolbar.innerHTML = `<button type="button" class="secondary-button registration-workspace-self" data-registration-self="${esc(departureId)}">Mon inscription</button><button type="button" class="primary-button registration-workspace-add" data-registration-add="${esc(departureId)}">+ Ajouter un pilote</button>`;
    title?.insertAdjacentElement('afterend', toolbar);
  }

  const categoryButton = oldActions?.querySelector('.category-add-button');
  if (categoryButton && !toolbar.querySelector('.category-add-button')) toolbar.append(categoryButton);
  if (oldActions) oldActions.hidden = true;
  toolbar.querySelector('[data-registration-add]')?.toggleAttribute('disabled', departure.startsAt <= Date.now());

  if (editorStates.has(departureId) && !section.querySelector(':scope > .registration-sharing-editor')) renderEditor(departureId);
}

function decorateOriginInfo(root = app) {
  root?.querySelectorAll?.('.pilot-row [data-action="edit-registration"][data-id][data-departure]').forEach(button => {
    const reg = registrationById(button.dataset.departure, button.dataset.id);
    const name = button.closest('.pilot-row')?.querySelector('.pilot-name');
    if (!reg?.addedByName || !name || name.querySelector('.registration-origin-info')) return;
    const info = document.createElement('span');
    info.className = 'registration-origin-info';
    info.textContent = 'ⓘ';
    info.title = `Inscription ajoutée par ${reg.addedByName}`;
    info.setAttribute('aria-label', info.title);
    name.append(' ', info);
  });
}

function decorate() {
  if (!app) return;
  app.querySelectorAll('.fold-registration').forEach(decorateRegistrationSection);
  decorateOriginInfo(app);
}

function scheduleDecorate() {
  if (decorateQueued) return;
  decorateQueued = true;
  queueMicrotask(() => {
    decorateQueued = false;
    decorate();
  });
}

function restoreAfterRefresh(departureId) {
  const observer = new MutationObserver(() => {
    const fold = document.getElementById(`departure-${departureId}`);
    if (!fold) return;
    fold.open = true;
    observer.disconnect();
    scheduleDecorate();
    fold.querySelector('.fold-registration')?.scrollIntoView({block:'start'});
  });
  observer.observe(app, {childList:true, subtree:true});
  const refresh = app.querySelector('[data-action="refresh"]');
  if (refresh) refresh.click();
  else location.reload();
  setTimeout(() => observer.disconnect(), 3000);
}

async function submitEditor(form) {
  const departureId = form.dataset.departure;
  const state = editorStates.get(departureId);
  const {event, departure} = eventContext(departureId);
  if (!state || !event || !departure) return;

  const error = form.querySelector('[data-registration-editor-error]');
  if (error) error.hidden = true;
  const manualName = form.elements.sharingPilotName?.value.trim();
  const selected = participants.find(participant => participant.id === state.participantUserId);
  const name = state.mode === 'edit' && state.discordLinked ? state.name : (selected?.name || manualName || state.name);
  const preferredPilot = form.elements.sharingPreferredPilot?.value.trim() || '';
  if (!name) throw new Error('Indique le pseudo du pilote ou sélectionne son compte Discord.');
  if (!state.status) throw new Error('Choisis au moins une heure de disponibilité.');
  if (!state.category) throw new Error('Choisis une catégorie.');

  const cars = [...form.querySelectorAll('[data-registration-car]:checked')].map(input => input.value);
  const carAny = !!form.querySelector('[data-registration-car-any]')?.checked;
  if (!carAny && !cars.length) throw new Error('Choisis au moins une voiture, ou coche « Peu importe la voiture ».');

  const payload = {name,status:state.status,category:state.category,cars,carAny,preferredPilot};
  let path;
  let method;
  if (state.mode === 'edit') {
    path = `/api/registrations/${state.id}`;
    method = 'PATCH';
    payload.version = state.version;
  } else {
    path = `/api/events/${event.id}/departures/${departure.id}/registrations`;
    method = 'POST';
    payload.forOther = true;
    if (state.participantUserId) payload.participantUserId = state.participantUserId;
  }

  const submit = form.querySelector('[type="submit"]');
  if (submit) submit.disabled = true;
  try {
    await api(path, method, payload);
    editorStates.delete(departureId);
    restoreAfterRefresh(departureId);
  } finally {
    if (submit?.isConnected) submit.disabled = false;
  }
}

document.addEventListener('click', event => {
  const edit = event.target.closest?.('[data-action="edit-registration"][data-id][data-departure]');
  if (edit && app?.contains(edit)) {
    const reg = registrationById(edit.dataset.departure, edit.dataset.id);
    if (!reg?.canEdit) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    openEditEditor(edit.dataset.departure, edit.dataset.id);
    return;
  }

  const add = event.target.closest?.('[data-registration-add]');
  if (add) {
    event.preventDefault();
    openAddEditor(add.dataset.registrationAdd);
    return;
  }

  const self = event.target.closest?.('[data-registration-self]');
  if (self) {
    event.preventDefault();
    closeEditor(self.dataset.registrationSelf);
    nativeAction('my-registration', self.dataset.registrationSelf);
    return;
  }

  const close = event.target.closest?.('[data-registration-editor-close]');
  if (close) {
    event.preventDefault();
    closeEditor(close.closest('[data-registration-sharing-editor]')?.dataset.departure || '');
    return;
  }

  const category = event.target.closest?.('[data-registration-category]');
  if (category) {
    event.preventDefault();
    const form = category.closest('[data-registration-sharing-editor]');
    const state = editorStates.get(form?.dataset.departure);
    if (!state) return;
    const next = category.dataset.registrationCategory;
    if (state.category !== next) {
      state.category = next;
      state.cars = [];
      state.carAny = false;
    }
    renderEditor(form.dataset.departure);
    return;
  }

  const hourButton = event.target.closest?.('[data-registration-hour]');
  if (hourButton) {
    event.preventDefault();
    const form = hourButton.closest('[data-registration-sharing-editor]');
    const state = editorStates.get(form?.dataset.departure);
    const {event:currentEvent} = eventContext(form?.dataset.departure);
    if (!state || !currentEvent) return;
    const duration = currentEvent.durationHours || 6;
    const hours = statusHours(state.status, duration);
    const hour = Number(hourButton.dataset.registrationHour);
    hours.has(hour) ? hours.delete(hour) : hours.add(hour);
    state.status = statusFromHours(hours, duration);
    renderEditor(form.dataset.departure);
    return;
  }

  const whole = event.target.closest?.('[data-registration-whole]');
  if (whole) {
    event.preventDefault();
    const form = whole.closest('[data-registration-sharing-editor]');
    const state = editorStates.get(form?.dataset.departure);
    if (!state) return;
    state.status = 'whole';
    renderEditor(form.dataset.departure);
  }
}, true);

document.addEventListener('input', event => {
  const form = event.target.closest?.('[data-registration-sharing-editor]');
  const state = editorStates.get(form?.dataset.departure);
  if (!form || !state) return;
  if (event.target.name === 'sharingPilotName') state.name = event.target.value;
  if (event.target.name === 'sharingPreferredPilot') state.preferredPilot = event.target.value;
});

document.addEventListener('change', event => {
  const person = event.target.closest?.('[data-registration-person]');
  if (person) {
    const form = person.closest('[data-registration-sharing-editor]');
    const state = editorStates.get(form?.dataset.departure);
    if (!state) return;
    state.participantUserId = person.value;
    const participant = participants.find(item => item.id === person.value);
    state.name = participant?.name || '';
    renderEditor(form.dataset.departure);
    return;
  }

  const car = event.target.closest?.('[data-registration-car]');
  if (car) {
    const form = car.closest('[data-registration-sharing-editor]');
    const state = editorStates.get(form?.dataset.departure);
    if (!state) return;
    state.cars = [...form.querySelectorAll('[data-registration-car]:checked')].map(input => input.value);
    return;
  }

  const any = event.target.closest?.('[data-registration-car-any]');
  if (any) {
    const form = any.closest('[data-registration-sharing-editor]');
    const state = editorStates.get(form?.dataset.departure);
    if (!state) return;
    state.carAny = any.checked;
    if (state.carAny) state.cars = [];
    renderEditor(form.dataset.departure);
  }
});

document.addEventListener('submit', event => {
  const form = event.target.closest?.('[data-registration-sharing-editor]');
  if (!form) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  submitEditor(form).catch(error => {
    const box = form.querySelector('[data-registration-editor-error]');
    if (box) {
      box.textContent = error?.message || 'Cette action a échoué.';
      box.hidden = false;
      box.focus?.();
    }
  });
}, true);

async function start() {
  try {
    const session = await api('/api/session');
    sessionUser = session.user || null;
    if (sessionUser) {
      const result = await api('/api/participants');
      participants = result.participants || [];
    }
  } catch {
    sessionUser = null;
    participants = [];
  }
  decorate();
  if (app) new MutationObserver(scheduleDecorate).observe(app, {childList:true, subtree:true});
}

void start();
