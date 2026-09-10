const app = document.getElementById('app');
let decorateQueued = false;

function pilotCount(registrations = []) {
  return new Set(
    registrations
      .filter(registration => registration.status !== 'unavailable')
      .map(registration => registration.participantId || registration.id)
  ).size;
}

function decorateCoursePilots() {
  app?.querySelectorAll('.pilot-section .pilot-row').forEach(row => {
    const name = row.querySelector('.pilot-name');
    if (!name) return;

    const ownerLabel = [...name.querySelectorAll(':scope > small')].find(label => label.textContent.trim().toLocaleLowerCase('fr-FR') === '(toi)');
    if (ownerLabel) row.classList.add('ux-current-pilot');

    [...name.querySelectorAll(':scope > small')].forEach(label => {
      const text = label.textContent.trim().toLocaleLowerCase('fr-FR');
      if (text === '(toi)' || text === '(inscription gérée par toi)') label.remove();
    });

    const status = row.querySelector('.registration-status');
    if (status && /^\d+\s*h\s+disponible/i.test(status.textContent.trim())) status.remove();

    const edit = row.querySelector('.edit-button');
    if (edit) edit.classList.add('ux-pilot-edit');
  });
}

function decorateCrewDepartureCounts() {
  const eventId = app?.querySelector('[data-event-id]')?.dataset.eventId;
  const event = app?.eventViewData?.events?.find(item => item.id === eventId);
  if (!event) return;

  app.querySelectorAll('.crew-page-accordion .departure-fold[id^="crew-departure-"]').forEach(fold => {
    const departureId = fold.id.replace(/^crew-departure-/, '');
    const departure = event.departures?.find(item => item.id === departureId);
    const meta = fold.querySelector(':scope > summary .fold-meta');
    if (!departure || !meta) return;

    const pilots = pilotCount(departure.availability || []);
    const crews = (departure.crews || []).length;
    const text = `${pilots} pilote${pilots > 1 ? 's' : ''} · ${crews} équipage${crews > 1 ? 's' : ''}`;
    if (meta.textContent !== text) meta.textContent = text;
  });
}

function decorate() {
  decorateCoursePilots();
  decorateCrewDepartureCounts();
}

function scheduleDecorate() {
  if (decorateQueued) return;
  decorateQueued = true;
  queueMicrotask(() => {
    decorateQueued = false;
    decorate();
  });
}

if (app) {
  decorate();
  new MutationObserver(scheduleDecorate).observe(app, {childList:true, subtree:true});
}
