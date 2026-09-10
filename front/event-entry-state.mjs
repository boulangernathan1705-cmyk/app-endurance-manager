const app = document.getElementById('app');
let desiredDepartureId = '';
let firstFrame = 0;
let secondFrame = 0;

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

function applyDepartureState() {
  firstFrame = 0;
  secondFrame = 0;
  if (!app?.querySelector('[data-event-id]')) return;

  app.querySelectorAll('.departure-fold[id]').forEach(fold => {
    const shouldOpen = Boolean(desiredDepartureId) && departureIdFromFold(fold) === desiredDepartureId;
    if (fold.open === shouldOpen) return;
    const summary = fold.querySelector(':scope > summary');
    if (summary) summary.click();
  });
}

function scheduleDepartureState(departureId = '') {
  desiredDepartureId = departureId || '';
  if (firstFrame) cancelAnimationFrame(firstFrame);
  if (secondFrame) cancelAnimationFrame(secondFrame);

  // Wait until the core renderer and the UX refinement MutationObserver have both
  // finished. We then toggle through the normal summary handler, so its internal
  // open-state cache stays synchronized instead of reopening a fold later.
  firstFrame = requestAnimationFrame(() => {
    secondFrame = requestAnimationFrame(applyDepartureState);
  });
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
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (!(node instanceof HTMLElement)) continue;
        refineMyEntryLinks(node.matches?.('.my-entry-card') ? node : node);
      }
    }
  }).observe(app, {childList: true, subtree: true});
}
