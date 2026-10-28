// « Annoncer un stream » of a race: when the streamer (who announced it) is in a crew of an endurance of that day on
// the same sim, the stream says so, with the crew's name and the team-mates (the site's calendar, the week's message
// and the morning announcement).
import {parisDay} from './discord-weekly-format.mjs';
import {STREAM_SIM, streamDetails} from '../shared/stream.mjs';

const parse = (value, fallback) => { try { return JSON.parse(value) ?? fallback; } catch { return fallback; } };
const minutes = time => { const [hours, mins] = String(time).split(':').map(Number); return hours * 60 + mins; };

// The crew of one stream (a row of events), or null: {eventId, eventName, crew, pilots:[team-mates]}.
export async function streamCrew(env, communityId, row) {
  const details = streamDetails({details:parse(row.details, {})}), start = parse(row.departures, [])[0];
  if (row.sim !== STREAM_SIM || !details.raceSim || !row.created_by || !Number.isFinite(Number(start?.startsAt))) return null;
  // Past streams: not looked up again.
  if (Number(start.startsAt) < Date.now() - 86400000) return null;
  // The race's start when given, else the stream's.
  const target = Number(start.startsAt) + (details.raceTime && start.time ? (minutes(details.raceTime) - minutes(start.time)) * 60000 : 0);
  const crews = (await env.DB.prepare(`SELECT e.id AS event_id,e.name AS event_name,e.departures,c.id AS crew_id,c.name AS crew_name,c.departure_id FROM registrations r
    JOIN crew_members cm ON cm.registration_id=r.id JOIN crews c ON c.id=cm.crew_id JOIN events e ON e.id=c.event_id
    WHERE r.user_id=? AND r.community_id=? AND COALESCE(e.format,'endurance')<>'solo' AND COALESCE(r.status,'')<>'unavailable'
      AND ${details.raceSim === 'iracing' ? "e.circuit LIKE 'iracing-%'" : "e.circuit NOT LIKE 'iracing-%'"}`).bind(row.created_by, communityId).all()).results || [];
  const day = parisDay(target);
  const best = crews.map(crew => ({crew, startsAt:Number(parse(crew.departures, []).find(item => item?.id === crew.departure_id)?.startsAt)}))
    .filter(item => Number.isFinite(item.startsAt) && parisDay(item.startsAt) === day)
    .sort((a, b) => Math.abs(a.startsAt - target) - Math.abs(b.startsAt - target))[0]?.crew;
  if (!best) return null;
  const mates = (await env.DB.prepare(`SELECT COALESCE(p.name,r.name) AS name FROM crew_members cm JOIN registrations r ON r.id=cm.registration_id
    LEFT JOIN participants p ON p.id=r.participant_id WHERE cm.crew_id=? AND COALESCE(r.user_id,'')<>? ORDER BY r.created_at,r.id`).bind(best.crew_id, row.created_by).all()).results || [];
  return {eventId:best.event_id, eventName:best.event_name, crew:best.crew_name, pilots:mates.map(mate => String(mate.name)).filter(Boolean)};
}
// The crews of the streams among events rows: Map(stream id → crew).
export async function streamCrews(env, communityId, rows) {
  const crews = new Map();
  for (const row of rows.filter(item => item.sim === STREAM_SIM)) {
    const crew = await streamCrew(env, communityId, row);
    if (crew) crews.set(row.id, crew);
  }
  return crews;
}
