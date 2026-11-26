import {id} from './core.mjs';
import {askToChooseStart, waitingMoves} from './event-departures.mjs';
import {recordIracingConflict, clearIracingConflict} from './iracing-supervision.mjs';

const equal = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const startsOf = departures => departures.filter(departure => !departure.tbd).map(departure => departure.startsAt).sort((a,b) => a-b);
const future = (starts, time) => (starts || []).filter(start => start > time);
const FIELDS = ['name','circuit','durationMinutes','categories','rounds','driverChangeRequired','starts'];

export function sourceSnapshot(data) {
  return {name:data.name, circuit:data.circuit, durationMinutes:data.durationMinutes, categories:data.categories, rounds:data.rounds,
    driverChangeRequired:data.driverChangeRequired ?? null, starts:startsOf(data.departures)};
}

function savedSnapshot(row, departures) {
  return sourceSnapshot({name:row.name, circuit:row.circuit, durationMinutes:Number(row.duration_minutes)||Number(row.duration_hours)*60,
    categories:JSON.parse(row.categories), rounds:JSON.parse(row.rounds||'[]'), departures,
    driverChangeRequired:row.driver_change_required == null ? null : Boolean(row.driver_change_required)});
}

export function reconcileStarts(existing, incoming, at) {
  const byTime = new Map(existing.filter(d => !d.tbd).map(d => [d.startsAt, d]));
  return [...existing.filter(d => d.tbd || d.startsAt <= at),
    ...incoming.filter(d => !d.tbd && d.startsAt > at).map(d => byTime.get(d.startsAt) || {...d,id:id()})]
    .sort((a,b) => a.startsAt-b.startsAt || Number(Boolean(b.tbd))-Number(Boolean(a.tbd)));
}

function notificationStatement(env, event, change, {departureIds, token = null} = {}) {
  const data = JSON.stringify({eventName:event.name, game:'iracing', ...change});
  // A single set operation scopes the audience to the affected starts and keeps crew owners in the loop.
  return env.DB.prepare(`INSERT INTO notifications(id,user_id,community_id,official,kind,event_id,data,created_at)
    SELECT lower(hex(randomblob(16))),user_id,min(community_id),1,'race_changed',?,?,unixepoch() FROM (
      SELECT p.user_id,r.community_id FROM registrations r JOIN participants p ON p.id=r.participant_id
      WHERE r.event_id=? AND r.status!='unavailable' AND (? IS NULL OR r.departure_id IN (SELECT value FROM json_each(?)))
      UNION ALL SELECT owner_user_id,community_id FROM crews
      WHERE event_id=? AND (? IS NULL OR departure_id IN (SELECT value FROM json_each(?)))
    ) WHERE user_id IS NOT NULL AND (? IS NULL OR EXISTS(SELECT 1 FROM iracing_imports WHERE event_id=? AND reconcile_token=?)) GROUP BY user_id`)
    .bind(event.id, data, event.id, departureIds ? JSON.stringify(departureIds) : null, JSON.stringify(departureIds || []),
      event.id, departureIds ? JSON.stringify(departureIds) : null, JSON.stringify(departureIds || []), token,event.id,token);
}

export async function synchronizeKnown(env, row, data, plan, at) {
  const old = JSON.parse(row.departures), current = savedSnapshot(row, old);
  const baseline = row.source_snapshot ? JSON.parse(row.source_snapshot) : null;
  const previousMeta = row.source_metadata ? JSON.parse(row.source_metadata) : {};
  const metadata = {...previousMeta, ...plan.metadata};
  const completeArticle = plan.articleComplete && (!previousMeta.articleCount || plan.articleCount >= previousMeta.articleCount);
  if (plan.articleCount) metadata.articleCount = Math.max(plan.articleCount,previousMeta.articleCount || 0);
  if (!plan.articleStarts && previousMeta.articleCount) {
    metadata.layout = previousMeta.layout;
    if (data && baseline) data = {...data,circuit:baseline.circuit,durationMinutes:baseline.durationMinutes,durationHours:Math.ceil(baseline.durationMinutes/60)};
  }
  if (!plan.metadata.status && previousMeta.status) metadata.status = previousMeta.status;
  // A partial publication can add slots, but its omissions must never remove one.
  const next = data ? sourceSnapshot(data) : {...current};
  const validStarts = !plan.special || Boolean(plan.articleStarts);
  if (!validStarts) next.starts = baseline?.starts || [];
  const knownStarts = baseline?.starts || [];
  if (plan.special && plan.articleStarts && !completeArticle)
    next.starts = [...new Set([...knownStarts,...next.starts])].sort((a,b) => a-b);
  if (plan.input.circuit === 'iracing-tbd' && data?.circuit === 'iracing-tbd' && row.circuit !== 'iracing-tbd')
    next.circuit = baseline?.circuit ?? current.circuit;
  if (!plan.input.durationMinutes) next.durationMinutes = baseline?.durationMinutes ?? current.durationMinutes;
  if (next.driverChangeRequired == null) next.driverChangeRequired = baseline?.driverChangeRequired ?? current.driverChangeRequired;

  const accepted = baseline ? {...baseline} : {...next};
  const proposed = new Set(), issues = [];
  const discrepancy = (field, reason, local, previous, incoming) => issues.push({field, reason, local, previous, incoming});
  for (const field of FIELDS) {
    const local = field === 'starts' ? future(current.starts,at) : current[field];
    const before = field === 'starts' ? future(knownStarts,at) : baseline?.[field] ?? current[field];
    const incoming = field === 'starts' ? future(next.starts,at) : next[field];
    const initialPublication = field === 'starts' && plan.special && validStarts && row.schedule_pending && !current.starts.length;
    if (field === 'starts' && !validStarts) continue;
    if (equal(local,incoming)) {
      if (field !== 'starts' || !equal(before,incoming) || !baseline) accepted[field] = next[field];
      continue;
    }
    if (!initialPublication && (!baseline || equal(before,incoming))) {
      if (!baseline && !row.source_metadata) discrepancy(field,'manual',local,before,incoming);
      continue;
    }
    if (!initialPublication && !equal(before,local)) {
      discrepancy(field,'manual',local,before,incoming);
      continue;
    }
    proposed.add(field);
  }
  const repair = row.circuit === 'iracing-tbd' && next.circuit !== 'iracing-tbd' && row.version === 1;
  if (repair) proposed.add('circuit');

  const hasDataChange = [...proposed].some(field => field !== 'starts');
  const removed = proposed.has('starts') ? old.filter(d => !d.tbd && d.startsAt > at && !next.starts.includes(d.startsAt)) : [];
  const firstPublication = Boolean(plan.special && plan.articleStarts && row.schedule_pending && completeArticle && !issues.some(issue => issue.field === 'starts'));
  const provisional = old.find(d => d.tbd);
  const hasActivityCheck = hasDataChange || removed.length || (firstPublication && provisional);
  const activity = hasActivityCheck ? await env.DB.prepare(`SELECT
    EXISTS(SELECT 1 FROM registrations WHERE event_id=? UNION ALL SELECT 1 FROM crews WHERE event_id=?) AS used,
    (SELECT revision FROM event_list_revision WHERE id=1) AS revision`).bind(row.id,row.id).first() : null;

  if (activity?.used) {
    for (const field of proposed) {
      if (field === 'starts') continue;
      discrepancy(field,'occupied',current[field],baseline?.[field],next[field]);
      proposed.delete(field);
    }
  }
  const incomingStarts = next.starts.filter(start => start > at);
  const newSlots = (data?.departures || []).filter(d => !d.tbd && incomingStarts.includes(d.startsAt));
  // A gap in a partial article never counts as a removal.
  const retained = old.filter(d => !d.tbd && incomingStarts.includes(d.startsAt) && !newSlots.some(n => n.startsAt === d.startsAt));
  const departures = {departures:proposed.has('starts') ? reconcileStarts(old,[...newSlots,...retained],at) : [...old]};
  const status = metadata.status === 'confirmed' ? null : metadata.status || row.official_schedule_status || null;
  let moves = null;
  if (status && proposed.has('starts')) {
    proposed.delete('starts');
    departures.departures = old;
  } else if (removed.length && activity?.used) {
    moves = await waitingMoves(env,row,departures);
    if (moves?.lossy || (moves && !departures.departures.some(d => !d.tbd && d.startsAt > at))) {
      discrepancy('starts','occupied',future(current.starts,at),future(knownStarts,at),incomingStarts);
      const oldStarts = old.filter(d => !d.tbd);
      const additions = newSlots.filter(slot => !oldStarts.some(start => start.startsAt === slot.startsAt));
      moves = null;
      proposed.delete('starts');
      departures.departures = [...old, ...additions.map(slot => ({...slot,id:id()}))].sort((a,b) => a.startsAt-b.startsAt);
      accepted.starts = [...new Set([...knownStarts,...additions.map(slot => slot.startsAt)])].sort((a,b) => a-b);
    }
  }
  const nextReal = departures.departures.find(d => !d.tbd && d.startsAt > at);
  const waiting = departures.departures.find(d => d.tbd);
  if (waiting && nextReal && (proposed.has('starts') || firstPublication)) {
    if (firstPublication && !activity?.used) departures.departures = departures.departures.filter(d => d !== waiting);
    else departures.departures = departures.departures.map(d => d === waiting ? {...d,date:nextReal.date,time:nextReal.time,startsAt:nextReal.startsAt} : d);
  }
  if (!departures.departures.length || departures.departures.length > 30) {
    discrepancy('starts','capacity',current.starts,knownStarts,incomingStarts);
    proposed.delete('starts');
    accepted.starts = baseline?.starts || current.starts;
    departures.departures = old;
    moves = null;
  }
  const published = firstPublication && departures.departures.some(d => !d.tbd);
  const pending = published ? 0 : Number(row.schedule_pending);
  for (const field of proposed) accepted[field] = next[field];
  if (plan.input.circuit === 'iracing-tbd' && row.circuit === 'iracing-tbd')
    discrepancy('circuit','unknown',current.circuit,previousMeta.layout,metadata.layout);
  if (plan.special && !plan.input.durationMinutes)
    discrepancy('durationMinutes','unverified',current.durationMinutes,null,null);
  if (plan.special && plan.articleStarts && !completeArticle)
    discrepancy('starts','partial',future(current.starts,at),null,incomingStarts);
  if (status) discrepancy('status',status,status,null,status);
  if (previousMeta.layout && metadata.layout && previousMeta.layout !== metadata.layout && next.circuit === current.circuit) {
    discrepancy('layout','configuration',previousMeta.layout,previousMeta.layout,metadata.layout);
    metadata.layout = previousMeta.layout;
  }
  if (previousMeta.cars && metadata.cars && !equal(previousMeta.cars,metadata.cars)) {
    discrepancy('cars','catalogue',previousMeta.cars,previousMeta.cars,metadata.cars);
    metadata.cars = previousMeta.cars;
  }

  const depsChanged = !equal(old,departures.departures);
  const statusChanged = status !== (row.official_schedule_status || null);
  const changed = proposed.size || depsChanged || pending !== Number(row.schedule_pending) || statusChanged;
  const snapshot = JSON.stringify(accepted), sourceMetadata = JSON.stringify(metadata);
  if (changed) {
    const changeToken = id();
    const choose = (published || moves) && departures.departures.find(d => d.tbd);
    const name = proposed.has('name') ? data.name : row.name, circuit = proposed.has('circuit') ? data.circuit : row.circuit;
    const db = env.DB;
    // The revision check covers concurrent registrations and crews while the move plan was read.
    const guard = activity && db.prepare(`SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM events WHERE id=? AND version=?)
      OR (SELECT revision FROM event_list_revision WHERE id=1) IS NOT ? THEN json('iracing_revision_changed') END`)
      .bind(row.id,row.version,activity.revision);
    const event = {...row,name,circuit};
    const preconditions = [...(guard ? [guard] : []), ...(moves ? moves.statements(row.version) : [])];
    const batch = [
      ...preconditions,
      db.prepare(`UPDATE events SET name=?,circuit=?,duration_hours=?,duration_minutes=?,categories=?,rounds=?,departures=?,
        driver_change_required=?,schedule_pending=?,official_schedule_status=?,version=version+1 WHERE id=? AND version=?`)
        .bind(name,circuit,proposed.has('durationMinutes')?data.durationHours:row.duration_hours,
          proposed.has('durationMinutes')?data.durationMinutes:row.duration_minutes,
          proposed.has('categories')?JSON.stringify(data.categories):row.categories,
          proposed.has('rounds')?JSON.stringify(data.rounds):row.rounds,
          JSON.stringify(departures.departures),proposed.has('driverChangeRequired')?Number(data.driverChangeRequired):row.driver_change_required,
          pending,status,row.id,row.version),
      db.prepare(`UPDATE iracing_imports SET source_snapshot=?,source_metadata=?,source_identity=COALESCE(source_identity,?),reconcile_token=?
        WHERE community_id='official' AND external_id=? AND changes()=1`)
        .bind(snapshot,sourceMetadata,plan.identity,changeToken,row.external_id),
      ...(statusChanged && status ? [notificationStatement(env,event,{officialStatus:status},{token:changeToken})] : [])
    ];
    try {
      const results = await db.batch(batch);
      if (!results[preconditions.length].meta.changes) return {conflicts:1};
    } catch (error) {
      if (/malformed JSON/i.test(error.message)) return {conflicts:1};
      throw error;
    }
    if (choose && nextReal) await askToChooseStart(env,event,choose.id);
  } else if (snapshot !== row.source_snapshot || sourceMetadata !== row.source_metadata || (plan.identity && !row.source_identity)) {
    await env.DB.prepare(`UPDATE iracing_imports SET source_snapshot=?,source_metadata=?,source_identity=COALESCE(source_identity,?)
      WHERE community_id='official' AND external_id=? AND source_snapshot IS ?`)
      .bind(snapshot,sourceMetadata,plan.identity,row.external_id,row.source_snapshot).run();
  }
  if (issues.length) {
    const issue = {fields:issues};
    if (JSON.stringify(issue) !== row.sync_conflict) {
      const unique = await recordIracingConflict(env,plan,row,issue,at);
      const pilotChanges = issues.filter(item => item.reason === 'occupied').map(item => item.field);
      if (unique && pilotChanges.length) {
        const relevant = pilotChanges.every(field => field === 'starts') ? {departureIds:removed.map(d => d.id)} : {};
        await notificationStatement(env,row,{officialReview:true,changes:pilotChanges.map(field => field === 'durationMinutes' ? 'duration' : field)},relevant).run();
      }
    }
  } else if (row.sync_conflict && !row.sync_conflict_resolved) await clearIracingConflict(env,plan);
  return {updated:changed ? 1 : 0, repaired:repair&&proposed.has('circuit') ? 1 : 0, completed:published ? 1 : 0, conflicts:issues.length ? 1 : 0, initialized:baseline ? 0 : 1};
}
