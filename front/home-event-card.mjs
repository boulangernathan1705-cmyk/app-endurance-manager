const app = document.getElementById('app');

const datePartsFormatter = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'Europe/Paris',
  day: 'numeric',
  month: 'long',
  year: 'numeric'
});

let eventsPromise = null;
let queued = false;

function loadEvents() {
  if (!eventsPromise) {
    eventsPromise = fetch('/api/events', {credentials:'same-origin', cache:'no-store'})
      .then(response => response.ok ? response.json() : Promise.reject(new Error('events')))
      .then(result => Array.isArray(result.events) ? result.events : [])
      .catch(() => {
        eventsPromise = null;
        return [];
      });
  }
  return eventsPromise;
}

function parts(timestamp) {
  const values = {};
  for (const part of datePartsFormatter.formatToParts(new Date(timestamp))) {
    if (part.type !== 'literal') values[part.type] = part.value;
  }
  return values;
}

function dateRange(departures) {
  const dated = departures
    .filter(departure => Number.isFinite(Number(departure.startsAt)))
    .sort((a,b) => Number(a.startsAt) - Number(b.startsAt));
  if (!dated.length) return 'Dates à confirmer';

  const unique = [];
  const seen = new Set();
  for (const departure of dated) {
    const item = parts(Number(departure.startsAt));
    const key = `${item.year}-${item.month}-${item.day}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(item);
    }
  }

  const first = unique[0];
  const last = unique[unique.length - 1];
  if (unique.length === 1) return `${first.day} ${first.month} ${first.year}`;
  if (first.month === last.month && first.year === last.year) {
    return `${first.day}–${last.day} ${first.month} ${first.year}`;
  }
  if (first.year === last.year) {
    return `${first.day} ${first.month} – ${last.day} ${last.month} ${first.year}`;
  }
  return `${first.day} ${first.month} ${first.year} – ${last.day} ${last.month} ${last.year}`;
}

function displayTime(value) {
  const match = String(value || '').match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return String(value || '').trim();
  return match[2] === '00' ? `${Number(match[1])}h` : `${Number(match[1])}h${match[2]}`;
}

function scheduleLabel(event) {
  const departures = event.departures || [];
  const dates = dateRange(departures);
  const times = [...new Set(departures.map(departure => displayTime(departure.time)).filter(Boolean))];
  if (!times.length) return dates;
  const visibleTimes = times.slice(0,4);
  const suffix = times.length > 4 ? ' • …' : '';
  return `${dates} · ${visibleTimes.join(' • ')}${suffix}`;
}

function decorateCard(card, event) {
  const info = card.querySelector('.event-card-title-row .event-info');
  if (!info) return;
  const signature = `${event.version || 0}:${(event.departures || []).map(item => `${item.id}:${item.startsAt}:${item.time}`).join('|')}`;
  if (card.dataset.homeCardSchedule === signature) return;
  card.dataset.homeCardSchedule = signature;

  const legacy = info.querySelector(':scope > span:not(.event-type-badge)');
  if (legacy) {
    legacy.className = 'event-home-schedule';
    legacy.textContent = scheduleLabel(event);
  }
  card.classList.add('event-card-harmonized');
}

async function decorate() {
  const cards = [...app?.querySelectorAll('.event-card[data-id]') || []];
  if (!cards.length) return;
  const events = await loadEvents();
  if (!events.length) return;
  const byId = new Map(events.map(event => [String(event.id), event]));
  for (const card of cards) {
    const event = byId.get(String(card.dataset.id));
    if (event) decorateCard(card,event);
  }
}

function scheduleDecorate() {
  if (queued) return;
  queued = true;
  queueMicrotask(() => {
    queued = false;
    void decorate();
  });
}

if (app) {
  scheduleDecorate();
  new MutationObserver(scheduleDecorate).observe(app,{childList:true,subtree:true});
}
