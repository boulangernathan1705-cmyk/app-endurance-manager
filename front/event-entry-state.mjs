const app = document.getElementById('app');

function resetDepartureFoldsClosed() {
  if (!app) return;

  app.querySelectorAll('.departure-fold').forEach(fold => {
    const summary = fold.querySelector(':scope > summary');
    if (!summary) return;

    // Go through the existing summary handler so its internal open-state cache
    // is cleared too. A closed fold needs two toggles: open/add, then close/remove.
    if (!fold.open) summary.click();
    summary.click();
  });
}

document.addEventListener('click', event => {
  const action = event.target.closest('[data-action]');
  if (!action) return;

  const openingEventFromAgenda = action.dataset.action === 'open' && !action.dataset.departure;
  const switchingEventSection = action.dataset.action === 'event-section';
  if (!openingEventFromAgenda && !switchingEventSection) return;

  // The core renderer runs synchronously later in the same click dispatch.
  // Resetting in the next microtask keeps every departure closed before paint.
  queueMicrotask(resetDepartureFoldsClosed);
}, true);
