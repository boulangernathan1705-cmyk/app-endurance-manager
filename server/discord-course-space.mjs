// Shared lifecycle for text recaps and crew voices. Times are milliseconds.
export const COURSE_CLOSE_AFTER = 24 * 3600000;
function starts(event) {
  try { const value = JSON.parse(event?.departures); return Array.isArray(value) ? value : []; } catch { return []; }
}
function knownStart(item) {
  return item && !item.tbd && item.startsAt != null && item.startsAt !== '' && Number.isFinite(Number(item.startsAt));
}
function duration(event) {
  const minutes = Number(event.duration_minutes) || Number(event.duration_hours) * 60;
  return Number.isFinite(minutes) && minutes > 0 ? minutes * 60000 : null;
}
export function eventDeletionTime(event) {
  const departures = starts(event), length = duration(event || {});
  if (!departures.length || event.schedule_pending || !departures.every(knownStart) || length === null) return null;
  return Math.max(...departures.map(item => Number(item.startsAt))) + length + COURSE_CLOSE_AFTER;
}
// A crew's voice expires after its own departure, independently of later starts of the event.
export function crewDeletionTime(event, departureId) {
  const departure = starts(event).find(item => item?.id === departureId), length = duration(event || {});
  if (event?.schedule_pending || !knownStart(departure) || length === null) return null;
  return Number(departure.startsAt) + length + COURSE_CLOSE_AFTER;
}
export const eventGame = event => String(event?.circuit || '').startsWith('iracing-') ? 'iracing' : 'lmu';
export function courseCategory(settings, event) {
  return eventGame(event) === 'iracing' && settings.iracing_destination_id ? settings.iracing_destination_id : settings.destination_id;
}
export function coordinatesCourse(settings, guildId, event) {
  return Boolean(settings?.adopted && settings.enabled && settings.mode === 'events' && settings.guild_id === guildId &&
    (settings.scope === 'all' || settings.scope === eventGame(event)));
}

// Delete only tracked voices of this community, race and server, before deleting its text recap.
// Each step is persisted. A busy crew or a failed Discord request postpones the text deletion.
export async function closeCourseVoices(env, publication, timestamp, request) {
  const source = `SELECT d.*,c.id AS current_crew_id,c.event_id AS current_race_id,c.departure_id,e.id AS current_event_id,
      e.departures,e.duration_hours,e.duration_minutes,e.schedule_pending
    FROM crew_discord d LEFT JOIN crews c ON c.id=d.crew_id LEFT JOIN events e ON e.id=COALESCE(c.event_id,d.event_id)
    `;
  const rows = (await env.DB.prepare(`${source}
    WHERE d.community_id=? AND COALESCE(c.event_id,d.event_id)=? AND d.guild_id=? AND d.closed_at IS NULL`)
    .bind(publication.community_id, publication.event_id, publication.guild_id).all()).results || [];
  for (const row of rows) {
    const now = Date.now();
    const lock = await env.DB.prepare('UPDATE crew_discord SET lock_until=? WHERE crew_id=? AND lock_until<? AND closed_at IS NULL')
      .bind(now + 60000, row.crew_id, now).run();
    if (!lock.meta.changes) return false;
    try {
      const fresh = await env.DB.prepare(`${source} WHERE d.crew_id=? AND d.closed_at IS NULL`).bind(row.crew_id).first();
      if (!fresh || (fresh.current_race_id || fresh.event_id) !== publication.event_id) return false;
      Object.assign(row,fresh);
      const expiry = row.current_event_id ? crewDeletionTime(row,row.departure_id) : row.delete_after;
      if ((row.current_crew_id || !row.current_event_id) && (expiry === null || timestamp < expiry)) return false;
      for (const field of ['voice_id','text_id','category_id']) {
        if (!row[field]) continue;
        try { await request('DELETE', `/channels/${row[field]}`); }
        catch (error) { if (error.status !== 404) throw error; }
        await env.DB.prepare(`UPDATE crew_discord SET ${field}=NULL WHERE crew_id=?`).bind(row.crew_id).run();
      }
      await env.DB.prepare('UPDATE crew_discord SET closed_at=? WHERE crew_id=?').bind(timestamp, row.crew_id).run();
    } finally {
      await env.DB.prepare('UPDATE crew_discord SET lock_until=0 WHERE crew_id=?').bind(row.crew_id).run();
    }
  }
  return true;
}
