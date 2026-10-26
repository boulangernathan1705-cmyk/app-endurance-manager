// Mur des stands (mur.html), organised like PitData: the team's car live, in full screen, on a phone or a second
// screen, for the pilot who is not driving. Five tabs: Classement (général, relatif, opposants), Chrono, Véhicule &
// énergie, Télémétrie, Carte. The feeds come from the team's room (server/live.mjs, through the relay when the site has
// one), the same as the old page front/live-page.mjs; plugin 2.0 adds the car ten times a second (tm), its settings and
// every car's tank. Raw numbers only, no advice.
import {COLORS} from '../shared/combos.mjs';
import {addToPath, isRace, lapsLeft, outlineLines, patch, readFeed, stationary, timeAt, LIVE_FOR} from '../shared/live.mjs';

const app = document.getElementById('pw-app');
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const known = value => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));
const fr = (value, digits = 1) => known(value) ? Number(value).toLocaleString('fr-FR', {minimumFractionDigits:digits, maximumFractionDigits:digits}) : '—';
const lapTime = seconds => known(seconds) && seconds > 0 ? `${Math.floor(seconds / 60)}:${(seconds % 60).toFixed(3).padStart(6, '0').replace('.', ',')}` : '—';
const clock = value => { if (!known(value)) return '—'; const s = Math.max(0, Math.round(value)); return `${Math.floor(s / 3600)}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; };
const signed = (value, digits = 1) => known(value) ? `${value > 0 ? '+' : value < 0 ? '−' : '±'}${fr(Math.abs(value), digits)}` : '—';
const WHEELS = ['AVG', 'AVD', 'ARG', 'ARD'];
const TABS = [['board', 'Classement', 'Class.'], ['chrono', 'Chrono', 'Chrono'], ['car', 'Véhicule & énergie', 'Voiture'], ['tele', 'Télémétrie & graphes', 'Télém.'], ['map', 'Carte en direct', 'Carte']];
const MODES = [['all', 'Général'], ['rel', 'Relatif'], ['opp', 'Opposants']];
// The last minute of our car, ten times a second.
const TELE_KEPT = 600;

const saved = (() => { try { return JSON.parse(localStorage.getItem('pw-view') || '{}'); } catch { return {}; } })();
const view = {raw:new Map(), feeds:new Map(), key:null, tab:TABS.some(([id]) => id === location.hash.slice(1)) ? location.hash.slice(1) : saved.tab || 'board',
  mode:saved.mode || 'all', cls:'all', offset:0, connected:false, started:false, rate:0};
const remember = () => { try { localStorage.setItem('pw-view', JSON.stringify({tab:view.tab, mode:view.mode})); } catch {} };

async function call(path) {
  let response;
  try { response = await fetch(path, {credentials:'same-origin', cache:'no-store', headers:{Accept:'application/json'}}); }
  catch { throw Object.assign(Error('Connexion au site impossible. Vérifie ta connexion puis réessaie.'), {status:0}); }
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(Error(result.error || `Action impossible (${response.status}).`), {status:response.status});
  return result;
}

function renderError(error) {
  const action = error.status === 401 ? `<a class="pw-button" href="/api/auth/discord?return=${encodeURIComponent('/mur.html')}">Se connecter avec Discord</a>` : '<a class="pw-button" href="/lmu/">Retour aux courses</a>';
  app.innerHTML = `<section class="pw-empty"><h1>Mur des stands</h1><p>${esc(error.message)}</p>${action}</section>`;
}

// ---------- Live connection ----------

let socket = null, retry = 2000;
// The relay's address with a fresh pass when the site has one, else the site itself.
async function liveUrl() {
  try {
    const response = await fetch('/api/combos/live/pass', {credentials:'same-origin', cache:'no-store'});
    if (response.ok) { const {url} = await response.json(); if (url) return url; }
  } catch {}
  return `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/combos/live`;
}

async function connect() {
  socket = new WebSocket(await liveUrl());
  socket.addEventListener('open', () => { view.connected = true; retry = 2000; viewSent = null; tellView(); render(); });
  socket.addEventListener('message', event => {
    let message;
    try { message = JSON.parse(event.data); } catch { return; }
    if (known(message.now)) view.offset = Date.now() - message.now;
    if (message.type === 'hello') { view.raw.clear(); for (const feed of message.feeds || []) keep(feed, message.pos?.[feed.key]); }
    if (message.type === 'feed' && message.feed?.key) keep(message.feed, message.pos);
    if (message.type === 'patch' && message.key) {
      const before = view.raw.get(message.key);
      if (before) keep(patch(before, message.patch), message.pos);
      else tellView(true);
    }
    const key = message.key || message.feed?.key;
    if (key && Array.isArray(message.tm)) addFrames(key, message.tm);
    pick();
    render();
  });
  socket.addEventListener('close', () => {
    view.connected = false;
    render();
    setTimeout(connect, retry);
    retry = Math.min(retry * 2, 30000);
  });
}

// The room sends only to a page on screen, and the cars' positions only while the map is shown.
let viewSent = null;
function tellView(again = false) {
  const state = {type:'view', watch:document.visibilityState !== 'hidden', map:view.tab === 'map'};
  const text = JSON.stringify(state);
  if (!socket || socket.readyState !== WebSocket.OPEN || (text === viewSent && !again)) return;
  socket.send(JSON.stringify(again ? {...state, again:true} : state));
  viewSent = text;
}
document.addEventListener('visibilitychange', () => tellView());

// Only the session under way: a car's feed in a new session replaces its earlier ones.
function keep(input, pos = null) {
  view.raw.set(input.key, input);
  const feed = readFeed(input, view.feeds.get(input.key));
  // The positions come with each message while the map is shown; without, the last ones stay.
  const at = Array.isArray(pos) ? new Map(pos.map(([id, x, z]) => [id, [x, z]]))
    : new Map((view.feeds.get(input.key)?.snap.field || []).map(car => [car.id, [car.x, car.z]]));
  for (const car of feed.snap.field) [car.x, car.z] = at.get(car.id) || [null, null];
  for (const [key, other] of view.feeds) {
    if (key === feed.key || other.snap.me.vehicle !== feed.snap.me.vehicle) continue;
    if (other.pilot?.id && feed.pilot?.id && other.pilot.id !== feed.pilot.id && Math.abs(other.updated - feed.updated) < LIVE_FOR) continue;
    if (other.updated > feed.updated) return;
    view.feeds.delete(key);
    view.raw.delete(key);
    motions.delete(key);
    teles.delete(key);
    if (view.key === key) view.key = feed.key;
  }
  view.feeds.set(feed.key, feed);
  record(feed);
  loadLap(feed.snap.track);
}

const age = feed => Math.max(0, (Date.now() - view.offset - feed.updated) / 1000);
const isLive = feed => age(feed) * 1000 < LIVE_FOR;
const feedName = feed => feed.pilot?.name || feed.snap.me.driver || 'Pilote';
const feedList = () => [...view.feeds.values()].sort((a, b) => isLive(b) - isLive(a) || feedName(a).localeCompare(feedName(b)) || a.key.localeCompare(b.key));
function pick() {
  if (view.key && view.feeds.has(view.key)) return;
  const list = feedList();
  view.key = (list.find(feed => isLive(feed) && isRace(feed.snap.session)) || list[0])?.key || null;
}
const current = () => view.feeds.get(view.key) || null;

// ---------- Our car ten times a second (plugin 2.0) ----------

// Per feed: [{t (page seconds), d, v, throttle, brake, steer, gear}], the frames of each second spread over it.
const teles = new Map();
function addFrames(key, frames) {
  const list = teles.get(key) || [], now = performance.now() / 1000;
  frames.forEach(([d, v, throttle, brake, steer, gear], index) => list.push({t:now - (frames.length - 1 - index) * 0.1, d, v, throttle, brake, steer, gear}));
  if (list.length > TELE_KEPT) list.splice(0, list.length - TELE_KEPT);
  teles.set(key, list);
  // The rate the car comes at: frames in the last 5 s.
  view.rate = list.filter(item => item.t > now - 5).length / 5;
}

// ---------- The figures ----------

function classColor(name) {
  const value = String(name || '').toLowerCase();
  if (/hyper|lmh|lmdh/.test(value)) return 'var(--pw-hyper)';
  if (/p2|lmp/.test(value)) return 'var(--pw-lmp2)';
  if (/gt3|gte|gt/.test(value)) return 'var(--pw-gt3)';
  return 'var(--pw-other)';
}
const nameColor = name => COLORS[[...String(name || '')].reduce((sum, char) => sum + char.charCodeAt(0), 0) % COLORS.length];
const feedColor = feed => feed.pilot?.color || nameColor(feedName(feed));
const model = car => String(car.vehicle || '').replace(/\s*#\s*\d+\b/, '').trim() || car.vehicle;
const meOf = feed => feed.snap.field.find(car => car.id === feed.snap.me.id);
const ourPace = feed => feed.ours.avg5 || feed.cars[feed.snap.me.id]?.avg5 || meOf(feed)?.best || meOf(feed)?.last || null;
// The standings: by place in a race, by best lap otherwise.
function order(feed) {
  const field = [...feed.snap.field];
  return isRace(feed.snap.session) ? field.sort((a, b) => (a.place || 999) - (b.place || 999))
    : field.sort((a, b) => (a.best > 0 ? a.best : 1e9) - (b.best > 0 ? b.best : 1e9));
}
const sessionName = session => isRace(session) ? 'Course' : session >= 5 && session <= 8 ? 'Qualifications' : session === 9 ? 'Warm-up' : 'Essais';
// Seconds left on the session's clock, moved on with the page's own since the last message.
const timeLeft = feed => feed.snap.end ? feed.snap.end - feed.snap.et - (isLive(feed) ? age(feed) : 0) : null;

// Energy (or fuel for a car without virtual energy): what we have, what a lap costs, and what the flag asks for.
function energyOf(feed) {
  const me = feed.snap.me, ours = feed.ours, ve = known(me.ve);
  const have = ve ? me.ve : me.fuel, perLap = ve ? ours.ve5 : ours.fuel5, last = ve ? ours.lastVe : ours.lastFuel;
  const room = ve ? 100 - me.ve : known(me.capacity) && known(me.fuel) ? me.capacity - me.fuel : null;
  const left = lapsLeft(feed.snap, ourPace(feed));
  const need = known(left) && known(perLap) ? left * perLap : null;
  // What is missing to reach the flag, and how many full refills that takes (a stop refills one tank at most).
  const missing = known(need) && known(have) ? Math.max(0, need - have) : null, full = ve ? 100 : me.capacity;
  const stops = known(missing) && full > 0 ? Math.ceil(missing / full - 1e-9) : null;
  return {ve, unit:ve ? '%' : 'L', have, perLap, last, room, left, need, missing, stops, laps:known(have) && perLap > 0 ? have / perLap : null};
}

// ---------- Drawing ----------

function header(feed) {
  const link = !view.connected ? '<span class="pw-dot late"></span>Reconnexion…'
    : !feed ? '<span class="pw-dot"></span>En attente'
      : isLive(feed) ? `<span class="pw-dot on"></span>Direct${view.rate >= 2 ? ` · ${fr(view.rate, 0)} Hz` : ''}` : `<span class="pw-dot late"></span>Il y a ${clock(age(feed))}`;
  const logo = '<a class="pw-logo" href="/" aria-label="Retour à l’accueil Endurance Manager"><img src="/images/endurance-manager-logo.webp" alt="" width="34" height="34"></a>';
  const full = document.fullscreenEnabled ? `<button class="pw-icon" type="button" data-full aria-label="${document.fullscreenElement ? 'Quitter le plein écran' : 'Plein écran'}">${document.fullscreenElement ? '🗗' : '⛶'}</button>` : '';
  if (!feed) return `<div class="pw-head">${logo}<div class="pw-id"><b>Mur des stands</b></div><div class="pw-link">${link}</div>${full}</div>`;
  const snap = feed.snap, me = meOf(feed), sorted = order(feed), classPlace = sorted.filter(car => car.cls === me.cls).indexOf(me) + 1;
  const num = me.num ? `#${esc(me.num)} ` : '';
  return `<div class="pw-head">${logo}
    <div class="pw-id"><b>${num}${esc(model(me))}</b><span>${esc(snap.me.driver)} · ${esc(snap.me.car || model(me))} · ${esc(snap.track)}</span></div>
    <div class="pw-facts">
      <div><span>${esc(sessionName(snap.session))}</span><b>${clock(timeLeft(feed))}</b></div>
      <div><span>Position</span><b>P${me.place || sorted.indexOf(me) + 1}<small> · ${esc(me.cls)} P${classPlace}</small></b></div>
      <div><span>Tour</span><b>${(me.laps || 0) + 1}</b></div>
    </div>
    <div class="pw-link">${link}</div>${full}</div>`;
}

function carsStrip() {
  const list = feedList();
  if (list.length < 2) return '';
  return `<div class="pw-cars" role="group" aria-label="Voiture suivie">${list.map(feed => `<button type="button" data-feed="${esc(feed.key)}" aria-pressed="${feed.key === view.key}">
    <i style="background:${esc(feedColor(feed))}"></i>${esc(feedName(feed))}<small>${esc(feed.snap.me.vehicle)}${isLive(feed) ? '' : ' · hors ligne'}</small></button>`).join('')}</div>`;
}

const tabs = () => `<nav class="pw-tabs" role="tablist">${TABS.map(([id, label, short]) => `<button type="button" role="tab" data-tab="${id}" aria-selected="${view.tab === id}"><span class="pw-long">${label}</span><span class="pw-short">${short}</span></button>`).join('')}</nav>`;

// A gap as PitData shows it: seconds, or laps once a lap down.
const gapText = (seconds, laps) => known(laps) && laps > 0 ? `+${laps} T` : known(seconds) ? `+${fr(seconds, 1)}` : '—';
// The game counts stops only in some sessions (0 in practice): our own are the ones the plugin measured.
const stopsOf = (feed, car) => car.id === feed.snap.me.id ? Math.max(car.stops || 0, (feed.ours.stops || []).length) : car.stops ?? 0;
const pitText = car => car.pit === 2 ? '<b class="pw-pit">GAR</b>' : car.pit ? '<b class="pw-pit">STAND</b>' : '';
const clsPill = cls => `<span class="pw-cls" style="--cls:${classColor(cls)}">${esc(String(cls || '—').replace(/hypercar/i, 'HY'))}</span>`;
// The game gives 0 for a car whose tank it does not share (other players online): shown as unknown.
const tankText = car => known(car.tank) && car.tank > 0 ? `<span class="pw-tank" style="--tank:${Math.max(0, Math.min(100, car.tank))}%">${fr(car.tank, 0)}</span>` : '—';

function board(feed) {
  const snap = feed.snap, race = isRace(snap.session);
  const classes = [...new Set(snap.field.map(car => car.cls).filter(Boolean))];
  if (view.cls !== 'all' && !classes.includes(view.cls)) view.cls = 'all';
  const modes = `<div class="pw-switch" role="group" aria-label="Vue">${MODES.map(([id, label]) => `<button type="button" data-mode="${id}" aria-pressed="${view.mode === id}">${label}</button>`).join('')}</div>`;
  const chips = view.mode === 'all' && classes.length > 1 ? `<div class="pw-switch" role="group" aria-label="Catégorie"><button type="button" data-cls="all" aria-pressed="${view.cls === 'all'}">Toutes</button>${classes.map(cls => `<button type="button" data-cls="${esc(cls)}" aria-pressed="${view.cls === cls}" style="--cls:${classColor(cls)}">${esc(cls)}</button>`).join('')}</div>` : '';
  const body = view.mode === 'rel' ? relative(feed) : view.mode === 'opp' ? opponents(feed) : general(feed, race);
  return `<div class="pw-bar">${modes}${chips}</div>${body}`;
}

function general(feed, race) {
  const snap = feed.snap, sorted = order(feed).filter(car => view.cls === 'all' || car.cls === view.cls);
  const bestOf = new Map();
  for (const car of snap.field) if (car.best > 0 && (!bestOf.has(car.cls) || car.best < bestOf.get(car.cls))) bestOf.set(car.cls, car.best);
  const classPlaces = new Map();
  const rows = sorted.map(car => {
    const place = (classPlaces.get(car.cls) || 0) + 1;
    classPlaces.set(car.cls, place);
    const info = feed.cars[car.id] || {}, ours = car.id === snap.me.id;
    const gap = race ? place === 1 ? 'Leader' : gapText(info.lead, info.leadLaps)
      : car.best > 0 && bestOf.get(car.cls) ? place === 1 ? '—' : `+${fr(car.best - bestOf.get(car.cls), 3)}` : '—';
    return `<tr class="${ours ? 'us' : ''}" style="--cls:${classColor(car.cls)}">
      <td class="pw-pos">${race ? car.place || '—' : order(feed).indexOf(car) + 1}</td><td class="pw-num pw-opt">${esc(car.num || '')}</td><td class="pw-opt">${clsPill(car.cls)}</td>
      <td class="pw-name"><b>${esc(car.driver)}</b><small>${esc(car.vehicle)}</small></td><td class="pw-opt2">${esc(model(car))}</td>
      <td class="pw-n">${gap}</td><td class="pw-n pw-opt">${car.laps ?? '—'}</td><td class="pw-n pw-opt">${lapTime(car.last)}</td>
      <td class="pw-n${car.best > 0 && car.best === bestOf.get(car.cls) ? ' best' : ''}">${lapTime(car.best)}</td>
      <td class="pw-n">${tankText(car)}</td><td class="pw-n">${stopsOf(feed, car)} ${pitText(car)}</td></tr>`;
  }).join('');
  return `<div class="pw-table"><table><thead><tr><th>Pos</th><th class="pw-opt">#</th><th class="pw-opt">Cat</th><th>Pilote / équipe</th><th class="pw-opt2">Voiture</th><th class="pw-n">Écart</th>
    <th class="pw-n pw-opt">Tours</th><th class="pw-n pw-opt">Dernier</th><th class="pw-n">Meilleur</th><th class="pw-n" title="Réservoir ou énergie virtuelle restante, en %">VE</th><th class="pw-n">Stands</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

// Every car around us on track, seconds ahead or behind at our pace, whatever its class: who we are about to catch,
// who is coming. Blue: a lap or more behind us (we lap him), orange: ahead of us by a lap or more.
function relative(feed) {
  const snap = feed.snap, me = meOf(feed), lap = ourPace(feed), length = snap.length;
  if (!me || !lap || !length) return '<p class="pw-note">Le relatif s’affiche dès que la voiture a fait un tour.</p>';
  const at = car => timeAt(snap.me.profile, ((car.dist || 0) / length + 1) % 1, lap);
  const run = car => (car.laps || 0) + Math.max(0, car.dist || 0) / length;
  const list = snap.field.filter(car => car.pit !== 2).map(car => {
    let gap = at(car) - at(me);
    gap = ((gap % lap) + lap * 1.5) % lap - lap / 2;
    return {car, gap, laps:Math.round(run(car) - run(me) - gap / lap)};
  }).sort((a, b) => b.gap - a.gap);
  const index = list.findIndex(item => item.car.id === me.id);
  const shown = list.slice(Math.max(0, index - 6), index + 7);
  const rows = shown.map(({car, gap, laps}) => `<tr class="${car.id === me.id ? 'us' : laps < 0 ? 'down' : laps > 0 ? 'up' : ''}" style="--cls:${classColor(car.cls)}">
    <td class="pw-pos">${car.place || '—'}</td><td class="pw-num pw-opt">${esc(car.num || '')}</td><td class="pw-opt">${clsPill(car.cls)}</td>
    <td class="pw-name"><b>${esc(car.driver)}</b><small>${esc(car.vehicle)}</small></td>
    <td class="pw-n">${car.id === me.id ? '' : signed(gap, 1)}</td><td class="pw-n pw-opt">${laps ? `${laps > 0 ? '+' : '−'}${Math.abs(laps)} T` : ''}</td>
    <td class="pw-n">${lapTime(car.last)}</td><td class="pw-n">${pitText(car)}</td></tr>`).join('');
  return `<div class="pw-table"><table><thead><tr><th>Pos</th><th class="pw-opt">#</th><th class="pw-opt">Cat</th><th>Pilote / équipe</th><th class="pw-n">Sur nous</th><th class="pw-n pw-opt">Tours</th><th class="pw-n">Dernier</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>
    <p class="pw-note">En secondes sur la piste, à notre rythme : + devant nous, − derrière.</p>`;
}

// Our class only: each car's gap to us in the race, its pace over 5 laps and its stint.
function opponents(feed) {
  const snap = feed.snap, me = meOf(feed), race = isRace(snap.session);
  if (!me) return '';
  const mine = order(feed).filter(car => car.cls === me.cls), our = feed.cars[me.id] || {};
  const lead = car => car === mine[0] ? {s:0, laps:0} : {s:feed.cars[car.id]?.lead ?? null, laps:feed.cars[car.id]?.leadLaps ?? 0};
  const us = lead(me);
  const rows = mine.map((car, index) => {
    const info = feed.cars[car.id] || {}, them = lead(car);
    // In a race + ahead of us; in practice, the best lap's difference (+ slower than ours).
    const laps = us.laps - them.laps;
    const gap = car === me ? '' : race && (them.laps || us.laps) ? laps ? `${laps > 0 ? '+' : '−'}${Math.abs(laps)} T` : '—'
      : race && known(them.s) && known(us.s) ? signed(us.s - them.s, 1) : car.best > 0 && me.best > 0 ? signed(car.best - me.best, 3) : '—';
    const pace = known(info.avg5) && known(our.avg5) && car !== me ? ` <small>${signed(info.avg5 - our.avg5, 2)}</small>` : '';
    return `<tr class="${car === me ? 'us' : ''}" style="--cls:${classColor(car.cls)}"><td class="pw-pos">${index + 1}</td><td class="pw-num pw-opt">${esc(car.num || '')}</td>
      <td class="pw-name"><b>${esc(car.driver)}</b><small>${esc(car.vehicle)}</small></td><td class="pw-n">${gap}</td>
      <td class="pw-n">${lapTime(info.avg5)}${pace}</td><td class="pw-n pw-opt">${lapTime(car.last)}</td><td class="pw-n pw-opt">${lapTime(car.best)}</td>
      <td class="pw-n">${tankText(car)}</td><td class="pw-n pw-opt">${known(info.sinceStop) ? info.sinceStop : '—'}</td><td class="pw-n">${stopsOf(feed, car)} ${pitText(car)}</td></tr>`;
  }).join('');
  return `<div class="pw-table"><table><thead><tr><th>Pos</th><th class="pw-opt">#</th><th>Pilote / équipe</th><th class="pw-n">${race ? 'Sur nous' : 'Meilleur / nous'}</th><th class="pw-n">Moy. 5 tours</th>
    <th class="pw-n pw-opt">Dernier</th><th class="pw-n pw-opt">Meilleur</th><th class="pw-n">VE</th><th class="pw-n pw-opt" title="Tours depuis son dernier arrêt">Relais</th><th class="pw-n">Stands</th></tr></thead><tbody>${rows}</tbody></table></div>
    <p class="pw-note">${esc(me.cls)} : ${race ? 'écart en course (+ devant nous)' : 'meilleur tour comparé au nôtre (+ plus lent)'}, rythme sur 5 tours comparé au nôtre (+ plus lent).</p>`;
}

const tile = (label, value, extra = '', cls = '') => `<div class="pw-tile${cls ? ` ${cls}` : ''}"><span>${label}</span><b>${value}</b>${extra ? `<small>${extra}</small>` : ''}</div>`;

function chrono(feed) {
  const snap = feed.snap, me = meOf(feed), ours = feed.ours, info = feed.cars[me.id] || {};
  const running = known(snap.me.cur) ? snap.me.cur + (isLive(feed) && !snap.me.pit ? age(feed) : 0) : null;
  const delta = snap.me.pit ? null : snap.me.delta, deltaCls = known(delta) ? delta < 0 ? 'good' : delta > 0 ? 'bad' : '' : '';
  const lastS = info.lastSectors || [null, null, null], bestS = ours.bestSectors || [null, null, null], avgS = ours.sectors5 || [null, null, null];
  const sum = list => list.every(known) ? list.reduce((a, b) => a + b, 0) : null;
  const sector = (value, index) => `<td class="pw-n${known(value) && value === bestS[index] ? ' best' : ''}">${known(value) ? fr(value, 3) : '—'}</td>`;
  const laps = [...(ours.laps || [])].reverse();
  const timed = laps.filter(lap => lap.t > 0 && !lap.pit).map(lap => lap.t), best = timed.length ? Math.min(...timed) : null;
  const history = laps.length ? laps.map(lap => `<tr class="${lap.t && lap.t === best ? 'top' : ''}"><td class="pw-pos">${lap.n}</td><td class="pw-n${lap.t && lap.t === best ? ' best' : ''}">${lapTime(lap.t)}</td>
    ${[0, 1, 2].map(index => `<td class="pw-n pw-opt">${known(lap.s?.[index]) ? fr(lap.s[index], 3) : '—'}</td>`).join('')}
    <td class="pw-n">${known(lap.ve) ? fr(lap.ve, 2) : known(lap.fuel) ? `${fr(lap.fuel, 2)} L` : '—'}</td><td class="pw-name pw-opt">${esc(lap.driver || '')}</td><td>${lap.pit ? '<b class="pw-pit">STAND</b>' : ''}</td></tr>`).join('')
    : '<tr><td colspan="8" class="pw-note">Les tours s’ajoutent ici à chaque passage sur la ligne.</td></tr>';
  return `<div class="pw-tiles big">
      ${tile('Tour en cours', lapTime(running))}
      ${tile('Delta meilleur', known(delta) ? signed(delta, 2) : '—', '', deltaCls)}
      ${tile('Dernier', lapTime(me.last))}
      ${tile('Meilleur', lapTime(me.best), '', 'purple')}
      ${tile('Limites de piste', known(snap.me.limits) ? fr(snap.me.limits, snap.me.limits % 1 ? 1 : 0) : '—', 'points')}
      ${tile('Pénalités', me.pen ?? 0)}
    </div>
    <h2>Secteurs</h2>
    <div class="pw-table"><table><thead><tr><th></th><th class="pw-n">S1</th><th class="pw-n">S2</th><th class="pw-n">S3</th><th class="pw-n">Tour</th></tr></thead><tbody>
      <tr><th>Dernier tour</th>${lastS.map(sector).join('')}<td class="pw-n">${lapTime(me.last)}</td></tr>
      <tr><th>Moyenne 5 tours</th>${avgS.map(sector).join('')}<td class="pw-n">${lapTime(ours.avg5)}</td></tr>
      <tr><th>Meilleurs</th>${bestS.map(sector).join('')}<td class="pw-n">${lapTime(sum(bestS))}<small> idéal</small></td></tr>
    </tbody></table></div>
    <h2>Historique des tours</h2>
    <div class="pw-table"><table><thead><tr><th class="pw-n">Tour</th><th class="pw-n">Temps</th><th class="pw-n pw-opt">S1</th><th class="pw-n pw-opt">S2</th><th class="pw-n pw-opt">S3</th><th class="pw-n">Conso</th><th class="pw-opt">Pilote</th><th></th></tr></thead><tbody>${history}</tbody></table></div>`;
}

function car(feed) {
  const snap = feed.snap, me = snap.me, control = me.control || {}, energy = energyOf(feed), u = energy.unit;
  const level = (label, value) => known(value) ? tile(label, value) : '';
  const electronics = [level('TC', control.tc), level('TC Cut', control.cut), level('TC Slip', control.slip), level('ABS', control.abs), level('Carto moteur', control.map),
    known(control.bias) ? tile('Freins', `${fr(control.bias, 1)} %`, 'à l’avant') : '', level('Migration', control.mig), level('Barre AV', control.arbF), level('Barre AR', control.arbR)].join('');
  const service = me.service, stops = feed.ours.stops || [];
  const stopFor = kind => stationary(kind, {service, energy:known(me.ve) ? me.ve : null, fuel:me.fuel, capacity:me.capacity, stops});
  const wheel = (w, index) => `<div class="pw-wheel"><span>${WHEELS[index]}</span>
    <b>${known(w.left) ? `${fr(w.left, 0)} %` : '—'}</b><small>usure restante</small>
    <dl><div><dt>Carcasse</dt><dd>${known(w.carcass) ? `${fr(w.carcass, 0)} °C` : '—'}</dd></div><div><dt>Pression</dt><dd>${known(w.kpa) ? `${fr(w.kpa, 1)} kPa` : '—'}</dd></div><div><dt>Frein</dt><dd>${known(w.brake) ? `${fr(w.brake, 0)} °C` : '—'}</dd></div></dl></div>`;
  return `${electronics ? `<h2>Électronique</h2><div class="pw-tiles">${electronics}</div>` : ''}
    <h2>${energy.ve ? 'Énergie virtuelle' : 'Carburant'}</h2>
    <div class="pw-tiles big">
      ${tile(energy.ve ? 'VE' : 'Carburant', known(energy.have) ? `${fr(energy.have, 1)} ${u}` : '—', energy.ve && known(me.fuel) ? `${fr(me.fuel, 1)} L de carburant` : known(me.capacity) ? `sur ${fr(me.capacity, 0)} L` : '')}
      ${tile('Dernier tour', known(energy.last) ? `${fr(energy.last, 2)} ${u}` : '—')}
      ${tile('Moyenne 5 tours', known(energy.perLap) ? `${fr(energy.perLap, 2)} ${u}` : '—')}
      ${tile('Tours possibles', known(energy.laps) ? fr(energy.laps, 1) : '—')}
      ${tile('Tours jusqu’à l’arrivée', known(energy.left) ? fr(energy.left, 1) : '—')}
      ${known(me.battery) ? tile('Batterie', `${fr(me.battery, 0)} %`, known(me.regen) && me.regen ? `régén. ${fr(me.regen, 0)} kW` : '') : ''}
    </div>
    <h2>Ravitaillement</h2>
    <div class="pw-tiles">
      ${tile('Pour finir', known(energy.need) ? `${fr(energy.need, 1)} ${u}` : '—', 'à notre moyenne')}
      ${tile('Il manque', known(energy.missing) ? `${fr(energy.missing, 1)} ${u}` : '—', 'en plus de ce qu’il reste')}
      ${tile('Arrêts', known(energy.stops) ? energy.stops : '—', energy.stops ? `plein${energy.stops > 1 ? 's' : ''} pour aller au bout` : 'pour aller au bout')}
      ${tile('Plein', known(energy.room) ? `${fr(energy.room, 1)} ${u}` : '—', 'place libre')}
      ${tile('Arrêt énergie', known(stopFor('energy')) ? `${fr(stopFor('energy'), 1)} s` : '—', 'à l’arrêt, plein')}
      ${tile('Arrêt + 4 pneus', known(stopFor('tyres')) ? `${fr(stopFor('tyres'), 1)} s` : '—', 'à l’arrêt, plein')}
    </div>
    <h2>Pneus et freins <small>${esc(me.compound || '')}</small></h2>
    <div class="pw-wheels">${me.wheels.map(wheel).join('')}</div>
    <h2>État</h2>
    <div class="pw-tiles">
      ${tile('Dégâts', known(me.damage) ? `${fr(me.damage, 0)} %` : '—', '', me.damage > 0 ? 'bad' : '')}
      ${tile('Eau', known(me.water) ? `${fr(me.water, 0)} °C` : '—')}
      ${tile('Huile', known(me.oil) ? `${fr(me.oil, 0)} °C` : '—')}
      ${tile('Piste', known(snap.trackTemp) ? `${fr(snap.trackTemp, 0)} °C` : '—', known(snap.air) ? `air ${fr(snap.air, 0)} °C` : '')}
      ${tile('Pluie', known(snap.rain) ? `${fr(snap.rain * 100, 0)} %` : '—', known(snap.wet) ? `piste mouillée ${fr(snap.wet * 100, 0)} %` : '')}
    </div>`;
}

// The last minute of our car as curves (drawn into the canvases after each redraw), and our laps as graphs.
const CURVES = [['v', 'Vitesse', 'km/h'], ['pedals', 'Gaz et frein', '%'], ['steer', 'Volant', '%']];
function tele(feed) {
  const list = teles.get(feed.key) || [], last = list.at(-1);
  const now = last && performance.now() / 1000 - last.t < 3 ? last : null;
  const bar = (label, value, cls) => `<div class="pw-pedal ${cls}"><span>${label}</span><i style="--level:${known(value) ? Math.max(0, Math.min(100, value)) : 0}%"></i><b>${known(value) ? fr(value, 0) : '—'}</b></div>`;
  const live = `<div class="pw-tiles big">
      ${tile('Vitesse', now ? `${fr(now.v, 0)}` : '—', 'km/h')}
      ${tile('Rapport', now ? now.gear === 0 ? 'N' : now.gear < 0 ? 'R' : now.gear : '—')}
      ${tile('Volant', now ? signed(now.steer, 0) : '—', '% à droite')}
    </div><div class="pw-pedals">${bar('Gaz', now?.throttle, 'gas')}${bar('Frein', now?.brake, 'brake')}</div>`;
  const curves = list.length ? CURVES.map(([id, label, unit]) => `<figure class="pw-curve"><figcaption>${label} <small>${unit} · dernière minute</small></figcaption><canvas data-curve="${id}" height="120"></canvas></figure>`).join('')
    : '<p class="pw-note">Les courbes arrivent quand le pilote roule avec le plugin 2.0 et que cette page est ouverte.</p>';
  return `${live}<h2>En direct</h2>${curves}<h2>Nos tours</h2>${lapGraphs(feed)}`;
}

// One bar per lap: its time (pit laps faded) and what it used.
function lapGraphs(feed) {
  const laps = (feed.ours.laps || []).slice(-40);
  const timed = laps.filter(lap => lap.t > 0 && !lap.pit).map(lap => lap.t);
  if (timed.length < 2) return '<p class="pw-note">Les graphes s’affichent après deux tours chronométrés.</p>';
  const graph = (title, pick, digits, unit) => {
    const values = laps.map(pick), shown = values.filter(known);
    if (shown.length < 2) return '';
    const sorted = [...shown].sort((a, b) => a - b), low = sorted[0], high = sorted[Math.floor(sorted.length * 0.9)] || sorted.at(-1);
    const span = Math.max(high - low, 1e-6), width = 100 / laps.length;
    const bars = laps.map((lap, index) => {
      const value = values[index];
      if (!known(value)) return '';
      const h = 12 + Math.min(1, (value - low) / span) * 88;
      return `<rect x="${(index * width + width * 0.12).toFixed(2)}" y="${(100 - h).toFixed(2)}" width="${(width * 0.76).toFixed(2)}" height="${h.toFixed(2)}"${lap.pit ? ' class="pit"' : value === low ? ' class="low"' : ''}><title>Tour ${lap.n} : ${digits === 'lap' ? lapTime(value) : `${fr(value, digits)} ${unit}`}</title></rect>`;
    }).join('');
    return `<figure class="pw-graph"><figcaption>${title} <small>tours ${laps[0].n} à ${laps.at(-1).n} · ${digits === 'lap' ? `${lapTime(low)} à ${lapTime(high)}` : `${fr(low, digits)} à ${fr(high, digits)} ${unit}`}</small></figcaption>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label="${title} par tour">${bars}</svg></figure>`;
  };
  const ve = laps.some(lap => known(lap.ve));
  return `${graph('Temps au tour', lap => lap.t > 0 ? lap.t : null, 'lap')}${graph(ve ? 'VE par tour' : 'Carburant par tour', lap => ve ? lap.ve : lap.fuel, 2, ve ? '%' : 'L')}`;
}

function drawCurves(feed) {
  const list = teles.get(feed?.key) || [];
  if (!list.length) return;
  const end = performance.now() / 1000, start = end - 60, style = getComputedStyle(app);
  for (const canvas of app.querySelectorAll('canvas[data-curve]')) {
    const ratio = window.devicePixelRatio || 1, width = canvas.clientWidth, height = canvas.clientHeight;
    if (!width) continue;
    canvas.width = width * ratio; canvas.height = height * ratio;
    const ctx = canvas.getContext('2d');
    ctx.scale(ratio, ratio);
    ctx.strokeStyle = style.getPropertyValue('--pw-line'); ctx.lineWidth = 1;
    for (const y of [0.25, 0.5, 0.75]) { ctx.beginPath(); ctx.moveTo(0, y * height); ctx.lineTo(width, y * height); ctx.stroke(); }
    const line = (pick, color, min, max) => {
      ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.beginPath();
      let open = false, before = null;
      for (const item of list) {
        const value = pick(item);
        if (item.t < start || !known(value) || (before && item.t - before.t > 1)) { open = false; before = item; if (!known(value)) continue; }
        const x = (item.t - start) / 60 * width, y = height - 4 - (Math.max(min, Math.min(max, value)) - min) / (max - min) * (height - 8);
        if (open) ctx.lineTo(x, y); else { ctx.moveTo(x, y); open = true; }
        before = item;
      }
      ctx.stroke();
    };
    const kind = canvas.dataset.curve;
    if (kind === 'v') line(item => item.v, style.getPropertyValue('--pw-speed'), 0, Math.max(100, ...list.map(item => item.v || 0)));
    if (kind === 'pedals') { line(item => item.throttle, style.getPropertyValue('--pw-gas'), 0, 100); line(item => item.brake, style.getPropertyValue('--pw-brake'), 0, 100); }
    if (kind === 'steer') line(item => item.steer, style.getPropertyValue('--pw-steer'), -100, 100);
  }
}

// ---------- Map (the cars glide between two messages) ----------

const PLAYBACK_DELAY = 1.8, JUMP = 400, KEPT = 6;
const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
const motions = new Map();
let frame = null;
function record(feed) {
  let motion = motions.get(feed.key);
  const snap = feed.snap, seen = performance.now() / 1000;
  if (motion && (motion.since !== feed.since || snap.et < motion.et - 5)) { motions.delete(feed.key); motion = null; }
  if (!motion) motions.set(feed.key, motion = {since:feed.since, cars:new Map(), offset:null, et:-Infinity, path:null, box:null});
  motion.path = addToPath(motion.path, snap);
  if (snap.et <= motion.et) return;
  motion.et = snap.et;
  const offset = snap.et - seen;
  motion.offset = motion.offset === null || Math.abs(offset - motion.offset) > 3 ? offset : motion.offset + (offset - motion.offset) * 0.1;
  for (const car of snap.field) {
    if (!known(car.x) || !known(car.z)) continue;
    if (car.pit !== 2) { const box = motion.box ||= [car.x, car.x, car.z, car.z]; box[0] = Math.min(box[0], car.x); box[1] = Math.max(box[1], car.x); box[2] = Math.min(box[2], car.z); box[3] = Math.max(box[3], car.z); }
    const list = motion.cars.get(car.id) || [];
    list.push({et:snap.et, x:car.x, z:car.z, pit:car.pit});
    if (list.length > KEPT) list.shift();
    motion.cars.set(car.id, list);
  }
}
function placed(feed, car) {
  const motion = motions.get(feed.key), list = motion?.cars.get(car.id);
  if (!list?.length || still) return [car.x, car.z];
  const at = performance.now() / 1000 + motion.offset - PLAYBACK_DELAY;
  const next = list.findIndex(item => item.et > at);
  if (next === -1) return [list.at(-1).x, list.at(-1).z];
  if (next === 0) return [list[0].x, list[0].z];
  const a = list[next - 1], b = list[next];
  if (Math.hypot(b.x - a.x, b.z - a.z) > JUMP || Boolean(a.pit) !== Boolean(b.pit)) return [a.x, a.z];
  const f = (at - a.et) / (b.et - a.et);
  return [a.x + (b.x - a.x) * f, a.z + (b.z - a.z) * f];
}
const trackLaps = new Map();
async function loadLap(track) {
  if (!track || trackLaps.has(track)) return;
  trackLaps.set(track, null);
  try {
    const result = await call(`/api/combos/outline?${new URLSearchParams({track})}`);
    if (Array.isArray(result.points) && result.points.length > 20) { trackLaps.set(track, result.points); render(); }
  } catch { trackLaps.delete(track); }
}
function outlineFor(feed) {
  const lap = trackLaps.get(feed.snap.track);
  if (lap) return outlineLines(lap);
  if (feed.mapFromGame) return outlineLines(feed.outline);
  const room = feed.outline || [], mine = motions.get(feed.key)?.path || [];
  const merged = mine.length === room.length || !room.length ? mine.map((point, index) => room[index] || point) : room;
  return outlineLines(merged, feed.snap.length);
}

function map(feed) {
  const snap = feed.snap, lines = outlineFor(feed), outline = lines.flatMap(line => line.points);
  const cars = snap.field.filter(car => known(car.x) && known(car.z) && car.pit !== 2);
  const whole = feed.mapFromGame || trackLaps.get(snap.track), box = whole ? null : motions.get(feed.key)?.box;
  const points = [...outline, ...(box ? [[box[0], box[2]], [box[1], box[3]]] : whole ? [] : cars.map(car => [car.x, car.z]))];
  if (!points.length) { frame = null; return '<p class="pw-note">Les positions arrivent dès que la voiture roule.</p>'; }
  const xs = points.map(p => p[0]), zs = points.map(p => p[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minZ = Math.min(...zs), maxZ = Math.max(...zs);
  const k = 940 / (Math.max(maxX - minX, maxZ - minZ) || 1);
  frame = {feed, minX, maxZ, k};
  const width = (maxX - minX) * k + 60, height = (maxZ - minZ) * k + 60;
  const px = v => (30 + (v - minX) * k).toFixed(1), pz = v => (30 + (maxZ - v) * k).toFixed(1);
  const path = lines.map(line => `M${line.points.map(([x, z]) => `${px(x)},${pz(z)}`).join('L')}${line.closed ? 'Z' : ''}`).join('');
  const sorted = order(feed), placeOf = car => (isRace(snap.session) && car.place) || sorted.indexOf(car) + 1;
  const dot = (car, fill, r, ours = false) => { const [x, z] = placed(feed, car);
    return `<g data-car="${car.id}"${ours ? ' class="us"' : ''} transform="translate(${px(x)},${pz(z)})"><circle r="${r}" fill="${fill}"/><text dy="0.36em">${placeOf(car)}</text></g>`; };
  const others = cars.filter(car => car.id !== snap.me.id).map(car => dot(car, classColor(car.cls), 18)).join('');
  const me = cars.find(car => car.id === snap.me.id);
  const classes = [...new Set(snap.field.map(car => car.cls).filter(Boolean))];
  return `<svg class="pw-map" viewBox="0 0 ${width.toFixed(0)} ${height.toFixed(0)}" role="img" aria-label="Position des voitures sur le circuit">${path ? `<path class="road" d="${path}"/><path class="edge" d="${path}"/>` : ''}${others}${me ? dot(me, esc(feedColor(feed)), 25, true) : ''}</svg>
    <div class="pw-legend">${classes.map(name => `<span><i style="background:${classColor(name)}"></i>${esc(name)}</span>`).join('')}<span><i class="us" style="background:${esc(feedColor(feed))}"></i>Nous</span></div>`;
}

function glide() {
  requestAnimationFrame(glide);
  if (still || document.hidden || !frame || view.tab !== 'map') return;
  const box = app.querySelector('.pw-map');
  if (!box) return;
  const {feed, minX, maxZ, k} = frame, field = new Map(feed.snap.field.map(car => [car.id, car]));
  for (const node of box.querySelectorAll('[data-car]')) {
    const car = field.get(Number(node.dataset.car));
    if (!car) continue;
    const [x, z] = placed(feed, car);
    node.setAttribute('transform', `translate(${(30 + (x - minX) * k).toFixed(1)},${(30 + (maxZ - z) * k).toFixed(1)})`);
  }
}

// ---------- The page ----------

const PANELS = {board, chrono, car, tele, map};
function render() {
  if (!view.started) return;
  const feed = current();
  if (!feed) {
    app.innerHTML = `${header(null)}<section class="pw-empty"><h1>Personne ne roule en ce moment</h1>
      <p>Le mur s’allume dès qu’un pilote de l’équipe roule avec le plugin SimHub, « Partager ma voiture en direct » coché. Cette page se met à jour toute seule.</p></section>`;
    return;
  }
  const scroll = app.querySelector('.pw-panel')?.scrollTop;
  app.innerHTML = `${header(feed)}${carsStrip()}${tabs()}<section class="pw-panel pw-${view.tab}" role="tabpanel">${PANELS[view.tab](feed)}</section>`;
  if (scroll) app.querySelector('.pw-panel').scrollTop = scroll;
  if (view.tab === 'tele') drawCurves(feed);
}

app.addEventListener('click', event => {
  const button = event.target.closest('button');
  if (!button) return;
  if (button.dataset.tab) { view.tab = button.dataset.tab; history.replaceState(null, '', `#${view.tab}`); remember(); tellView(); window.scrollTo(0, 0); }
  else if (button.dataset.mode) { view.mode = button.dataset.mode; remember(); }
  else if (button.dataset.cls) view.cls = button.dataset.cls;
  else if (button.dataset.feed) view.key = button.dataset.feed;
  else if ('full' in button.dataset) {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else document.documentElement.requestFullscreen().catch(() => {});
    return;
  } else return;
  render();
});
document.addEventListener('fullscreenchange', render);

async function start() {
  try { await call('/api/combos'); }
  catch (error) { renderError(error); return; }
  view.started = true;
  render();
  connect();
  // Clocks and ages move between two messages; the curves scroll.
  setInterval(render, 1000);
  requestAnimationFrame(glide);
}
start();
