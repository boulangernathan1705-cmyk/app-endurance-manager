const app = document.getElementById('app');
let controlsObserver;

function removeUnavailableButtons(root = app) {
  root?.querySelectorAll?.('[data-action="availability"][data-value="unavailable"]').forEach(button => button.remove());
}

function crewStatusText(locked) {
  return locked ? 'Équipage complet' : 'Ouvert';
}

function crewLockIcon(locked) {
  return locked ? '🔒' : '🔓';
}

function ensureCrewStatusControl(card) {
  if (!(card instanceof HTMLElement)) return;
  const header = card.querySelector(':scope > .crew-card-header');
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

function refineCrewCards(root = app) {
  root?.querySelectorAll?.('.crew-card[data-crew]').forEach(card => {
    ensureCrewStatusControl(card);
    makeRemoveButtonRed(card);
    removeCoveredMessage(card);
  });
  root?.querySelectorAll?.('button.ux-crew-candidate[data-ux-add-crew-pilot]').forEach(transformCandidateButton);
}

async function findCrew(crewId) {
  const response = await fetch('/api/events', {credentials:'same-origin', cache:'no-store'});
  if (!response.ok) throw new Error('Impossible de charger l’équipage.');
  const result = await response.json();
  for (const event of result.events || []) {
    for (const departure of event.departures || []) {
      const crew = (departure.crews || []).find(item => item.id === crewId);
      if (crew) return crew;
    }
  }
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

if (app) {
  controlsObserver = new MutationObserver(() => decorate());
  decorate();
}
