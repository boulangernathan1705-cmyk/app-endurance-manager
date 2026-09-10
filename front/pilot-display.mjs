const app = document.getElementById('app');
let decorateQueued = false;

const CATEGORY_ORDER = new Map([
  ['hypercar', 0],
  ['lmp2', 1],
  ['lmp3', 2],
  ['gte', 3],
  ['gt3', 4]
]);

function pilotCount(registrations = []) {
  return new Set(
    registrations
      .filter(registration => registration.status !== 'unavailable')
      .map(registration => registration.participantId || registration.id)
  ).size;
}

function normalizeCategory(category) {
  return String(category || '')
    .trim()
    .toLocaleLowerCase('fr-FR')
    .replace(/[^a-z0-9]/g, '');
}

function categoryRank(category) {
  return CATEGORY_ORDER.get(normalizeCategory(category)) ?? 99;
}

function compareCrew(categoryA, nameA, categoryB, nameB) {
  const categoryDifference = categoryRank(categoryA) - categoryRank(categoryB);
  if (categoryDifference) return categoryDifference;
  return String(nameA || '').localeCompare(String(nameB || ''), 'fr', {
    sensitivity: 'base',
    numeric: true
  });
}

function currentEvent() {
  const eventId = app?.querySelector('[data-event-id]')?.dataset.eventId;
  return app?.eventViewData?.events?.find(item => item.id === eventId) || null;
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

  app?.querySelectorAll('.crew-pilot-accordion-body').forEach(body => {
    const count = body.querySelectorAll(':scope > .pilot-row').length;
    const visibleColumns = Math.max(1, Math.min(3, count));
    const value = String(visibleColumns);
    if (body.dataset.pilotColumns !== value) body.dataset.pilotColumns = value;
  });
}

function applyVisualOrder(items, comparator) {
  const sorted = [...items].sort(comparator);
  sorted.forEach((item, index) => {
    const order = String(index);
    if (item.style.order !== order) item.style.order = order;
  });
}

function sortCourseCrewsVisually() {
  app?.querySelectorAll('.ux-crew-bucket-body').forEach(body => {
    const accordions = [...body.querySelectorAll(':scope > .crew-pilot-accordion')];
    applyVisualOrder(accordions, (a, b) => compareCrew(
      a.dataset.crewCategory,
      a.dataset.crewTeam,
      b.dataset.crewCategory,
      b.dataset.crewTeam
    ));
  });

  app?.querySelectorAll('.category-group').forEach(group => {
    const accordions = [...group.querySelectorAll(':scope > .crew-pilot-accordion')];
    applyVisualOrder(accordions, (a, b) => String(a.dataset.crewTeam || '').localeCompare(
      String(b.dataset.crewTeam || ''),
      'fr',
      {sensitivity: 'base', numeric: true}
    ));
  });
}

function sortCrewManagementVisually() {
  const event = currentEvent();
  if (!event) return;

  app?.querySelectorAll('.crew-page-accordion .departure-fold[id^="crew-departure-"] .crew-list').forEach(list => {
    const departureId = list.closest('.departure-fold')?.id.replace(/^crew-departure-/, '');
    const departure = event.departures?.find(item => item.id === departureId);
    if (!departure) return;

    const crewById = new Map((departure.crews || []).map(crew => [crew.id, crew]));
    const cards = [...list.querySelectorAll(':scope > .crew-card[data-crew]')];
    applyVisualOrder(cards, (a, b) => {
      const crewA = crewById.get(a.dataset.crew);
      const crewB = crewById.get(b.dataset.crew);
      return compareCrew(crewA?.category, crewA?.name, crewB?.category, crewB?.name);
    });
  });
}

function decorateCrewDepartureCounts() {
  const event = currentEvent();
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
  sortCourseCrewsVisually();
  sortCrewManagementVisually();
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
