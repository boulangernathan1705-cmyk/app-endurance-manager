// Mur des stands (server/live.mjs, page mur-des-stands.html): what the SimHub plugin of the pilot at the wheel sends
// about once a second, and what the site works out of it for the teammates watching. Shared by the server (the team's
// live room keeps the history) and the page (rejoin estimate), so both read the same numbers.
//
// A snapshot: the session, our car (energy, tyres, sectors…) and the whole field as LMU's scoring gives it (rF2 layout
// of the shared memory LMU_Data). The field is sent as rows in the order of FIELD, to keep each message small.

export const LIVE_VERSION = 1;
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
  if (!input || typeof input !== 'object' || input.v !== LIVE_VERSION) throw Error('Format inconnu.');
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

// ---------- The team's room keeps the history ----------

// The feed of one of our cars in one session: same track, same session, same car (a driver swap stays in it).
export const feedKey = snap => `${snap.track}|${snap.session}|${snap.me.vehicle || snap.me.id}`;

export function newFeed(snap, at) {
  return {key:feedKey(snap), track:snap.track, session:snap.session, vehicle:snap.me.vehicle, cls:snap.me.cls, startEt:snap.et, updated:at,
    pilot:null, snap:null, cars:{}, ours:{laps:[], stops:[], stints:[], drivers:{}, start:null}, outline:[]};
}

const sectorsOf = car => {
  const s1 = time(car.ls1), s12 = time(car.ls2), t = time(car.last);
  return s1 && s12 && t && s12 > s1 && t > s12 ? [round(s1), round(s12 - s1), round(t - s12)] : null;
};

// One snapshot into the feed (a fresh one when the session restarted): each car's laps and stops, our laps (energy,
// tyres, driver), our stints and stops. pilot: who sent it (name and colour on the site).
export function ingest(feeds, snap, at, pilot = null) {
  const key = feedKey(snap);
  let feed = feeds[key];
  // The same session again from its start (restart, or a new event on the same track): history from scratch.
  if (feed && snap.et + 30 < (feed.snap?.et ?? 0)) feed = null;
  if (!feed) feed = feeds[key] = newFeed(snap, at);
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
  // The track's outline: the game's map when the plugin sent it, else our own path over one whole lap, a point a second.
  if (snap.map) { feed.outline = snap.map; feed.mapFromGame = true; }
  else if (!feed.mapFromGame && finite(me.x) && finite(me.z)) {
    if (feed.outlineLap === undefined && me.laps >= 1 && !me.pit) { feed.outlineLap = me.laps; feed.outline = []; }
    if (me.laps === feed.outlineLap && feed.outline.length < 900) feed.outline.push([round(me.x, 1), round(me.z, 1)]);
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
// The outline once there is a whole one: the game's, or our path once its lap is over.
export const outlineOf = feed => feed.mapFromGame || (feed.outlineLap !== undefined && feed.snap.field.find(car => car.id === feed.snap.me.id)?.laps > feed.outlineLap) ? feed.outline : [];

// shape=false leaves out what rarely changes (the track's outline, our lap's profile): the page keeps the last ones.
// The field goes as rows (FIELD order), as it came: a 60-car field stays near 10 KB a message.
export function publicFeed(feed, shape = true) {
  const snap = feed.snap;
  const cars = {};
  for (const car of snap.field) {
    const state = feed.cars[car.id];
    const five = cleanLaps(state?.laps || []).slice(-5).map(lap => lap.t);
    cars[car.id] = {avg5:round(five.length >= 3 ? mean(five) : null), sd5:round(spread(five)), stop:state?.stop ?? null,
      sinceStop:state?.stopLap !== null && state?.stopLap !== undefined ? car.laps - state.stopLap : car.stops ? null : car.laps,
      lastSectors:sectorsOf(car), best:state?.best || [null, null, null]};
  }
  const ours = feed.ours, laps = cleanLaps(ours.laps), five = laps.slice(-5);
  const stint = ours.stints.at(-1);
  const stintLaps = stint ? ours.laps.filter(lap => lap.n > stint.from) : [];
  const avgOf = (list, pick) => { const values = list.map(pick).filter(value => finite(value) && value > 0); return values.length ? round(mean(values)) : null; };
  const me = shape ? snap.me : {...snap.me, profile:undefined};
  return {
    key:feed.key, updated:feed.updated, pilot:feed.pilot, snap:{...snap, me, field:snap.field.map(car => FIELD.map(key => car[key]))},
    ...(shape ? {outline:outlineOf(feed), mapFromGame:Boolean(feed.mapFromGame)} : {}), cars,
    ours:{
      avg5:avgOf(five, lap => lap.t), sd5:round(spread(five.map(lap => lap.t))),
      sectors5:[0, 1, 2].map(index => avgOf(five.filter(lap => lap.s), lap => lap.s[index])),
      ve5:avgOf(ours.laps.slice(-5), lap => lap.ve), fuel5:avgOf(ours.laps.slice(-5), lap => lap.fuel),
      wear5:[0, 1, 2, 3].map(index => avgOf(ours.laps.slice(-5), lap => lap.wear[index])),
      lastVe:ours.laps.at(-1)?.ve ?? null, lastFuel:ours.laps.at(-1)?.fuel ?? null,
      stintVe:avgOf(stintLaps, lap => lap.ve), stintFuel:avgOf(stintLaps, lap => lap.fuel), stintAvg:avgOf(cleanLaps(stintLaps), lap => lap.t),
      bestSectors:[0, 1, 2].map(index => { const values = laps.filter(lap => lap.s).map(lap => lap.s[index]); return values.length ? Math.min(...values) : null; }),
      stints:ours.stints, stops:ours.stops, drivers:ours.drivers
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
