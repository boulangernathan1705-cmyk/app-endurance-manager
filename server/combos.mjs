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
import {OFFICIAL} from './api-shared.mjs';
import {memoCandidates, NOTE_THEMES} from '../shared/memo-links.mjs';
import {simForEvent} from '../shared/catalog.mjs';
import {openLive} from './live.mjs';
import {signPass, relaySocketUrl, RELAY_ORIGIN} from '../shared/relay-pass.mjs';
import {cleanSession, CONDITIONS, CONDITION_SQL, CLEAN_RATIO, STINT_MIN, WHEELS, SETUP_MAX, NIGHT_BELOW, linkCode} from '../shared/combos.mjs';

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

// A change to a combo's data: its sheet cached for the plugin is read again (pluginSheet).
const BUMP = `INSERT INTO combo_revisions(community_id,track,car,rev) VALUES(?,?,?,1)
  ON CONFLICT(community_id,track,car) DO UPDATE SET rev=rev+1`;

// One session → kept once (the same session sent twice is ignored), with its laps and stops in one batch.
export async function saveSession(env, link, input) {
  let session;
  try { session = cleanSession(input); } catch (error) { fail(400, error.message); }
  const result = {track:session.track, car:session.car, laps:session.laps.length, stops:session.stops.length};
  const fingerprint = await hash(JSON.stringify([session.at, session.track, session.car]));
  const received = async () => {
    const row = await env.DB.prepare('SELECT id,community_id,received_at FROM combo_sessions WHERE user_id=? AND fingerprint=?')
      .bind(link.user_id,fingerprint).first();
    if (row && row.community_id !== link.community_id) fail(409,'Cette séance est déjà enregistrée dans une autre communauté.');
    return row && {...result,id:row.id,receivedAt:row.received_at,created:false};
  };
  const duplicate = await received();
  if (duplicate) return duplicate;
  const sessionId = id(), receivedAt = now();
  const scope = [sessionId, link.community_id, link.user_id, session.track, session.car, session.at];
  const statements = [env.DB.prepare(`INSERT INTO combo_sessions(id,community_id,user_id,fingerprint,started_at,track,car,car_class,driver,capacity,service,game,expert,lap_count,received_at,session_type)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(sessionId, link.community_id, link.user_id, fingerprint, session.at, session.track, session.car,
    session.carClass, session.driver, session.capacity, session.service && JSON.stringify(session.service), session.game && JSON.stringify(session.game),
    session.expert && JSON.stringify(session.expert), session.laps.length, receivedAt, session.sessionType)];
  for (const lap of session.laps) statements.push(env.DB.prepare(LAP_INSERT).bind(...scope, lap.n, lap.t, lap.s1, lap.s2, lap.s3, lap.fuel, lap.ve,
    ...lap.wear, ...lap.temp, ...lap.kpa, ...lap.brake, lap.compound, lap.track, lap.air, lap.rain, lap.wet, lap.top, lap.invalid ? 1 : 0, lap.pit ? 1 : 0, lap.setup, lap.light));
  session.stops.forEach((stop, index) => statements.push(env.DB.prepare(STOP_INSERT).bind(...scope, index, stop.lap, stop.lane, stop.stopped,
    stop.fuel, stop.ve, stop.tyres, stop.repair ? 1 : 0)));
  statements.push(env.DB.prepare(BUMP).bind(link.community_id, session.track, session.car));
  if (session.trace) {
    const {n, t, ...points} = session.trace;
    statements.push(env.DB.prepare('INSERT INTO combo_traces(session_id,community_id,user_id,track,car,started_at,lap,lap_time,data) VALUES(?,?,?,?,?,?,?,?,?)')
      .bind(...scope, n, t, JSON.stringify(points)));
  }
  try { await env.DB.batch(statements); }
  catch (error) {
    if (/UNIQUE/i.test(String(error?.message))) {
      const existing = await received();
      if (existing) return existing;
    }
    throw error;
  }
  return {...result,id:sessionId,receivedAt,created:true};
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

// The dates the sheet reads: the chosen race and version (an id, « all » or nothing for every date), narrowed to the
// days chosen by hand (from / to, in ms: the page sends its own midnights). The plugin reads the race and version going on now.
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
  const bound = key => { const value = Number(url.searchParams.get(key) || NaN); return Number.isInteger(value) && value >= 0 && value < FOREVER ? value : null; };
  const since = bound('from'), until = bound('to');
  const from = Math.max(event?.startsAt ?? 0, version?.startsAt ?? 0, since ?? 0);
  const to = Math.min(event?.endsAt ?? FOREVER, version?.endsAt ?? FOREVER, until ?? FOREVER);
  return {event:event?.id || null, version:version?.id || null, since, until, from, to};
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

// A new stint starts on a lap that touched the pits, or after a gap in the lap numbers: the plugin leaves out an
// untimed lap in the pits (the drive out of the garage).
const CUT = 'CASE WHEN pit=1 OR n-LAG(n) OVER (PARTITION BY session_id ORDER BY n)<>1 THEN 1 ELSE 0 END';

// Laps that count: timed, valid, away from the pits, not taken out by their pilot, within CLEAN_RATIO of the pilot's best in that condition, on
// the chosen setup, by day or by night, between two track temperatures (NULL: any). A stint is the run of laps between
// two laps that touched the pits (CUT); one shorter than STINT_MIN timed laps keeps only the pilot's best lap. Stints are cut
// before the filters, so a stint crossing dusk or a track temperature bound keeps its length.
const cleanSQL = (endurance=false) => `WITH raw AS (SELECT *, ${CONDITION_SQL} AS cond, ${CUT} AS cut
    FROM combo_laps WHERE community_id=? AND track=? AND car=? AND started_at BETWEEN ? AND ?${endurance ? ' AND EXISTS (SELECT 1 FROM combo_sessions s WHERE s.id=combo_laps.session_id AND (s.session_type IS NULL OR s.session_type BETWEEN 0 AND 4 OR s.session_type BETWEEN 10 AND 13))' : ''}),
  stints AS (SELECT *, SUM(cut) OVER (PARTITION BY session_id ORDER BY n ROWS UNBOUNDED PRECEDING) AS stint FROM raw),
  runs AS (SELECT *, SUM(pit=0 AND ignored=0 AND t>0${endurance?' AND invalid=0':''}) OVER (PARTITION BY session_id, stint) AS run FROM stints),
  base AS (SELECT * FROM runs WHERE (? IS NULL OR setup=?)
      AND (? IS NULL OR (light IS NOT NULL AND (light<${NIGHT_BELOW})=(?='night'))) AND (? IS NULL OR track_temp>=?) AND (? IS NULL OR track_temp<=?)),
  timed AS (SELECT * FROM base WHERE pit=0 AND invalid=0 AND ignored=0 AND t>0),
  best AS (SELECT user_id, cond, MIN(t) AS best FROM timed GROUP BY user_id, cond),
  clean AS (SELECT timed.* FROM timed JOIN best ON best.user_id=timed.user_id AND best.cond=timed.cond
    WHERE timed.t<=best.best*${CLEAN_RATIO} AND (timed.run>=${STINT_MIN}${endurance?'':' OR timed.t=best.best'}))`;
const CLEAN = cleanSQL();
const ENDURANCE = cleanSQL(true);
const wheelAverages = kind => WHEELS.map(wheel => `AVG(NULLIF(${kind}_${wheel},0)) AS ${kind}_${wheel}`).join(',');
const wheels = (row, kind, digits) => WHEELS.map(wheel => round(row[`${kind}_${wheel}`], digits));

function sheetFilters(list, combo, url, current = false) {
  const degrees = name => { const value = url.searchParams.get(name); return value !== null && value !== '' && Number.isFinite(Number(value)) ? Math.max(-30, Math.min(80, Number(value))) : null; };
  const moment = url.searchParams.get('moment');
  return {...selection(list, url, combo.track, current), setup:label(url.searchParams.get('setup'), SETUP_MAX) || null,
    moment:['day', 'night'].includes(moment) ? moment : null, trackMin:degrees('tmin'), trackMax:degrees('tmax')};
}

async function memoRace(env, community, combo, eventId) {
  if (!/^[a-f0-9-]{36}$/i.test(eventId || '')) return null;
  const row = await env.DB.prepare("SELECT id,name,circuit,sim FROM events WHERE id=? AND community_id IN (?,?) AND format='endurance'")
    .bind(eventId,community.id,OFFICIAL).first();
  if (!row?.circuit || simForEvent(row) !== 'lmu' || !memoCandidates([combo],new URLSearchParams({circuit:row.circuit})).length) return null;
  return {id:row.id,name:row.name};
}

function noteInput(input) {
  const text = String(input.body ?? '').trim().slice(0,NOTE_MAX);
  if (!text) fail(400,'La note est vide.');
  if (input.theme !== undefined && !Object.hasOwn(NOTE_THEMES,input.theme)) fail(400,'Thème de note invalide.');
  if (input.pinned !== undefined && typeof input.pinned !== 'boolean') fail(400,'Épinglage invalide.');
  return {text,theme:input.theme,pinned:input.pinned};
}

const canManageMemo = actor => actor.permissions.has('crews') || actor.permissions.has('admin');

export async function sheet(env, community, userId, combo, url, current = false, knownPeriods = null) {
  const [list,race] = await Promise.all([knownPeriods || periods(env,community),
    !current && url.searchParams.has('race') ? memoRace(env,community,combo,url.searchParams.get('race')) : null]);
  const withNotes = current || !url.searchParams.has('comparison');
  const filters = sheetFilters(list, combo, url, current);
  const scope = [community.id, combo.track, combo.car, filters.from, filters.to];
  const lapScope = [...scope, filters.setup, filters.setup, filters.moment, filters.moment, filters.trackMin, filters.trackMin, filters.trackMax, filters.trackMax];
  const where = 'community_id=? AND track=? AND car=? AND started_at BETWEEN ? AND ?';
  const [drivers, slopes, tyres, moments, setups, sample, stops, service, game, notes, endurance] = await Promise.all([
    all(env, `${CLEAN} SELECT user_id, cond, COUNT(*) AS laps, AVG(NULLIF(ve,0)) AS ve, COUNT(NULLIF(ve,0)) AS ve_laps, AVG(NULLIF(fuel,0)) AS fuel,
      AVG(t) AS avg, MIN(t) AS best, AVG(NULLIF((wear_fl+wear_fr+wear_rl+wear_rr)/4.0,0)) AS wear, COUNT(s1) AS sector_laps, AVG(s1) AS s1, AVG(s2) AS s2, AVG(s3) AS s3, MIN(s1) AS best1, MIN(s2) AS best2, MIN(s3) AS best3
      FROM clean GROUP BY user_id, cond`, ...lapScope),
    // Time lost per lap along a stint: the slope of lap time over lap number, each stint centred on its own mean.
    all(env, `${CLEAN}, centred AS (SELECT user_id, cond, n-AVG(n) OVER w AS x, t-AVG(t) OVER w AS y FROM clean WINDOW w AS (PARTITION BY session_id, stint))
      SELECT user_id, cond, SUM(x*y)/NULLIF(SUM(x*x),0) AS slope FROM centred GROUP BY user_id, cond`, ...lapScope),
    all(env, `${CLEAN} SELECT user_id, cond, compound, COUNT(*) AS laps, MIN(track_temp) AS tmin, MAX(track_temp) AS tmax, ${wheelAverages('wear')}, ${wheelAverages('temp')}, ${wheelAverages('kpa')}, ${wheelAverages('brake')}
      FROM clean GROUP BY user_id, cond, compound`, ...lapScope),
    // Laps driven by day and by night in each condition, whatever the day/night choice: the sheet's day/night switch.
    all(env, `SELECT ${CONDITION_SQL} AS cond, SUM(light>=${NIGHT_BELOW}) AS day, SUM(light<${NIGHT_BELOW}) AS night FROM combo_laps
      WHERE ${where} AND pit=0 AND ignored=0 AND t>0 GROUP BY cond`, ...scope),
    // The setups driven in the period, whichever is chosen: the sheet's setup filter.
    all(env, `SELECT setup, COUNT(*) AS laps, json_group_array(DISTINCT user_id) AS drivers, MAX(started_at) AS last FROM combo_laps
      WHERE ${where} AND setup<>'' GROUP BY setup ORDER BY last DESC LIMIT 50`, ...scope),
    env.DB.prepare(`SELECT COUNT(*) AS sessions, COUNT(DISTINCT user_id) AS drivers, COALESCE(SUM(lap_count),0) AS laps, MIN(started_at) AS first,
      MAX(started_at) AS last, MAX(car_class) AS car_class, MIN(capacity) AS capacity_min, MAX(capacity) AS capacity_max FROM combo_sessions WHERE ${where}`).bind(...scope).first(),
    env.DB.prepare(`SELECT COUNT(*) AS stops, AVG(lane-stopped) AS lane_through FROM combo_stops WHERE ${where} AND lane>stopped`).bind(...scope).first(),
    // The service times belong to the car, but stay within the selected period/version.
    env.DB.prepare('SELECT service FROM combo_sessions WHERE community_id=? AND car=? AND service IS NOT NULL AND started_at BETWEEN ? AND ? ORDER BY started_at DESC LIMIT 1').bind(community.id, combo.car, filters.from, filters.to).first(),
    env.DB.prepare(`SELECT game FROM combo_sessions WHERE ${where} AND game IS NOT NULL ORDER BY started_at DESC LIMIT 1`).bind(...scope).first(),
    withNotes ? all(env, `SELECT n.id, n.user_id, n.body, n.created_at, n.updated_at, n.event_id, n.theme, n.pinned, COALESCE(NULLIF(m.nickname,''), u.name) AS author FROM combo_notes n
      LEFT JOIN users u ON u.id=n.user_id LEFT JOIN memberships m ON m.user_id=n.user_id AND m.community_id=n.community_id
      WHERE n.community_id=? AND n.track=? AND n.car=? AND (n.event_id IS NULL OR n.event_id=?)
      ORDER BY n.pinned DESC,n.created_at DESC LIMIT 200`, community.id, combo.track, combo.car,race?.id ?? null) : [],
    // Website-only preparation: exclude qualifying and warm-up before selecting clean laps.
    // Old sessions of unknown type are retained only when they contain a proper stint.
    current ? [] : all(env, `${ENDURANCE}, ranked AS (
      SELECT *, ROW_NUMBER() OVER(PARTITION BY user_id,cond ORDER BY t) AS pace_rank,
      COUNT(*) OVER(PARTITION BY user_id,cond) AS pace_count FROM clean)
      SELECT 'pace' AS kind,user_id,cond,NULL AS compound,COUNT(*) AS laps,AVG(t) AS avg,
        CASE WHEN COUNT(*)>=4 THEN MAX(CASE WHEN pace_rank=(pace_count+3)/4 THEN t END) END AS q25,
        CASE WHEN COUNT(*)>=4 THEN MAX(CASE WHEN pace_rank=(3*pace_count+3)/4 THEN t END) END AS q75,
        AVG(NULLIF(ve,0)) AS ve,AVG(NULLIF(fuel,0)) AS fuel,
        NULL AS wear_fl,NULL AS wear_fr,NULL AS wear_rl,NULL AS wear_rr
      FROM ranked GROUP BY user_id,cond
      UNION ALL
      SELECT 'tyres',user_id,cond,compound,COUNT(*),NULL,NULL,NULL,NULL,NULL,${wheelAverages('wear')}
      FROM clean GROUP BY user_id,cond,compound`, ...lapScope)
  ]);

  // Each pilot: his name on the community's Discord server, his colour; the most laps first.
  const lapsOf = new Map();
  for (const row of drivers) lapsOf.set(row.user_id, (lapsOf.get(row.user_id) || 0) + row.laps);
  for (const row of endurance) if (row.kind==='pace' && !lapsOf.has(row.user_id)) lapsOf.set(row.user_id,row.laps);
  const people = lapsOf.size ? await all(env, `SELECT u.id, COALESCE(NULLIF(m.nickname,''), u.name) AS name, c.color FROM users u
    LEFT JOIN memberships m ON m.user_id=u.id AND m.community_id=? LEFT JOIN combo_colors c ON c.user_id=u.id AND c.community_id=?
    WHERE u.id IN (SELECT value FROM json_each(?))`, community.id, community.id, JSON.stringify([...lapsOf.keys()])) : [];
  const slopeOf = new Map(slopes.map(row => [`${row.user_id}|${row.cond}`, row.slope]));
  const byCondition = Object.fromEntries(CONDITIONS.map(cond => {
    // The tyre groups partition the same clean laps, including laps without a known compound.
    let laps = 0, tmin = null, tmax = null;
    const compounds = {};
    for (const row of tyres.filter(item => item.cond === cond)) {
      const name = row.compound || '?';
      laps += row.laps;
      compounds[name] ||= {laps:0, trackTemp:null, drivers:[]};
      compounds[name].laps += row.laps;
      // The track temperatures this compound was driven between.
      if (row.tmin !== null) {
        tmin = Math.min(tmin ?? row.tmin, row.tmin);
        tmax = Math.max(tmax ?? row.tmax, row.tmax);
        const range = compounds[name].trackTemp;
        compounds[name].trackTemp = [round(Math.min(range?.[0] ?? row.tmin, row.tmin), 1), round(Math.max(range?.[1] ?? row.tmax, row.tmax), 1)];
      }
      compounds[name].drivers.push({id:row.user_id, laps:row.laps, wear:wheels(row, 'wear', 3), temp:wheels(row, 'temp', 1), kpa:wheels(row, 'kpa', 1), brake:wheels(row, 'brake', 0)});
    }
    const moment = moments.find(row => row.cond === cond);
    const prep = {drivers:[],compounds:{}};
    for (const row of endurance.filter(item=>item.cond===cond)) {
      if (row.kind==='pace') prep.drivers.push({id:row.user_id,laps:row.laps,avg:round(row.avg),q25:round(row.q25),q75:round(row.q75),ve:round(row.ve),fuel:round(row.fuel)});
      else {const name=row.compound||'?'; const group=prep.compounds[name] ||= {laps:0,drivers:[]}; group.laps+=row.laps; group.drivers.push({id:row.user_id,laps:row.laps,wear:wheels(row,'wear',3)});}
    }
    return [cond, {...(!current?{endurance:prep}:{}),laps, trackTemp:laps ? [round(tmin, 1), round(tmax, 1)] : null,
      moments:{day:moment?.day || 0, night:moment?.night || 0},
      drivers:drivers.filter(row => row.cond === cond).sort((a, b) => b.laps - a.laps).map(row => ({id:row.user_id, laps:row.laps, ve:round(row.ve),
        veLaps:row.ve_laps, fuel:round(row.fuel), wear:round(row.wear), avg:round(row.avg), best:round(row.best), slope:round(slopeOf.get(`${row.user_id}|${cond}`) ?? null, 4),
        sectors:row.sector_laps ? {laps:row.sector_laps, avg:[row.s1, row.s2, row.s3].map(value => round(value)), best:[row.best1, row.best2, row.best3].map(value => round(value))} : null})),
      compounds}];
  }));

  return {
    combo:{...combo, carClass:sample?.car_class || '', capacity:sample?.capacity_min === sample?.capacity_max ? sample?.capacity_min ?? null : null},
    filters, periods:{events:list.events.filter(item => !item.track || item.track === combo.track), versions:list.versions},
    setups:setups.map(row => ({name:row.setup, laps:row.laps, drivers:parsed(row.drivers) || [], last:row.last})),
    sample:{laps:sample?.laps || 0, sessions:sample?.sessions || 0, drivers:sample?.drivers || 0, from:sample?.first ?? null, to:sample?.last ?? null},
    drivers:people.map(row => ({id:row.id, name:row.name, color:row.color || null, me:row.id === userId}))
      .sort((a, b) => lapsOf.get(b.id) - lapsOf.get(a.id) || a.name.localeCompare(b.name, 'fr')),
    conditions:byCondition,
    pit:{stops:stops?.stops || 0, laneThrough:round(stops?.lane_through ?? null, 2), service:parsed(service?.service), game:parsed(game?.game)},
    race, notes:notes.map(row => ({id:row.id, author:row.author || 'Ancien pilote', body:row.body, createdAt:row.created_at, updatedAt:row.updated_at,
      mine:row.user_id === userId, eventId:row.event_id, theme:row.theme, pinned:row.pinned === 1}))
  };
}

// Only the website asks for this bounded history, on demand. Stints use the same filtered laps as the sheet.
// Pit stops are separately measured and scoped by session dates, not by weather inferred from another lap.
async function history(env, community, combo, url) {
  const filters = sheetFilters(await periods(env,community),combo,url);
  const scope = [community.id,combo.track,combo.car,filters.from,filters.to];
  const lapScope = [...scope,filters.setup,filters.setup,filters.moment,filters.moment,filters.trackMin,filters.trackMin,filters.trackMax,filters.trackMax];
  const cond = url.searchParams.get('cond');
  if (!CONDITIONS.includes(cond)) fail(400,'Conditions de piste invalides.');
  const [runs, stops] = await Promise.all([
    all(env,`${CLEAN} SELECT session_id,user_id,started_at,stint,MIN(n) AS first,MAX(n) AS last,MAX(run) AS timed,COUNT(*) AS laps,
      AVG(t) AS pace,MIN(t) AS best,SUM(t) AS driving,AVG(NULLIF(ve,0)) AS ve,AVG(NULLIF(fuel,0)) AS fuel,
      AVG(wear_fl) AS wear_fl,AVG(wear_fr) AS wear_fr,AVG(wear_rl) AS wear_rl,AVG(wear_rr) AS wear_rr,
      SUM(CASE WHEN ve>0 THEN ve ELSE 0 END) AS energy,COUNT(NULLIF(ve,0)) AS ve_count
      FROM clean WHERE cond=? GROUP BY session_id,user_id,started_at,stint
      ORDER BY started_at DESC, session_id, stint DESC LIMIT 101`,...lapScope,cond),
    all(env,`SELECT user_id,started_at,lap,lane,stopped,fuel,ve,tyres,repair FROM combo_stops
      WHERE community_id=? AND track=? AND car=? AND started_at BETWEEN ? AND ? AND lane>=stopped
      ORDER BY started_at DESC, session_id, idx DESC LIMIT 101`,...scope)
  ]);
  return {stints:runs.slice(0,100).map(row=>({session:row.session_id,pilot:row.user_id,at:row.started_at,stint:row.stint,
    first:row.first,last:row.last,laps:row.laps,timed:row.timed,pace:round(row.pace),best:round(row.best),driving:round(row.driving),
    ve:round(row.ve),fuel:round(row.fuel),wear:wheels(row,'wear',3),energy:row.ve_count===row.laps?round(row.energy):null})),
    stops:stops.slice(0,100).map(row=>({pilot:row.user_id,at:row.started_at,lap:row.lap,lane:round(row.lane,1),
      stopped:round(row.stopped,1),fuel:round(row.fuel),ve:round(row.ve),tyres:row.tyres,repair:!!row.repair})),
    moreStints:runs.length>100,moreStops:stops.length>100};
}

// ---------- « Mon analyse »: one session, wheel by wheel, and its best lap on the map ----------

// The sessions on a combo, the most recent first, each with its pilot and its best lap's trace when the plugin sent it:
// the page opens on the pilot's own and offers the others for the comparison.
async function analysisList(env, community, userId, combo) {
  const rows = await all(env, `SELECT s.id, s.user_id, s.started_at, s.lap_count, s.session_type, s.expert IS NOT NULL AS expert,
      l.n AS lap, t.lap_time, ${CONDITION_SQL} AS cond, l.track_temp, l.light,
      COALESCE(NULLIF(m.nickname,''), u.name) AS name, c.color,
      (SELECT MIN(l.t) FROM combo_laps l WHERE l.session_id=s.id AND l.pit=0 AND l.invalid=0 AND l.ignored=0 AND l.t>0) AS best
    FROM combo_sessions s LEFT JOIN combo_traces t ON t.session_id=s.id
    LEFT JOIN combo_laps l ON l.session_id=t.session_id AND l.n=t.lap AND l.ignored=0 AND l.invalid=0 AND l.pit=0 AND ABS(l.t-t.lap_time)<=1
    LEFT JOIN users u ON u.id=s.user_id
    LEFT JOIN memberships m ON m.user_id=s.user_id AND m.community_id=s.community_id LEFT JOIN combo_colors c ON c.user_id=s.user_id AND c.community_id=s.community_id
    WHERE s.community_id=? AND s.track=? AND s.car=? ORDER BY s.started_at DESC LIMIT 300`, community.id, combo.track, combo.car);
  return {combo, sessions:rows.map(row => ({id:row.id, userId:row.user_id, name:row.name || 'Ancien pilote', color:row.color || null, mine:row.user_id === userId,
    startedAt:row.started_at, laps:row.lap_count, best:round(row.best), expert:row.expert === 1, type:row.session_type, trace:row.lap ? {lap:row.lap, time:row.lap_time, cond:row.cond, temp:row.track_temp, light:row.light} : null}))};
}

// One session of the community: what the plugin measured wheel by wheel, the laps in figures and the best lap's trace.
async function analysisSession(env, community, userId, sessionId) {
  const session = await env.DB.prepare(`SELECT s.id, s.user_id, s.started_at, s.track, s.car, s.expert, COALESCE(NULLIF(m.nickname,''), u.name) AS name FROM combo_sessions s
    LEFT JOIN users u ON u.id=s.user_id LEFT JOIN memberships m ON m.user_id=s.user_id AND m.community_id=s.community_id
    WHERE s.id=? AND s.community_id=?`).bind(String(sessionId || ''), community.id).first();
  if (!session) notFound();
  // Clean laps as on the sheet: timed, valid, away from the pits, kept, within CLEAN_RATIO of the session's best.
  const [trace, list, records] = await Promise.all([
    env.DB.prepare('SELECT lap, lap_time, data FROM combo_traces WHERE session_id=?').bind(session.id).first(),
    // Each lap with its condition and the length of its stint, as the sheet cuts them.
    all(env, `WITH raw AS (SELECT *, ${CONDITION_SQL} AS cond, ${CUT} AS cut FROM combo_laps WHERE session_id=?),
        stints AS (SELECT *, SUM(cut) OVER (ORDER BY n ROWS UNBOUNDED PRECEDING) AS stint FROM raw)
      SELECT n, t, s1, s2, s3, ve, fuel, top, wear_fl, wear_fr, wear_rl, wear_rr, compound, pit, invalid, ignored, cond, stint, SUM(pit=0 AND ignored=0 AND t>0) OVER (PARTITION BY stint) AS run
      FROM stints ORDER BY n`, session.id),
    // The pilot's best lap on this combo in each condition: a short stint keeps it.
    all(env, `SELECT cond, MIN(t) AS best FROM (SELECT t, ${CONDITION_SQL} AS cond FROM combo_laps WHERE community_id=? AND track=? AND car=? AND user_id=?
      AND pit=0 AND invalid=0 AND ignored=0 AND t>0) GROUP BY cond`, community.id, session.track, session.car, session.user_id)
  ]);
  // Every lap of the session and why it counts or not, the slow ones against the session's best kept lap.
  const record = new Map(records.map(row => [row.cond, row.best]));
  const why = lap => lap.ignored ? 'ignored' : lap.pit ? 'pit' : lap.invalid ? 'invalid' : !(lap.t > 0) ? 'untimed'
    : lap.run < STINT_MIN && lap.t !== record.get(lap.cond) ? 'short' : lap.t > record.get(lap.cond) * CLEAN_RATIO ? 'slow' : '';
  const clean = list.filter(lap => !why(lap));
  const values = (key, positive = false) => clean.map(lap => lap[key]).filter(value => Number.isFinite(value) && (!positive || value > 0));
  const avg = (key, positive = false) => { const data = values(key, positive); return data.length ? data.reduce((sum, value) => sum + value, 0) / data.length : null; };
  const times = values('t');
  const best = times.length ? Math.min(...times) : null;
  const top = values('top');
  const traceLap = trace && list.find(lap => lap.n === trace.lap);
  const usableTrace = traceLap && !traceLap.ignored && !traceLap.invalid && !traceLap.pit && Math.abs(traceLap.t-trace.lap_time)<=1;
  const byCondition = Object.fromEntries(CONDITIONS.map(cond=>{
    const laps = clean.filter(lap=>lap.cond===cond);
    const data = key=>laps.map(lap=>lap[key]).filter(value=>Number.isFinite(value) && value>0);
    const mean = key=>{const items=data(key);return items.length?round(items.reduce((sum,n)=>sum+n,0)/items.length):null;};
    const times = data('t');
    return [cond,{count:times.length,best:times.length?round(Math.min(...times)):null,avg:mean('t'),
      spread:times.length?round(Math.max(...times)-Math.min(...times)):null,fuel:mean('fuel'),ve:mean('ve'),
      top:data('top').length?round(Math.max(...data('top')),1):null}];
  }));
  return {
    session:{id:session.id, userId:session.user_id, name:session.name || 'Ancien pilote', mine:session.user_id === userId, startedAt:session.started_at,
      track:session.track, car:session.car},
    laps:{count:clean.length, best:round(best), avg:round(avg('t')), spread:times.length ? round(Math.max(...times) - best) : null, fuel:round(avg('fuel', true)),
      ve:round(avg('ve', true)), top:top.length ? round(Math.max(...top), 1) : null, wear:WHEELS.map(wheel => round(avg(`wear_${wheel}`, true), 3))},
    byCondition,
    list:list.map(lap => ({n:lap.n, cond:lap.cond, stint:lap.stint+1, t:lap.t > 0 ? lap.t : null, s1:lap.s1, s2:lap.s2, s3:lap.s3, ve:lap.ve, fuel:lap.fuel, compound:lap.compound, out:why(lap)})),
    expert:parsed(session.expert),
    trace:usableTrace ? {...parsed(trace.data), lap:trace.lap, lapTime:trace.lap_time} : null
  };
}

// The track's outline for the pit wall: the most recent lap one of us recorded there (any car), at most 600 points.
async function outline(env, community, track) {
  const row = await env.DB.prepare('SELECT data FROM combo_traces WHERE community_id=? AND track=? ORDER BY started_at DESC LIMIT 1')
    .bind(community.id, String(track || '').slice(0, 80)).first();
  const data = row ? parsed(row.data) : null;
  const xs = Array.isArray(data?.x) ? data.x : [], zs = Array.isArray(data?.z) ? data.z : [];
  const count = Math.min(xs.length, zs.length), step = Math.max(1, Math.ceil(count / 600)), points = [];
  for (let i = 0; i < count; i += step) if (Number.isFinite(xs[i]) && Number.isFinite(zs[i])) points.push([xs[i], zs[i]]);
  return {track, points:points.length > 20 ? points : []};
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
  const race = !cursor && url.searchParams.has('race') ? await memoRace(env,community,combo,url.searchParams.get('race')) : null;
  return {combo, exportedAt:Date.now(), sessions:out, next:sessions.length > EXPORT_PAGE ? `${last.started_at}:${last.id}` : null,
    ...(cursor ? {} : {notes:(await all(env, `SELECT n.body, n.created_at, n.event_id, n.theme, n.pinned, COALESCE(NULLIF(m.nickname,''), u.name) AS author FROM combo_notes n
      LEFT JOIN users u ON u.id=n.user_id LEFT JOIN memberships m ON m.user_id=n.user_id AND m.community_id=n.community_id
      WHERE n.community_id=? AND n.track=? AND n.car=? AND (n.event_id IS NULL OR n.event_id=?)
      ORDER BY n.created_at`,community.id,combo.track,combo.car,race?.id ?? null))
      .map(row=>({author:row.author || 'Ancien pilote',body:row.body,createdAt:row.created_at,eventId:row.event_id,theme:row.theme,pinned:row.pinned===1})), periods:await periods(env, community)})};
}

// ---------- The plugin (no browser, no cookie: the pilot's own key) ----------

async function pluginAccess(request, env) {
  const raw = request.headers.get('Authorization') || '';
  if (!/^Bearer [a-f0-9]{64}$/.test(raw)) fail(401, 'Liaison requise.');
  await rateLimit(request, env, 'combos-plugin', 120);
  const link = await env.DB.prepare('SELECT * FROM combo_links WHERE token_hash=?').bind(await hash(raw.slice(7))).first();
  if (!link) fail(401, 'Cette liaison a été retirée. Crée un nouveau code sur le site.');
  const community = await communityById(env, link.community_id);
  if (!combosEnabled(community)) fail(403, 'Les fiches combo ne sont pas ouvertes dans cette communauté.');
  const user = await env.DB.prepare('SELECT id, name FROM users WHERE id=?').bind(link.user_id).first();
  if (!user) fail(403, 'Les fiches combo ne sont pas ouvertes dans cette communauté.');
  // His rights now, not when the code was made: a pilot who left the team or lost the role sends nothing more.
  const access = await communityAccess(env, {user}, community);
  if (access.status !== 'member' || !access.permissions.has('combos')) fail(403, 'Tu n’as plus accès aux fiches combo de cette communauté.');
  const seenAt = now();
  if (!link.last_seen || seenAt - link.last_seen >= 60) await env.DB.prepare('UPDATE combo_links SET last_seen=? WHERE token_hash=?').bind(seenAt, link.token_hash).run();
  return {link, community, user};
}

// The practice banner reads the sheet at each session start and every few minutes, and a sheet goes through the
// combo's laps several times: kept in the data centre's cache until the combo changes (its revision), at most
// SHEET_CACHE seconds (the current race or game version can move on). Without a cache (tests), computed each time.
const SHEET_CACHE = 1800;
async function pluginSheet(env, community, userId, url) {
  const combo = comboOf(url), cache = globalThis.caches?.default;
  if (!cache) return json(await sheet(env, community, userId, combo, url, true));
  const rev = await env.DB.prepare('SELECT rev FROM combo_revisions WHERE community_id=? AND track=? AND car=?').bind(community.id, combo.track, combo.car).first();
  const list = await periods(env, community);
  const selected = selection(list, url, combo.track, true);
  const filterKey = JSON.stringify([selected, list, ...['setup','moment','tmin','tmax'].map(name => url.searchParams.get(name))]);
  const key = new Request(`https://combo-sheet.invalid/${[community.id, combo.track, combo.car, rev?.rev ?? 0, userId, await hash(filterKey)].map(encodeURIComponent).join('/')}`);
  const hit = await cache.match(key);
  if (hit) {
    const headers=new Headers(hit.headers);
    headers.set('Cache-Control','no-store');
    return new Response(hit.body,{status:hit.status,headers});
  }
  const response = json(await sheet(env, community, userId, combo, url, true,list));
  const headers = new Headers(response.headers);
  headers.set('Cache-Control', `max-age=${SHEET_CACHE}`);
  await cache.put(key, new Response(await response.clone().arrayBuffer(), {status:response.status, headers}));
  return response;
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
  // Mur des stands: the pilot at the wheel shares his car live with the team (server/live.mjs). With a relay (a second
  // Cloudflare account, relay/worker.mjs), the plugin asks here for a pass and connects there; else straight here.
  if (path === '/api/combos/plugin/live' || path === '/api/combos/plugin/live/pass') {
    const {community, user} = await pluginAccess(request, env);
    const row = await env.DB.prepare(`SELECT NULLIF(m.nickname,'') AS nickname, c.color FROM users u LEFT JOIN memberships m ON m.user_id=u.id AND m.community_id=?
      LEFT JOIN combo_colors c ON c.user_id=u.id AND c.community_id=? WHERE u.id=?`).bind(community.id, community.id, user.id).first();
    const who = {Role:'driver', User:user.id, Name:row?.nickname || user.name, Color:row?.color || ''};
    if (path.endsWith('/pass')) return relayPass(env, community.id, who);
    return openLive(request, env, community.id, who);
  }
  // The mur in SimHub (plugin 2.5, Wall.cs): a teammate's plugin follows the team's cars as a page does (viewer).
  if (path === '/api/combos/plugin/live/watch' || path === '/api/combos/plugin/live/watch/pass') {
    const {community, user} = await pluginAccess(request, env);
    const who = {Role:'viewer', User:user.id};
    if (path.endsWith('/pass')) return relayPass(env, community.id, who);
    return openLive(request, env, community.id, who);
  }
  // Module « Aide au développement » (Report.cs): a session's journal or a problem the pilot reports, kept REPORT_DAYS days.
  if (path === '/api/combos/plugin/report') {
    if (method !== 'POST') fail(405, 'Méthode non prise en charge.');
    const {community, user} = await pluginAccess(request, env);
    return json(await saveReport(env, community.id, user.id, await largeBody(request)), 201);
  }
  if (path === '/api/combos/plugin/sheet' && method === 'GET') {
    const {community, user} = await pluginAccess(request, env);
    return pluginSheet(env, community, user.id, new URL(request.url));
  }
  notFound();
}

const REPORT_KINDS = new Set(['journal', 'signal']), REPORT_MAX = 256 * 1024, REPORT_DAYS = 60;
async function saveReport(env, communityId, userId, input) {
  const kind = String(input?.kind || '');
  if (!REPORT_KINDS.has(kind)) fail(400, 'Retour illisible.');
  const body = JSON.stringify(input.data ?? null);
  if (body.length > REPORT_MAX) fail(413, 'Retour trop lourd.');
  const at = now(), reportId = id();
  await env.DB.batch([
    env.DB.prepare('INSERT INTO plugin_reports (id, community_id, user_id, created_at, version, kind, note, body) VALUES (?,?,?,?,?,?,?,?)')
      .bind(reportId, communityId, userId, at, String(input.version || '').slice(0, 20), kind, String(input.note || '').slice(0, 2000), body),
    env.DB.prepare('DELETE FROM plugin_reports WHERE created_at < ?').bind(at - REPORT_DAYS * 86400),
  ]);
  return {id:reportId};
}

// A pass for the live relay, valid a few minutes: where to connect, or 404 while the site has no relay (the plugin and
// the page then connect to the site itself).
// The dev site (a copy of production's data, same communities) gets rooms of its own on the same relay.
async function relayPass(env, communityId, who) {
  const relay = env.RELAY_URL || RELAY_ORIGIN;
  if (!relay || !env.RELAY_SECRET) fail(404, 'Pas de relais en direct sur ce site.');
  const room = env.SITE_ENV === 'development' ? `dev:${communityId}` : communityId;
  const pass = await signPass(env.RELAY_SECRET, {c:room, r:who.Role, u:who.User, n:who.Name || '', col:who.Color || ''});
  return json({url:relaySocketUrl(relay, pass)});
}

// ---------- The site (signed in, « combos » permission) ----------

export async function combosApi(path, method, request, env, actor, community) {
  if (path !== '/api/combos' && !path.startsWith('/api/combos/')) return null;
  if (!combosEnabled(community)) fail(404, 'Les fiches combo ne sont pas ouvertes dans cette communauté.');
  requirePermission(actor, 'combos', 'Les fiches combo sont réservées aux pilotes de l’équipe.');
  const url = new URL(request.url), userId = actor.user.id;
  if (path === '/api/combos' && method === 'GET') return json({combos:await combos(env, community), preferenceScope:community.id+':'+userId});
  if (path === '/api/combos/crew' && method === 'GET') {
    const crewId=String(url.searchParams.get('id')||'');
    if (!/^[a-f0-9-]{36}$/i.test(crewId)) fail(404,'Équipage indisponible.');
    // Use actual Discord accounts, not display names, and never resolve a foreign community or another crew.
    const crew=await env.DB.prepare(`SELECT c.id,c.name,c.car,e.circuit FROM crews c JOIN events e ON e.id=c.event_id
      WHERE c.id=? AND c.community_id=? AND (e.community_id=? OR e.community_id=?)
      AND e.format='endurance' AND COALESCE(e.sim,CASE WHEN e.circuit LIKE 'iracing-%' THEN 'iracing' ELSE 'lmu' END)='lmu'
      AND EXISTS(SELECT 1 FROM crew_members cm JOIN registrations r ON r.id=cm.registration_id JOIN participants p ON p.id=r.participant_id
        WHERE cm.crew_id=c.id AND r.community_id=c.community_id AND r.status!='unavailable' AND p.user_id=?)`).bind(crewId,community.id,community.id,OFFICIAL,userId).first();
    if (!crew) fail(404,'Équipage indisponible.');
    const members=await all(env,`SELECT DISTINCT p.user_id AS id FROM crew_members cm JOIN registrations r ON r.id=cm.registration_id JOIN participants p ON p.id=r.participant_id
      WHERE cm.crew_id=? AND r.community_id=? AND r.status!='unavailable' AND p.user_id IS NOT NULL`,crew.id,community.id);
    return json({id:crew.id,name:crew.name,car:crew.car,circuit:crew.circuit,members:members.map(m=>m.id)});
  }
  // Mur des stands: a page of the site watching the team's cars live. A GET skips the site's origin check: done here,
  // so no other site can open it with the member's cookie.
  if (path === '/api/combos/live') {
    if (request.headers.get('Origin') !== siteOrigin(request, env)) fail(403, 'Origine de la requête refusée.');
    return openLive(request, env, community.id, {Role:'viewer', User:userId});
  }
  if (path === '/api/combos/live/pass' && method === 'GET') return relayPass(env, community.id, {Role:'viewer', User:userId});
  if (path === '/api/combos/sheet' && method === 'GET') return json({...await sheet(env, community, userId, comboOf(url), url), canManagePeriods:canManageMemo(actor), canManageNotes:canManageMemo(actor)});
  if (path === '/api/combos/history' && method === 'GET') return json(await history(env,community,comboOf(url),url));
  if (path === '/api/combos/export' && method === 'GET') return json(await exportPage(env, community, comboOf(url), url));
  if (path === '/api/combos/outline' && method === 'GET') return json(await outline(env, community, url.searchParams.get('track')));
  if (path === '/api/combos/analysis' && method === 'GET') return json(await analysisList(env, community, userId, comboOf(url)));
  if (path === '/api/combos/analysis/session' && method === 'GET') return json(await analysisSession(env, community, userId, url.searchParams.get('id')));

  // His plugin: one code at a time, shown once; a new code replaces the previous one.
  if (path === '/api/combos/link') {
    if (method === 'GET') {
      const row = await env.DB.prepare('SELECT created_at, last_seen FROM combo_links WHERE user_id=? AND community_id=?').bind(userId, community.id).first();
      const last = await env.DB.prepare('SELECT track, car, lap_count, received_at, started_at FROM combo_sessions WHERE user_id=? AND community_id=? ORDER BY received_at DESC, started_at DESC LIMIT 1').bind(userId, community.id).first();
      return json({linked:Boolean(row), createdAt:row?.created_at ?? null, lastSeen:row?.last_seen ?? null, lastSession:last ? {track:last.track, car:last.car, laps:last.lap_count, receivedAt:last.received_at, startedAt:last.started_at} : null});
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

  // « Retours des testeurs » (Administration › Plateforme): what the pilots sent from the plugin, for the platform managers only.
  if (path === '/api/combos/reports' && method === 'GET') {
    if (!actor.manager) fail(403, 'Réservé aux gestionnaires de la plateforme.');
    const rows = await all(env, `SELECT r.id, r.created_at, r.version, r.kind, r.note, length(r.body) AS size, COALESCE(NULLIF(m.nickname,''), u.name) AS pilot
      FROM plugin_reports r JOIN users u ON u.id=r.user_id LEFT JOIN memberships m ON m.user_id=r.user_id AND m.community_id=r.community_id
      WHERE r.community_id=? ORDER BY r.created_at DESC LIMIT 100`, community.id);
    return json({reports:rows.map(row => ({id:row.id, at:row.created_at, version:row.version, kind:row.kind, note:row.note, size:row.size, pilot:row.pilot}))});
  }
  const reportMatch = path.match(/^\/api\/combos\/reports\/([a-f0-9-]{36})$/);
  if (reportMatch && method === 'GET') {
    if (!actor.manager) fail(403, 'Réservé aux gestionnaires de la plateforme.');
    const row = await env.DB.prepare('SELECT body FROM plugin_reports WHERE id=? AND community_id=?').bind(reportMatch[1], community.id).first();
    if (!row) fail(404, 'Retour introuvable.');
    return json({data:parsed(row.body)});
  }

  if (path === '/api/combos/color' && method === 'PUT') {
    const input = await body(request);
    const color = String(input.color || '').toLowerCase();
    if (!color) await env.DB.prepare('DELETE FROM combo_colors WHERE community_id=? AND user_id=?').bind(community.id, userId).run();
    else if (!COLOR.test(color)) fail(400, 'Couleur invalide.');
    else await env.DB.prepare(`INSERT INTO combo_colors(community_id,user_id,color) VALUES(?,?,?)
      ON CONFLICT(community_id,user_id) DO UPDATE SET color=excluded.color`).bind(community.id, userId, color).run();
    await env.DB.prepare('UPDATE combo_revisions SET rev=rev+1 WHERE community_id=?').bind(community.id).run();
    return json({color:color || null});
  }

  const canManagePeriods = canManageMemo(actor);
  if (path === '/api/combos/periods') {
    if (method === 'GET') return json(await periods(env, community));
    if (method === 'POST') {
      if (!canManagePeriods) fail(403, 'Réservé aux responsables des équipages.');
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
    if (['PATCH','DELETE'].includes(method) && !canManagePeriods) fail(403, 'Réservé aux responsables des équipages.');
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
    const row = await env.DB.prepare('SELECT id, user_id, track, car FROM combo_sessions WHERE id=? AND community_id=?').bind(String(input.session ?? ''), community.id).first();
    if (!row) fail(404, 'Séance introuvable.');
    if (row.user_id !== userId) requirePermission(actor, 'admin', 'Seul le pilote de la séance ou un administrateur peut retirer ses tours.');
    const laps = Array.isArray(input.laps) ? input.laps.map(Number).filter(Number.isInteger).slice(0, 2000) : [];
    if (!laps.length) fail(400, 'Aucun tour choisi.');
    await env.DB.batch([env.DB.prepare('UPDATE combo_laps SET ignored=? WHERE session_id=? AND n IN (SELECT value FROM json_each(?))')
      .bind(input.ignored ? 1 : 0, row.id, JSON.stringify(laps)), env.DB.prepare(BUMP).bind(community.id, row.track, row.car)]);
    return json({ok:true});
  }

  // Notes: anyone of the team writes; the author or an admin changes or removes.
  if (path === '/api/combos/notes' && method === 'POST') {
    const input = await body(request);
    const combo = {track:label(input.track,120),car:label(input.car,120)};
    if (!combo.track || !combo.car) fail(400,'Circuit et voiture requis.');
    const {text,theme='strategy',pinned=false} = noteInput(input);
    if (pinned && !canManageMemo(actor)) fail(403,'Seuls les responsables peuvent épingler une note.');
    const race = input.eventId ? await memoRace(env,community,combo,input.eventId) : null;
    if (input.eventId && !race) fail(404,'Épreuve introuvable.');
    const noteId = id(), time = now();
    await env.DB.batch([
      env.DB.prepare('INSERT INTO combo_notes(id,community_id,track,car,user_id,body,created_at,updated_at,event_id,theme,pinned) VALUES(?,?,?,?,?,?,?,?,?,?,?)')
        .bind(noteId,community.id,combo.track,combo.car,userId,text,time,time,race?.id ?? null,theme,+pinned),
      env.DB.prepare(BUMP).bind(community.id,combo.track,combo.car)
    ]);
    return json({id:noteId,body:text,createdAt:time},201);
  }
  const noteMatch = path.match(/^\/api\/combos\/notes\/([a-f0-9-]{36})$/);
  if (noteMatch && ['PATCH','DELETE'].includes(method)) {
    const row = await env.DB.prepare('SELECT * FROM combo_notes WHERE id=? AND community_id=?').bind(noteMatch[1],community.id).first();
    if (!row) fail(404,'Note introuvable.');
    const manager = canManageMemo(actor);
    if (row.user_id !== userId && !manager) fail(403,'Seul l’auteur ou un responsable peut modifier cette note.');
    const bump = env.DB.prepare(BUMP).bind(community.id,row.track,row.car);
    if (method === 'DELETE') {
      await env.DB.batch([env.DB.prepare('DELETE FROM combo_notes WHERE id=?').bind(row.id),bump]);
      return json({ok:true});
    }
    const input = await body(request);
    const {text,theme,pinned} = noteInput({...input,body:input.body ?? row.body});
    if (pinned !== undefined && !manager) fail(403,'Seuls les responsables peuvent épingler une note.');
    if (input.eventId !== undefined && input.eventId && !await memoRace(env,community,row,input.eventId)) fail(404,'Épreuve introuvable.');
    const eventId = input.eventId === undefined ? row.event_id : input.eventId || null;
    await env.DB.batch([
      env.DB.prepare('UPDATE combo_notes SET body=?,theme=?,pinned=?,event_id=?,updated_at=? WHERE id=?')
        .bind(text,theme ?? row.theme,pinned === undefined ? row.pinned : +pinned,eventId,now(),row.id),bump
    ]);
    return json({id:row.id,body:text});
  }
  notFound();
}
