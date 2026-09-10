const app = document.getElementById('app');

function closeAutomaticallyOpenedDepartures() {
  if (!app) return;
  app.querySelectorAll('.departure-fold[open] > summary').forEach(summary => summary.click());
}

document.addEventListener('click', event => {
  const action = event.target.closest('[data-action]');
  if (!action) return;

  const openingEventFromAgenda = action.dataset.action === 'open' && !action.dataset.departure;
  const switchingEventSection = action.dataset.action === 'event-section';
  if (!openingEventFromAgenda && !switchingEventSection) return;

  // The core renderer runs synchronously later in the same click dispatch.
  // Closing in the next microtask keeps the first departure closed before paint,
  // while going through the existing summary handler so its open-state cache stays in sync.
  queueMicrotask(closeAutomaticallyOpenedDepartures);
}, true);
