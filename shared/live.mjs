// Mur des stands (server/live.mjs, page mur-des-stands.html): what the SimHub plugin of the pilot at the wheel sends
// about once a second, and what the site works out of it for the teammates watching. Shared by the server (the team's
// live room keeps the history) and the page (rejoin estimate), so both read the same numbers.
//
// A snapshot: the session, our car (energy, tyres, sectors…) and the whole field as LMU's scoring gives it (rF2 layout
// of the shared memory LMU_Data). The field is sent as rows in the order of FIELD, to keep each message small.

export const LIVE_VERSION = 1;
// Plugin 1.6 and later (version 2): a complete snapshot when the connection opens, then only what changed (mergeSnapshot).
export const DELTA_VERSION = 2;
// One row per car of the field (connectors/simhub-plugin/LiveShare.cs writes them in this order).
// dist: metres into the lap; pit: 0 on track, 1 in the pit lane, 2 in the garage; ls1/ls2, bs1/bs2, cs1/cs2: the game's
// sector times, the second one counted from the line (S1 + S2); behind/next: seconds behind the leader / the car ahead,
// lapsBehind/lapsNext: laps behind them; finish: 0 racing, 1 finished, 2 out, 3 disqualified; x, z: position seen from above.
export const FIELD = ['id', 'place', 'cls', 'driver', 'vehicle', 'num', 'laps', 'dist', 'pit', 'stops', 'pen', 'last', 'best',
  'ls1', 'ls2', 'bs1', 'bs2', 'cs1', 'cs2', 'behind', 'lapsBehind', 'next', 'lapsNext', 'finish', 'x', 'z'];
const TEXT = new Set(['cls', 'driver', 'vehicle', 'num']);
export const MAX_CARS = 104;
// LMU's session numbers (rF2): 0 test day, 1–4 practice, 5–8 qualifying, 9 warm-up, 10–13 race.
export const isRace = session => session >= 10 && session <= 13;
// Laps kept per rival (5-lap average and its spread) and for our car (stints, fair share, 24 h ≈ 380 laps at Le Mans).
const RIVAL_LAPS = 8, OUR_LAPS = 500, STOPS_KEPT = 60, STINTS_KEPT = 80, MAP_POINTS = 800;
// A feed nobody sent to for this long is no longer shown as live; after STALE_DROP it is forgotten.
export const LIVE_FOR = 20_000, STALE_DROP = 8 * 3600_000;

const finite = value => typeof value === 'number' && Number.isFinite(value);
const num = (value, min = -1e9, max = 1e9) => finite(value) && value >= min && value <= max ? value : null;
const text = (value, size = 64) => typeof value === 'string' ? value.replace(/[\u0000-\u001f]/g, '').trim().slice(0, size) : '';
const round = (value, digits = 3) => finite(value) ? Math.round(value * 10 ** digits) / 10 ** digits : null;
const time = value => finite(value) && value > 0 && value < 3600 ? value : null;
const mean = list => list.length ? list.reduce((sum, value) => sum + value, 0) / list.length : null;
const spread = list => {
  if (list.length < 2) return null;
  const m = mean(list);
  return Math.sqrt(list.reduce((sum, value) => sum + (value - m) ** 2, 0) / (list.length - 1));
};
export const median = list => {
  const sorted = list.filter(finite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const half = sorted.length >> 1;
  return sorted.length % 2 ? sorted[half] : (sorted[half - 1] + sorted[half]) / 2;
};

// ---------- What the plugin sends ----------

function cleanWheel(input) {
  const [left, carcass, kpa, brake] = Array.isArray(input) ? input : [];
  return {left:num(left, 0, 100), carcass:num(carcass, -50, 400), kpa:num(kpa, 0, 1000), brake:num(brake, -50, 2000)};
}

function cleanStop(input) {
  if (!input || typeof input !== 'object') return null;
  const lap = num(input.lap, 0, 10000), lane = num(input.lane, 0, 900), stopped = num(input.stopped, 0, 900);
  if (lap === null || lane === null || stopped === null || stopped > lane) return null;
  return {lap, lane, stopped, ve:num(input.ve, 0, 100) ?? 0, fuel:num(input.fuel, 0, 500) ?? 0, tyres:num(input.tyres, 0, 4) ?? 0,
    // The time the pit lane costs on top of the same stretch of track at racing speed, without the time stopped
    // (measured by the plugin with our recorded lap); null when it could not be measured.
    drive:num(input.drive, -30, 300), driver:text(input.driver, 40)};
}

const SERVICE = ['connect', 'energyRate', 'fuelRate', 'tyres4', 'tyresAlong', 'driver', 'driverAlong'];

// Throws on a message that is not a snapshot; anything odd inside is dropped, never trusted.
export function cleanSnapshot(input) {
  if (!input || typeof input !== 'object' || (input.v !== LIVE_VERSION && input.v !== DELTA_VERSION)) throw Error('Format inconnu.');
  const track = text(input.track, 80), session = num(input.session, 0, 20), et = num(input.et, 0, 1e7);
  const me = input.me && typeof input.me === 'object' ? input.me : null;
  if (!track || session === null || et === null || !me) throw Error('Séance incomplète.');
  const field = (Array.isArray(input.field) ? input.field : []).slice(0, MAX_CARS).map(row => {
    if (!Array.isArray(row)) return null;
    const car = {};
    FIELD.forEach((key, index) => { car[key] = TEXT.has(key) ? text(row[index], key === 'vehicle' ? 80 : 40) : num(row[index]); });
    return car.id === null || car.laps === null ? null : car;
  }).filter(Boolean);
  const id = num(me.id);
  if (id === null || !field.some(car => car.id === id)) throw Error('Notre voiture manque au classement.');
  const service = me.service && typeof me.service === 'object' ? Object.fromEntries(SERVICE.map(key => [key, num(me.service[key], 0, 10000)])) : null;
  const profile = Array.isArray(me.profile) && me.profile.length === 101 && me.profile.every((value, index) => finite(value) && value >= 0 && (index === 0 || value >= me.profile[index - 1]))
    && me.profile[100] > 20 ? me.profile.map(value => round(value, 2)) : null;
  const map = Array.isArray(input.map) ? input.map.slice(0, MAP_POINTS).filter(point => Array.isArray(point) && finite(point[0]) && finite(point[1])).map(([x, z]) => [round(x, 1), round(z, 1)]) : null;
  const control = me.control && typeof me.control === 'object' ? {tc:num(me.control.tc, 0, 50), abs:num(me.control.abs, 0, 50), bias:num(me.control.bias, 0, 100), map:num(me.control.map, 0, 50)} : null;
  return {
    v:LIVE_VERSION, track, session, et, end:num(input.end, 0, 1e7), maxLaps:num(input.maxLaps, 0, 100000), length:num(input.length, 100, 100000),
    phase:num(input.phase, 0, 20), yellow:num(input.yellow, -1, 20), air:num(input.air, -50, 80), trackTemp:num(input.trackTemp, -50, 100),
    rain:num(input.rain, 0, 1), wet:num(input.wet, 0, 1), light:num(input.light, 0, 1),
    // car: the model as the fiches combo name it (their track + car), vehicle: the entry's full name in the scoring.
    me:{id, driver:text(me.driver, 40), car:text(me.car, 120), vehicle:text(me.vehicle, 80), cls:text(me.cls, 40), compound:text(me.compound, 40),
      cur:num(me.cur, -10, 3600), pit:num(me.pit, 0, 2) ?? 0, ve:num(me.ve, -1, 100), fuel:num(me.fuel, 0, 500), capacity:num(me.capacity, 0, 500),
      wheels:[0, 1, 2, 3].map(index => cleanWheel(me.wheels?.[index])), damage:num(me.damage, 0, 100),
      limits:num(me.limits, 0, 1000), control:control && Object.values(control).some(value => value !== null) ? control : null,
      stops:(Array.isArray(me.stops) ? me.stops : []).slice(-STOPS_KEPT).map(cleanStop).filter(Boolean), service, profile},
    field, map:map && map.length >= 50 ? map : null
  };
}

// What plugin 1.6 sends after its first snapshot: only the keys that changed (`me` by key too) and, per car, only the
// values that changed, as [id, index in FIELD, value, index, value…] in `fd`; `field` again in full when the list of cars
// changed. `full` marks a complete snapshot. While nobody watches, it sends only what the history needs (laps, stops…);
// without a page on the map, no positions (x, z as null). base: the last snapshot merged for this connection (changed in
// place). Null when the message cannot be read without the snapshot it builds on: the room then asks for a complete one.
export function mergeSnapshot(base, input) {
  if (!input || typeof input !== 'object' || input.v !== DELTA_VERSION) return null;
  if (input.full) { const {full, ...snap} = input; return snap; }
  if (!base || typeof base !== 'object' || !Array.isArray(base.field)) return null;
  for (const [key, value] of Object.entries(input)) if (key !== 'me' && key !== 'fd') base[key] = value;
  if (input.me && typeof input.me === 'object') base.me = {...base.me, ...input.me};
  if (Array.isArray(input.fd)) {
    const rows = new Map(base.field.filter(Array.isArray).map(row => [row[0], row]));
    for (const change of input.fd) {
      const row = Array.isArray(change) ? rows.get(change[0]) : null;
      if (!row) return null;
      for (let k = 1; k + 1 < change.length; k += 2) if (Number.isInteger(change[k]) && change[k] > 0 && change[k] < FIELD.length) row[change[k]] = change[k + 1];
    }
  }
  return base;
}

// ---------- The team's room keeps the history ----------

// The feed of one of our cars in one session: same track, same session, same car (a driver swap stays in it).
export const feedKey = snap => `${snap.track}|${snap.session}|${snap.me.vehicle || snap.me.id}`;

// since: when this session's feed began, so the pages start it over when it changes. base: the key without the pilot
// told apart (feedKey), the same for two of us in the same car on the same track in sessions of their own.
export function newFeed(snap, at, key = feedKey(snap)) {
  return {key, base:feedKey(snap), since:at, track:snap.track, session:snap.session, vehicle:snap.me.vehicle, cls:snap.me.cls, startEt:snap.et, updated:at,
    pilot:null, snap:null, cars:{}, ours:{laps:[], stops:[], stints:[], drivers:{}, start:null}, outline:[], path:null};
}

const sectorsOf = car => {
  const s1 = time(car.ls1), s12 = time(car.ls2), t = time(car.last);
  return s1 && s12 && t && s12 > s1 && t > s12 ? [round(s1), round(s12 - s1), round(t - s12)] : null;
};

// Another session than the feed's, though on the same track, of the same kind and in the same car: the game's clock
// went back (restart, next event), ran ahead of the real one (a server joined while its session was under way) or the
// session's planned end changed.
export function otherSession(feed, snap, at) {
  const before = feed?.snap;
  if (!before) return false;
  return snap.et + 5 < before.et || snap.et - before.et > (at - feed.updated) / 1000 + 60
    || (finite(snap.end) && finite(before.end) && Math.abs(snap.end - before.end) > 1);
}

// The same car in the same session as a feed another of us is still sending to (a driver swap): the same entry, and
// the game's clocks agree within a few seconds, real time apart. Two sessions of their own (each in practice on his
// PC) seldom do; two of our cars in one session are two entries.
export function sameClock(feed, snap, at) {
  const before = feed?.snap;
  return Boolean(before) && before.me.id === snap.me.id && !otherSession(feed, snap, at) && Math.abs(snap.et - before.et - (at - feed.updated) / 1000) < 5;
}

// A feed another pilot is still sending to: kept apart from ours, never replaced by it.
const heldByOther = (feed, pilot, at) => Boolean(pilot?.id) && Boolean(feed.pilot?.id) && feed.pilot.id !== pilot.id && at - feed.updated < LIVE_FOR;

// The feed this snapshot goes to: the sender's own in the same session, else the one of a teammate in the same
// session (driver swap), else a new one. Two of us in the same car on the same track but each in a session of his own
// (practice on his PC) get a feed each, the second keyed by his name too, so the page never swaps between the two.
function feedFor(feeds, snap, at, pilot) {
  const base = feedKey(snap), same = Object.values(feeds).filter(feed => (feed.base ?? feed.key) === base);
  const mine = same.find(feed => feed.pilot?.id && feed.pilot.id === pilot?.id && !otherSession(feed, snap, at));
  if (mine) return mine;
  const shared = same.find(feed => heldByOther(feed, pilot, at) ? sameClock(feed, snap, at) : !otherSession(feed, snap, at));
  if (shared) return shared;
  const taken = feeds[base] && heldByOther(feeds[base], pilot, at);
  return newFeed(snap, at, taken ? `${base}|${pilot.id}` : base);
}

// One snapshot into the feed (a fresh one for a new session): each car's laps and stops, our laps (energy, tyres,
// driver), our stints and stops. pilot: who sent it (name and colour on the site). Only the session under way counts:
// a new one drops the feeds of the same car in earlier sessions, but not those another of us is sending to. paths:
// the field's path per track, kept by the room from one session to the next, so the outline does not start over.
export function ingest(feeds, snap, at, pilot = null, paths = null) {
  let feed = feedFor(feeds, snap, at, pilot);
  if (feeds[feed.key] !== feed) {
    for (const [other, item] of Object.entries(feeds)) if (item.vehicle === feed.vehicle && !heldByOther(item, pilot, at)) delete feeds[other];
    feeds[feed.key] = feed;
    const known = paths?.[snap.track];
    if (Array.isArray(known)) feed.path = known.slice();
  }
  const before = feed.snap;
  feed.updated = at;
  if (pilot) feed.pilot = pilot;
  for (const car of snap.field) {
    const state = feed.cars[car.id] ||= {laps:[], pitIn:null, stop:null, stopLap:null, lapPit:false, best:[null, null, null]};
    const old = before?.field.find(item => item.id === car.id);
    if (car.pit) state.lapPit = true;
    if (old && car.laps > old.laps) {
      const t = time(car.last), sectors = sectorsOf(car);
      if (t && car.laps - old.laps === 1) {
        state.laps.push({n:car.laps, t:round(t), s:sectors, pit:state.lapPit});
        if (state.laps.length > RIVAL_LAPS) state.laps.shift();
        if (sectors && !state.lapPit) sectors.forEach((value, index) => { if (state.best[index] === null || value < state.best[index]) state.best[index] = value; });
      }
      state.lapPit = Boolean(car.pit);
    }
    // In and out of the pit lane: how long the stop took, lane included, and from which lap the stint counts.
    if (old && !old.pit && car.pit === 1) state.pitIn = snap.et;
    if (old && old.pit && !car.pit) {
      if (state.pitIn !== null && snap.et - state.pitIn < 900) state.stop = round(snap.et - state.pitIn, 1);
      state.pitIn = null;
      state.stopLap = car.laps;
    }
  }
  const ours = feed.ours, me = snap.field.find(car => car.id === snap.me.id), meBefore = before?.field.find(car => car.id === snap.me.id);
  if (!ours.start) ours.start = {laps:me.laps, ve:snap.me.ve, fuel:snap.me.fuel, wheels:snap.me.wheels.map(wheel => wheel.left), pit:false};
  if (snap.me.pit) ours.start.pit = true;
  if (meBefore && me.laps > meBefore.laps) {
    const start = ours.start, done = me.laps - meBefore.laps, clean = done === 1 && !start.pit;
    const used = (from, to) => clean && finite(from) && finite(to) && from - to > 0 ? round(from - to) : null;
    ours.laps.push({n:me.laps, t:done === 1 ? round(time(me.last)) : null, s:done === 1 ? sectorsOf(me) : null, pit:start.pit, driver:snap.me.driver,
      ve:used(start.ve, snap.me.ve), fuel:used(start.fuel, snap.me.fuel), wear:snap.me.wheels.map((wheel, index) => used(start.wheels[index], wheel.left))});
    if (ours.laps.length > OUR_LAPS) ours.laps.shift();
    // Fair share: laps the plugin did not see (a short drop) go to the driver at the wheel now.
    if (snap.me.driver) ours.drivers[snap.me.driver] = (ours.drivers[snap.me.driver] || 0) + done;
    const stint = ours.stints.at(-1);
    if (stint) { stint.laps += done; stint.end = snap.et; }
    ours.start = {laps:me.laps, ve:snap.me.ve, fuel:snap.me.fuel, wheels:snap.me.wheels.map(wheel => wheel.left), pit:Boolean(snap.me.pit)};
  }
  // A stint: from a pit exit (or the first message) to the next stop, or a change of driver.
  const stint = ours.stints.at(-1), leftPits = meBefore && meBefore.pit && !me.pit;
  if (!stint || leftPits || (snap.me.driver && stint.driver !== snap.me.driver)) {
    ours.stints.push({driver:snap.me.driver, from:me.laps, laps:0, start:snap.et, end:snap.et});
    if (ours.stints.length > STINTS_KEPT) ours.stints.shift();
  } else stint.end = snap.et;
  // Our stops as the plugin measured them (precise, ten times a second): merged by lap, the newest wins.
  for (const stop of snap.me.stops) {
    const index = ours.stops.findIndex(item => item.lap === stop.lap);
    if (index >= 0) ours.stops[index] = {...ours.stops[index], ...stop, driver:stop.driver || ours.stops[index].driver};
    else ours.stops.push(stop);
  }
  ours.stops.sort((a, b) => a.lap - b.lap);
  if (ours.stops.length > STOPS_KEPT) ours.stops.splice(0, ours.stops.length - STOPS_KEPT);
  // The track's outline: the game's map when the plugin sent it, else the path the whole field drives.
  if (snap.map) { feed.outline = snap.map; feed.mapFromGame = true; }
  else if (!feed.mapFromGame) {
    feed.path = addToPath(feed.path, snap);
    if (paths && feed.path) paths[snap.track] = feed.path;
  }
  feed.snap = {...snap, map:null};
  return feed;
}

// The feeds still worth keeping (persisted by the room), the oldest dropped.
export function prune(feeds, at) {
  for (const [key, feed] of Object.entries(feeds)) if (at - feed.updated > STALE_DROP) delete feeds[key];
  return feeds;
}

// ---------- What the teammates' pages receive ----------

const cleanLaps = laps => laps.filter(lap => lap.t && !lap.pit);

// The feed for the page: the last snapshot, and per car its 5-lap average and spread, last stop, laps since it,
// best sectors; for our car the 5-lap averages (time, sectors, energy, fuel, wear), the stint, stints, stops, drivers.
// The outline: the game's map, or the field's path as far as it is known (null where no car was seen yet).
export const outlineOf = feed => feed.mapFromGame ? feed.outline : feed.path || [];

// The path the field drives, one point per stretch of the lap (by distance into it), set by the first car seen there.
// Kept by the room, and by the page from the positions it receives, so it fills while the page is open too.
export function addToPath(path, snap) {
  if (!snap.length) return path || null;
  const step = Math.max(25, snap.length / 600), size = Math.ceil(snap.length / step);
  if (!Array.isArray(path) || path.length !== size) path = Array(size).fill(null);
  for (const car of snap.field) {
    if (car.pit || !finite(car.x) || !finite(car.z) || !finite(car.dist) || car.dist < 0 || car.dist > snap.length) continue;
    const index = Math.min(size - 1, Math.floor(car.dist / step));
    path[index] ||= [round(car.x, 1), round(car.z, 1)];
  }
  return path;
}

// The outline as lines to draw. The game's map: one closed line. The field's path: its known points in lap order,
// cut where more than 150 m of the lap is unknown, joined over the start line when both ends are known.
export function outlineLines(outline, length = null) {
  if (!Array.isArray(outline)) return [];
  if (!length) return outline.length > 20 ? [{points:outline, closed:true}] : [];
  const gap = Math.max(1, Math.ceil(150 / (length / outline.length)));
  const lines = [];
  let firstIndex = null, lastIndex = null;
  outline.forEach((point, index) => {
    if (!point) return;
    if (lastIndex === null || index - lastIndex > gap) lines.push([]);
    lines.at(-1).push(point);
    firstIndex ??= index;
    lastIndex = index;
  });
  const wraps = lines.length && firstIndex + outline.length - lastIndex <= gap;
  if (wraps && lines.length === 1) return lines[0].length > 20 ? [{points:lines[0], closed:true}] : [];
  if (wraps) lines[0] = [...lines.pop(), ...lines[0]];
  return lines.filter(points => points.length >= 2).map(points => ({points, closed:false}));
}

// The field goes as rows (FIELD order), without the positions (positionsOf, only for the pages showing the map) nor the
// game's gaps (raceGaps measures them on track): the room sends the pages only what changed since (diff).
// gaps: raceGaps' result, each car's gap to its class leader and to the car ahead in its class.
const NOT_SHOWN = new Set(['behind', 'lapsBehind', 'next', 'lapsNext', 'x', 'z']);
export function publicFeed(feed, gaps = null) {
  const snap = feed.snap;
  const cars = {};
  for (const car of snap.field) {
    const state = feed.cars[car.id];
    const five = cleanLaps(state?.laps || []).slice(-5).map(lap => lap.t);
    cars[car.id] = {avg5:round(five.length >= 2 ? mean(five) : null), sd5:round(spread(five)), stop:state?.stop ?? null,
      sinceStop:state?.stopLap !== null && state?.stopLap !== undefined ? car.laps - state.stopLap : car.stops ? null : car.laps,
      lastSectors:sectorsOf(car), best:state?.best || [null, null, null], ...gaps?.[car.id]};
  }
  const ours = feed.ours, laps = cleanLaps(ours.laps), five = laps.slice(-5);
  const stint = ours.stints.at(-1);
  const stintLaps = stint ? ours.laps.filter(lap => lap.n > stint.from) : [];
  const avgOf = (list, pick) => { const values = list.map(pick).filter(value => finite(value) && value > 0); return values.length ? round(mean(values)) : null; };
  const field = snap.field.map(car => FIELD.map(key => NOT_SHOWN.has(key) ? null : key === 'dist' ? round(car.dist, 0) : car[key]));
  return {
    key:feed.key, since:feed.since ?? null, updated:feed.updated, pilot:feed.pilot, snap:{...snap, field},
    outline:outlineOf(feed), mapFromGame:Boolean(feed.mapFromGame), cars,
    ours:{
      avg5:avgOf(five, lap => lap.t), sd5:round(spread(five.map(lap => lap.t))),
      sectors5:[0, 1, 2].map(index => avgOf(five.filter(lap => lap.s), lap => lap.s[index])),
      ve5:avgOf(ours.laps.slice(-5), lap => lap.ve), fuel5:avgOf(ours.laps.slice(-5), lap => lap.fuel),
      wear5:[0, 1, 2, 3].map(index => avgOf(ours.laps.slice(-5), lap => lap.wear[index])),
      lastVe:ours.laps.at(-1)?.ve ?? null, lastFuel:ours.laps.at(-1)?.fuel ?? null,
      stintVe:avgOf(stintLaps, lap => lap.ve), stintFuel:avgOf(stintLaps, lap => lap.fuel), stintAvg:avgOf(cleanLaps(stintLaps), lap => lap.t),
      bestSectors:[0, 1, 2].map(index => { const values = laps.filter(lap => lap.s).map(lap => lap.s[index]); return values.length ? Math.min(...values) : null; }),
      stints:ours.stints.map((item, index) => {
        // A stint's summary: its timed laps, what it used per lap, and the stop that ended it.
        const next = ours.stints[index + 1], mine = ours.laps.filter(lap => lap.n > item.from && lap.n <= item.from + item.laps);
        const stop = next ? ours.stops.findLast(entry => entry.lap > item.from && entry.lap <= next.from + 1) : null;
        return {...item, avg:avgOf(cleanLaps(mine), lap => lap.t), ve:avgOf(mine, lap => lap.ve), fuel:avgOf(mine, lap => lap.fuel), stop:stop || null};
      }),
      stops:ours.stops, drivers:ours.drivers
    }
  };
}

// ---------- Estimates shown on the page ----------

// LMU's Fair Share rule (team events): each driver who completed laps in the car must drive at least 50 % / N of the
// team's laps, rounded down (2 drivers 25 %, 3 16,7 %, 4 12,5 %…). Today's minimum, and at the flag with the laps to come.
export function fairShare(drivers, lapsLeft = 0) {
  const names = Object.keys(drivers || {}).filter(name => drivers[name] > 0);
  const team = names.reduce((sum, name) => sum + drivers[name], 0);
  if (!names.length) return {share:null, team:0, now:0, end:0, rows:[]};
  const share = 0.5 / names.length, now = Math.floor(team * share), end = Math.floor((team + Math.max(0, lapsLeft || 0)) * share);
  return {share, team, now, end, rows:names.sort((a, b) => drivers[b] - drivers[a]).map(name => ({name, laps:drivers[name],
    missingNow:Math.max(0, now - drivers[name]), missingEnd:Math.max(0, end - drivers[name])}))};
}

// Time at a point of the lap (0 to 1) on our recorded lap; a straight line without one.
export function timeAt(profile, fraction, lap) {
  const x = ((fraction % 1) + 1) % 1;
  if (!profile) return x * lap;
  const scaled = x * 100, low = Math.floor(scaled), high = Math.min(100, low + 1);
  const t = profile[low] + (profile[high] - profile[low]) * (scaled - low);
  return t * lap / profile[100];
}

// Seconds the car sits in the box for a stop of this kind: refill to 100 % (energy, or fuel to the tank's size on a car
// without virtual energy) at the game's rate, plus 4 tyres when chosen (during the refuel when the game says so).
// Without the game's service times, our own measured stops of that kind.
export function stationary(kind, {service, energy, fuel, capacity, stops = []}) {
  let refill = null;
  if (service) {
    if (energy !== null && service.energyRate > 0) refill = (service.connect || 0) + Math.max(0, 100 - energy) / service.energyRate;
    else if (energy === null && fuel !== null && capacity > 0 && service.fuelRate > 0) refill = (service.connect || 0) + Math.max(0, capacity - fuel) / service.fuelRate;
  }
  if (refill !== null) {
    if (kind !== 'tyres') return refill;
    if (!(service.tyres4 > 0)) return null;
    return service.tyresAlong ? Math.max(refill, service.tyres4) : refill + service.tyres4;
  }
  return median(stops.filter(stop => kind === 'tyres' ? stop.tyres >= 4 : stop.tyres === 0).map(stop => stop.stopped));
}

// Where we would be back on track if we stopped at the end of this lap, against every car of the field (all classes):
// the gap on track in seconds at our pace (positive: ahead of us) and the place in the standings then.
// Each car keeps its own 5-lap pace until we are out (cars already in the pits are not moved); our recorded lap turns
// distances into seconds. plus: the margin from each one's lap-to-lap spread over the laps until then.
export function rejoin(feed, loss, now = feed.snap.et) {
  const snap = feed.snap, me = snap.field.find(car => car.id === snap.me.id);
  if (!me) return null;
  const length = snap.length || null, lap = feed.ours.avg5 || feed.cars[me.id]?.avg5 || time(me.best) || time(me.last);
  if (!lap || !length || !finite(loss)) return null;
  const profile = snap.me.profile, fraction = car => (car.dist || 0) / length;
  const at = car => timeAt(profile, fraction(car), lap);
  // From now to the pit exit: the rest of this lap, then the stop (snapshot age taken off).
  const tau = Math.max(0, lap - at(me) - (now - snap.et)) + loss;
  const ourSd = feed.ours.sd5 ?? 0.6;
  const us = {car:me, total:me.laps + fraction(me) + (tau - loss) / lap};
  const others = snap.field.filter(car => car.id !== me.id && !(car.finish >= 2) && car.pit !== 2).map(car => {
    const pace = feed.cars[car.id]?.avg5 || time(car.last) || lap;
    const moved = car.pit ? 0 : tau * lap / pace;
    let gap = at(car) - at(me) + moved - (tau - loss);
    gap = ((gap % lap) + lap * 1.5) % lap - lap / 2;
    const sd = feed.cars[car.id]?.sd5 ?? 0.6;
    return {car, gap:round(gap, 1), plus:round(Math.sqrt(sd * sd + ourSd * ourSd) * Math.sqrt(tau / lap) + 0.3, 1), pits:Boolean(car.pit),
      total:car.laps + fraction(car) + (car.pit ? 0 : tau / pace)};
  });
  const order = [...others, us].sort((a, b) => b.total - a.total);
  const ahead = others.filter(item => item.gap > 0).sort((a, b) => a.gap - b.gap).slice(0, 4).reverse();
  const behind = others.filter(item => item.gap <= 0).sort((a, b) => b.gap - a.gap).slice(0, 4);
  return {tau:round(tau, 1), loss:round(loss, 1), ahead, behind, place:order.indexOf(us) + 1,
    classPlace:order.filter(item => item.car.cls === me.cls).indexOf(us) + 1};
}

// A feed as the page received it: rows back into cars, and what was left out taken from the previous one.
export function readFeed(input, previous = null) {
  const field = input.snap.field.map(row => Array.isArray(row) ? Object.fromEntries(FIELD.map((key, index) => [key, row[index]])) : row);
  const feed = {...input, snap:{...input.snap, field, me:{...input.snap.me}}};
  if (!('outline' in input)) { feed.outline = previous?.outline || []; feed.mapFromGame = previous?.mapFromGame || false; }
  if (feed.snap.me.profile === undefined) feed.snap.me.profile = previous?.snap.me.profile ?? null;
  return feed;
}

// Laps still to drive: by time, at our 5-lap pace (the lap under way when the clock runs out is driven to the line); or
// by the session's lap count.
export function lapsLeft(snap, lap) {
  if (snap.maxLaps && snap.maxLaps < 10000) return Math.max(0, snap.maxLaps - Math.max(...snap.field.map(car => car.laps)));
  if (!snap.end || !lap) return null;
  const me = snap.field.find(car => car.id === snap.me.id);
  const left = snap.end - snap.et, rest = 1 - (me?.dist && snap.length ? Math.min(1, me.dist / snap.length) : 0);
  if (left <= 0) return round(rest, 1);
  return round(rest + Math.ceil(Math.max(0, left - rest * lap) / lap), 1);
}

// Gaps between two cars measured on track (the page keeps each car's distance run, once a second), not taken from the
// game's gaps to the leader: those are 0 for a car a lap down, so a class lapped by the Hypercars had no gap at all.
// total: laps + metres into the lap, in metres. A trail: [{et, d}] with d the total, oldest first.
export const runOf = (car, length) => (car.laps || 0) * length + Math.max(0, car.dist || 0);
const TRAIL_KEPT = 400;
export function addToTrail(trail, et, d) {
  if (trail.length && et <= trail.at(-1).et) return trail;
  // Going backwards: one odd reading at the line is skipped, a car sent back to the garage (several in a row) starts over.
  if (trail.length && d < trail.at(-1).d - 50) {
    trail.back = (trail.back || 0) + 1;
    if (trail.back < 5) return trail;
    trail.length = 0;
  }
  trail.back = 0;
  trail.push({et, d:Math.max(d, trail.at(-1)?.d ?? d)});
  if (trail.length > TRAIL_KEPT) trail.shift();
  return trail;
}
// How far `car` is behind `ref`: {laps} once a whole lap down, else {seconds}: the time since `ref` was where `car` is now
// (from ref's trail), or before that is known the distance between them at car's pace (lap time in seconds).
export function trackGap(car, ref, length, now, trail = [], pace = null) {
  if (!(length > 0) || !car || !ref || car === ref) return null;
  const mine = runOf(car, length), theirs = runOf(ref, length), apart = theirs - mine;
  if (apart <= 0) return {seconds:0};
  if (apart >= length) return {laps:Math.floor(apart / length)};
  const next = trail.findIndex(point => point.d >= mine);
  if (next > 0) {
    const a = trail[next - 1], b = trail[next], at = b.d > a.d ? a.et + (b.et - a.et) * (mine - a.d) / (b.d - a.d) : b.et;
    return {seconds:Math.max(0, now - at)};
  }
  return pace > 0 ? {seconds:apart / length * pace} : null;
}

// The room measures the gaps of a race (the pages then get only the gaps, not every car's position each second): each
// car's to its class leader (lead) and to the car ahead in its class (ahead), in seconds, or in laps once a whole lap
// down (leadLaps, aheadLaps). trails: the room's distance trail per car for this feed, kept up to date here.
export function raceGaps(feed, trails) {
  const snap = feed.snap, length = snap.length;
  if (!(length > 0)) return {};
  for (const car of snap.field) {
    let trail = trails.get(car.id);
    // A hole (a pause, nobody watching): the old trail would put the cars where they no longer are.
    if (!trail || (trail.length && snap.et - trail.at(-1).et > 5)) trails.set(car.id, trail = []);
    addToTrail(trail, snap.et, runOf(car, length));
  }
  if (!isRace(snap.session)) return {};
  const sorted = [...snap.field].sort((a, b) => (a.place || 999) - (b.place || 999)), gaps = {};
  const pace = car => { const five = cleanLaps(feed.cars[car.id]?.laps || []).slice(-5).map(lap => lap.t); return five.length >= 3 ? mean(five) : time(car.last) || time(car.best); };
  const put = (car, ref, name) => {
    const found = trackGap(car, ref, length, snap.et, trails.get(ref?.id), pace(car));
    return found?.laps ? {[`${name}Laps`]:found.laps} : found ? {[name]:round(found.seconds, 1)} : {};
  };
  for (const cls of new Set(sorted.map(car => car.cls))) {
    const mine = sorted.filter(car => car.cls === cls);
    mine.forEach((car, index) => { if (index) gaps[car.id] = {...put(car, mine[0], 'lead'), ...put(car, mine[index - 1], 'ahead')}; });
  }
  return gaps;
}

// Where the cars are, for the pages showing the map: [id, x, z] to the metre, cars without a position left out.
export const positionsOf = feed => feed.snap.field.filter(car => finite(car.x) && finite(car.z)).map(car => [car.id, Math.round(car.x), Math.round(car.z)]);

// What the room sends the pages after the first message: only what changed. A patch of an object (or array) is an object
// of its changed keys (indexes); a key gone is listed under GONE, an array's new length under SIZE, and a whole value
// replacing another under WHOLE. Control characters never appear in the keys: text() takes them out of names.
const SIZE = '\u0001n', GONE = '\u0001d', WHOLE = '\u0001w';
const container = value => value !== null && typeof value === 'object';
export function diff(before, after) {
  if (before === after) return undefined;
  if (!container(after)) return Object.is(before, after) ? undefined : after;
  if (!container(before) || Array.isArray(before) !== Array.isArray(after)) return {[WHOLE]:after};
  const patch = {};
  let changed = false;
  if (Array.isArray(after)) {
    if (after.length !== before.length) { patch[SIZE] = after.length; changed = true; }
    after.forEach((value, index) => { const part = diff(before[index], value); if (part !== undefined) { patch[index] = part; changed = true; } });
  } else {
    for (const key of Object.keys(after)) { const part = diff(before[key], after[key]); if (part !== undefined) { patch[key] = part; changed = true; } }
    const gone = Object.keys(before).filter(key => !(key in after));
    if (gone.length) { patch[GONE] = gone; changed = true; }
  }
  return changed ? patch : undefined;
}
// The patch applied (a new value; `before` is left as it was).
export function patch(before, change) {
  if (!container(change)) return change;
  if (WHOLE in change) return change[WHOLE];
  if (!container(before)) return before;
  if (Array.isArray(before)) {
    const after = before.slice(0, change[SIZE] ?? before.length);
    while (after.length < (change[SIZE] ?? 0)) after.push(null);
    for (const [key, value] of Object.entries(change)) if (key !== SIZE) after[Number(key)] = patch(before[Number(key)], value);
    return after;
  }
  const after = {...before};
  for (const key of change[GONE] || []) delete after[key];
  for (const [key, value] of Object.entries(change)) if (key !== GONE) after[key] = patch(before[key], value);
  return after;
}
