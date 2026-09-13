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
  return new Date(day * DAY_MS + 12 * HOUR_MS);
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

function departureFields(departure) {
  const fields = departure.crews.slice(0, 23).map(crewField);
  if (departure.crews.length > 23) {
    fields.push({
      name: 'Autres équipages',
      value: `${departure.crews.length - 23} équipage(s) supplémentaire(s) sont visibles sur Endurance Manager.`,
      inline: false
    });
  }
  if (!departure.crews.length) {
    fields.push({name: 'Équipages', value: 'Aucun équipage créé pour ce départ.', inline: false});
  }
  if (departure.unassignedPilots?.length) {
    fields.push({
      name: '👤 Pilotes inscrits non affectés',
      value: cut(departure.unassignedPilots.map(clean).join(' • '), 1024),
      inline: false
    });
  }
  return fields.slice(0, 25);
}

function departureEmbed(departure, appUrl, mode, first, updatedAt) {
  const current = mode === 'current';
  const circuit = circuitNames.get(departure.circuit) || departure.circuit || 'Circuit à préciser';
  const pilotCount = Number(departure.pilotCount) || 0;
  const label = current ? '🔴 Course en cours' : '📝 Prochaine inscription';
  const pilotLine = pilotCount
    ? `👥 ${pilotCount} pilote${pilotCount > 1 ? 's' : ''} inscrit${pilotCount > 1 ? 's' : ''}`
    : '👥 Aucun pilote inscrit pour le moment';
  const embed = {
    title: cut(`${label} — ${clean(departure.eventName)}`, 256),
    description: cut(`📅 **${departureLabel.format(departure.startsAt)}**\n📍 ${clean(circuit)}\n⏱️ ${departure.durationHours || '?'} h\n${pilotLine}`, 4096),
    color: current ? 0xd71920 : 0x2563eb,
    fields: departureFields(departure)
  };
  if (appUrl) embed.url = appUrl;
  if (first) {
    embed.footer = {text: 'Endurance Manager • mise à jour automatique'};
    embed.timestamp = new Date(updatedAt).toISOString();
  }
  return embed;
}

export function buildWeeklyDiscordPayload(snapshot, appUrl, updatedAt = Date.now()) {
  const content = '🏁 **Endurance Manager — LMU**';
  const currentDepartures = Array.isArray(snapshot.currentDepartures) ? snapshot.currentDepartures : [];
  const nextDeparture = snapshot.nextDeparture || null;

  if (!currentDepartures.length && !nextDeparture) {
    return {
      content,
      embeds: [{
        title: 'Aucune endurance LMU à préparer',
        description: 'Aucune course avec un pilote FMT inscrit n’est en cours et aucun prochain départ LMU n’est programmé.',
        color: 0x6b7280,
        footer: {text: 'Endurance Manager • mise à jour automatique'},
        timestamp: new Date(updatedAt).toISOString()
      }],
      allowed_mentions: {parse: []}
    };
  }

  const embeds = [];
  for (const departure of currentDepartures.slice(0, 7)) {
    embeds.push(departureEmbed(departure, appUrl, 'current', embeds.length === 0, updatedAt));
  }
  if (currentDepartures.length > 7) {
    embeds.push({
      title: 'Autres courses en cours',
      description: cut(currentDepartures.slice(7).map(item => `• ${clean(item.eventName)}`).join('\n'), 4096),
      color: 0xd71920
    });
  }
  if (nextDeparture) {
    embeds.push(departureEmbed(nextDeparture, appUrl, 'next', embeds.length === 0, updatedAt));
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
