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

function pilotLines(pilots) {
  return pilots.map(name => `👤 ${clean(name)}`).join('\n');
}

function crewText(crew) {
  const marker = markers.get(crew.category) || '⬜';
  const status = crew.locked ? '🔒 Complet' : '🔓 Ouvert';
  const pilots = crew.pilots.length ? pilotLines(crew.pilots) : 'Aucun pilote affecté';
  return `${marker} ${clean(crew.name)} · ${clean(crew.category)} · ${status}\n${crew.car ? `🏎️ ${clean(crew.car)}` : '🏎️ Voiture à définir'}\n${pilots}`;
}

function crewField(crew) {
  const marker = markers.get(crew.category) || '⬜';
  const status = crew.locked ? '🔒 Complet' : '🔓 Ouvert';
  const pilots = crew.pilots.length ? pilotLines(crew.pilots) : 'Aucun pilote affecté';
  return {
    name: cut(`${marker} ${clean(crew.name)} · ${clean(crew.category)} · ${status}`, 256),
    value: cut(`${crew.car ? `🏎️ ${clean(crew.car)}` : '🏎️ Voiture à définir'}\n${pilots}`, 1024),
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
  if (departure.unassignedPilots?.length) {
    fields.push({
      name: '📋 Pilotes inscrits non affectés',
      value: cut(pilotLines(departure.unassignedPilots), 1024),
      inline: false
    });
  }
  return fields.slice(0, 25);
}

function currentDepartureEmbed(departure, appUrl, first, updatedAt) {
  const circuit = circuitNames.get(departure.circuit) || departure.circuit || 'Circuit à préciser';
  const embed = {
    title: cut(`🔴 Course en cours — ${clean(departure.eventName)}`, 256),
    description: cut(`📅 **${departureLabel.format(departure.startsAt)}**\n📍 ${clean(circuit)}\n⏱️ ${departure.durationHours || '?'} h`, 4096),
    color: 0xd71920,
    fields: departureFields(departure)
  };
  if (appUrl) embed.url = appUrl;
  if (first) {
    embed.footer = {text: 'Endurance Manager • mise à jour automatique'};
    embed.timestamp = new Date(updatedAt).toISOString();
  }
  return embed;
}

function eventTitleAndNote(eventName) {
  const text = String(eventName ?? '').trim();
  const match = text.match(/^(.*?)\s*\(([^)]*horaires?[^)]*)\)\s*$/i);
  if (!match) return {title:clean(text),note:''};
  const note = match[2].trim();
  return {
    title:clean(match[1]),
    note:clean(note ? `${note.charAt(0).toUpperCase()}${note.slice(1)}` : '')
  };
}

function compactDepartureLabel(timestamp) {
  return departureLabel.format(timestamp).replace(' à ', ' — ');
}

function futureDepartureDetails(departure) {
  const blocks = departure.crews.map(crewText);
  if (departure.unassignedPilots?.length) {
    blocks.push(`📋 Pilotes inscrits non affectés\n${pilotLines(departure.unassignedPilots)}`);
  }
  return blocks.join('\n\n');
}

function futureDepartureBlock(departure) {
  const details = futureDepartureDetails(departure);
  const heading = `🕐 **${clean(compactDepartureLabel(departure.startsAt))}**`;
  return cut(details ? `${heading}\n${details}` : heading, 1024);
}

function groupFutureDepartures(departures) {
  const groups = new Map();
  for (const departure of departures) {
    const key = departure.eventId || departure.eventName || 'event';
    if (!groups.has(key)) groups.set(key,{eventName:departure.eventName,departures:[]});
    groups.get(key).departures.push(departure);
  }
  return [...groups.values()];
}

function futureEventFields(departures) {
  const fields = [];
  for (const group of groupFutureDepartures(departures)) {
    const {title,note} = eventTitleAndNote(group.eventName);
    let firstChunk = true;
    let chunk = note;

    for (const departure of group.departures) {
      const block = futureDepartureBlock(departure);
      const candidate = chunk ? `${chunk}\n\n${block}` : block;
      if (candidate.length > 1024 && chunk) {
        fields.push({
          name: cut(firstChunk ? `🏁 ${title}` : '↳ Suite',256),
          value:cut(chunk,1024),
          inline:false
        });
        firstChunk = false;
        chunk = block;
      } else {
        chunk = candidate;
      }
    }

    if (chunk) {
      fields.push({
        name: cut(firstChunk ? `🏁 ${title}` : '↳ Suite',256),
        value:cut(chunk,1024),
        inline:false
      });
    }
  }
  return fields;
}

function futureDepartureEmbeds(departures, periodLabel, appUrl, first, updatedAt) {
  const allFields = futureEventFields(departures);
  const embeds = [];
  for (let offset = 0; offset < allFields.length; offset += 25) {
    const embed = {
      title: cut(`📝 Départs disponibles — ${periodLabel || 'semaine à venir'}`, 256),
      description: offset === 0 ? 'Tous les horaires encore disponibles pour les inscriptions.' : 'Suite des horaires disponibles.',
      color: 0x2563eb,
      fields:allFields.slice(offset,offset + 25)
    };
    if (appUrl) embed.url = appUrl;
    if (first && embeds.length === 0) {
      embed.footer = {text: 'Endurance Manager • mise à jour automatique'};
      embed.timestamp = new Date(updatedAt).toISOString();
    }
    embeds.push(embed);
  }
  return embeds;
}

export function buildWeeklyDiscordPayload(snapshot, appUrl, updatedAt = Date.now()) {
  const content = '🏁 **Endurance Manager — LMU**';
  const currentDepartures = Array.isArray(snapshot.currentDepartures) ? snapshot.currentDepartures : [];
  const futureDepartures = Array.isArray(snapshot.futureDepartures) ? snapshot.futureDepartures : [];

  if (!currentDepartures.length && !futureDepartures.length) {
    return {
      content,
      embeds: [{
        title: 'Aucune endurance LMU à préparer',
        description: 'Aucune course avec un équipage engagé n’est en cours et aucun prochain départ LMU n’est programmé.',
        color: 0x6b7280,
        footer: {text: 'Endurance Manager • mise à jour automatique'},
        timestamp: new Date(updatedAt).toISOString()
      }],
      allowed_mentions: {parse: []}
    };
  }

  const embeds = [];
  for (const departure of currentDepartures) {
    embeds.push(currentDepartureEmbed(departure, appUrl, embeds.length === 0, updatedAt));
  }

  if (futureDepartures.length) {
    embeds.push(...futureDepartureEmbeds(
      futureDepartures,
      snapshot.periodLabel,
      appUrl,
      embeds.length === 0,
      updatedAt
    ));
  }

  return {content, embeds:embeds.slice(0, 10), allowed_mentions: {parse: []}};
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
