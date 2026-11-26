import {notify} from './notifications.mjs';

export const BELL_REMINDER_WINDOW = 24 * 3600_000;

// The bell, 24 h before a start: every pilot entered there in the community, with their crew and its voice channel.
export async function bellReminders(env, timestamp, communities) {
  if (!communities.length) return 0;
  let told = 0;
  // The starts of the coming 24 h with pilots of a community not reminded yet (a few per run), in one query.
  // Apply the indexed lower bound before reading departures. The last start can be beyond 24 h
  // while one of the earlier departures of the same race still needs a reminder.
  const starts = (await env.DB.prepare(`SELECT k.value AS community_id, e.id, e.name, e.circuit, e.community_id AS event_community,
      json_extract(j.value,'$.id') AS departure_id, json_extract(j.value,'$.startsAt') AS starts_at
    FROM json_each(?) k, events e, json_each(e.departures) j
    WHERE (e.community_id=k.value OR e.community_id='official') AND e.last_start > ?
      AND e.schedule_pending=0 AND COALESCE(json_extract(j.value,'$.tbd'),0)=0
      AND json_extract(j.value,'$.startsAt') > ? AND json_extract(j.value,'$.startsAt') <= ?
      AND EXISTS(SELECT 1 FROM registrations g WHERE g.event_id=e.id AND g.departure_id=json_extract(j.value,'$.id') AND g.community_id=k.value)
      AND NOT EXISTS(SELECT 1 FROM race_reminders r WHERE r.event_id=e.id AND r.departure_id=json_extract(j.value,'$.id') AND r.community_id=k.value)
    LIMIT 3`).bind(JSON.stringify(communities.map(item => item.id)), timestamp, timestamp, timestamp + BELL_REMINDER_WINDOW).all()).results || [];
  for (const start of starts) {
    // Marked first: a reminder is never sent twice, even if the run stops halfway.
    const mark = await env.DB.prepare('INSERT OR IGNORE INTO race_reminders(event_id,departure_id,community_id,sent_at) VALUES(?,?,?,?)').bind(start.id, start.departure_id, start.community_id, timestamp).run();
    if (!mark.meta.changes) continue;
    const entries = (await env.DB.prepare(`SELECT DISTINCT p.user_id, c.id AS crew_id, c.name AS crew_name, d.voice_id, d.guild_id FROM registrations r
        JOIN participants p ON p.id=r.participant_id
        LEFT JOIN crew_members cm ON cm.registration_id=r.id LEFT JOIN crews c ON c.id=cm.crew_id
        LEFT JOIN crew_discord d ON d.crew_id=c.id AND d.closed_at IS NULL AND d.voice_id IS NOT NULL
      WHERE r.event_id=? AND r.departure_id=? AND r.community_id=? AND p.user_id IS NOT NULL AND r.status!='unavailable'`)
      .bind(start.id, start.departure_id, start.community_id).all()).results || [];
    // One notification per crew (its name and voice channel), one for the pilots without a crew.
    const groups = new Map();
    for (const entry of entries) {
      const key = entry.crew_id || '';
      if (!groups.has(key)) groups.set(key, {entry, users:[]});
      groups.get(key).users.push(entry.user_id);
    }
    const event = {id:start.id, name:start.name, circuit:start.circuit, community_id:start.event_community};
    const departure = {startsAt:Number(start.starts_at), tbd:false};
    for (const {entry, users} of groups.values()) {
      const data = entry.crew_id ? {crewName:entry.crew_name, ...(entry.voice_id ? {channelUrl:`https://discord.com/channels/${entry.guild_id}/${entry.voice_id}`} : {})} : {};
      told += await notify(env, users.map(user_id => ({user_id, community_id:start.community_id})), 'race_reminder', event, {departure, ...data});
    }
  }
  return told;
}
