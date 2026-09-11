const app = document.getElementById('app');
let canEditCrews = false;
let queued = false;

function departureIdFrom(accordion) {
  const fold = accordion?.closest('.departure-fold');
  return fold?.id?.replace(/^crew-departure-/, '').replace(/^departure-/, '') || '';
}

function decorateEditButtons() {
  if (!canEditCrews || !app) return;
  app.querySelectorAll('.crew-pilot-accordion[data-crew-id]').forEach(accordion => {
    const summary = accordion.querySelector(':scope > .crew-pilot-accordion-summary');
    if (!summary || summary.querySelector(':scope > .crew-inline-edit')) return;
    const crewId = accordion.dataset.crewId;
    const departureId = departureIdFrom(accordion);
    if (!crewId || !departureId) return;

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'crew-inline-edit';
    button.dataset.crewInlineEdit = 'true';
    button.dataset.crew = crewId;
    button.dataset.departure = departureId;
    button.textContent = 'Modifier';
    button.setAttribute('aria-label', `Modifier l’équipage ${accordion.dataset.crewTeam || ''}`.trim());

    const status = summary.querySelector(':scope > .crew-compact-status');
    summary.insertBefore(button, status || summary.querySelector(':scope > .crew-compact-chevron'));
  });
}

function scheduleDecorate() {
  if (queued) return;
  queued = true;
  queueMicrotask(() => {
    queued = false;
    decorateEditButtons();
  });
}

async function loadPermission() {
  try {
    const response = await fetch('/api/session', {credentials: 'same-origin', cache: 'no-store'});
    if (!response.ok) return;
    const session = await response.json();
    canEditCrews = ['admin', 'organizer'].includes(session?.user?.role);
    decorateEditButtons();
  } catch {}
}

document.addEventListener('click', event => {
  const button = event.target.closest('[data-crew-inline-edit]');
  if (!button) return;
  event.preventDefault();
  event.stopImmediatePropagation();

  const crewId = button.dataset.crew;
  const departureId = button.dataset.departure;
  if (!crewId || !departureId) return;

  const crewsTab = app?.querySelector('[data-action="event-section"][data-section="crews"]');
  if (crewsTab && crewsTab.getAttribute('aria-pressed') !== 'true') crewsTab.click();

  const edit = app?.querySelector(`.crew-card[data-crew="${CSS.escape(crewId)}"] [data-action="edit-crew"][data-departure="${CSS.escape(departureId)}"]`);
  edit?.click();
}, true);

if (app) {
  new MutationObserver(scheduleDecorate).observe(app, {childList: true, subtree: true});
  void loadPermission();
}
