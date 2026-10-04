// Notifications on the site (migration 0043): the bell next to the account tells a player what happens on the races
// he is entered in. Only players with a Discord account are told, never the one who did the action, and a
// notification never stops the action itself (an error is only written to the logs).
import {id, now, fail, json} from './core.mjs';

const KEEP_DAYS = 30;
const LIST_SIZE = 30;
const MAX_RECIPIENTS = 200;
export const NOTIFICATION_KINDS = ['entry', 'entered_by', 'crew_join', 'crew_added', 'crew_leave', 'crew_removed', 'crew_deleted', 'crew_start', 'crew_car', 'withdrawn', 'removed_by', 'race_changed', 'race_deleted', 'race_reminder'];

const all = async (env, sql, ...params) => (await env.DB.prepare(sql).bind(...params).all()).results || [];
const game = event => String(event?.circuit || '').startsWith('iracing-') ? 'iracing' : 'lmu';

// The pilots entered on a start, in one community (the others never see who enters there).
export function departurePilots(env, eventId, departureId, communityId) {
  return all(env, `SELECT DISTINCT p.user_id, r.community_id FROM registrations r JOIN participants p ON p.id=r.participant_id
    WHERE r.event_id=? AND r.departure_id=? AND r.community_id=? AND p.user_id IS NOT NULL AND r.status!='unavailable'`, eventId, departureId, communityId);
}
// Every pilot entered in a race, each with the community of his entry.
export function eventPilots(env, eventId) {
  return all(env, `SELECT DISTINCT p.user_id, r.community_id FROM registrations r JOIN participants p ON p.id=r.participant_id
    WHERE r.event_id=? AND p.user_id IS NOT NULL`, eventId);
}
// The pilots of a crew, and its manager.
export function crewPilots(env, crewId) {
  return all(env, `SELECT p.user_id, c.community_id FROM crew_members cm JOIN crews c ON c.id=cm.crew_id
      JOIN registrations r ON r.id=cm.registration_id JOIN participants p ON p.id=r.participant_id
      WHERE cm.crew_id=? AND p.user_id IS NOT NULL
    UNION SELECT owner_user_id, community_id FROM crews WHERE id=? AND owner_user_id IS NOT NULL`, crewId, crewId);
}

// `recipients`: [{user_id, community_id}]; `skip`: players not told (the one who did it, the pilot concerned…).
// `data`: what the message shows (names of the pilot, the crew, the one who did it), with the race and its start.
export async function notify(env, recipients, kind, event, {departure = null, skip = [], ...data} = {}) {
  try {
    const left = new Set(skip.filter(Boolean)), seen = new Set(), rows = [];
    for (const item of recipients) {
      const user = item?.user_id;
      if (!user || left.has(user) || seen.has(user) || String(user).startsWith('system:')) continue;
      seen.add(user); rows.push(item);
      if (rows.length >= MAX_RECIPIENTS) break;
    }
    if (!rows.length) return 0;
    const payload = JSON.stringify({eventName:event.name, game:game(event), ...(departure ? {startsAt:departure.startsAt, tbd:Boolean(departure.tbd)} : {}), ...data});
    const official = event.community_id === 'official' ? 1 : 0, time = now();
    const statements = rows.map(row => env.DB.prepare('INSERT INTO notifications(id,user_id,community_id,official,kind,event_id,data,created_at) VALUES(?,?,?,?,?,?,?,?)')
      .bind(id(), row.user_id, row.community_id, official, kind, event.id, payload, time));
    for (let start = 0; start < statements.length; start += 50) await env.DB.batch(statements.slice(start, start + 50));
    return rows.length;
  } catch (error) {
    console.error('Notification failed', kind, error instanceof Error ? error.message.slice(0, 80) : 'unknown');
    return 0;
  }
}

// Seen on this community's site: its own notifications and those of the official races (common to every community).
const VISIBLE = 'user_id=? AND (community_id=? OR official=1)';

export async function notificationsApi(path, method, env, actor, community) {
  if (path !== '/api/notifications' && path !== '/api/notifications/read') return null;
  if (!actor.user) fail(401, 'Connecte-toi avec Discord pour voir tes notifications.');
  if (path === '/api/notifications' && method === 'GET') {
    const items = (await all(env, `SELECT id, kind, event_id, data, created_at, read_at FROM notifications WHERE ${VISIBLE} ORDER BY created_at DESC, rowid DESC LIMIT ${LIST_SIZE}`, actor.user.id, community.id))
      .map(row => {
        let data = {};
        try { data = JSON.parse(row.data || '{}'); } catch {}
        return {id:row.id, kind:row.kind, eventId:row.event_id, createdAt:row.created_at, read:row.read_at != null, ...data};
      });
    const unread = (await env.DB.prepare(`SELECT COUNT(*) AS n FROM notifications WHERE ${VISIBLE} AND read_at IS NULL`).bind(actor.user.id, community.id).first())?.n || 0;
    return json({unread:Number(unread), notifications:items});
  }
  if (path === '/api/notifications/read' && method === 'POST') {
    // Opening the bell: everything shown is read.
    await env.DB.prepare(`UPDATE notifications SET read_at=? WHERE ${VISIBLE} AND read_at IS NULL`).bind(now(), actor.user.id, community.id).run();
    return json({ok:true});
  }
  fail(404, 'Action introuvable.');
}

// Notifications older than 30 days go (scheduled task).
export async function purgeNotifications(env) {
  await env.DB.prepare('DELETE FROM notifications WHERE id IN (SELECT id FROM notifications WHERE created_at<? LIMIT 500)').bind(now() - KEEP_DAYS * 86400).run();
}
