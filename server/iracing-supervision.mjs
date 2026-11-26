import {fail, id} from './core.mjs';

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

export async function resolveIracingConflict(env, key, revision) {
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
    conflicts:conflicts.map(row => ({...row, details:JSON.parse(row.details)})), waiting,
    seasons:manifest ? JSON.parse(manifest.payload) : null,
    lastCalendar:lastCalendar?.finished_at ?? null, lastSpecial:lastSpecial?.finished_at ?? null};
}
