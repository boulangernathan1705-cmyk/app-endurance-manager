// Individual training (migrations 0046-0047, module "training"): each pilot's LMU sessions, read from the results files
// the sync program sends (or the pilot drops on the page), turned into a program, a session for today, advice and a
// comparison with the other pilots of the site. Only the pilot sees his own data; the others are counted, never named.
import {fail, json, now, id, token, hash, siteOrigin, rateLimit, body, DAY} from './core.mjs';
import {parseResults, analyse, programSteps, adviceFor, trackKey, cleanLaps, circuitOf, normal, cleanLive, analyseLive, resultsAsLive, pitTimes, memoSheet, parseLaptimes, laptimesUpdated, mainLayout, LAPTIME_SOURCE, STEPS} from '../shared/training.mjs';
import {BOP} from '../shared/lmu-bop.mjs';
import {bopFor} from '../shared/bop.mjs';

const FILE_LIMIT = 3_000_000;
const KEEP_DAYS = 120;
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
  const result = await env.DB.prepare(`INSERT OR IGNORE INTO training_sessions(id,user_id,fingerprint,started_at,track_key,venue,course,car,car_class,kind,laps,best,s1,s2,s3,per_lap,created_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(id(), userId, fingerprint, session.at, trackKey(session), session.venue.slice(0, 120), session.course.slice(0, 120),
    session.car.slice(0, 120), session.carClass.slice(0, 60), session.kind.slice(0, 20), JSON.stringify(session.laps), best, sector(0), sector(1), sector(2), perLap, now()).run();
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
  return {created:result.meta.changes === 1, track:session.track, laps:session.laps.length};
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

// Once a day (cron): the spreadsheet of reference lap times, read whole and kept only when it still looks right.
export async function refreshLaptimes(env, fetcher = fetch) {
  const kept = await env.DB.prepare("SELECT fetched_at FROM training_reference WHERE id='laptimes'").first();
  if (kept && kept.fetched_at > now() - 86400) return false;
  const response = await fetcher(LAPTIME_SOURCE.csv, {headers:{Accept:'text/csv'}, redirect:'follow'});
  if (!response.ok) throw Error(`laptimes ${response.status}`);
  const text = await response.text(), rows = parseLaptimes(text);
  if (rows.length < 3) throw Error('laptimes unreadable');
  await env.DB.prepare(`INSERT INTO training_reference(id,data,updated,fetched_at) VALUES('laptimes',?,?,?)
    ON CONFLICT(id) DO UPDATE SET data=excluded.data,updated=excluded.updated,fetched_at=excluded.fetched_at`).bind(JSON.stringify(rows), laptimesUpdated(text), now()).run();
  return true;
}

// The circuit sheet: every circuit where the pilots of the site drove with the plugin, then for the one asked (or
// the first) and one of its cars, the figures of memoSheet. Only medians leave the server, never a pilot's name;
// the viewer's own figures come with them.
async function memo(env, user, url) {
  const since = Date.now() - KEEP_DAYS * DAY * 1000;
  const rows = await all(env, `SELECT circuit,MIN(track) AS track,car,car_class,COUNT(DISTINCT user_id) AS pilots FROM training_live WHERE started_at>=?
    GROUP BY circuit,car,car_class ORDER BY circuit,car`, since);
  const circuits = [];
  for (const row of rows) {
    let item = circuits.find(entry => entry.key === row.circuit);
    if (!item) circuits.push(item = {key:row.circuit, name:row.track, cars:[]});
    item.cars.push({car:row.car, carClass:row.car_class, pilots:row.pilots});
  }
  const circuit = circuits.find(item => item.key === url.searchParams.get('circuit')) || circuits[0];
  if (!circuit) return {circuits, circuit:null};
  const car = circuit.cars.find(item => item.car === url.searchParams.get('car'))
    || circuit.cars.find(item => item.carClass === url.searchParams.get('class')) || [...circuit.cars].sort((a, b) => b.pilots - a.pilots)[0];
  const lane = await all(env, `SELECT stops FROM training_live WHERE circuit=? AND started_at>=? AND stops!='[]' ORDER BY started_at DESC LIMIT 500`, circuit.key, since);
  const sessions = await all(env, `SELECT user_id,capacity,laps,stops,game FROM training_live WHERE circuit=? AND car=? AND started_at>=? ORDER BY started_at DESC LIMIT 500`,
    circuit.key, car.car, since);
  const stored = await env.DB.prepare('SELECT service FROM training_cars WHERE car=?').bind(car.car).first();
  const game = sessions.map(row => row.game && JSON.parse(row.game)).find(Boolean) || null;
  const laptimes = await env.DB.prepare("SELECT data,updated FROM training_reference WHERE id='laptimes'").first();
  const references = laptimes ? JSON.parse(laptimes.data).filter(row => row.circuit === circuit.key && row.carClass === LAPTIME_CLASS[car.carClass]) : [];
  const sheet = memoSheet({reference:mainLayout(references),laneStops:lane.flatMap(row => JSON.parse(row.stops)), carStops:sessions.flatMap(row => JSON.parse(row.stops)),
    sessions:sessions.map(row => ({user:row.user_id, capacity:row.capacity, laps:JSON.parse(row.laps)})), viewer:user,
    service:stored ? JSON.parse(stored.service) : null, game});
  return {circuits, circuit:{key:circuit.key, name:circuit.name}, car, ...sheet,
    bop:bopFor(BOP, circuit.key, car.car, car.carClass),
    source:laptimes ? {name:LAPTIME_SOURCE.name, title:LAPTIME_SOURCE.title, url:LAPTIME_SOURCE.url, updated:laptimes.updated} : null};
}

// The next LMU race the pilot is entered in (for the program's deadline and the circuit shown first).
async function nextRace(env, userId) {
  const rows = await all(env, `SELECT r.departure_id,r.category,e.id,e.name,e.circuit,e.departures FROM registrations r JOIN participants p ON p.id=r.participant_id
    JOIN events e ON e.id=r.event_id WHERE p.user_id=? AND r.status!='unavailable' AND e.circuit NOT LIKE 'iracing-%'`, userId);
  let next = null;
  for (const row of rows) {
    const departure = JSON.parse(row.departures || '[]').find(item => item.id === row.departure_id);
    if (!departure?.startsAt || departure.startsAt < Date.now()) continue;
    if (!next || departure.startsAt < next.startsAt) next = {eventId:row.id, name:row.name, circuit:row.circuit, category:row.category, startsAt:departure.startsAt};
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
    const sessions = await all(env, `SELECT id,started_at,track_key,venue,course,car,car_class,kind,laps,best FROM training_sessions
      WHERE user_id=? AND started_at>=? ORDER BY started_at DESC LIMIT 200`, user, Date.now() - KEEP_DAYS * DAY * 1000);
    const race = await nextRace(env, user);
    const tracks = [];
    for (const row of sessions) if (!tracks.some(track => track.key === row.track_key)) tracks.push({key:row.track_key, venue:row.venue, course:row.course, circuit:circuitOf(row.venue)});
    const wanted = url.searchParams.get('track');
    const track = tracks.find(item => item.key === wanted) || (race && tracks.find(item => item.circuit === race.circuit)) || tracks[0] || null;
    const onTrack = track ? sessions.filter(row => row.track_key === track.key) : [];
    const classes = [...new Set(onTrack.map(row => row.car_class))];
    const carClass = classes.includes(url.searchParams.get('class')) ? url.searchParams.get('class') : classes[0] || null;
    const chosen = onTrack.filter(row => row.car_class === carClass).slice(0, 50)
      .map(row => ({at:row.started_at, car:row.car, kind:row.kind, laps:JSON.parse(row.laps)}));
    const analysis = analyse(chosen);
    // Live sessions on the same circuit and class (a track the site does not know is matched by its name).
    const circuit = track ? track.circuit || normal(track.venue) : null;
    const liveRows = circuit && carClass ? await all(env, `SELECT started_at,car,capacity,laps,stops FROM training_live WHERE user_id=? AND circuit=? AND car_class=?
      AND started_at>=? ORDER BY started_at DESC LIMIT 30`, user, circuit, carClass, Date.now() - KEEP_DAYS * DAY * 1000) : [];
    const live = liveRows.length ? analyseLive(liveRows.map(row => ({at:row.started_at, car:row.car, capacity:row.capacity, laps:JSON.parse(row.laps), stops:JSON.parse(row.stops)})))
      : resultsAsLive(chosen);
    // The results files give the fuel as a share of the tank: in litres once the game told the tank size.
    if (live?.capacity && analysis.fuelPerLap) analysis.fuelLitres = Math.round(analysis.fuelPerLap * live.capacity) / 100;
    const marks = track ? (await all(env, 'SELECT step FROM training_marks WHERE user_id=? AND track_key=?', user, track.key)).map(row => row.step) : [];
    const compared = track && carClass ? await comparison(env, user, track.key, carClass) : null;
    const device = await env.DB.prepare('SELECT created_at,last_seen FROM training_devices WHERE user_id=?').bind(user).first();
    const profile = await env.DB.prepare('SELECT lmu_name FROM training_profiles WHERE user_id=?').bind(user).first();
    const waiting = await all(env, 'SELECT drivers FROM training_pending WHERE user_id=? ORDER BY created_at DESC', user);
    return json({race, tracks, track, classes, carClass, analysis, live, steps:programSteps(analysis, marks), advice:adviceFor(analysis, compared), comparison:compared,
      sessions:sessions.slice(0, 20).map(row => ({id:row.id, at:row.started_at, venue:row.venue, course:row.course, car:row.car, carClass:row.car_class, kind:row.kind,
        laps:JSON.parse(row.laps).length, best:row.best})),
      device:device ? {linked:true, lastSeen:device.last_seen} : {linked:false}, lmuName:profile?.lmu_name || null,
      pending:waiting.length && !profile?.lmu_name ? {files:waiting.length, drivers:[...new Set(waiting.flatMap(row => JSON.parse(row.drivers)))].sort((a, b) => a.localeCompare(b)).slice(0, 60)} : null});
  }
  // The pit guide (stands.html): the stops measured by every pilot of the site, per class, never named.
  if (path === '/api/training/memo' && method === 'GET') return json(await memo(env, user, new URL(request.url)));
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
  for (const table of ['training_sessions', 'training_live']) await env.DB.prepare(`DELETE FROM ${table} WHERE id IN (SELECT id FROM ${table} WHERE started_at<? LIMIT 500)`).bind(Date.now() - KEEP_DAYS * DAY * 1000).run();
}
