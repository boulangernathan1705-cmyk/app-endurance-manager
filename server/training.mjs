// Individual training (migrations 0046-0047, module "training"): each pilot's LMU sessions, read from the results files
// the sync program sends (or the pilot drops on the page), turned into a program, a session for today, advice and a
// comparison with the other pilots of the site. Only the pilot sees his own data; the others are counted, never named.
import {fail, json, now, id, token, hash, siteOrigin, rateLimit, body, DAY} from './core.mjs';
import {parseResults, analyse, programSteps, adviceFor, trackKey, cleanLaps, circuitOf, normal, cleanLive, analyseLive, resultsAsLive, pitTimes, memoSheet, parseLaptimes, laptimesUpdated, mainLayout, LAPTIME_SOURCE, STEPS} from '../shared/training.mjs';
import {levelOf, memoPilots} from '../shared/training.mjs';
import {BOP} from '../shared/lmu-bop.mjs';
import {bopFor} from '../shared/bop.mjs';
import {collectMemo, collectiveMemo, restartMemo, renewMemos} from './memo-collection.mjs';
import {EXERCISES,checklistScope,checklistEvidence,analysisFromLive} from '../shared/training-checklist.mjs';
import {sessionChecklist,getChecklist} from './training-checklist.mjs';

const FILE_LIMIT = 3_000_000;
const KEEP_DAYS = 120;
const ANALYSIS_SESSIONS = 5;
const enabled = community => community?.modules?.training === true;
const all = async (env, sql, ...params) => (await env.DB.prepare(sql).bind(...params).all()).results || [];
const median = values => { const list = values.filter(value => value > 0).sort((a, b) => a - b); return list.length ? (list[Math.floor((list.length - 1) / 2)] + list[Math.ceil((list.length - 1) / 2)]) / 2 : null; };

async function rawBody(request) {
  const reader = request.body?.getReader();
  if (!reader) fail(400, 'Fichier manquant.');
  let size = 0; const chunks = [];
  while (true) { const {value, done} = await reader.read(); if (done) break; size += value.length; if (size > FILE_LIMIT) { await reader.cancel(); fail(413, 'Fichier trop lourd.'); } chunks.push(value); }
  const all = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { all.set(chunk, offset); offset += chunk.length; }
  return new TextDecoder().decode(all);
}

// The names that are the pilot in an online results file: his name in LMU, then his name on the site.
async function namesOf(env, userId) {
  const row = await env.DB.prepare('SELECT p.lmu_name,u.name FROM users u LEFT JOIN training_profiles p ON p.user_id=u.id WHERE u.id=?').bind(userId).first();
  return [row?.lmu_name, row?.name].filter(Boolean);
}

// One results file → one stored session (the same file sent twice is kept once). An online file where the pilot's
// name is not found waits until he gives it (the last 20 files, without their <Stream> section). Once his LMU name is
// known, such a file is a session he did not drive (joined or watched): it is left out.
export async function saveSession(env, userId, xml, keep = true) {
  let session;
  try { session = parseResults(xml, await namesOf(env, userId)); }
  catch (error) {
    const known = error.code === 'driver' && keep && await env.DB.prepare('SELECT 1 FROM training_profiles WHERE user_id=?').bind(userId).first();
    if (error.code !== 'driver' || !keep || known) fail(400, error.message);
    await env.DB.prepare('INSERT INTO training_pending(id,user_id,xml,drivers,created_at) VALUES(?,?,?,?,?)')
      .bind(id(), userId, xml.replace(/<Stream>[\s\S]*?<\/Stream>/, ''), JSON.stringify(error.drivers), now()).run();
    await env.DB.prepare('DELETE FROM training_pending WHERE user_id=? AND id NOT IN (SELECT id FROM training_pending WHERE user_id=? ORDER BY created_at DESC LIMIT 20)').bind(userId, userId).run();
    return {created:false, pending:true, drivers:error.drivers, message:error.message};
  }
  if (!session.at) fail(400, 'Date de séance absente du fichier.');
  const laps = cleanLaps(session), clean = laps.filter(lap => lap.clean);
  const best = clean.length ? Math.min(...clean.map(lap => lap.t)) : null;
  const sector = index => { const values = clean.map(lap => lap.s[index]).filter(Boolean); return values.length ? Math.min(...values) : null; };
  const perLap = Math.max(median(clean.map(lap => lap.fuel)) || 0, median(clean.map(lap => lap.ve)) || 0) || null;
  const fingerprint = await hash(JSON.stringify([session.at, session.venue, session.course, session.kind, session.car, session.laps]));
  const result = await env.DB.prepare(`INSERT OR IGNORE INTO training_sessions(id,user_id,fingerprint,started_at,track_key,venue,course,car,car_class,kind,laps,best,s1,s2,s3,per_lap,created_at,lap_count)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(id(), userId, fingerprint, session.at, trackKey(session), session.venue.slice(0, 120), session.course.slice(0, 120),
    session.car.slice(0, 120), session.carClass.slice(0, 60), session.kind.slice(0, 20), JSON.stringify(session.laps), best, sector(0), sector(1), sector(2), perLap, now(),session.laps.length).run();
  await sessionChecklist(env,userId,session);
  return {created:result.meta.changes === 1, venue:session.venue, laps:session.laps.length};
}

// The pilot's name in LMU: kept, then the files that waited for it are read.
async function setLmuName(env, userId, name) {
  await env.DB.prepare(`INSERT INTO training_profiles(user_id,lmu_name,updated_at) VALUES(?,?,?)
    ON CONFLICT(user_id) DO UPDATE SET lmu_name=excluded.lmu_name,updated_at=excluded.updated_at`).bind(userId, name, now()).run();
  let added = 0;
  for (const row of await all(env, 'SELECT id,xml FROM training_pending WHERE user_id=? ORDER BY created_at', userId)) {
    try { if ((await saveSession(env, userId, row.xml, false)).created) added++; await env.DB.prepare('DELETE FROM training_pending WHERE id=?').bind(row.id).run(); }
    catch { /* his name is not in this one: it stays until another name is given */ }
  }
  return added;
}

// Live data on one session (tyres, speed, litres, stops). The circuit is the site's name for it when known, so the
// session sits next to the results files of the same track.
export async function saveLive(env, userId, text) {
  let session;
  try { session = cleanLive(JSON.parse(text)); } catch (error) { fail(400, error instanceof SyntaxError ? 'Séance en direct illisible.' : error.message); }
  const fingerprint = await hash(JSON.stringify([session.at, session.track, session.car]));
  const result = await env.DB.prepare(`INSERT OR IGNORE INTO training_live(id,user_id,fingerprint,started_at,circuit,track,car,car_class,capacity,laps,stops,game,created_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(id(), userId, fingerprint, session.at, circuitOf(session.track) || normal(session.track), session.track, session.car,
    session.carClass, session.capacity, JSON.stringify(session.laps), JSON.stringify(session.stops), session.game ? JSON.stringify(session.game) : null, now()).run();
  // The car's service times, the same for everyone: the latest the game gave.
  if (session.service) await env.DB.prepare(`INSERT INTO training_cars(car,car_class,service,updated_at) VALUES(?,?,?,?)
    ON CONFLICT(car) DO UPDATE SET car_class=excluded.car_class,service=excluded.service,updated_at=excluded.updated_at`).bind(session.car, session.carClass, JSON.stringify(session.service), now()).run();
  // The game names the pilot: learnt once, so his online results files find him.
  if (session.driver && !(await env.DB.prepare('SELECT 1 FROM training_profiles WHERE user_id=?').bind(userId).first())) await setLmuName(env, userId, session.driver);
  if (result.meta.changes === 1) {
    const circuit=circuitOf(session.track)||normal(session.track);
    await refreshMemoPilot(env,userId,circuit,session.car);
  }
  // Idempotent collection also retries a previous upload whose compact aggregation failed.
  await collectMemo(env,userId,session,`${userId}:${fingerprint}`,circuitOf(session.track)||normal(session.track));
  await sessionChecklist(env,userId,session,true);
  return {created:result.meta.changes === 1, track:session.track, laps:session.laps.length};
}

// At most five raw sessions are read once when new data arrives. The shared page only reads these small summaries.
export async function refreshMemoPilot(env, user, circuit, car) {
  const rows = await all(env, `SELECT track,car_class,started_at,capacity,laps,stops,game FROM training_live
    WHERE user_id=? AND circuit=? AND car=? AND started_at>=? ORDER BY started_at DESC LIMIT ?`,user,circuit,car,Date.now()-KEEP_DAYS*DAY*1000,ANALYSIS_SESSIONS);
  if (!rows.length) return;
  const sessions=rows.map(row=>({user,capacity:row.capacity,laps:JSON.parse(row.laps)}));
  const stops=rows.flatMap(row=>JSON.parse(row.stops)).slice(0,20);
  const summary={...memoPilots(sessions)[0],lane:pitTimes(stops),game:rows.map(row=>row.game&&JSON.parse(row.game)).find(Boolean)||null};
  const latest=rows[0];
  await env.DB.prepare(`INSERT INTO training_memo_pilots(user_id,circuit,track,car,car_class,started_at,summary,stops) VALUES(?,?,?,?,?,?,?,?)
    ON CONFLICT(user_id,circuit,car) DO UPDATE SET track=excluded.track,car_class=excluded.car_class,started_at=excluded.started_at,summary=excluded.summary,stops=excluded.stops`)
    .bind(user,circuit,latest.track,car,latest.car_class,latest.started_at,JSON.stringify(summary),JSON.stringify(stops)).run();
}

async function backfillMemo(env, user = null) {
  const pairs=await all(env,`SELECT DISTINCT t.user_id,t.circuit,t.car FROM training_live t LEFT JOIN training_memo_pilots m
    ON m.user_id=t.user_id AND m.circuit=t.circuit AND m.car=t.car WHERE m.user_id IS NULL AND t.started_at>=?
    ${user ? 'AND t.user_id=?' : ''} LIMIT 3`,Date.now()-KEEP_DAYS*DAY*1000,...(user?[user]:[]));
  for(const pair of pairs) await refreshMemoPilot(env,pair.user_id,pair.circuit,pair.car);
}

// The sync program (or the SimHub plugin): no browser and no cookie, only the pilot's own key, which can do nothing
// but send sessions: the results files to /collector, what it reads live to /live.
export async function trainingCollector(request, env, live = false) {
  if (request.method !== 'POST') fail(405, 'Méthode non prise en charge.');
  const raw = request.headers.get('Authorization') || '';
  if (!/^Bearer [a-f0-9]{64}$/.test(raw)) fail(401, 'Liaison requise.');
  await rateLimit(request, env, 'training-sync', 300);
  const device = await env.DB.prepare('SELECT user_id FROM training_devices WHERE token_hash=?').bind(await hash(raw.slice(7))).first();
  if (!device) fail(401, 'Cette liaison a été retirée. Télécharge à nouveau le synchroniseur depuis le site.');
  // The program reads the pilot's name in LMU's settings and sends it along: his online files find him.
  let named = request.headers.get('X-LMU-Name') || '';
  try { named = decodeURIComponent(named); } catch { named = ''; }
  named = named.replace(/[\u0000-\u001f]/g, '').trim().slice(0, 60);
  if (named && !(await env.DB.prepare('SELECT 1 FROM training_profiles WHERE user_id=? AND lmu_name=?').bind(device.user_id, named).first())) await setLmuName(env, device.user_id, named);
  const saved = live ? await saveLive(env, device.user_id, await rawBody(request)) : await saveSession(env, device.user_id, await rawBody(request));
  await env.DB.prepare('UPDATE training_devices SET last_seen=? WHERE user_id=?').bind(now(), device.user_id).run();
  return json({ok:true, ...saved});
}

// The class LMU writes for a car, as the spreadsheet of reference lap times names it.
const LAPTIME_CLASS = {Hyper:'Hypercar', LMP2_ELMS:'LMP2 ELMS', LMP2_WEC:'LMP2', GT3:'GT3', LMGT3:'GT3', Hypercar:'Hypercar', LMH:'Hypercar', LMDh:'Hypercar', LMP2:'LMP2', LMP3:'LMP3', GTE:'GTE', LMGTE:'GTE'};

// Google answers the published sheet with a redirect to a one-off address. Seen from Cloudflare, following it
// gave another tab of the spreadsheet: each way of asking is tried until one gives the lap times.
const LAPTIME_URLS = [LAPTIME_SOURCE.csv, LAPTIME_SOURCE.csv.replace(/\?.*$/, `?output=csv&gid=${new URL(LAPTIME_SOURCE.csv).searchParams.get('gid')}`)];
async function laptimesText(fetcher, url, manual) {
  const headers = {'User-Agent':'EnduranceManager/1.0 (+https://endurance-manager.app)'};
  let response = await fetcher(url, {headers, redirect:manual ? 'manual' : 'follow'});
  const location = manual && response.headers.get('Location');
  if (location) response = await fetcher(location, {headers, redirect:'follow'});
  const text = await response.text();
  if (!response.ok) throw Error(`${response.status}: ${text.slice(0, 80)}`);
  return text;
}

// Once a day (cron): the spreadsheet of reference lap times, read whole and kept only when it still looks right.
// Until it has been read once, it is tried again every hour.
export async function refreshLaptimes(env, fetcher = fetch) {
  const kept = await env.DB.prepare("SELECT fetched_at FROM training_reference WHERE id='laptimes'").first();
  if (kept && kept.fetched_at > now() - 86400) return false;
  const failures = [];
  for (const url of LAPTIME_URLS) for (const manual of [false, true]) {
    try {
      const text = await laptimesText(fetcher, url, manual), rows = parseLaptimes(text);
      if (rows.length < 3) throw Error(`${rows.length} rows: ${text.slice(0, 80)}`);
      await env.DB.prepare(`INSERT INTO training_reference(id,data,updated,fetched_at) VALUES('laptimes',?,?,?)
        ON CONFLICT(id) DO UPDATE SET data=excluded.data,updated=excluded.updated,fetched_at=excluded.fetched_at`).bind(JSON.stringify(rows), laptimesUpdated(text), now()).run();
      await env.DB.prepare("DELETE FROM training_reference WHERE id='laptimes-error'").run();
      return true;
    } catch (error) { failures.push(`${failures.length + 1}. ${String(error?.message || error)}`); }
  }
  // Kept where it can be read (the cron's logs are not).
  const message = failures.join(' | ').replace(/[\u0000-\u001f]/g, ' ').slice(0, 600);
  await env.DB.prepare(`INSERT INTO training_reference(id,data,updated,fetched_at) VALUES('laptimes-error',?,NULL,?)
    ON CONFLICT(id) DO UPDATE SET data=excluded.data,fetched_at=excluded.fetched_at`).bind(JSON.stringify({error:message}), now()).run();
  throw Error(`laptimes unreadable: ${message}`);
}

// The circuit sheet: every circuit where the pilots of the site drove with the plugin, then for the one asked (or
// the first) and one of its cars, the figures of memoSheet. Only medians leave the server, never a pilot's name;
// the viewer's own figures come with them.
async function memo(env, user, url, canRestart = false) {
  const since = Date.now() - KEEP_DAYS * DAY * 1000;
  await backfillMemo(env,user);
  const rows = await all(env, `SELECT circuit,MIN(track) AS track,car,car_class,COUNT(DISTINCT user_id) AS pilots FROM (
    SELECT circuit,track,car,car_class,user_id FROM training_memo_pilots WHERE started_at>=?
    UNION ALL SELECT circuit,track,car,car_class,NULL AS user_id FROM training_memo_cycles)
    GROUP BY circuit,car,car_class ORDER BY circuit,car`, since);
  const circuits = [];
  for (const row of rows) {
    let item = circuits.find(entry => entry.key === row.circuit);
    if (!item) circuits.push(item = {key:row.circuit, name:row.track, cars:[]});
    item.cars.push({car:row.car, carClass:row.car_class, pilots:row.pilots});
  }
  const circuit = circuits.find(item => item.key === url.searchParams.get('circuit')) || circuits[0];
  if (!circuit) return {circuits, circuit:null,canRestart};
  const car = circuit.cars.find(item => item.car === url.searchParams.get('car'))
    || circuit.cars.find(item => item.carClass === url.searchParams.get('class')) || [...circuit.cars].sort((a, b) => b.pilots - a.pilots)[0];
  const personal = await env.DB.prepare('SELECT summary,stops FROM training_memo_pilots WHERE circuit=? AND car=? AND user_id=? AND started_at>=?')
    .bind(circuit.key,car.car,user,since).first();
  const collective = await collectiveMemo(env,{circuit:circuit.key,car:car.car,track:circuit.name,car_class:car.carClass});
  const stored = await env.DB.prepare('SELECT service FROM training_cars WHERE car=?').bind(car.car).first();
  const pilots=personal?[JSON.parse(personal.summary)]:[];
  const game = collective.sheet ? {fuel:collective.sheet.fuel.game,ve:collective.sheet.energy.game,ideal:collective.sheet.tyres[0]?.ideal} : pilots[0]?.game || null;
  const laptimes = await env.DB.prepare("SELECT data,updated FROM training_reference WHERE id='laptimes'").first();
  const references = laptimes ? JSON.parse(laptimes.data).filter(row => row.circuit === circuit.key && row.carClass === LAPTIME_CLASS[car.carClass]) : [];
  const own = memoSheet({reference:mainLayout(references),carStops:personal?JSON.parse(personal.stops):[],
    summaries:pilots, viewer:user,
    service:stored ? JSON.parse(stored.service) : null, game});
  const common=collective.sheet;
  const compare=(shared,personal)=>({...shared,you:personal?.you??null,youMin:personal?.youMin??null,youMax:personal?.youMax??null});
  const sheet=common?{...common,levels:own.levels,service:own.service,
    energy:compare(common.energy,own.energy),fuel:compare(common.fuel,own.fuel),
    tyres:[...common.tyres.map(tyre=>({...compare(tyre,own.tyres.find(item=>item.name===tyre.name)),youTemp:own.tyres.find(item=>item.name===tyre.name)?.youTemp??null})),
      ...own.tyres.filter(tyre=>!common.tyres.some(item=>item.name===tyre.name)).map(tyre=>({...tyre,median:null,low:null,high:null}))]
  }:{...own,energy:{...own.energy,median:null,low:null,high:null},fuel:{...own.fuel,median:null,low:null,high:null},tyres:own.tyres.map(tyre=>({...tyre,median:null,low:null,high:null}))};
  return {circuits, circuit:{key:circuit.key, name:circuit.name}, car, ...sheet,collection:collective.collection,canRestart,
    bop:bopFor(BOP, circuit.key, car.car, car.carClass),
    source:laptimes ? {name:LAPTIME_SOURCE.name, title:LAPTIME_SOURCE.title, url:LAPTIME_SOURCE.url, updated:laptimes.updated} : null};
}

// The next LMU race the pilot is entered in (for the program's deadline and the circuit shown first).
export async function nextRace(env, userId) {
  const rows = await all(env, `SELECT r.departure_id,r.category,e.id,e.name,e.circuit,e.departures FROM registrations r JOIN participants p ON p.id=r.participant_id
    JOIN events e ON e.id=r.event_id WHERE p.user_id=? AND r.status!='unavailable' AND e.circuit NOT LIKE 'iracing-%'`, userId);
  let next = null;
  for (const row of rows) {
    const departure = JSON.parse(row.departures || '[]').find(item => item.id === row.departure_id);
    if (!departure?.startsAt || departure.startsAt < Date.now()) continue;
    if (!next || departure.startsAt < next.startsAt) next = {eventId:row.id, departureId:row.departure_id, name:row.name, circuit:row.circuit, category:row.category, startsAt:departure.startsAt};
  }
  return next;
}

// Where the pilot stands among the pilots of the site on this track and class: counted, never named.
async function comparison(env, userId, key, carClass) {
  const rows = await all(env, `SELECT user_id,MIN(best) AS best,MIN(s1) AS s1,MIN(s2) AS s2,MIN(s3) AS s3,AVG(per_lap) AS per_lap FROM training_sessions
    WHERE track_key=? AND car_class=? AND started_at>=? AND best IS NOT NULL GROUP BY user_id`, key, carClass, Date.now() - KEEP_DAYS * DAY * 1000);
  const mine = rows.find(row => row.user_id === userId);
  if (!mine || rows.length < 3) return {pilots:rows.length};
  const sorted = [...rows].sort((a, b) => a.best - b.best);
  const rank = sorted.findIndex(row => row.user_id === userId) + 1;
  const sectorBest = ['s1', 's2', 's3'].map(field => Math.min(...rows.map(row => row[field]).filter(Boolean)));
  const fuel = median(rows.filter(row => row.user_id !== userId).map(row => row.per_lap));
  return {pilots:rows.length, rank, faster:Math.round((rows.length - rank) / (rows.length - 1) * 100), siteBest:sorted[0].best, gap:mine.best - sorted[0].best,
    sectorGaps:['s1', 's2', 's3'].map((field, index) => mine[field] && Number.isFinite(sectorBest[index]) ? mine[field] - sectorBest[index] : null),
    fuelGap:fuel && mine.per_lap ? (mine.per_lap - fuel) / fuel * 100 : null};
}

// Named summaries are restricted to the viewer's crew in the active community and next departure.
export async function crewPreparation(env, user, community, race, track, carClass) {
  const circuit = track?.circuit || (track && normal(track.venue));
  const stored = circuit && carClass ? await env.DB.prepare("SELECT data FROM training_reference WHERE id='laptimes'").first() : null;
  const reference = stored ? mainLayout(JSON.parse(stored.data).filter(row => row.circuit === circuit && row.carClass === LAPTIME_CLASS[carClass])) : null;
  if (!race || !track || circuit !== race.circuit) return {crew:null, reference};
  const crew = await env.DB.prepare(`SELECT c.id,c.name,c.car FROM crews c JOIN crew_members cm ON cm.crew_id=c.id
    JOIN registrations r ON r.id=cm.registration_id JOIN participants p ON p.id=r.participant_id
    WHERE p.user_id=? AND c.community_id=? AND c.event_id=? AND c.departure_id=? AND r.category=? LIMIT 1`)
    .bind(user, community, race.eventId, race.departureId, race.category).first();
  if (!crew) return {crew:null, reference};
  const members = await all(env, `SELECT DISTINCT p.user_id,p.name FROM crew_members cm JOIN registrations r ON r.id=cm.registration_id
    JOIN participants p ON p.id=r.participant_id WHERE cm.crew_id=? ORDER BY p.name`, crew.id);
  const since = Date.now() - KEEP_DAYS * DAY * 1000;
  const rows = await all(env, `WITH recent AS (SELECT t.id,
    ROW_NUMBER() OVER (PARTITION BY t.user_id ORDER BY t.started_at DESC) AS position FROM training_sessions t WHERE t.track_key=? AND t.car_class=? AND t.started_at>=?
    AND t.user_id IN (SELECT p.user_id FROM crew_members cm JOIN registrations r ON r.id=cm.registration_id JOIN participants p ON p.id=r.participant_id WHERE cm.crew_id=?)
    ) SELECT t.user_id,t.started_at,t.car,t.kind,t.laps FROM recent JOIN training_sessions t ON t.id=recent.id
    WHERE recent.position<=? ORDER BY t.started_at DESC`, track.key, carClass, since, crew.id,ANALYSIS_SESSIONS);
  const marks = await all(env, `SELECT m.user_id,m.step FROM training_marks m WHERE m.track_key=? AND m.user_id IN
    (SELECT p.user_id FROM crew_members cm JOIN registrations r ON r.id=cm.registration_id JOIN participants p ON p.id=r.participant_id WHERE cm.crew_id=?)`, track.key, crew.id);
  const live = await all(env, `SELECT m.user_id,m.summary FROM training_memo_pilots m WHERE m.circuit=? AND m.car_class=? AND m.started_at>=?
    AND m.user_id IN (SELECT p.user_id FROM crew_members cm JOIN registrations r ON r.id=cm.registration_id JOIN participants p ON p.id=r.participant_id WHERE cm.crew_id=?)`,circuit,carClass,since,crew.id);
  const pilots = members.map(member => {
    const sessions = rows.filter(row => member.user_id && row.user_id === member.user_id).slice(0,50).map(row => ({at:row.started_at,car:row.car,kind:row.kind,laps:JSON.parse(row.laps)}));
    const a = analyse(sessions);
    const telemetry = live.filter(row => member.user_id && row.user_id === member.user_id).map(row=>JSON.parse(row.summary));
    const fuel=median(telemetry.map(row=>row.fuel)), capacity=median(telemetry.map(row=>row.capacity));
    const steps = programSteps(a, marks.filter(row => member.user_id && row.user_id === member.user_id).map(row => row.step));
    return {name:member.name, you:member.user_id === user, steps:steps.map(step => ({key:step.key,done:step.done})), best:a.best, pace:a.median,
      level:levelOf(a.median,reference), fuel:fuel ?? (capacity && a.fuelPerLap ? a.fuelPerLap*capacity/100 : null),
      energy:median(telemetry.map(row=>row.ve)) ?? a.energyPerLap,last:a.last ? {at:a.last.at,laps:a.last.laps.length} : null};
  });
  pilots.sort((a,b) => Number(b.you)-Number(a.you));
  return {crew:{name:crew.name,car:crew.car,pilots},reference};
}

// One key per pilot: a new one (program or SimHub code) replaces the last, which stops working.
async function linkDevice(env, user) {
  const raw = token();
  await env.DB.prepare(`INSERT INTO training_devices(user_id,token_hash,created_at) VALUES(?,?,?)
    ON CONFLICT(user_id) DO UPDATE SET token_hash=excluded.token_hash,created_at=excluded.created_at,last_seen=NULL`).bind(user, await hash(raw), now()).run();
  return raw;
}

export async function trainingApi(path, method, request, env, actor, community) {
  if (!path.startsWith('/api/training')) return null;
  if (!enabled(community)) fail(404, 'L’entraînement n’est pas activé dans cette communauté.');
  if (!actor.user) fail(401, 'Connecte-toi avec Discord.');
  const user = actor.user.id;
  if (path === '/api/training' && method === 'GET') {
    const url = new URL(request.url);
    const sessions = await all(env, `SELECT id,started_at,track_key,venue,course,car,car_class,kind,lap_count,best FROM training_sessions
      WHERE user_id=? AND started_at>=? ORDER BY started_at DESC LIMIT 200`, user, Date.now() - KEEP_DAYS * DAY * 1000);
    const race = await nextRace(env, user);
    const liveMeta=await all(env,'SELECT circuit,track,car_class FROM training_live WHERE user_id=? AND started_at>=? ORDER BY started_at DESC LIMIT 200',user,Date.now()-KEEP_DAYS*DAY*1000);
    const tracks = [];
    for (const row of sessions) if (!tracks.some(track => track.key === row.track_key)) tracks.push({key:row.track_key, venue:row.venue, course:row.course, circuit:circuitOf(row.venue)});
    for(const row of liveMeta)if(!tracks.some(track=>track.circuit===row.circuit))tracks.push({key:row.circuit,venue:row.track,course:'',circuit:row.circuit});
    const wanted = url.searchParams.get('track');
    const track = tracks.find(item => item.key === wanted) || (race && tracks.find(item => item.circuit === race.circuit)) || tracks[0] || null;
    const onTrack = track ? sessions.filter(row => row.track_key === track.key) : [];
    const classes = [...new Set([...onTrack.map(row => row.car_class),...liveMeta.filter(row=>row.circuit===track?.circuit).map(row=>row.car_class)])];
    const carClass = classes.includes(url.searchParams.get('class')) ? url.searchParams.get('class') : classes[0] || race?.category || null;
    const chosenRows=track&&carClass ? await all(env,`SELECT started_at,car,kind,laps FROM training_sessions
      WHERE user_id=? AND track_key=? AND car_class=? AND started_at>=? ORDER BY started_at DESC LIMIT ?`,user,track.key,carClass,Date.now()-KEEP_DAYS*DAY*1000,ANALYSIS_SESSIONS):[];
    const chosen = chosenRows
      .map(row => ({at:row.started_at, car:row.car, kind:row.kind, laps:JSON.parse(row.laps)}));
    let analysis = analyse(chosen);
    // Live sessions on the same circuit and class (a track the site does not know is matched by its name).
    const circuit = track ? track.circuit || normal(track.venue) : race?.circuit || null;
    const liveRows = circuit && carClass ? await all(env, `SELECT started_at,car,capacity,laps,stops,game FROM training_live WHERE user_id=? AND circuit=? AND car_class=?
      AND started_at>=? ORDER BY started_at DESC LIMIT ?`, user, circuit, carClass, Date.now() - KEEP_DAYS * DAY * 1000,ANALYSIS_SESSIONS) : [];
    const live = liveRows.length ? analyseLive(liveRows.map(row => ({at:row.started_at, car:row.car, capacity:row.capacity, laps:JSON.parse(row.laps), stops:JSON.parse(row.stops)})))
      : resultsAsLive(chosen);
    const liveSessions=liveRows.map(row=>({at:row.started_at,car:row.car,capacity:row.capacity,laps:JSON.parse(row.laps),stops:JSON.parse(row.stops)}));
    if(!chosen.length&&liveSessions.length)analysis=analysisFromLive(liveSessions);
    // The results files give the fuel as a share of the tank: in litres once the game told the tank size.
    if (live?.capacity && analysis.fuelPerLap) analysis.fuelLitres = Math.round(analysis.fuelPerLap * live.capacity) / 100;
    const marks = track ? (await all(env, 'SELECT step FROM training_marks WHERE user_id=? AND track_key=?', user, track.key)).map(row => row.step) : [];
    const checklist=await getChecklist(env,user,checklistScope(circuit,carClass),checklistEvidence(analysis,liveSessions),marks);
    const compared = track && carClass ? await comparison(env, user, track.key, carClass) : null;
    const device = await env.DB.prepare('SELECT created_at,last_seen FROM training_devices WHERE user_id=?').bind(user).first();
    const profile = await env.DB.prepare('SELECT lmu_name FROM training_profiles WHERE user_id=?').bind(user).first();
    const waiting = await all(env, 'SELECT drivers FROM training_pending WHERE user_id=? ORDER BY created_at DESC', user);
    const preparation = await crewPreparation(env, user, community.id, race, track, carClass);
    const game = liveRows.map(row => row.game && JSON.parse(row.game)).find(Boolean) || null;
    return json({race, tracks, track, classes, carClass, analysis, live, game, checklist,...preparation, steps:programSteps(analysis, marks), advice:adviceFor(analysis, compared), comparison:compared,
      sessions:sessions.slice(0, 20).map(row => ({id:row.id, at:row.started_at, venue:row.venue, course:row.course, car:row.car, carClass:row.car_class, kind:row.kind,
        laps:row.lap_count, best:row.best})),
      analysisWindow:ANALYSIS_SESSIONS,
      device:device ? {linked:true, lastSeen:device.last_seen} : {linked:false}, lmuName:profile?.lmu_name || null,
      pending:waiting.length && !profile?.lmu_name ? {files:waiting.length, drivers:[...new Set(waiting.flatMap(row => JSON.parse(row.drivers)))].sort((a, b) => a.localeCompare(b)).slice(0, 60)} : null});
  }
  // The pit guide (stands.html): the stops measured by every pilot of the site, per class, never named.
  if (path === '/api/training/memo' && method === 'GET') return json(await memo(env, user, new URL(request.url),actor.manager===true));
  if (path === '/api/training/memo/restart' && method === 'POST') {
    if(!actor.manager)fail(403,'Réservé aux administrateurs de la plateforme.');
    const input=await body(request);
    const reason=typeof input.reason==='string'?input.reason.trim():'';
    if(reason.length<3||reason.length>120)fail(400,'Indique la version du jeu ou la raison de la relance (3 à 120 caractères).');
    await restartMemo(env,reason);
    return json({ok:true});
  }
  if (path === '/api/training/profile' && method === 'PUT') {
    const input = await body(request);
    const name = typeof input.lmuName === 'string' ? input.lmuName.replace(/[\u0000-\u001f]/g, '').trim() : '';
    if (!name || name.length > 60) fail(400, 'Indique ton nom tel qu’il apparaît dans LMU.');
    return json({ok:true, added:await setLmuName(env, user, name)});
  }
  if (path === '/api/training/sessions' && method === 'POST') {
    await rateLimit(request, env, 'training-import', 200);
    return json({ok:true, ...await saveSession(env, user, await rawBody(request))});
  }
  const remove = path.match(/^\/api\/training\/sessions\/([a-f0-9-]{36})$/);
  if (remove && method === 'DELETE') {
    await env.DB.prepare('DELETE FROM training_sessions WHERE id=? AND user_id=?').bind(remove[1], user).run();
    return json({ok:true});
  }
  if (path === '/api/training/marks' && method === 'PUT') {
    const input = await body(request);
    if (typeof input.track !== 'string' || input.track.length > 300 || !STEPS.some(step => step.key === input.step) || typeof input.done !== 'boolean') fail(400, 'Étape invalide.');
    await env.DB.prepare(input.done ? 'INSERT OR IGNORE INTO training_marks(user_id,track_key,step) VALUES(?,?,?)' : 'DELETE FROM training_marks WHERE user_id=? AND track_key=? AND step=?')
      .bind(user, input.track, input.step).run();
    return json({ok:true});
  }
  if(path==='/api/training/checklist'&&method==='PUT') {
    const input=await body(request),exercise=EXERCISES.find(item=>item.key===input.exercise);
    if(!exercise||typeof input.scope!=='string'||input.scope.length>300||!/^[a-z0-9 -]+::[a-z0-9 -]+$/.test(input.scope)||
      !['selected','manual'].includes(input.field)||typeof input.value!=='boolean')fail(400,'Exercice ou état invalide.');
    const field=input.field;
    await env.DB.prepare(`INSERT INTO training_checklist(user_id,scope,exercise,selected,manual) VALUES(?,?,?,?,?)
      ON CONFLICT(user_id,scope,exercise) DO UPDATE SET ${field}=excluded.${field}`)
      .bind(user,input.scope,exercise.key,field==='selected'?(input.value?1:0):(exercise.default?1:0),field==='manual'&&input.value?1:0).run();
    return json({ok:true});
  }
  // The SimHub plugin: the same key, as a code the pilot pastes in the plugin's settings.
  if (path === '/api/training/sync/code' && method === 'POST') {
    return json({code:`EMSYNC1 ${siteOrigin(request, env)} ${await linkDevice(env, user)} EMSYNC1`});
  }
  // The sync program, with the pilot's key written at its end: download it, double-click it, nothing else to do.
  if (path === '/api/training/sync' && method === 'POST') {
    const asset = await env.ASSETS.fetch(new Request(new URL('/downloads/EnduranceManagerSync.exe', request.url)));
    if (!asset.ok) fail(503, 'Le synchroniseur n’est pas disponible pour le moment.');
    const program = new Uint8Array(await asset.arrayBuffer());
    if (program.length < 1024) fail(503, 'Le synchroniseur n’est pas disponible pour le moment.');
    const raw = await linkDevice(env, user);
    const trailer = new TextEncoder().encode(`\nEMSYNC1 ${siteOrigin(request, env)} ${raw} EMSYNC1\n`);
    const file = new Uint8Array(program.length + trailer.length); file.set(program); file.set(trailer, program.length);
    return new Response(file, {headers:{'Content-Type':'application/octet-stream', 'Content-Disposition':'attachment; filename="EnduranceManagerSync.exe"', 'Cache-Control':'no-store'}});
  }
  if (path === '/api/training/sync' && method === 'DELETE') {
    await env.DB.prepare('DELETE FROM training_devices WHERE user_id=?').bind(user).run();
    return json({ok:true});
  }
  fail(404, 'Action inconnue.');
}

export async function purgeTraining(env) {
  await renewMemos(env);
  for (const table of ['training_sessions', 'training_live']) await env.DB.prepare(`DELETE FROM ${table} WHERE id IN (SELECT id FROM ${table} WHERE started_at<? LIMIT 500)`).bind(Date.now() - KEEP_DAYS * DAY * 1000).run();
  await env.DB.prepare('DELETE FROM training_memo_pilots WHERE started_at<?').bind(Date.now()-KEEP_DAYS*DAY*1000).run();
  await backfillMemo(env);
}
