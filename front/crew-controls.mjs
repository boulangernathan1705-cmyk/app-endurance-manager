const app = document.getElementById('app');
let controlsObserver;
const managementAccordionStates = new Map();

function removeUnavailableButtons(root = app) {
  root?.querySelectorAll?.('[data-action="availability"][data-value="unavailable"]').forEach(button => button.remove());
}

function crewStatusText(locked) {
  return locked ? 'Équipage complet' : 'Ouvert';
}

function crewStatusPillText(locked) {
  return locked ? 'ÉQUIPAGE COMPLET' : 'ÉQUIPAGE OUVERT';
}

function crewLockIcon(locked) {
  return locked ? '🔒' : '🔓';
}

function normalizedName(value) {
  return String(value || '').trim();
}

function compareNames(left, right) {
  return normalizedName(left).localeCompare(normalizedName(right), 'fr', {sensitivity:'base', numeric:true});
}

function crewNameFromElement(element) {
  return normalizedName(
    element?.dataset?.crewTeam ||
    element?.querySelector?.('.crew-compact-team strong')?.textContent ||
    element?.querySelector?.('.crew-card-header h3')?.textContent ||
    ''
  );
}

function ensureCrewStatusControl(card) {
  if (!(card instanceof HTMLElement)) return;
  const header = card.querySelector('.crew-card-header');
  const copy = header?.querySelector(':scope > div');
  const crewId = card.dataset.crew;
  if (!header || !copy || !crewId || !card.querySelector('.crew-actions')) return;

  const locked = card.dataset.crewLocked === 'true';
  let control = copy.querySelector(':scope > [data-crew-state-control]');
  if (!control) {
    control = document.createElement('div');
    control.className = 'crew-state-control';
    control.dataset.crewStateControl = 'true';
    control.innerHTML = `<span class="crew-state-label"><span class="crew-state-lock" aria-hidden="true"></span><span>Équipage</span></span><label class="crew-state-select-wrap"><span class="sr-only">État de l’équipage</span><select class="crew-state-select" data-crew-state-select><option value="open">Ouvert</option><option value="locked">Équipage complet</option></select><span class="crew-state-chevron" aria-hidden="true">▾</span></label>`;
    copy.prepend(control);
  }

  const lock = control.querySelector('.crew-state-lock');
  const select = control.querySelector('[data-crew-state-select]');
  if (lock) lock.textContent = crewLockIcon(locked);
  if (select) {
    select.dataset.crewId = crewId;
    select.value = locked ? 'locked' : 'open';
    select.setAttribute('aria-label', `Équipage ${crewStatusText(locked)}`);
  }

  header.querySelector(':scope > .crew-card-status')?.setAttribute('hidden', '');
  card.querySelector('[data-crew-lock-toggle]')?.setAttribute('hidden', '');
}

function makeRemoveButtonRed(card) {
  card.querySelectorAll('[data-action="remove-crew-pilot"]').forEach(button => {
    button.classList.remove('secondary-button');
    button.classList.add('danger-button', 'crew-member-action');
  });
}

function removeObsoleteCrewActions(card) {
  card.querySelectorAll('.crew-actions [data-action="edit-crew"]').forEach(button => button.remove());
}

function removeCoveredMessage(card) {
  card.querySelectorAll('.coverage-note').forEach(note => {
    if (note.textContent.trim().startsWith('Toutes les heures sont couvertes.')) note.remove();
  });
}

function transformCandidateButton(candidate) {
  if (!(candidate instanceof HTMLButtonElement) || candidate.dataset.crewActionCard === 'true') return;

  const article = document.createElement('article');
  article.className = 'ux-crew-candidate crew-candidate-action-card';
  article.dataset.crewActionCard = 'true';

  const info = document.createElement('div');
  info.className = 'crew-candidate-info';
  while (candidate.firstChild) info.append(candidate.firstChild);
  info.querySelector('.ux-candidate-head > span')?.remove();

  const add = document.createElement('button');
  add.type = 'button';
  add.className = 'primary-button crew-add-pilot-button';
  add.dataset.uxAddCrewPilot = 'true';
  add.dataset.crew = candidate.dataset.crew || '';
  add.dataset.departure = candidate.dataset.departure || '';
  add.dataset.registration = candidate.dataset.registration || '';
  add.textContent = 'Ajouter';
  add.setAttribute('aria-label', `Ajouter ${info.querySelector('strong')?.textContent?.trim() || 'ce pilote'} à l’équipage`);

  article.append(info, add);
  candidate.replaceWith(article);
}

function createCompactSummary(card) {
  const header = card.querySelector('.crew-card-header');
  if (!header) return null;
  const teamName = header.querySelector('h3')?.textContent?.trim() || 'Équipage';
  const car = header.querySelector('.crew-car')?.textContent?.trim() || 'Voiture à choisir';
  const pilots = [...card.querySelectorAll('.crew-roster .crew-pilot-name')].map(node => node.textContent.trim()).filter(Boolean);
  const categoryLogo = header.querySelector('.event-category-badge .category-logo, .event-category-badge .category-text-logo');
  const locked = card.dataset.crewLocked === 'true';
  const crewId = card.dataset.crew || '';
  const departureId = card.querySelector('[data-action="delete-crew"][data-departure], [data-action="add-crew-pilot"][data-departure], [data-action="remove-crew-pilot"][data-departure]')?.dataset.departure || '';

  const summary = document.createElement('summary');
  summary.className = 'crew-pilot-accordion-summary crew-management-summary';
  summary.setAttribute('aria-label', `${teamName} · ${pilots.join(', ') || 'aucun pilote'} · ${car}`);

  const category = document.createElement('span');
  category.className = 'crew-compact-category';
  category.setAttribute('aria-hidden', 'true');
  if (categoryLogo) category.append(categoryLogo.cloneNode(true));
  summary.append(category);

  const team = document.createElement('span');
  team.className = 'crew-compact-team';
  const strong = document.createElement('strong');
  strong.textContent = teamName;
  team.append(strong);
  summary.append(team);

  const pilotLine = document.createElement('span');
  pilotLine.className = 'crew-compact-pilots';
  pilotLine.textContent = pilots.join(' · ') || 'Aucun pilote affecté';
  summary.append(pilotLine);

  const carLine = document.createElement('span');
  carLine.className = 'crew-compact-car';
  const carLabel = document.createElement('span');
  carLabel.className = 'crew-compact-car-label';
  carLabel.textContent = car;
  carLine.append(carLabel);
  if (crewId && departureId) {
    const edit = document.createElement('button');
    edit.type = 'button';
    edit.className = 'secondary-button crew-summary-edit';
    edit.dataset.action = 'edit-crew';
    edit.dataset.id = crewId;
    edit.dataset.departure = departureId;
    edit.textContent = 'Modifier';
    edit.setAttribute('aria-label', `Modifier l’équipage ${teamName}`);
    carLine.append(edit);
  }
  summary.append(carLine);

  const status = document.createElement('span');
  status.className = `crew-compact-status ${locked ? 'is-complete' : 'is-open'}`;
  status.textContent = crewStatusPillText(locked);
  summary.append(status);

  const chevron = document.createElement('span');
  chevron.className = 'crew-compact-chevron';
  chevron.setAttribute('aria-hidden', 'true');
  chevron.textContent = '›';
  summary.append(chevron);
  return summary;
}

function transformManagementCard(card) {
  if (!(card instanceof HTMLElement) || card.matches('details.crew-management-accordion')) return card;
  const summary = createCompactSummary(card);
  if (!summary) return card;

  const details = document.createElement('details');
  for (const attribute of [...card.attributes]) details.setAttribute(attribute.name, attribute.value);
  details.classList.add('crew-management-accordion');
  details.dataset.crewTeam = crewNameFromElement(card);
  details.open = managementAccordionStates.get(details.dataset.crew) ?? false;

  const body = document.createElement('div');
  body.className = 'crew-management-accordion-body';
  while (card.firstChild) body.append(card.firstChild);
  details.append(summary, body);
  card.replaceWith(details);
  return details;
}

function refreshManagementSummary(card) {
  if (!card?.matches?.('details.crew-management-accordion')) return;
  const current = card.querySelector(':scope > .crew-management-summary');
  const next = createCompactSummary(card);
  if (!current || !next) return;
  if (current.outerHTML !== next.outerHTML) current.replaceWith(next);
  card.dataset.crewTeam = crewNameFromElement(card);
}

function applyAlphabeticalManagementOrder(root = app) {
  root?.querySelectorAll?.('.crew-list').forEach(list => {
    const cards = [...list.querySelectorAll(':scope > .crew-card[data-crew]')];
    const sorted = [...cards].sort((a, b) => compareNames(crewNameFromElement(a), crewNameFromElement(b)));
    sorted.forEach((card, index) => { card.style.order = String(index); });
  });
}

function mergeCourseCrewBuckets(root = app) {
  root?.querySelectorAll?.('.ux-course-overview').forEach(overview => {
    const buckets = [...overview.querySelectorAll(':scope > .ux-crew-bucket:not(.ux-unavailable-bucket)')]
      .filter(bucket => bucket.querySelector(':scope > summary span')?.textContent?.trim().startsWith('Équipages'));
    if (!buckets.length) return;

    const primary = buckets[0];
    const primaryBody = primary.querySelector(':scope > .ux-crew-bucket-body');
    if (!primaryBody) return;
    const wasOpen = buckets.some(bucket => bucket.open);

    for (const bucket of buckets.slice(1)) {
      const body = bucket.querySelector(':scope > .ux-crew-bucket-body');
      [...(body?.querySelectorAll(':scope > .crew-pilot-accordion') || [])].forEach(crew => primaryBody.append(crew));
      bucket.remove();
    }

    const crews = [...primaryBody.querySelectorAll(':scope > .crew-pilot-accordion')]
      .sort((a, b) => compareNames(crewNameFromElement(a), crewNameFromElement(b)));
    crews.forEach(crew => primaryBody.append(crew));

    const label = primary.querySelector(':scope > summary span');
    const count = primary.querySelector(':scope > summary strong');
    if (label) label.textContent = 'Équipages';
    if (count) count.textContent = String(crews.length);
    primary.dataset.uxBucketKey = `${primary.closest('.departure-fold')?.id || 'course'}:crews`;
    primary.dataset.crewMerged = 'true';
    primary.open = wasOpen || crews.some(crew => crew.dataset.crewMine === 'true');
  });
}

function refineCrewCards(root = app) {
  root?.querySelectorAll?.('.crew-card[data-crew]').forEach(originalCard => {
    removeObsoleteCrewActions(originalCard);
    ensureCrewStatusControl(originalCard);
    makeRemoveButtonRed(originalCard);
    removeCoveredMessage(originalCard);
    const card = transformManagementCard(originalCard);
    refreshManagementSummary(card);
  });
  root?.querySelectorAll?.('button.ux-crew-candidate[data-ux-add-crew-pilot]').forEach(transformCandidateButton);
  applyAlphabeticalManagementOrder(root);
}

function crewFromEvents(events, crewId) {
  for (const event of events || []) {
    for (const departure of event.departures || []) {
      const crew = (departure.crews || []).find(item => item.id === crewId);
      if (crew) return crew;
    }
  }
  return null;
}

async function findCrew(crewId) {
  const current = crewFromEvents(app?.eventViewData?.events, crewId);
  if (current) return current;

  const response = await fetch('/api/events', {credentials:'same-origin', cache:'no-store'});
  if (!response.ok) throw new Error('Impossible de charger l’équipage.');
  const result = await response.json();
  const crew = crewFromEvents(result.events, crewId);
  if (crew) return crew;
  throw new Error('Équipage introuvable. Actualise la page.');
}

function restoreScroll(x, y) {
  if (typeof requestAnimationFrame !== 'function') {
    window.scrollTo(x, y);
    return;
  }
  requestAnimationFrame(() => {
    window.scrollTo(x, y);
    requestAnimationFrame(() => window.scrollTo(x, y));
  });
}

function refreshPreservingScroll() {
  const refresh = app?.querySelector('[data-action="refresh"]');
  if (!refresh) {
    location.reload();
    return;
  }
  const x = window.scrollX;
  const y = window.scrollY;
  let restored = false;
  const observer = new MutationObserver(() => {
    if (restored) return;
    restored = true;
    observer.disconnect();
    restoreScroll(x, y);
  });
  observer.observe(app, {childList:true});
  refresh.click();
  setTimeout(() => {
    observer.disconnect();
    if (!restored) restoreScroll(x, y);
  }, 2000);
}

async function updateCrewState(select) {
  const crewId = select.dataset.crewId;
  if (!crewId) return;
  const requestedLocked = select.value === 'locked';
  const currentLocked = select.closest('.crew-card')?.dataset.crewLocked === 'true';
  if (requestedLocked === currentLocked) return;

  select.disabled = true;
  try {
    const crew = await findCrew(crewId);
    if (requestedLocked && !confirm(`Marquer « ${crew.name} » comme équipage complet et verrouiller sa composition ?`)) {
      select.value = currentLocked ? 'locked' : 'open';
      return;
    }

    const response = await fetch(`/api/crews/${crew.id}`, {
      method:'PATCH',
      credentials:'same-origin',
      cache:'no-store',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({locked:requestedLocked, version:crew.version})
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || 'Impossible de modifier l’état de l’équipage.');
    refreshPreservingScroll();
  } catch (error) {
    select.value = currentLocked ? 'locked' : 'open';
    alert(error?.message || 'Impossible de modifier l’état de l’équipage.');
  } finally {
    if (select.isConnected) select.disabled = false;
  }
}

function decorate(root = app) {
  controlsObserver?.disconnect();
  try {
    removeUnavailableButtons(root);
    mergeCourseCrewBuckets(root);
    refineCrewCards(root);
  } finally {
    controlsObserver?.observe(app, {childList:true, subtree:true, attributes:true, attributeFilter:['data-crew-locked']});
  }
}

document.addEventListener('change', event => {
  const select = event.target.closest?.('[data-crew-state-select]');
  if (!select) return;
  updateCrewState(select);
});

document.addEventListener('toggle', event => {
  const details = event.target.closest?.('details.crew-management-accordion');
  if (!details || event.target !== details) return;
  managementAccordionStates.set(details.dataset.crew, details.open);
}, true);

if (app) {
  controlsObserver = new MutationObserver(() => decorate());
  decorate();
}
