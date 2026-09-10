const app = document.getElementById('app');
let desiredDepartureId = '';
let normalizationRequested = false;
let frame = 0;

function departureIdFromFold(fold) {
  return fold?.id?.replace(/^crew-departure-/, '').replace(/^departure-/, '') || '';
}

function refineMyEntryLinks(root = app) {
  if (!root) return;
  root.querySelectorAll?.('.my-entry-actions-top [data-action="open"][data-departure]').forEach(button => {
    if (button.dataset.pilotEventLink === 'true') return;
    button.dataset.pilotEventLink = 'true';
    button.removeAttribute('data-registration');
    button.textContent = 'Voir ce départ dans Course';
    button.setAttribute('aria-label', 'Voir uniquement ce départ dans la vue Course');
  });
}

function applyDepartureState(finalize = false) {
  if (!normalizationRequested || !app?.querySelector('[data-event-id]')) return;

  app.querySelectorAll('.departure-fold[id]').forEach(fold => {
    const shouldOpen = Boolean(desiredDepartureId) && departureIdFromFold(fold) === desiredDepartureId;
    if (fold.open === shouldOpen) return;
    const summary = fold.querySelector(':scope > summary');
    if (summary) summary.click();
  });

  if (finalize) {
    normalizationRequested = false;
    frame = 0;
  }
}

function scheduleDepartureState(departureId = '') {
  desiredDepartureId = departureId || '';
  normalizationRequested = true;
  if (frame) cancelAnimationFrame(frame);

  // requestAnimationFrame runs after the renderer/MutationObservers and before paint.
  // It is therefore late enough to beat automatic UX opening, without showing a flash.
  frame = requestAnimationFrame(() => applyDepartureState(true));
}

document.addEventListener('click', event => {
  const action = event.target.closest('[data-action]');
  if (!action) return;

  if (action.dataset.action === 'open') {
    const fromMyEntries = Boolean(action.closest('.my-entry-card')) && Boolean(action.dataset.departure);
    if (fromMyEntries) {
      // "Voir ce départ" must never be interpreted as "modifier cette inscription".
      action.removeAttribute('data-registration');
      scheduleDepartureState(action.dataset.departure);
      return;
    }

    if (!action.dataset.departure) scheduleDepartureState('');
    return;
  }

  if (action.dataset.action === 'event-section') {
    scheduleDepartureState('');
  }
}, true);

if (app) {
  refineMyEntryLinks();
  new MutationObserver(mutations => {
    let eventViewChanged = false;
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (!(node instanceof HTMLElement)) continue;
        refineMyEntryLinks(node);
        if (node.matches?.('[data-event-id], .departure-fold') || node.querySelector?.('[data-event-id], .departure-fold')) eventViewChanged = true;
      }
    }

    // This microtask normally closes the folds in the same rendering turn.
    // The rAF scheduled above remains as a final pre-paint safety pass.
    if (eventViewChanged && normalizationRequested) queueMicrotask(() => applyDepartureState(false));
  }).observe(app, {childList: true, subtree: true});
}
