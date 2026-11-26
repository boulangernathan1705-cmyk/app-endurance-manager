import {fail, id, validateEvent} from './core.mjs';

const MINUTE = 60_000;
const DAY = 1_440 * MINUTE;
const LEASE = 4 * MINUTE;
const MAX_SOURCE_BYTES = 5_000_000;

const all = async (env, sql, ...args) => (await env.DB.prepare(sql).bind(...args).all()).results || [];

export async function withIracingLock(env, work) {
  const token = id(), at = Date.now();
  const acquired = await env.DB.prepare('UPDATE iracing_sync_lock SET token=?,expires_at=? WHERE id=1 AND expires_at<=?')
    .bind(token, at + LEASE, at).run();
  if (!acquired.meta.changes) return {busy:true};
  try {
    return await work(token);
  } finally {
    await env.DB.prepare("UPDATE iracing_sync_lock SET token='',expires_at=0 WHERE id=1 AND token=?").bind(token).run();
  }
}

export async function readIracingSource(env, key, url, fetchImpl, validate, timestamp) {
  const cached = await env.DB.prepare('SELECT payload,etag,saved_at FROM iracing_sync_sources WHERE name=?').bind(key).first();
  const previous = cached ? JSON.parse(cached.payload) : null;
  try {
    const headers = {Accept:'application/json', ...(cached?.etag ? {'If-None-Match':cached.etag} : {})};
    const response = await fetchImpl(url, {headers, signal:AbortSignal.timeout(10_000)});
    if (response.status === 304 && previous != null) return {data:previous, status:'unchanged', savedAt:cached.saved_at};
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const length = Number(response.headers.get('Content-Length'));
    if (length > MAX_SOURCE_BYTES) throw new Error('réponse trop volumineuse');
    const reader = response.body?.getReader();
    if (!reader) throw new Error('réponse vide');
    const decoder = new TextDecoder();
    let bytes = 0, raw = '';
    for (;;) {
      const {done, value} = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_SOURCE_BYTES) {
        await reader.cancel();
        throw new Error('réponse trop volumineuse');
      }
      raw += decoder.decode(value, {stream:true});
    }
    const data = validate(JSON.parse(raw + decoder.decode()), previous);
    const payload = JSON.stringify(data), etag = response.headers.get('ETag')?.slice(0, 512) ?? null;
    if (new TextEncoder().encode(payload).length > 1_900_000) throw new Error('calendrier validé trop volumineux');
    const changed = payload !== cached?.payload;
    if (changed || etag !== cached?.etag) {
      await env.DB.prepare(`INSERT INTO iracing_sync_sources(name,payload,etag,saved_at) VALUES(?,?,?,?)
        ON CONFLICT(name) DO UPDATE SET payload=excluded.payload,etag=excluded.etag,saved_at=excluded.saved_at`)
        .bind(key, payload, etag, changed ? timestamp : cached.saved_at).run();
    }
    return {data, status:changed ? 'available' : 'unchanged', savedAt:changed ? timestamp : cached.saved_at};
  } catch (error) {
    return {data:previous, status:previous == null ? 'unavailable' : 'stale', savedAt:cached?.saved_at ?? null,
      error:String(error.message || 'source indisponible').slice(0, 140)};
  }
}

export async function runIracingSync(env, mode, timestamp, scheduled, work) {
  if (env.IRACING_IMPORT === 'off') return {disabled:true};
  return withIracingLock(env, async token => {
    if (scheduled && mode === 'calendar') {
      const recent = await env.DB.prepare('SELECT finished_at,status FROM iracing_sync_runs WHERE mode=? ORDER BY started_at DESC LIMIT 1').bind(mode).first();
      const delay = recent?.status === 'ok' ? 360 * MINUTE : 60 * MINUTE;
      if (recent && timestamp - recent.finished_at < delay) return {deferred:true,created:0,completed:0};
    }
    const started = Date.now();
    let summary, status, error;
    try {
      summary = await work(token);
      status = summary.errors?.length ? 'partial' : 'ok';
    } catch (caught) {
      error = caught;
      summary = {sources:caught.sources || {}, errors:[String(caught.message || 'synchronisation interrompue').slice(0, 140)]};
      status = 'failed';
    }
    if (summary.idle) return summary;
    await env.DB.batch([
      env.DB.prepare('INSERT INTO iracing_sync_runs VALUES(?,?,?,?,?,?)')
        .bind(token, mode, timestamp, timestamp + Math.max(0, Date.now() - started), status, JSON.stringify(summary)),
      env.DB.prepare('DELETE FROM iracing_sync_runs WHERE started_at < ?').bind(timestamp - 14 * DAY)
    ]);
    if (error) throw error;
    return summary;
  });
}

export function conflictKey(plan) {
  return plan.identity || plan.externalId;
}

export async function recordIracingConflict(env, plan, row, details, timestamp) {
  const payload = JSON.stringify(details);
  const result = await env.DB.prepare(`INSERT INTO iracing_sync_conflicts(source_key,event_id,name,details,updated_at) VALUES(?,?,?,?,?)
    ON CONFLICT(source_key) DO UPDATE SET event_id=excluded.event_id,name=excluded.name,details=excluded.details,updated_at=excluded.updated_at,resolved_at=NULL
    WHERE details<>excluded.details OR event_id IS NOT excluded.event_id`)
    .bind(conflictKey(plan), row?.id ?? null, plan.input?.name || plan.name, payload, timestamp).run();
  return Boolean(result.meta.changes);
}

export async function clearIracingConflict(env, plan) {
  await env.DB.prepare('DELETE FROM iracing_sync_conflicts WHERE source_key=? AND resolved_at IS NULL').bind(conflictKey(plan)).run();
}

const APPLICABLE_FIELDS = new Set(['name','circuit','durationMinutes','categories','rounds','driverChangeRequired','starts']);
const sameValue = (a,b) => JSON.stringify(a) === JSON.stringify(b);
const localClock = new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
function officialDeparture(startsAt) {
  const p = Object.fromEntries(localClock.formatToParts(new Date(startsAt)).map(part=>[part.type,part.value]));
  return {date:`${p.year}-${p.month}-${p.day}`,time:`${p.hour}:${p.minute}`,startsAt};
}
function applicableIssues(details) {
  return Array.isArray(details?.fields) && details.fields.length > 0 &&
    details.fields.every(issue => issue.reason === 'manual' && APPLICABLE_FIELDS.has(issue.field));
}

async function applyIracingConflict(env, key, revision) {
  const result = await withIracingLock(env, async () => {
    const db = env.DB, at = Date.now();
    const conflict = await db.prepare('SELECT * FROM iracing_sync_conflicts WHERE source_key=? AND updated_at=? AND resolved_at IS NULL').bind(key,revision).first();
    if (!conflict) fail(409,'Ce conflit a changé. Actualise le suivi.');
    const details = JSON.parse(conflict.details);
    if (!conflict.event_id || !applicableIssues(details)) fail(409,'Ce signalement nécessite une vérification manuelle.');
    const row = await db.prepare(`SELECT e.*,i.external_id,i.source_snapshot,
      EXISTS(SELECT 1 FROM registrations WHERE event_id=e.id UNION ALL SELECT 1 FROM crews WHERE event_id=e.id) AS occupied
      FROM events e JOIN iracing_imports i ON i.event_id=e.id AND i.community_id='official'
      WHERE e.id=? AND e.community_id='official' AND e.created_by='system:iracing'`).bind(conflict.event_id).first();
    if (!row || row.occupied || row.official_schedule_status) fail(409,'Ouvre la course pour arbitrer sans perdre les inscriptions.');
    const old = JSON.parse(row.departures), real = old.filter(d=>!d.tbd), current = {
      name:row.name,circuit:row.circuit,durationMinutes:Number(row.duration_minutes)||Number(row.duration_hours)*60,
      categories:JSON.parse(row.categories),rounds:JSON.parse(row.rounds||'[]'),
      driverChangeRequired:row.driver_change_required == null ? null : Boolean(row.driver_change_required),
      starts:real.map(d=>d.startsAt).filter(t=>t>at).sort((a,b)=>a-b)
    };
    const selected = {...current};
    const fields = new Set();
    for (const issue of details.fields) {
      const local = issue.field === 'starts' && Array.isArray(issue.local) ? issue.local.filter(t=>t>at) : issue.local;
      if (!sameValue(current[issue.field],local)) fail(409,'La course a changé depuis ce signalement. Actualise le suivi.');
      selected[issue.field] = issue.incoming;
      fields.add(issue.field);
    }
    let departures = old;
    if (fields.has('starts')) {
      if (!Array.isArray(selected.starts) || !selected.starts.length || selected.starts.some(t=>!Number.isSafeInteger(t))) fail(409,'Les horaires officiels ne sont pas exploitables.');
      const future = [...new Set(selected.starts.filter(t=>t>at))].sort((a,b)=>a-b);
      if (!future.length) fail(409,'Les départs proposés sont déjà passés.');
      const byTime = new Map(real.map(d=>[d.startsAt,d]));
      departures = [...real.filter(d=>d.startsAt<=at),...future.map(t=>byTime.get(t)||officialDeparture(t))];
      selected.starts = future;
    }
    const input = {...selected,format:row.format,sim:row.sim,eventType:row.event_type,access:row.access,capacity:row.capacity,
      details:JSON.parse(row.details||'{}'),schedulePending:fields.has('starts')?false:Boolean(row.schedule_pending),departures};
    const data = validateEvent(input,row,{officialImport:true});
    // In solo, duration, track and classes derive from rounds. Never accept a conflicting combination.
    for (const field of fields) {
      const value = field === 'starts' ? data.departures.filter(d=>!d.tbd&&d.startsAt>at).map(d=>d.startsAt)
        : field === 'driverChangeRequired' ? data.driverChangeRequired ?? null : data[field];
      if (!sameValue(value,selected[field])) fail(409,'Ces valeurs doivent être arbitrées ensemble dans la fiche course.');
    }
    const snapshot = JSON.parse(row.source_snapshot||'{}');
    for (const field of fields) snapshot[field] = selected[field];
    try {
      await db.batch([
        db.prepare(`UPDATE events SET name=?,circuit=?,duration_hours=?,duration_minutes=?,categories=?,rounds=?,departures=?,
          driver_change_required=?,schedule_pending=?,version=version+1 WHERE id=? AND version=?
          AND official_schedule_status IS NULL
          AND NOT EXISTS(SELECT 1 FROM registrations WHERE event_id=events.id)
          AND NOT EXISTS(SELECT 1 FROM crews WHERE event_id=events.id)
          AND EXISTS(SELECT 1 FROM iracing_sync_conflicts WHERE source_key=? AND updated_at=? AND resolved_at IS NULL)`)
          .bind(data.name,data.circuit,data.durationHours,data.durationMinutes,JSON.stringify(data.categories),JSON.stringify(data.rounds),
            JSON.stringify(data.departures),data.driverChangeRequired==null?null:Number(data.driverChangeRequired),data.schedulePending?1:0,
            row.id,row.version,key,revision),
        db.prepare("UPDATE iracing_imports SET source_snapshot=? WHERE community_id='official' AND external_id=? AND changes()=1")
          .bind(JSON.stringify(snapshot),row.external_id),
        db.prepare('UPDATE iracing_sync_conflicts SET resolved_at=? WHERE source_key=? AND updated_at=? AND resolved_at IS NULL AND changes()=1')
          .bind(at,key,revision),
        db.prepare("SELECT CASE WHEN changes()<>1 THEN json('iracing_conflict_stale') END")
      ]);
    } catch (error) {
      if (/malformed JSON/i.test(error.message)) fail(409,'La course ou les inscriptions ont changé. Actualise le suivi.');
      throw error;
    }
    return {ok:true,applied:true};
  });
  if (result.busy) fail(409,'Une synchronisation iRacing est déjà en cours.');
  return result;
}

export async function resolveIracingConflict(env, key, revision, action = 'keep') {
  if (action === 'apply') return applyIracingConflict(env,key,revision);
  if (action !== 'keep') fail(400,'Décision invalide.');
  const result = await env.DB.prepare('UPDATE iracing_sync_conflicts SET resolved_at=? WHERE source_key=? AND updated_at=? AND resolved_at IS NULL')
    .bind(Date.now(), key, revision).run();
  if (!result.meta.changes) fail(409, 'Ce conflit a changé. Actualise le suivi.');
  return {ok:true};
}

export async function iracingSupervision(env, timestamp = Date.now()) {
  const [sources, history, conflicts, waiting, lastCalendar, lastSpecial, manifest] = await Promise.all([
    all(env, 'SELECT name,saved_at FROM iracing_sync_sources ORDER BY name'),
    all(env, 'SELECT * FROM iracing_sync_runs ORDER BY started_at DESC LIMIT 24'),
    all(env, `SELECT c.*,
      (SELECT count(*) FROM registrations WHERE event_id=c.event_id) AS registrations,
      (SELECT count(*) FROM crews WHERE event_id=c.event_id) AS crews
      FROM iracing_sync_conflicts c WHERE resolved_at IS NULL ORDER BY updated_at DESC LIMIT 60`),
    all(env, "SELECT id,name,last_start FROM events WHERE community_id='official' AND created_by='system:iracing' AND schedule_pending=1 AND last_start>=? ORDER BY last_start LIMIT 60", timestamp - 7 * DAY),
    env.DB.prepare("SELECT finished_at FROM iracing_sync_runs WHERE mode='calendar' AND status='ok' ORDER BY started_at DESC LIMIT 1").first(),
    env.DB.prepare("SELECT finished_at FROM iracing_sync_runs WHERE mode='special' AND status='ok' ORDER BY started_at DESC LIMIT 1").first(),
    env.DB.prepare("SELECT payload FROM iracing_sync_sources WHERE name='manifest'").first()
  ]);
  return {sources, history:history.map(row => ({...row, summary:JSON.parse(row.summary)})),
    conflicts:conflicts.map(row => {const details=JSON.parse(row.details);return {...row,details,canApply:Boolean(row.event_id && !row.registrations && !row.crews && applicableIssues(details))};}), waiting,
    seasons:manifest ? JSON.parse(manifest.payload) : null,
    lastCalendar:lastCalendar?.finished_at ?? null, lastSpecial:lastSpecial?.finished_at ?? null};
}
