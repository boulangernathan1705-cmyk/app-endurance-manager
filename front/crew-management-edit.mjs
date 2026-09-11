const app = document.getElementById('app');
let queued = false;

function departureIdFrom(details) {
  return details.querySelector(':scope > .crew-management-accordion-body [data-action="delete-crew"][data-departure]')?.dataset.departure || '';
}

function decorateManagementEditButtons() {
  if (!app) return;
  app.querySelectorAll('details.crew-management-accordion[data-crew]').forEach(details => {
    const summary = details.querySelector(':scope > .crew-management-summary');
    const car = summary?.querySelector(':scope > .crew-compact-car');
    if (!summary || !car || car.querySelector(':scope > [data-crew-management-edit]')) return;

    const crewId = details.dataset.crew || '';
    const departureId = departureIdFrom(details);
    if (!crewId || !departureId) return;

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'crew-management-edit';
    button.dataset.crewManagementEdit = 'true';
    button.dataset.crew = crewId;
    button.dataset.departure = departureId;
    button.textContent = 'Modifier';
    button.setAttribute('aria-label', `Modifier l’équipage ${details.dataset.crewTeam || ''}`.trim());
    car.append(button);
  });
}

function scheduleDecorate() {
  if (queued) return;
  queued = true;
  queueMicrotask(() => {
    queued = false;
    decorateManagementEditButtons();
  });
}

document.addEventListener('click', event => {
  const button = event.target.closest('[data-crew-management-edit]');
  if (!button) return;
  event.preventDefault();
  event.stopPropagation();

  const crewId = button.dataset.crew || '';
  const departureId = button.dataset.departure || '';
  if (!crewId || !departureId || !app) return;

  const proxy = document.createElement('button');
  proxy.type = 'button';
  proxy.hidden = true;
  proxy.dataset.action = 'edit-crew';
  proxy.dataset.id = crewId;
  proxy.dataset.departure = departureId;
  app.append(proxy);
  proxy.click();
  proxy.remove();
}, true);

if (app) {
  decorateManagementEditButtons();
  new MutationObserver(scheduleDecorate).observe(app, {childList: true, subtree: true});
}
