// Fiches combo (migration 0073, module "combos"): a team's practice data on one car and one track, kept from one
// race to the next. Each pilot's SimHub plugin sends his sessions with his own key; the sheet shows each pilot's
// own numbers (no advice, no ranking), sorted by track condition, race being prepared and game version / BoP, and
// optionally narrowed to one setup.
//
// Private to the communities where a platform manager turned the module on, and there to the Discord roles given
// the « combos » permission (server/access.mjs). The plugin's key is checked against those rights at every call.
import {fail, json, now, id, token, hash, rateLimit, body, siteOrigin} from './core.mjs';
import {communityAccess, requirePermission} from './access.mjs';
import {communityById} from './community.mjs';
import {cleanSession, CONDITIONS, CONDITION_SQL, CLEAN_RATIO, WHEELS, SETUP_MAX, NIGHT_BELOW, linkCode} from '../shared/combos.mjs';

export const combosEnabled = community => community?.modules?.combos === true;

const BODY_LIMIT = 2_000_000;
const EXPORT_PAGE = 10;
const NOTE_MAX = 1000;
const NAME_MAX = 80;
const FOREVER = 8_000_000_000_000;
const COLOR = /^#[0-9a-f]{6}$/;
const all = async (env, sql, ...params) => (await env.DB.prepare(sql).bind(...params).all()).results || [];
const round = (value, digits = 3) => value === null || value === undefined ? null : Math.round(value * 10 ** digits) / 10 ** digits;
const label = (value, size) => String(value ?? '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, size);
const parsed = value => { try { return value ? JSON.parse(value) : null; } catch { return null; } };
const notFound = () => fail(404, 'Introuvable.');

function comboOf(url) {
  const track = label(url.searchParams.get('track'), 120), car = label(url.searchParams.get('car'), 120);
  if (!track || !car) fail(400, 'Circuit et voiture requis.');
  return {track, car};
}

// The plugin sends a whole session at once (up to 600 laps): more than the forms' limit.
async function largeBody(request) {
  const reader = request.body?.getReader();
  if (!reader) fail(400, 'Séance manquante.');
  let size = 0; const chunks = [];
  while (true) {
    const {value, done} = await reader.read();
    if (done) break;
    size += value.length;
    if (size > BODY_LIMIT) { await reader.cancel(); fail(413, 'Séance trop lourde.'); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  try { return JSON.parse(new TextDecoder().decode(bytes)); } catch { fail(400, 'Séance illisible.'); }
}

// ---------- Sessions sent by the plugin ----------

const LAP_COLUMNS = ['session_id', 'community_id', 'user_id', 'track', 'car', 'started_at', 'n', 't', 's1', 's2', 's3', 'fuel', 've',
  ...['wear', 'temp', 'kpa', 'brake'].flatMap(kind => WHEELS.map(wheel => `${kind}_${wheel}`)),
  'compound', 'track_temp', 'air_temp', 'rain', 'wet', 'top', 'invalid', 'pit', 'setup', 'light'];
const LAP_INSERT = `INSERT INTO combo_laps(${LAP_COLUMNS.join(',')}) VALUES(${LAP_COLUMNS.map(() => '?').join(',')})`;
const STOP_INSERT = `INSERT INTO combo_stops(session_id,community_id,user_id,track,car,started_at,idx,lap,lane,stopped,fuel,ve,tyres,repair)
  VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`;

// One session → kept once (the same session sent twice is ignored), with its laps and stops in one batch.
export async function saveSession(env, link, input) {
  let session;
  try { session = cleanSession(input); } catch (error) { fail(400, error.message); }
  const result = {track:session.track, car:session.car, laps:session.laps.length, stops:session.stops.length};
  const fingerprint = await hash(JSON.stringify([session.at, session.track, session.car]));
  if (await env.DB.prepare('SELECT 1 FROM combo_sessions WHERE user_id=? AND fingerprint=?').bind(link.user_id, fingerprint).first()) return {...result, created:false};
  const sessionId = id();
  const scope = [sessionId, link.community_id, link.user_id, session.track, session.car, session.at];
  const statements = [env.DB.prepare(`INSERT INTO combo_sessions(id,community_id,user_id,fingerprint,started_at,track,car,car_class,driver,capacity,service,game,expert,lap_count,received_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(sessionId, link.community_id, link.user_id, fingerprint, session.at, session.track, session.car,
    session.carClass, session.driver, session.capacity, session.service && JSON.stringify(session.service), session.game && JSON.stringify(session.game),
    session.expert && JSON.stringify(session.expert), session.laps.length, now())];
  for (const lap of session.laps) statements.push(env.DB.prepare(LAP_INSERT).bind(...scope, lap.n, lap.t, lap.s1, lap.s2, lap.s3, lap.fuel, lap.ve,
    ...lap.wear, ...lap.temp, ...lap.kpa, ...lap.brake, lap.compound, lap.track, lap.air, lap.rain, lap.wet, lap.top, lap.invalid ? 1 : 0, lap.pit ? 1 : 0, lap.setup, lap.light));
  session.stops.forEach((stop, index) => statements.push(env.DB.prepare(STOP_INSERT).bind(...scope, index, stop.lap, stop.lane, stop.stopped,
    stop.fuel, stop.ve, stop.tyres, stop.repair ? 1 : 0)));
  if (session.trace) {
    const {n, t, ...points} = session.trace;
    statements.push(env.DB.prepare('INSERT INTO combo_traces(session_id,community_id,user_id,track,car,started_at,lap,lap_time,data) VALUES(?,?,?,?,?,?,?,?,?)')
      .bind(...scope, n, t, JSON.stringify(points)));
  }
  try { await env.DB.batch(statements); }
  catch (error) { if (/UNIQUE/i.test(String(error?.message))) return {...result, created:false}; throw error; }
  return {...result, created:true};
}

// ---------- Periods: races being prepared and game versions ----------

async function periods(env, community) {
  const rows = await all(env, 'SELECT * FROM combo_periods WHERE community_id=? ORDER BY starts_at, created_at', community.id);
  const versions = rows.filter(row => row.kind === 'version');
  return {
    events:rows.filter(row => row.kind === 'event').map(row => ({id:row.id, name:row.name, track:row.track, startsAt:row.starts_at, endsAt:row.ends_at})),
    // A version lasts until the next one starts.
    versions:versions.map((row, index) => ({id:row.id, name:row.name, startsAt:row.starts_at, endsAt:versions[index + 1] ? versions[index + 1].starts_at - 1 : null}))
  };
}

// The dates the sheet reads: the chosen race and version (an id, « all » or nothing for every date). The plugin
// reads the race and version going on now.
function selection(list, url, track, current) {
  const at = Date.now();
  const pick = (items, key) => {
    const value = url.searchParams.get(key);
    if (value && value !== 'all') return items.find(item => item.id === value) || fail(404, 'Période introuvable.');
    if (!value && current) return items.find(item => item.startsAt <= at && (item.endsAt === null || at <= item.endsAt)) || null;
    return null;
  };
  const event = pick(list.events.filter(item => !item.track || item.track === track), 'event');
  const version = pick(list.versions, 'version');
  const from = Math.max(event?.startsAt ?? 0, version?.startsAt ?? 0);
  const to = Math.min(event?.endsAt ?? FOREVER, version?.endsAt ?? FOREVER);
  return {event:event?.id || null, version:version?.id || null, from, to};
}

function periodInput(input, kind) {
  const name = label(input.name, NAME_MAX);
  if (!name) fail(400, 'Donne un nom à la période.');
  const date = value => Number.isInteger(value) && value >= 1_500_000_000_000 && value < FOREVER ? value : null;
  const startsAt = date(input.startsAt);
  if (startsAt === null) fail(400, 'Date de début invalide.');
  if (kind === 'version') return {name, track:null, startsAt, endsAt:null};
  const endsAt = date(input.endsAt);
  if (endsAt === null || endsAt < startsAt) fail(400, 'Date de fin invalide.');
  return {name, track:label(input.track, 120) || null, startsAt, endsAt};
}

// ---------- The sheet ----------

// Laps that count: timed, valid, away from the pits, not taken out by their pilot, within CLEAN_RATIO of the pilot's best in that condition, on
// the chosen setup, by day or by night, between two track temperatures (NULL: any). A stint is the run of laps between
// two laps that touched the pits.
const CLEAN = `WITH base AS (SELECT *, ${CONDITION_SQL} AS cond, SUM(pit) OVER (PARTITION BY session_id ORDER BY n ROWS UNBOUNDED PRECEDING) AS stint
    FROM combo_laps WHERE community_id=? AND track=? AND car=? AND started_at BETWEEN ? AND ? AND (? IS NULL OR setup=?)
      AND (? IS NULL OR (light IS NOT NULL AND (light<${NIGHT_BELOW})=(?='night'))) AND (? IS NULL OR track_temp>=?) AND (? IS NULL OR track_temp<=?)),
  timed AS (SELECT * FROM base WHERE pit=0 AND invalid=0 AND ignored=0 AND t>0),
  best AS (SELECT user_id, cond, MIN(t) AS best FROM timed GROUP BY user_id, cond),
  clean AS (SELECT timed.* FROM timed JOIN best ON best.user_id=timed.user_id AND best.cond=timed.cond WHERE timed.t<=best.best*${CLEAN_RATIO})`;
const wheelAverages = kind => WHEELS.map(wheel => `AVG(NULLIF(${kind}_${wheel},0)) AS ${kind}_${wheel}`).join(',');
const wheels = (row, kind, digits) => WHEELS.map(wheel => round(row[`${kind}_${wheel}`], digits));

export async function sheet(env, community, userId, combo, url, current = false) {
  const list = await periods(env, community);
  const degrees = name => { const value = url.searchParams.get(name); return value !== null && value !== '' && Number.isFinite(Number(value)) ? Math.max(-30, Math.min(80, Number(value))) : null; };
  const moment = url.searchParams.get('moment');
  const filters = {...selection(list, url, combo.track, current), setup:label(url.searchParams.get('setup'), SETUP_MAX) || null,
    moment:['day', 'night'].includes(moment) ? moment : null, trackMin:degrees('tmin'), trackMax:degrees('tmax')};
  const scope = [community.id, combo.track, combo.car, filters.from, filters.to];
  const lapScope = [...scope, filters.setup, filters.setup, filters.moment, filters.moment, filters.trackMin, filters.trackMin, filters.trackMax, filters.trackMax];
  const where = 'community_id=? AND track=? AND car=? AND started_at BETWEEN ? AND ?';
  const [drivers, slopes, tyres, conditions, moments, setups, sample, stops, service, game, notes] = await Promise.all([
    all(env, `${CLEAN} SELECT user_id, cond, COUNT(*) AS laps, AVG(NULLIF(ve,0)) AS ve, COUNT(NULLIF(ve,0)) AS ve_laps, AVG(NULLIF(fuel,0)) AS fuel,
      AVG(t) AS avg, MIN(t) AS best, COUNT(s1) AS sector_laps, AVG(s1) AS s1, AVG(s2) AS s2, AVG(s3) AS s3, MIN(s1) AS best1, MIN(s2) AS best2, MIN(s3) AS best3
      FROM clean GROUP BY user_id, cond`, ...lapScope),
    // Time lost per lap along a stint: the slope of lap time over lap number, each stint centred on its own mean.
    all(env, `${CLEAN}, centred AS (SELECT user_id, cond, n-AVG(n) OVER w AS x, t-AVG(t) OVER w AS y FROM clean WINDOW w AS (PARTITION BY session_id, stint))
      SELECT user_id, cond, SUM(x*y)/NULLIF(SUM(x*x),0) AS slope FROM centred GROUP BY user_id, cond`, ...lapScope),
    all(env, `${CLEAN} SELECT user_id, cond, compound, COUNT(*) AS laps, MIN(track_temp) AS tmin, MAX(track_temp) AS tmax, ${wheelAverages('wear')}, ${wheelAverages('temp')}, ${wheelAverages('kpa')}, ${wheelAverages('brake')}
      FROM clean GROUP BY user_id, cond, compound`, ...lapScope),
    all(env, `${CLEAN} SELECT cond, COUNT(*) AS laps, MIN(track_temp) AS tmin, MAX(track_temp) AS tmax FROM clean GROUP BY cond`, ...lapScope),
    // Laps driven by day and by night in each condition, whatever the day/night choice: the sheet's day/night switch.
    all(env, `SELECT ${CONDITION_SQL} AS cond, SUM(light>=${NIGHT_BELOW}) AS day, SUM(light<${NIGHT_BELOW}) AS night FROM combo_laps
      WHERE ${where} AND pit=0 AND ignored=0 AND t>0 GROUP BY cond`, ...scope),
    // The setups driven in the period, whichever is chosen: the sheet's setup filter.
    all(env, `SELECT setup, COUNT(*) AS laps, json_group_array(DISTINCT user_id) AS drivers, MAX(started_at) AS last FROM combo_laps
      WHERE ${where} AND setup<>'' GROUP BY setup ORDER BY last DESC LIMIT 50`, ...scope),
    env.DB.prepare(`SELECT COUNT(*) AS sessions, COUNT(DISTINCT user_id) AS drivers, COALESCE(SUM(lap_count),0) AS laps, MIN(started_at) AS first,
      MAX(started_at) AS last, MAX(car_class) AS car_class FROM combo_sessions WHERE ${where}`).bind(...scope).first(),
    env.DB.prepare(`SELECT COUNT(*) AS stops, AVG(lane-stopped) AS lane_through FROM combo_stops WHERE ${where} AND lane>stopped`).bind(...scope).first(),
    // The service times belong to the car: the latest the game gave, on any track.
    env.DB.prepare('SELECT service FROM combo_sessions WHERE community_id=? AND car=? AND service IS NOT NULL ORDER BY started_at DESC LIMIT 1').bind(community.id, combo.car).first(),
    env.DB.prepare(`SELECT game FROM combo_sessions WHERE ${where} AND game IS NOT NULL ORDER BY started_at DESC LIMIT 1`).bind(...scope).first(),
    all(env, `SELECT n.id, n.user_id, n.body, n.created_at, n.updated_at, COALESCE(NULLIF(m.nickname,''), u.name) AS author FROM combo_notes n
      LEFT JOIN users u ON u.id=n.user_id LEFT JOIN memberships m ON m.user_id=n.user_id AND m.community_id=n.community_id
      WHERE n.community_id=? AND n.track=? AND n.car=? ORDER BY n.created_at DESC LIMIT 200`, community.id, combo.track, combo.car)
  ]);

  // Each pilot: his name on the community's Discord server, his colour; the most laps first.
  const lapsOf = new Map();
  for (const row of drivers) lapsOf.set(row.user_id, (lapsOf.get(row.user_id) || 0) + row.laps);
  const people = lapsOf.size ? await all(env, `SELECT u.id, COALESCE(NULLIF(m.nickname,''), u.name) AS name, c.color FROM users u
    LEFT JOIN memberships m ON m.user_id=u.id AND m.community_id=? LEFT JOIN combo_colors c ON c.user_id=u.id AND c.community_id=?
    WHERE u.id IN (SELECT value FROM json_each(?))`, community.id, community.id, JSON.stringify([...lapsOf.keys()])) : [];
  const slopeOf = new Map(slopes.map(row => [`${row.user_id}|${row.cond}`, row.slope]));
  const byCondition = Object.fromEntries(CONDITIONS.map(cond => {
    const summary = conditions.find(row => row.cond === cond);
    const compounds = {};
    for (const row of tyres.filter(item => item.cond === cond)) {
      const name = row.compound || '?';
      compounds[name] ||= {laps:0, trackTemp:null, drivers:[]};
      compounds[name].laps += row.laps;
      // The track temperatures this compound was driven between.
      if (row.tmin !== null) {
        const range = compounds[name].trackTemp;
        compounds[name].trackTemp = [round(Math.min(range?.[0] ?? row.tmin, row.tmin), 1), round(Math.max(range?.[1] ?? row.tmax, row.tmax), 1)];
      }
      compounds[name].drivers.push({id:row.user_id, laps:row.laps, wear:wheels(row, 'wear', 3), temp:wheels(row, 'temp', 1), kpa:wheels(row, 'kpa', 1), brake:wheels(row, 'brake', 0)});
    }
    const moment = moments.find(row => row.cond === cond);
    return [cond, {laps:summary?.laps || 0, trackTemp:summary ? [round(summary.tmin, 1), round(summary.tmax, 1)] : null,
      moments:{day:moment?.day || 0, night:moment?.night || 0},
      drivers:drivers.filter(row => row.cond === cond).sort((a, b) => b.laps - a.laps).map(row => ({id:row.user_id, laps:row.laps, ve:round(row.ve),
        veLaps:row.ve_laps, fuel:round(row.fuel), avg:round(row.avg), best:round(row.best), slope:round(slopeOf.get(`${row.user_id}|${cond}`) ?? null, 4),
        sectors:row.sector_laps ? {laps:row.sector_laps, avg:[row.s1, row.s2, row.s3].map(value => round(value)), best:[row.best1, row.best2, row.best3].map(value => round(value))} : null})),
      compounds}];
  }));

  return {
    combo:{...combo, carClass:sample?.car_class || ''},
    filters, periods:{events:list.events.filter(item => !item.track || item.track === combo.track), versions:list.versions},
    setups:setups.map(row => ({name:row.setup, laps:row.laps, drivers:parsed(row.drivers) || [], last:row.last})),
    sample:{laps:sample?.laps || 0, sessions:sample?.sessions || 0, drivers:sample?.drivers || 0, from:sample?.first ?? null, to:sample?.last ?? null},
    drivers:people.map(row => ({id:row.id, name:row.name, color:row.color || null, me:row.id === userId}))
      .sort((a, b) => lapsOf.get(b.id) - lapsOf.get(a.id) || a.name.localeCompare(b.name, 'fr')),
    conditions:byCondition,
    pit:{stops:stops?.stops || 0, laneThrough:round(stops?.lane_through ?? null, 2), service:parsed(service?.service), game:parsed(game?.game)},
    notes:notes.map(row => ({id:row.id, author:row.author || 'Ancien pilote', body:row.body, createdAt:row.created_at, updatedAt:row.updated_at, mine:row.user_id === userId}))
  };
}

// ---------- « Mon analyse »: one session, wheel by wheel, and its best lap on the map ----------

// The sessions on a combo, the most recent first, each with its pilot and its best lap's trace when the plugin sent it:
// the page opens on the pilot's own and offers the others for the comparison.
async function analysisList(env, community, userId, combo) {
  const rows = await all(env, `SELECT s.id, s.user_id, s.started_at, s.lap_count, s.expert IS NOT NULL AS expert, t.lap, t.lap_time,
      COALESCE(NULLIF(m.nickname,''), u.name) AS name, c.color,
      (SELECT MIN(l.t) FROM combo_laps l WHERE l.session_id=s.id AND l.pit=0 AND l.invalid=0 AND l.ignored=0 AND l.t>0) AS best
    FROM combo_sessions s LEFT JOIN combo_traces t ON t.session_id=s.id LEFT JOIN users u ON u.id=s.user_id
    LEFT JOIN memberships m ON m.user_id=s.user_id AND m.community_id=s.community_id LEFT JOIN combo_colors c ON c.user_id=s.user_id AND c.community_id=s.community_id
    WHERE s.community_id=? AND s.track=? AND s.car=? ORDER BY s.started_at DESC LIMIT 300`, community.id, combo.track, combo.car);
  return {combo, sessions:rows.map(row => ({id:row.id, userId:row.user_id, name:row.name || 'Ancien pilote', color:row.color || null, mine:row.user_id === userId,
    startedAt:row.started_at, laps:row.lap_count, best:round(row.best), expert:row.expert === 1, trace:row.lap ? {lap:row.lap, time:row.lap_time} : null}))};
}

// One session of the community: what the plugin measured wheel by wheel, the laps in figures and the best lap's trace.
async function analysisSession(env, community, userId, sessionId) {
  const session = await env.DB.prepare(`SELECT s.id, s.user_id, s.started_at, s.track, s.car, s.expert, COALESCE(NULLIF(m.nickname,''), u.name) AS name FROM combo_sessions s
    LEFT JOIN users u ON u.id=s.user_id LEFT JOIN memberships m ON m.user_id=s.user_id AND m.community_id=s.community_id
    WHERE s.id=? AND s.community_id=?`).bind(String(sessionId || ''), community.id).first();
  if (!session) notFound();
  // Clean laps as on the sheet: timed, valid, away from the pits, kept, within CLEAN_RATIO of the session's best.
  const [laps, trace, list] = await Promise.all([
    env.DB.prepare(`WITH timed AS (SELECT * FROM combo_laps WHERE session_id=? AND pit=0 AND invalid=0 AND ignored=0 AND t>0),
        clean AS (SELECT * FROM timed WHERE t<=(SELECT MIN(t) FROM timed)*${CLEAN_RATIO})
      SELECT COUNT(*) AS laps, MIN(t) AS best, AVG(t) AS avg, MAX(t)-MIN(t) AS spread, AVG(NULLIF(fuel,0)) AS fuel, AVG(NULLIF(ve,0)) AS ve,
        (SELECT MAX(top) FROM combo_laps WHERE session_id=?) AS top, ${wheelAverages('wear')} FROM clean`).bind(session.id, session.id).first(),
    env.DB.prepare('SELECT lap, lap_time, data FROM combo_traces WHERE session_id=?').bind(session.id).first(),
    all(env, 'SELECT n, t, s1, s2, s3, ve, fuel, compound, pit, invalid, ignored FROM combo_laps WHERE session_id=? ORDER BY n', session.id)
  ]);
  // Every lap of the session and why it counts or not, the slow ones against the session's best kept lap.
  const best = Math.min(...list.filter(lap => !lap.pit && !lap.invalid && !lap.ignored && lap.t > 0).map(lap => lap.t));
  const why = lap => lap.ignored ? 'ignored' : lap.pit ? 'pit' : lap.invalid ? 'invalid' : !(lap.t > 0) ? 'untimed' : lap.t > best * CLEAN_RATIO ? 'slow' : '';
  return {
    session:{id:session.id, userId:session.user_id, name:session.name || 'Ancien pilote', mine:session.user_id === userId, startedAt:session.started_at,
      track:session.track, car:session.car},
    laps:{count:laps?.laps || 0, best:round(laps?.best ?? null), avg:round(laps?.avg ?? null), spread:round(laps?.spread ?? null), fuel:round(laps?.fuel ?? null),
      ve:round(laps?.ve ?? null), top:round(laps?.top ?? null, 1), wear:laps ? wheels(laps, 'wear', 3) : [null, null, null, null]},
    list:list.map(lap => ({n:lap.n, t:lap.t > 0 ? lap.t : null, s1:lap.s1, s2:lap.s2, s3:lap.s3, ve:lap.ve, fuel:lap.fuel, compound:lap.compound, out:why(lap)})),
    expert:parsed(session.expert),
    trace:trace ? {...parsed(trace.data), lap:trace.lap, lapTime:trace.lap_time} : null
  };
}

// Every combo of the community with data, the most recent first.
async function combos(env, community) {
  const rows = await all(env, `SELECT track, car, MAX(car_class) AS car_class, SUM(lap_count) AS laps, COUNT(*) AS sessions, COUNT(DISTINCT user_id) AS drivers,
    MAX(started_at) AS last FROM combo_sessions WHERE community_id=? GROUP BY track, car ORDER BY last DESC`, community.id);
  return rows.map(row => ({track:row.track, car:row.car, carClass:row.car_class, laps:row.laps, sessions:row.sessions, drivers:row.drivers, last:row.last}));
}

// The raw data of one combo, ten sessions a page (the oldest first): what « Exporter la fiche » saves.
async function exportPage(env, community, combo, url) {
  const cursor = /^\d{13}:[a-f0-9-]{36}$/.test(url.searchParams.get('after') || '') ? url.searchParams.get('after').split(':') : null;
  const sessions = await all(env, `SELECT s.*, COALESCE(NULLIF(m.nickname,''), u.name) AS pilot FROM combo_sessions s
    LEFT JOIN users u ON u.id=s.user_id LEFT JOIN memberships m ON m.user_id=s.user_id AND m.community_id=s.community_id
    WHERE s.community_id=? AND s.track=? AND s.car=? ${cursor ? 'AND (s.started_at>? OR (s.started_at=? AND s.id>?))' : ''}
    ORDER BY s.started_at, s.id LIMIT ?`, community.id, combo.track, combo.car, ...(cursor ? [Number(cursor[0]), Number(cursor[0]), cursor[1]] : []), EXPORT_PAGE + 1);
  const page = sessions.slice(0, EXPORT_PAGE);
  const ids = JSON.stringify(page.map(row => row.id));
  const [laps, stops] = page.length ? await Promise.all([
    all(env, 'SELECT * FROM combo_laps WHERE session_id IN (SELECT value FROM json_each(?)) ORDER BY session_id, n', ids),
    all(env, 'SELECT * FROM combo_stops WHERE session_id IN (SELECT value FROM json_each(?)) ORDER BY session_id, idx', ids)
  ]) : [[], []];
  const four = (row, kind) => WHEELS.map(wheel => row[`${kind}_${wheel}`]);
  const out = page.map(row => ({id:row.id, pilot:row.pilot || 'Ancien pilote', startedAt:row.started_at, track:row.track, car:row.car, carClass:row.car_class,
    driver:row.driver, capacity:row.capacity, service:parsed(row.service), game:parsed(row.game), expert:parsed(row.expert),
    laps:laps.filter(lap => lap.session_id === row.id).map(lap => ({n:lap.n, t:lap.t, s1:lap.s1, s2:lap.s2, s3:lap.s3, fuel:lap.fuel, ve:lap.ve, wear:four(lap, 'wear'), temp:four(lap, 'temp'),
      kpa:four(lap, 'kpa'), brake:four(lap, 'brake'), compound:lap.compound, track:lap.track_temp, air:lap.air_temp, rain:lap.rain, wet:lap.wet, top:lap.top,
      invalid:lap.invalid === 1, pit:lap.pit === 1, ignored:lap.ignored === 1, setup:lap.setup, light:lap.light})),
    stops:stops.filter(stop => stop.session_id === row.id).map(stop => ({lap:stop.lap, lane:stop.lane, stopped:stop.stopped, fuel:stop.fuel, ve:stop.ve,
      tyres:stop.tyres, repair:stop.repair === 1}))}));
  const last = page.at(-1);
  return {combo, exportedAt:Date.now(), sessions:out, next:sessions.length > EXPORT_PAGE ? `${last.started_at}:${last.id}` : null,
    ...(cursor ? {} : {notes:(await all(env, `SELECT n.body, n.created_at, COALESCE(NULLIF(m.nickname,''), u.name) AS author FROM combo_notes n
      LEFT JOIN users u ON u.id=n.user_id LEFT JOIN memberships m ON m.user_id=n.user_id AND m.community_id=n.community_id
      WHERE n.community_id=? AND n.track=? AND n.car=? ORDER BY n.created_at`, community.id, combo.track, combo.car))
      .map(row => ({author:row.author || 'Ancien pilote', body:row.body, createdAt:row.created_at})), periods:await periods(env, community)})};
}

// ---------- The plugin (no browser, no cookie: the pilot's own key) ----------

async function pluginAccess(request, env) {
  const raw = request.headers.get('Authorization') || '';
  if (!/^Bearer [a-f0-9]{64}$/.test(raw)) fail(401, 'Liaison requise.');
  await rateLimit(request, env, 'combos-plugin', 120);
  const link = await env.DB.prepare('SELECT * FROM combo_links WHERE token_hash=?').bind(await hash(raw.slice(7))).first();
  if (!link) fail(401, 'Cette liaison a été retirée. Crée un nouveau code sur le site.');
  const community = await communityById(env, link.community_id);
  const user = await env.DB.prepare('SELECT id, name FROM users WHERE id=?').bind(link.user_id).first();
  if (!community || !user || !combosEnabled(community)) fail(403, 'Les fiches combo ne sont pas ouvertes dans cette communauté.');
  // His rights now, not when the code was made: a pilot who left the team or lost the role sends nothing more.
  const access = await communityAccess(env, {user}, community);
  if (access.status !== 'member' || !access.permissions.has('combos')) fail(403, 'Tu n’as plus accès aux fiches combo de cette communauté.');
  await env.DB.prepare('UPDATE combo_links SET last_seen=? WHERE token_hash=?').bind(now(), link.token_hash).run();
  return {link, community, user};
}

export async function combosPlugin(path, request, env) {
  const method = request.method;
  if (path === '/api/combos/plugin/session') {
    if (method !== 'POST') fail(405, 'Méthode non prise en charge.');
    const {link} = await pluginAccess(request, env);
    const result = await saveSession(env, link, await largeBody(request));
    return json(result, result.created ? 201 : 200);
  }
  if (path === '/api/combos/plugin/status' && method === 'GET') {
    const {community, user} = await pluginAccess(request, env);
    const name = await env.DB.prepare('SELECT nickname FROM memberships WHERE community_id=? AND user_id=?').bind(community.id, user.id).first();
    return json({pilot:name?.nickname || user.name, community:community.name});
  }
  if (path === '/api/combos/plugin/sheet' && method === 'GET') {
    const {community, user} = await pluginAccess(request, env);
    const url = new URL(request.url);
    return json(await sheet(env, community, user.id, comboOf(url), url, true));
  }
  notFound();
}

// ---------- The site (signed in, « combos » permission) ----------

export async function combosApi(path, method, request, env, actor, community) {
  if (path !== '/api/combos' && !path.startsWith('/api/combos/')) return null;
  if (!combosEnabled(community)) fail(404, 'Les fiches combo ne sont pas ouvertes dans cette communauté.');
  requirePermission(actor, 'combos', 'Les fiches combo sont réservées aux pilotes de l’équipe.');
  const url = new URL(request.url), userId = actor.user.id;
  if (path === '/api/combos' && method === 'GET') return json({combos:await combos(env, community)});
  if (path === '/api/combos/sheet' && method === 'GET') return json(await sheet(env, community, userId, comboOf(url), url));
  if (path === '/api/combos/export' && method === 'GET') return json(await exportPage(env, community, comboOf(url), url));
  if (path === '/api/combos/analysis' && method === 'GET') return json(await analysisList(env, community, userId, comboOf(url)));
  if (path === '/api/combos/analysis/session' && method === 'GET') return json(await analysisSession(env, community, userId, url.searchParams.get('id')));

  // His plugin: one code at a time, shown once; a new code replaces the previous one.
  if (path === '/api/combos/link') {
    if (method === 'GET') {
      const row = await env.DB.prepare('SELECT created_at, last_seen FROM combo_links WHERE user_id=? AND community_id=?').bind(userId, community.id).first();
      return json({linked:Boolean(row), createdAt:row?.created_at ?? null, lastSeen:row?.last_seen ?? null});
    }
    if (method === 'POST') {
      const key = token();
      await env.DB.prepare(`INSERT INTO combo_links(user_id,community_id,token_hash,created_at) VALUES(?,?,?,?)
        ON CONFLICT(user_id,community_id) DO UPDATE SET token_hash=excluded.token_hash,created_at=excluded.created_at,last_seen=NULL`)
        .bind(userId, community.id, await hash(key), now()).run();
      return json({code:linkCode(siteOrigin(request, env), key)}, 201);
    }
    if (method === 'DELETE') {
      await env.DB.prepare('DELETE FROM combo_links WHERE user_id=? AND community_id=?').bind(userId, community.id).run();
      return json({ok:true});
    }
  }

  if (path === '/api/combos/color' && method === 'PUT') {
    const input = await body(request);
    const color = String(input.color || '').toLowerCase();
    if (!color) await env.DB.prepare('DELETE FROM combo_colors WHERE community_id=? AND user_id=?').bind(community.id, userId).run();
    else if (!COLOR.test(color)) fail(400, 'Couleur invalide.');
    else await env.DB.prepare(`INSERT INTO combo_colors(community_id,user_id,color) VALUES(?,?,?)
      ON CONFLICT(community_id,user_id) DO UPDATE SET color=excluded.color`).bind(community.id, userId, color).run();
    return json({color:color || null});
  }

  if (path === '/api/combos/periods') {
    if (method === 'GET') return json(await periods(env, community));
    if (method === 'POST') {
      const input = await body(request);
      if (!['event', 'version'].includes(input.kind)) fail(400, 'Type de période invalide.');
      const period = periodInput(input, input.kind), periodId = id();
      await env.DB.prepare('INSERT INTO combo_periods(id,community_id,kind,name,track,starts_at,ends_at,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?)')
        .bind(periodId, community.id, input.kind, period.name, period.track, period.startsAt, period.endsAt, userId, now()).run();
      return json({id:periodId, ...period}, 201);
    }
  }
  const periodMatch = path.match(/^\/api\/combos\/periods\/([a-f0-9-]{36})$/);
  if (periodMatch) {
    const row = await env.DB.prepare('SELECT * FROM combo_periods WHERE id=? AND community_id=?').bind(periodMatch[1], community.id).first();
    if (!row) fail(404, 'Période introuvable.');
    if (method === 'PATCH') {
      const period = periodInput(await body(request), row.kind);
      await env.DB.prepare('UPDATE combo_periods SET name=?, track=?, starts_at=?, ends_at=? WHERE id=?').bind(period.name, period.track, period.startsAt, period.endsAt, row.id).run();
      return json({id:row.id, ...period});
    }
    if (method === 'DELETE') {
      await env.DB.prepare('DELETE FROM combo_periods WHERE id=?').bind(row.id).run();
      return json({ok:true});
    }
  }

  // A pilot takes his own laps out of the sheet, or puts them back (a test lap, a lap not driven for real); an admin too.
  if (path === '/api/combos/laps' && method === 'PATCH') {
    const input = await body(request);
    const row = await env.DB.prepare('SELECT id, user_id FROM combo_sessions WHERE id=? AND community_id=?').bind(String(input.session ?? ''), community.id).first();
    if (!row) fail(404, 'Séance introuvable.');
    if (row.user_id !== userId) requirePermission(actor, 'admin', 'Seul le pilote de la séance ou un administrateur peut retirer ses tours.');
    const laps = Array.isArray(input.laps) ? input.laps.map(Number).filter(Number.isInteger).slice(0, 2000) : [];
    if (!laps.length) fail(400, 'Aucun tour choisi.');
    await env.DB.prepare('UPDATE combo_laps SET ignored=? WHERE session_id=? AND n IN (SELECT value FROM json_each(?))')
      .bind(input.ignored ? 1 : 0, row.id, JSON.stringify(laps)).run();
    return json({ok:true});
  }

  // Notes: anyone of the team writes; the author or an admin changes or removes.
  if (path === '/api/combos/notes' && method === 'POST') {
    const input = await body(request);
    const track = label(input.track, 120), car = label(input.car, 120), text = String(input.body ?? '').trim().slice(0, NOTE_MAX);
    if (!track || !car) fail(400, 'Circuit et voiture requis.');
    if (!text) fail(400, 'La note est vide.');
    const noteId = id(), time = now();
    await env.DB.prepare('INSERT INTO combo_notes(id,community_id,track,car,user_id,body,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)')
      .bind(noteId, community.id, track, car, userId, text, time, time).run();
    return json({id:noteId, body:text, createdAt:time}, 201);
  }
  const noteMatch = path.match(/^\/api\/combos\/notes\/([a-f0-9-]{36})$/);
  if (noteMatch && ['PATCH', 'DELETE'].includes(method)) {
    const row = await env.DB.prepare('SELECT * FROM combo_notes WHERE id=? AND community_id=?').bind(noteMatch[1], community.id).first();
    if (!row) fail(404, 'Note introuvable.');
    if (row.user_id !== userId) requirePermission(actor, 'admin', 'Seul l’auteur de la note ou un administrateur peut la changer.');
    if (method === 'DELETE') {
      await env.DB.prepare('DELETE FROM combo_notes WHERE id=?').bind(row.id).run();
      return json({ok:true});
    }
    const text = String((await body(request)).body ?? '').trim().slice(0, NOTE_MAX);
    if (!text) fail(400, 'La note est vide.');
    await env.DB.prepare('UPDATE combo_notes SET body=?, updated_at=? WHERE id=?').bind(text, now(), row.id).run();
    return json({id:row.id, body:text});
  }
  notFound();
}
