const app = document.getElementById('app');
let desiredDepartureId = '';
let frame = 0;

function departureIdFromFold(fold) {
  return fold?.id?.replace(/^crew-departure-/, '').replace(/^departure-/, '') || '';
}

function applyDepartureState() {
  if (!app?.querySelector('[data-event-id]')) return;
  app.querySelectorAll('.departure-fold[id]').forEach(fold => {
    const shouldOpen = Boolean(desiredDepartureId) && departureIdFromFold(fold) === desiredDepartureId;
    if (fold.open === shouldOpen) return;
    const summary = fold.querySelector(':scope > summary');
    if (summary) summary.click();
  });
  frame = 0;
}

function scheduleDepartureState(departureId = '') {
  desiredDepartureId = departureId || '';
  if (frame) cancelAnimationFrame(frame);
  // Le rendu principal et les décorateurs terminent leurs microtasks avant ce rAF.
  // On normalise donc l’état final juste avant l’affichage, sans observer tout le DOM.
  frame = requestAnimationFrame(applyDepartureState);
}

document.addEventListener('click', event => {
  const action = event.target.closest('[data-action]');
  if (!action) return;

  if (action.dataset.action === 'open') {
    const fromMyEntries = Boolean(action.closest('.my-entry-card, .native-my-entry-card')) && Boolean(action.dataset.departure);
    if (fromMyEntries) action.removeAttribute('data-registration');
    scheduleDepartureState(action.dataset.departure || '');
    return;
  }

  if (action.dataset.action === 'event-section') scheduleDepartureState('');
}, true);
