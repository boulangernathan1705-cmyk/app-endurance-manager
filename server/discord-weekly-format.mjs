import {catalogForGame} from '../shared/catalog.mjs';

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
const TIME_ZONE = 'Europe/Paris';
const catalog = catalogForGame('lmu');
const circuitNames = new Map(catalog.circuits.map(circuit => [circuit.id, circuit.name]));

const ymd = new Intl.DateTimeFormat('en-CA', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit'
});
const startLabel = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'UTC',
  day: 'numeric',
  month: 'long'
});
const endLabel = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'UTC',
  day: 'numeric',
  month: 'long',
  year: 'numeric'
});
const departureLabel = new Intl.DateTimeFormat('fr-FR', {
  timeZone: TIME_ZONE,
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23'
});

const markers = new Map([
  ['Hypercar', '🟦'],
  ['LMP2 ELMS', '🟨'],
  ['LMP2 WEC', '🟨'],
  ['LMP3', '🟩'],
  ['GT3', '🟪'],
  ['GTE', '🟥']
]);

function localDay(timestamp) {
  const parts = Object.fromEntries(ymd.formatToParts(timestamp).map(part => [part.type, part.value]));
  return Math.floor(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day)) / DAY_MS);
}

function dayDate(day) {
  return new Date(day * DAY_MS + 12 * 60 * 60 * 1000);
}

function dayKey(day) {
  const date = new Date(day * DAY_MS);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

function weekFromMonday(monday) {
  const sunday = monday + 6;
  return {
    key: dayKey(monday),
    monday,
    sunday,
    label: `semaine du ${startLabel.format(dayDate(monday))} au ${endLabel.format(dayDate(sunday))}`
  };
}

export function parisWeek(timestamp = Date.now()) {
  const current = localDay(timestamp);
  const weekday = new Date(current * DAY_MS).getUTCDay();
  const monday = current - (weekday === 0 ? 6 : weekday - 1);
  return weekFromMonday(monday);
}

export function nextParisWeek(timestamp = Date.now()) {
  return weekFromMonday(parisWeek(timestamp).monday + 7);
}

export function isInParisWeek(timestamp, week) {
  const day = localDay(timestamp);
  return day >= week.monday && day <= week.sunday;
}

export function isDepartureRelevant(startsAt, durationHours, week, now = Date.now()) {
  if (!Number.isFinite(startsAt) || !isInParisWeek(startsAt, week)) return false;
  const hours = Number(durationHours);
  const endAt = startsAt + (Number.isFinite(hours) && hours > 0 ? hours * HOUR_MS : 0);
  return startsAt >= now || endAt > now;
}

function clean(value) {
  return String(value ?? '').replace(/[\\`*_~|>]/g, '\\$&').trim();
}

function cut(value, length) {
  const text = String(value ?? '');
  return text.length <= length ? text : `${text.slice(0, length - 1).trimEnd()}…`;
}

function crewField(crew) {
  const marker = markers.get(crew.category) || '⬜';
  const status = crew.locked ? '🔒 Complet' : '🔓 Ouvert';
  const pilots = crew.pilots.length ? crew.pilots.map(clean).join(' • ') : 'Aucun pilote affecté';
  return {
    name: cut(`${marker} ${clean(crew.name)} · ${clean(crew.category)} · ${status}`, 256),
    value: cut(`${crew.car ? `🏎️ ${clean(crew.car)}` : '🏎️ Voiture à définir'}\n👥 ${pilots}`, 1024),
    inline: false
  };
}

function departureEmbed(departure, appUrl, first, updatedAt) {
  const fields = departure.crews.slice(0, 24).map(crewField);
  if (departure.crews.length > 24) {
    fields.push({
      name: 'Autres équipages',
      value: `${departure.crews.length - 24} équipage(s) supplémentaire(s) sont visibles sur Endurance Manager.`,
      inline: false
    });
  }
  if (!fields.length) fields.push({name: 'Équipages', value: 'Aucun équipage créé pour ce départ.', inline: false});

  const circuit = circuitNames.get(departure.circuit) || departure.circuit || 'Circuit à préciser';
  const embed = {
    title: cut(`🏁 ${clean(departure.eventName)}`, 256),
    description: cut(`📅 **${departureLabel.format(departure.startsAt)}**\n📍 ${clean(circuit)}\n⏱️ ${departure.durationHours || '?'} h`, 4096),
    color: 0xd71920,
    fields
  };
  if (appUrl) embed.url = appUrl;
  if (first) {
    embed.footer = {text: 'Endurance Manager • mise à jour automatique'};
    embed.timestamp = new Date(updatedAt).toISOString();
  }
  return embed;
}

export function buildWeeklyDiscordPayload(snapshot, appUrl, updatedAt = Date.now()) {
  const content = `🏁 **Endurances LMU — ${snapshot.week.label}**`;
  if (!snapshot.departures.length) {
    return {
      content,
      embeds: [{
        title: 'Aucune endurance LMU programmée',
        description: 'Aucun départ LMU à venir ou encore en cours sur la période affichée.',
        color: 0x6b7280,
        footer: {text: 'Endurance Manager • mise à jour automatique'},
        timestamp: new Date(updatedAt).toISOString()
      }],
      allowed_mentions: {parse: []}
    };
  }

  const embeds = snapshot.departures.slice(0, 9).map((departure, index) => departureEmbed(departure, appUrl, index === 0, updatedAt));
  if (snapshot.departures.length > 9) {
    embeds.push({
      title: 'Autres départs cette semaine',
      description: cut(snapshot.departures.slice(9).map(item => `• ${departureLabel.format(item.startsAt)} — ${clean(item.eventName)}`).join('\n'), 4096),
      color: 0xd71920
    });
  }
  return {content, embeds, allowed_mentions: {parse: []}};
}

export function isWeeklyDiscordMutation(request) {
  const method = String(request?.method || '').toUpperCase();
  if (!['POST', 'PATCH', 'DELETE'].includes(method)) return false;
  let path;
  try { path = new URL(request.url).pathname; } catch { return false; }
  const uuid = '[a-f0-9-]{36}';
  if (path === '/api/events' && method === 'POST') return true;
  if (new RegExp(`^/api/events/${uuid}$`).test(path) && ['PATCH', 'DELETE'].includes(method)) return true;
  if (new RegExp(`^/api/events/${uuid}/departures/${uuid}/registrations$`).test(path) && method === 'POST') return true;
  if (new RegExp(`^/api/events/${uuid}/departures/${uuid}/crews$`).test(path) && method === 'POST') return true;
  if (new RegExp(`^/api/registrations/${uuid}$`).test(path)) return true;
  if (new RegExp(`^/api/crews/${uuid}(?:/members(?:/${uuid})?)?$`).test(path)) return true;
  return false;
}
