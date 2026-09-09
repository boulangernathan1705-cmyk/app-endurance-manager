const app = document.getElementById('app');
let crewEvents = null;
let crewEventsPromise = null;
let refreshTimer = null;
const accordionStates = new Map();
let accordionEventId = null;

function pilotNameFromRow(row) {
  const name = row.querySelector('.pilot-name');
  if (!name) return '';
  return Array.from(name.childNodes)
    .filter(node => node.nodeType === Node.TEXT_NODE)
    .map(node => node.textContent.trim())
    .filter(Boolean)
    .join(' ')
    .trim();
}

function addText(parent, className, text, strong = false) {
  const element = document.createElement('span');
  element.className = className;
  const child = strong ? document.createElement('strong') : document.createTextNode(text);
  if (strong) child.textContent = text;
  element.append(child);
  parent.append(element);
  return element;
}

function categoryNameFromGroup(group) {
  const text = group.closest('.category-group')?.querySelector(':scope > .category-group-header span')?.textContent || '';
  return text.split('·')[0].trim();
}

function departureIdFrom(element) {
  const fold = element.closest('.departure-fold');
  if (!fold?.id) return '';
  return fold.id.replace(/^crew-departure-/, '').replace(/^departure-/, '');
}

function normalize(value) {
  return String(value || '').trim().toLocaleLowerCase('fr-FR');
}

function sameNames(left, right) {
  const a = [...left].map(normalize).sort();
  const b = [...right].map(normalize).sort();
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function coversHour(registration, index) {
  return registration?.status === 'whole' || String(registration?.status || '').split(',').includes(`h${index + 1}`);
}

function coverageFor(event, departure, crew) {
  const duration = Number(event?.durationHours) || 6;
  const registrations = (crew?.registrationIds || [])
    .map(id => departure?.availability?.find(registration => registration.id === id))
    .filter(Boolean);
  const counts = Array.from({length: duration}, (_, index) => registrations.filter(registration => coversHour(registration, index)).length);
  const covered = counts.filter(Boolean).length;
  return {duration, covered, missing: Math.max(0, duration - covered), registrations};
}

async function loadCrewEvents(force = false) {
  if (!force && app?.querySelector('[data-event-id]') && app.eventViewData) return app.eventViewData.events;
  if (!force && crewEvents) return crewEvents;
  if (!force && crewEventsPromise) return crewEventsPromise;
  crewEventsPromise = fetch('/api/events', {credentials: 'same-origin', cache: 'no-store'})
    .then(async response => {
      if (!response.ok) throw new Error('Impossible de charger les équipages.');
      const result = await response.json();
      crewEvents = Array.isArray(result.events) ? result.events : [];
      return crewEvents;
    })
    .finally(() => { crewEventsPromise = null; });
  return crewEventsPromise;
}

function findCrewById(events, crewId) {
  for (const event of events || []) {
    for (const departure of event.departures || []) {
      const crew = (departure.crews || []).find(item => item.id === crewId);
      if (crew) return {event, departure, crew};
    }
  }
  return null;
}

function findCrewForAccordion(events, details) {
  if (details.dataset.crewId) return findCrewById(events, details.dataset.crewId);
  const departureId = departureIdFrom(details);
  const category = details.dataset.crewCategory || '';
  const teamName = details.dataset.crewTeam || '';
  const car = details.dataset.crewCar || '';
  const pilots = (details.dataset.crewPilots || '').split('\u001f').filter(Boolean);

  for (const event of events || []) {
    const departure = (event.departures || []).find(item => item.id === departureId);
    if (!departure) continue;
    let candidates = (departure.crews || []).filter(crew => crew.category === category && crew.name === teamName);
    const exactCar = candidates.filter(crew => normalize(crew.car || 'Voiture à choisir') === normalize(car));
    if (exactCar.length) candidates = exactCar;
    const exactPilots = candidates.filter(crew => {
      const names = (crew.registrationIds || [])
        .map(id => departure.availability?.find(registration => registration.id === id)?.name)
        .filter(Boolean);
      return sameNames(names, pilots);
    });
    const crew = exactPilots[0] || candidates[0];
    if (crew) return {event, departure, crew};
  }
  return null;
}

function statusLabel(locked) {
  return locked ? 'ÉQUIPAGE COMPLET' : 'ÉQUIPAGE OUVERT';
}

function ensureStatusPill(container, locked) {
  if (!container) return null;
  let pill = container.querySelector(':scope > .crew-compact-status, :scope > .crew-card-status');
  if (!pill) {
    pill = document.createElement('span');
    pill.className = container.matches('.crew-pilot-accordion-summary') ? 'crew-compact-status' : 'crew-card-status';
    if (container.matches('.crew-pilot-accordion-summary')) {
      const chevron = container.querySelector(':scope > .crew-compact-chevron');
      container.insertBefore(pill, chevron || null);
    } else {
      container.append(pill);
    }
  }
  pill.textContent = statusLabel(locked);
  pill.classList.toggle('is-open', !locked);
  pill.classList.toggle('is-complete', locked);
  return pill;
}

function capacityMessage(event, departure, crew) {
  const coverage = coverageFor(event, departure, crew);
  if (crew.locked) return `Équipage complet et verrouillé par l’organisation. Couverture actuelle : ${coverage.covered}/${coverage.duration} h.`;
  if (coverage.missing > 0) return `Il reste de la place dans cet équipage : ${coverage.missing} h de course ${coverage.missing > 1 ? 'ne sont' : 'n’est'} pas encore couverte${coverage.missing > 1 ? 's' : ''}.`;
  return 'Toutes les heures sont couvertes, mais l’équipage reste ouvert tant qu’un organisateur ne le verrouille pas.';
}

function ensureCapacityMessage(container, event, departure, crew, placement = 'prepend') {
  if (!container) return;
  let message = container.querySelector(':scope > .crew-capacity-message');
  if (!message) {
    message = document.createElement('p');
    message.className = 'crew-capacity-message';
    placement === 'prepend' ? container.prepend(message) : container.append(message);
  }
  message.textContent = capacityMessage(event, departure, crew);
  message.classList.toggle('is-open', !crew.locked);
  message.classList.toggle('is-complete', Boolean(crew.locked));
  message.classList.toggle('needs-pilots', !crew.locked && coverageFor(event, departure, crew).missing > 0);
}

function enhanceCrewGroup(group) {
  if (!(group instanceof HTMLElement) || group.dataset.crewAccordion === 'true') return;
  const groupHeader = group.querySelector(':scope > .crew-pilot-group-header');
  if (!groupHeader) return;

  const teamName = groupHeader.querySelector('strong')?.textContent.trim() || 'Équipage';
  const car = groupHeader.querySelector('span')?.textContent.trim() || 'Voiture à choisir';
  const pilotNames = Array.from(group.querySelectorAll(':scope > .pilot-row')).map(pilotNameFromRow).filter(Boolean);
  const categoryHeader = group.closest('.category-group')?.querySelector(':scope > .category-group-header');
  const categoryLogo = categoryHeader?.querySelector('.category-logo, .category-text-logo');
  const categoryName = categoryNameFromGroup(group);

  const details = document.createElement('details');
  details.className = `${group.className} crew-pilot-accordion`;
  const eventId = app.querySelector('[data-event-id]')?.dataset.eventId;
  if (eventId !== accordionEventId) { accordionStates.clear(); accordionEventId = eventId; }
  details.dataset.crewId = group.dataset.crewId;
  details.dataset.crewLocked = group.dataset.crewLocked;
  details.dataset.crewMine = group.dataset.crewMine;
  details.open = accordionStates.get(group.dataset.crewId) ?? (group.dataset.crewMine === 'true');
  details.dataset.crewAccordion = 'true';
  details.dataset.crewTeam = teamName;
  details.dataset.crewCar = car;
  details.dataset.crewCategory = categoryName;
  details.dataset.crewPilots = pilotNames.join('\u001f');

  const summary = document.createElement('summary');
  summary.className = 'crew-pilot-accordion-summary';
  summary.setAttribute('aria-label', `${teamName} · ${pilotNames.join(', ') || 'aucun pilote'} · ${car}`);

  const category = document.createElement('span');
  category.className = 'crew-compact-category';
  category.setAttribute('aria-hidden', 'true');
  if (categoryLogo) category.append(categoryLogo.cloneNode(true));
  summary.append(category);

  addText(summary, 'crew-compact-team', teamName, true);
  addText(summary, 'crew-compact-pilots', pilotNames.join(' · ') || 'Aucun pilote affecté');
  addText(summary, 'crew-compact-car', car);
  ensureStatusPill(summary, group.dataset.crewLocked === 'true');

  const chevron = document.createElement('span');
  chevron.className = 'crew-compact-chevron';
  chevron.setAttribute('aria-hidden', 'true');
  chevron.textContent = '›';
  summary.append(chevron);

  const body = document.createElement('div');
  body.className = 'crew-pilot-accordion-body';
  while (group.firstChild) body.append(group.firstChild);

  details.append(summary, body);
  group.replaceWith(details);
}

function enhanceCrewAccordions(root = app) {
  if (!root) return;
  if (root instanceof HTMLElement && root.matches('.crew-pilot-group:not([data-crew-accordion="true"])')) enhanceCrewGroup(root);
  root.querySelectorAll?.('.crew-pilot-group:not([data-crew-accordion="true"])').forEach(enhanceCrewGroup);
}

function sortAccordions() {
  app?.querySelectorAll('.category-group').forEach(group => {
    const accordions = Array.from(group.querySelectorAll(':scope > .crew-pilot-accordion'));
    if (accordions.length < 2) return;
    const desired = [...accordions].sort((a, b) => Number(a.dataset.crewLocked === 'true') - Number(b.dataset.crewLocked === 'true'));
    if (desired.every((accordion, index) => accordion === accordions[index])) return;
    const firstPilot = group.querySelector(':scope > .pilot-row');
    for (const accordion of desired) group.insertBefore(accordion, firstPilot || null);
  });
}

function decorateAccordions(events) {
  app?.querySelectorAll('.crew-pilot-accordion').forEach(details => {
    const found = findCrewForAccordion(events, details);
    if (!found) return;
    const {event, departure, crew} = found;
    details.dataset.crewId = crew.id;
    details.dataset.crewLocked = String(Boolean(crew.locked));
    details.classList.toggle('is-complete', Boolean(crew.locked));
    details.classList.toggle('is-open', !crew.locked);
    ensureStatusPill(details.querySelector(':scope > .crew-pilot-accordion-summary'), Boolean(crew.locked));
    ensureCapacityMessage(details.querySelector(':scope > .crew-pilot-accordion-body'), event, departure, crew, 'prepend');
  });
  sortAccordions();
}

function decorateCrewCards(events) {
  app?.querySelectorAll('.crew-card[data-crew]').forEach(card => {
    const found = findCrewById(events, card.dataset.crew);
    if (!found) return;
    const {event, departure, crew} = found;
    card.dataset.crewLocked = String(Boolean(crew.locked));
    card.dataset.crewStatusDecorated = 'true';
    card.classList.toggle('is-complete', Boolean(crew.locked));
    card.classList.toggle('is-open', !crew.locked);

    const header = card.querySelector('.crew-card-header');
    if (header) ensureStatusPill(header, Boolean(crew.locked));

    const timeline = card.querySelector('.presence-timeline');
    if (timeline?.parentElement) ensureCapacityMessage(timeline.parentElement, event, departure, crew, 'append');

    card.querySelectorAll('[data-action="add-crew-pilot"], [data-action="remove-crew-pilot"], .crew-assignment select').forEach(control => {
      control.disabled = Boolean(crew.locked);
    });

    const actions = card.querySelector('.crew-actions');
    if (actions && !actions.querySelector('[data-crew-lock-toggle]')) {
      const toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.className = crew.locked ? 'secondary-button crew-unlock-button' : 'primary-button crew-lock-button';
      toggle.dataset.crewLockToggle = crew.id;
      toggle.textContent = crew.locked ? 'Rouvrir l’équipage' : 'Marquer l’équipage complet';
      actions.prepend(toggle);
    } else if (actions) {
      const toggle = actions.querySelector('[data-crew-lock-toggle]');
      toggle.className = crew.locked ? 'secondary-button crew-unlock-button' : 'primary-button crew-lock-button';
      toggle.textContent = crew.locked ? 'Rouvrir l’équipage' : 'Marquer l’équipage complet';
    }
  });

  app?.querySelectorAll('.crew-list').forEach(list => {
    const cards = Array.from(list.querySelectorAll(':scope > .crew-card'));
    if (cards.length < 2) return;
    const desired = [...cards].sort((a, b) => Number(a.dataset.crewLocked === 'true') - Number(b.dataset.crewLocked === 'true'));
    if (desired.every((card, index) => card === cards[index])) return;
    for (const card of desired) list.append(card);
  });
}

function decorateFromCache() {
  const events = app?.querySelector('[data-event-id]') && app.eventViewData ? app.eventViewData.events : crewEvents;
  if (!events) return false;
  decorateAccordions(events);
  decorateCrewCards(events);
  return true;
}

async function refreshCrewDecorations(force = false) {
  try {
    const events = await loadCrewEvents(force);
    decorateAccordions(events);
    decorateCrewCards(events);
  } catch (error) {
    console.warn('Crew status UI unavailable:', error?.message || error);
  }
}

function scheduleRefresh(force = false) {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => refreshCrewDecorations(force), 0);
}

function restoreScrollPosition(x, y) {
  if (typeof window === 'undefined' || typeof window.scrollTo !== 'function') return;
  const restore = () => window.scrollTo(x, y);
  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(() => {
      restore();
      requestAnimationFrame(restore);
    });
  } else {
    setTimeout(restore, 0);
  }
}

function focusRegistrationEditor(departureId) {
  if (!departureId) return;
  setTimeout(() => {
    const fold = document.getElementById(`departure-${departureId}`);
    if (!fold) return;
    fold.open = true;
    const section = fold.querySelector('.fold-registration');
    if (!section) return;
    section.scrollIntoView({behavior: 'smooth', block: 'start'});
    const field = section.querySelector('input:not([type="checkbox"]):not([type="hidden"]), button[data-action="availability"], button[data-action="category"]');
    field?.focus({preventScroll: true});
  }, 0);
}

function refreshMainViewPreservingScroll() {
  const refreshButton = app?.querySelector('[data-action="refresh"]');
  if (!refreshButton) {
    scheduleRefresh(true);
    return;
  }

  const x = typeof window !== 'undefined' ? window.scrollX : 0;
  const y = typeof window !== 'undefined' ? window.scrollY : 0;
  let restored = false;
  const observer = new MutationObserver(() => {
    if (restored) return;
    restored = true;
    observer.disconnect();
    restoreScrollPosition(x, y);
  });
  observer.observe(app, {childList: true});
  refreshButton.click();
  setTimeout(() => {
    observer.disconnect();
    if (!restored) restoreScrollPosition(x, y);
  }, 2000);
}

// L'application reconstruit la vue quand on édite une inscription. Le cache équipage
// permet de redécorer et trier immédiatement dans le MutationObserver, avant le prochain
// rendu navigateur, sans requête réseau intermédiaire ni déplacement visible des cartes.
document.addEventListener('click', event => {
  const summary = event.target.closest('.crew-pilot-accordion > summary');
  if (summary) {
    event.preventDefault();
    const details = summary.parentElement;
    details.open = !details.open;
    accordionStates.set(details.dataset.crewId, details.open);
    return;
  }
  const edit = event.target.closest('[data-action="edit-registration"]');
  if (edit) focusRegistrationEditor(edit.dataset.departure);

  const availability = event.target.closest('[data-action="availability"]');
  if (!availability || typeof window === 'undefined') return;
  const x = window.scrollX;
  const y = window.scrollY;
  setTimeout(() => restoreScrollPosition(x, y), 0);
}, true);

document.addEventListener('click', async event => {
  const button = event.target.closest('[data-crew-lock-toggle]');
  if (!button) return;
  event.preventDefault();
  event.stopPropagation();

  try {
    button.disabled = true;
    const events = await loadCrewEvents(true);
    const found = findCrewById(events, button.dataset.crewLockToggle);
    if (!found) throw new Error('Équipage introuvable. Actualise la page.');
    const nextLocked = !Boolean(found.crew.locked);
    if (nextLocked && !confirm(`Marquer « ${found.crew.name} » comme complet et verrouiller sa composition ?`)) return;

    const response = await fetch(`/api/crews/${found.crew.id}`, {
      method: 'PATCH',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({locked: nextLocked, version: found.crew.version})
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || 'Impossible de modifier l’état de l’équipage.');

    crewEvents = null;
    refreshMainViewPreservingScroll();
  } catch (error) {
    alert(error?.message || 'Impossible de modifier l’état de l’équipage.');
  } finally {
    if (button.isConnected) button.disabled = false;
  }
});

if (app) {
  enhanceCrewAccordions();
  decorateFromCache();
  new MutationObserver(mutations => {
    if (!app.querySelector('[data-event-id]')) { accordionStates.clear(); accordionEventId = null; }
    let meaningful = false;
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (!(node instanceof HTMLElement)) continue;

        const freshAccordion = node.matches('.crew-pilot-group:not([data-crew-accordion="true"])') || Boolean(node.querySelector?.('.crew-pilot-group:not([data-crew-accordion="true"])'));
        const freshCard = node.matches('.crew-card:not([data-crew-status-decorated="true"])') || Boolean(node.querySelector?.('.crew-card:not([data-crew-status-decorated="true"])'));
        const freshStructure = node.matches('.departure-fold, .category-group, .crew-list') || Boolean(node.querySelector?.('.departure-fold, .category-group, .crew-list'));

        enhanceCrewAccordions(node);
        if (freshAccordion || freshCard || freshStructure) meaningful = true;
      }
    }

    if (!meaningful) return;

    // Très important : si les données sont déjà en cache, on applique le statut et le tri
    // synchroniquement dans le callback MutationObserver. Cela évite le "tri après coup"
    // visible quand on clique sur Modifier ou sur un créneau d'un pilote.
    if (!decorateFromCache()) scheduleRefresh(false);
  }).observe(app, {childList: true, subtree: true});
}

