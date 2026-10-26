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
const TABS = [['board', 'Classement', 'Class.', '🏆'], ['chrono', 'Chronométrage', 'Chrono', '⏱️'], ['car', 'Véhicule & énergie', 'Voiture', '🏎️'], ['tele', 'Télémétrie & graphes', 'Télém.', '📊'], ['map', 'Carte en direct', 'Carte', '🗺️']];
const MODES = [['all', 'Général', '🏆'], ['rel', 'Relatif', '⏱️'], ['opp', 'Opposants', '⚔️']];
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
  app.innerHTML = `<div class="pw-card pw-empty"><h1>Mur des stands</h1><p>${esc(error.message)}</p>${action}</div>`;
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
// The place shown everywhere: the race's order in a race, the best laps' otherwise (the game's own differs in practice).
const placeOf = (feed, car) => (isRace(feed.snap.session) && car.place) || order(feed).indexOf(car) + 1;
// LMU's class names, as read: LMP2_ELMS → LMP2 ELMS.
const clsName = cls => String(cls || '').replace(/_/g, ' ').toUpperCase();
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
// PitData's look: dark framed cards, one title bar each, bright colours for what counts (cyan: us and the live lap,
// purple: the class's best, green: our best and what is fine, yellow: car numbers and fuel, red: what is wrong).

const card = (title, body, extra = '', cls = '') => `<div class="pw-card${cls ? ` ${cls}` : ''}"><div class="pw-card-head"><h2>${title}</h2>${extra}</div>${body}</div>`;
const box = (label, value, sub = '', cls = '') => `<div class="pw-box${cls ? ` ${cls}` : ''}"><span>${label}</span><b>${value}</b>${sub ? `<small>${sub}</small>` : ''}</div>`;
const chip = (text, cls = '') => `<span class="pw-chip${cls ? ` ${cls}` : ''}">${text}</span>`;
const lastFrame = feed => { const list = teles.get(feed.key) || [], last = list.at(-1); return last && performance.now() / 1000 - last.t < 3 ? last : null; };
const gearText = gear => gear === 0 ? 'N' : gear < 0 ? 'R' : gear;

function header(feed) {
  const link = !view.connected ? `<span class="pw-pill late"><i></i>Reconnexion…</span>`
    : !feed ? `<span class="pw-pill off"><i></i>En attente pilote</span>`
      : isLive(feed) ? `<span class="pw-pill on"><i></i>Pilote en direct</span>` : `<span class="pw-pill late"><i></i>Il y a ${clock(age(feed))}</span>`;
  const rate = feed && isLive(feed) && view.rate >= 2 ? `<span class="pw-hz">⚡ ${fr(view.rate, 0)} Hz</span>` : '';
  const full = document.fullscreenEnabled ? `<button class="pw-icon" type="button" data-full aria-label="${document.fullscreenElement ? 'Quitter le plein écran' : 'Plein écran'}">${document.fullscreenElement ? '🗗' : '⛶'}</button>` : '';
  const session = feed ? `<div class="pw-session"><span>${esc(sessionName(feed.snap.session))}</span><b>${clock(timeLeft(feed))}</b></div>` : '';
  return `<div class="pw-top pw-card">
    <a class="pw-brand" href="/" aria-label="Retour à l’accueil Endurance Manager"><img src="/images/endurance-manager-logo.webp" alt="" width="30" height="30"><b>Mur des stands</b></a>
    ${session}<div class="pw-status">${link}${rate}${full}</div></div>`;
}

function driverCard(feed) {
  const snap = feed.snap, me = meOf(feed), sorted = order(feed), classPlace = sorted.filter(car => car.cls === me.cls).indexOf(me) + 1;
  return `<div class="pw-driver pw-card">
    <div class="pw-carnum">#${esc(me.num || '--')}</div>
    <div class="pw-who"><b>${esc(snap.me.driver || feedName(feed))}</b><span>${esc(snap.me.car || model(me))}</span></div>
    <div class="pw-facts">
      <div><span>Position</span><b>P${placeOf(feed, me)}</b></div>
      <div><span>${esc(clsName(me.cls) || 'Catégorie')}</span><b style="color:${classColor(me.cls)}">P${classPlace}</b></div>
      <div><span>Tour</span><b>${(me.laps || 0) + 1}</b></div>
    </div>
    <div class="pw-track">📍 ${esc(snap.track)}</div></div>`;
}

function carsStrip() {
  const list = feedList();
  if (list.length < 2) return '';
  return `<div class="pw-cars" role="group" aria-label="Voiture suivie">${list.map(feed => `<button type="button" data-feed="${esc(feed.key)}" aria-pressed="${feed.key === view.key}">
    <i style="background:${esc(feedColor(feed))}"></i>${esc(feedName(feed))}<small>${esc(feed.snap.me.vehicle)}${isLive(feed) ? '' : ' · hors ligne'}</small></button>`).join('')}</div>`;
}

const tabs = () => `<nav class="pw-tabs pw-card" role="tablist">${TABS.map(([id, label, short, icon], index) => `<button type="button" role="tab" data-tab="${id}" aria-selected="${view.tab === id}">
  <span class="pw-tab-icon" aria-hidden="true">${icon}</span><span class="pw-long">${label}</span><span class="pw-short">${short}</span><kbd>${index + 1}</kbd></button>`).join('')}</nav>`;

// A gap as PitData shows it: seconds, or laps once a lap down.
const gapText = (seconds, laps) => known(laps) && laps > 0 ? `+${laps} T` : known(seconds) ? `+${fr(seconds, 3)}s` : '—';
// The game counts stops only in some sessions (0 in practice): our own are the ones the plugin measured.
const stopsOf = (feed, car) => car.id === feed.snap.me.id ? Math.max(car.stops || 0, (feed.ours.stops || []).length) : car.stops ?? 0;
const lastStopOf = (feed, car) => car.id === feed.snap.me.id ? feed.ours.stops?.at(-1)?.lane ?? feed.cars[car.id]?.stop : feed.cars[car.id]?.stop;
function pitCell(feed, car) {
  if (car.pit === 2) return chip('GARAGE', 'warn');
  if (car.pit) return chip('PIT IN', 'warn');
  const last = lastStopOf(feed, car);
  return `<b>${stopsOf(feed, car)}</b>${known(last) ? chip(`${fr(last, 1)}s`, 'stop') : ''}`;
}
const clsPill = cls => `<span class="pw-cls" style="--cls:${classColor(cls)}">${esc(clsName(cls) || '—')}</span>`;
// The game gives 0 for a car whose tank it does not share (other players online): shown as unknown.
function tankCell(car) {
  if (!(known(car.tank) && car.tank > 0)) return '<span class="pw-dim">—</span>';
  const level = Math.max(0, Math.min(100, car.tank)), color = level < 15 ? 'var(--pw-red)' : level < 35 ? 'var(--pw-yellow)' : 'var(--pw-green)';
  return `<span class="pw-tank" style="--tank:${level}%;--bar:${color}"><b>${fr(level, 0)}%</b><i></i></span>`;
}
const numCell = car => `<td class="pw-num">#${esc(car.num || '')}</td>`;
const nameCell = car => `<td class="pw-name"><b>${esc(car.driver)}</b></td>`;

function board(feed) {
  const snap = feed.snap, race = isRace(snap.session);
  const classes = [...new Set(snap.field.map(car => car.cls).filter(Boolean))];
  if (view.cls !== 'all' && !classes.includes(view.cls)) view.cls = 'all';
  const modes = `<div class="pw-seg" role="group" aria-label="Vue">${MODES.map(([id, label, icon]) => `<button type="button" data-mode="${id}" aria-pressed="${view.mode === id}">${icon} ${label}</button>`).join('')}</div>`;
  const chips = view.mode === 'all' && classes.length > 1 ? `<div class="pw-filters" role="group" aria-label="Catégorie"><button type="button" data-cls="all" aria-pressed="${view.cls === 'all'}">Toutes les classes</button>${classes.map(cls => `<button type="button" data-cls="${esc(cls)}" aria-pressed="${view.cls === cls}" style="--cls:${classColor(cls)}">${esc(clsName(cls))}</button>`).join('')}</div>` : '';
  const body = view.mode === 'rel' ? relative(feed) : view.mode === 'opp' ? opponents(feed) : general(feed, race);
  const title = view.mode === 'rel' ? 'Relatif sur la piste' : view.mode === 'opp' ? `Opposants ${esc(meOf(feed)?.cls || '')}` : 'Classement en direct';
  return card(`🏆 ${title} <small>${snap.field.length} concurrents</small>`, `${chips}${body}`, modes);
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
    const gap = race ? place === 1 ? '<span class="pw-green">LEADER</span>' : gapText(info.lead, info.leadLaps)
      : car.best > 0 && bestOf.get(car.cls) ? place === 1 ? '<span class="pw-green">MEILLEUR</span>' : `+${fr(car.best - bestOf.get(car.cls), 3)}s` : '—';
    const best = car.best > 0 ? `<span class="${car.best === bestOf.get(car.cls) ? 'pw-purple' : 'pw-green'}">${lapTime(car.best)}</span>` : '—';
    return `<tr class="${ours ? 'us' : ''}">
      <td class="pw-pos">P${placeOf(feed, car)}</td>${numCell(car)}<td class="pw-opt">${clsPill(car.cls)}</td>
      ${nameCell(car)}<td class="pw-team pw-opt2">${esc(model(car))}</td>
      <td class="pw-n">${gap}</td><td class="pw-n pw-opt">${car.laps ?? '—'}</td><td class="pw-n pw-opt">${lapTime(car.last)}</td>
      <td class="pw-n">${best}</td><td class="pw-n pw-opt">${tankCell(car)}</td><td class="pw-n pw-stand">${pitCell(feed, car)}</td></tr>`;
  }).join('');
  return `<div class="pw-table"><table><thead><tr><th>Pos</th><th class="pw-yellow">#</th><th class="pw-opt">Cat</th><th>Pilote / équipe</th><th class="pw-opt2">Équipe</th><th class="pw-n">${race ? 'Écart leader' : 'Écart'}</th>
    <th class="pw-n pw-opt">Tours</th><th class="pw-n pw-opt">Dernier tour</th><th class="pw-n">Meilleur tour</th><th class="pw-n pw-opt" title="Réservoir ou énergie virtuelle restante">Énergie virt.</th><th class="pw-n">Stands / arrêt</th></tr></thead><tbody>${rows}</tbody></table></div>`;
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
  const rows = shown.map(({car, gap, laps}) => `<tr class="${car.id === me.id ? 'us' : laps < 0 ? 'down' : laps > 0 ? 'up' : ''}">
    <td class="pw-pos">P${placeOf(feed, car)}</td>${numCell(car)}<td class="pw-opt">${clsPill(car.cls)}</td>${nameCell(car)}
    <td class="pw-n pw-big">${car.id === me.id ? '' : `${signed(gap, 1)}s`}</td><td class="pw-n pw-opt">${laps ? `${laps > 0 ? '+' : '−'}${Math.abs(laps)} T` : ''}</td>
    <td class="pw-n">${lapTime(car.last)}</td><td class="pw-n pw-stand">${car.pit ? chip(car.pit === 2 ? 'GARAGE' : 'PIT IN', 'warn') : ''}</td></tr>`).join('');
  return `<div class="pw-table"><table><thead><tr><th>Pos</th><th class="pw-yellow">#</th><th class="pw-opt">Cat</th><th>Pilote / équipe</th><th class="pw-n">Sur nous</th><th class="pw-n pw-opt">Tours</th><th class="pw-n">Dernier tour</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>
    <p class="pw-note">Secondes sur la piste à notre rythme : + devant nous, − derrière. <span class="pw-blue">Bleu</span> : on lui prend un tour, <span class="pw-orange">orange</span> : il nous prend un tour.</p>`;
}

// Our class only, to read each car's strategy: its gap to us, its pace over 5 laps, the tyres it has on, its damage, what
// is left in its tank, what a lap uses (5-lap average) and how many laps that lasts. Raw figures, no advice.
const COMPOUNDS = [[/wet|rain|pluie/i, 'W'], [/soft|tendre/i, 'S'], [/hard|dur/i, 'H'], [/med/i, 'M']];
function tyreCell(name) {
  if (!name) return '<span class="pw-dim">—</span>';
  const letter = COMPOUNDS.find(([test]) => test.test(name))?.[1] || name[0].toUpperCase();
  return `<span class="pw-compound ${letter}" title="${esc(name)}">${esc(letter)}</span>`;
}
function damageCell(value) {
  if (!known(value)) return '<span class="pw-dim">—</span>';
  return value <= 0 ? chip('AUCUN', 'good') : value < 30 ? chip('LÉGERS', 'warn') : value < 65 ? chip('MOYENS', 'bad') : chip('GRAVES', 'bad');
}
function opponents(feed) {
  const snap = feed.snap, me = meOf(feed), race = isRace(snap.session);
  if (!me) return '';
  const mine = order(feed).filter(car => car.cls === me.cls), our = feed.cars[me.id] || {};
  const lead = car => car === mine[0] ? {s:0, laps:0} : {s:feed.cars[car.id]?.lead ?? null, laps:feed.cars[car.id]?.leadLaps ?? 0};
  const us = lead(me);
  const rows = mine.map((car, index) => {
    const info = feed.cars[car.id] || {}, them = lead(car), ours = car === me;
    // In a race + ahead of us; in practice, the best lap's difference (+ slower than ours).
    const laps = us.laps - them.laps;
    const value = ours ? null : race && (them.laps || us.laps) ? laps ? `${laps > 0 ? '+' : '−'}${Math.abs(laps)} T` : '—'
      : race && known(them.s) && known(us.s) ? `${signed(us.s - them.s, 1)}s` : car.best > 0 && me.best > 0 ? `${signed(car.best - me.best, 3)}s` : '—';
    const gap = value === null ? '' : `<span class="${/^\+/.test(value) ? 'pw-red' : /^−/.test(value) ? 'pw-green' : ''}">${value}</span>`;
    const diff = known(info.avg5) && known(our.avg5) && !ours ? info.avg5 - our.avg5 : null;
    const pace = known(diff) ? ` <small class="${diff < 0 ? 'pw-red' : 'pw-green'}">${signed(diff, 2)}</small>` : '';
    // Our own car: what our plugin reads of it when the field's row has nothing.
    const compound = car.cmp || (ours ? snap.me.compound : null), damage = car.dmg ?? (ours ? snap.me.damage : null);
    const use = info.use5, left = known(use) && use > 0 && known(car.tank) && car.tank > 0 ? car.tank / use : null;
    const leftTone = !known(left) ? '' : left < 4 ? 'pw-red' : left < 8 ? 'pw-yellow' : 'pw-green';
    return `<tr class="${ours ? 'us' : ''}"><td class="pw-pos">P${index + 1}</td>${numCell(car)}${nameCell(car)}<td class="pw-n pw-big">${gap}</td>
      <td class="pw-n">${lapTime(info.avg5)}${pace}</td><td>${tyreCell(compound)}</td><td class="pw-opt">${damageCell(damage)}</td>
      <td class="pw-n">${tankCell(car)}</td><td class="pw-n pw-opt">${known(use) ? `${fr(use, 1)} %` : '—'}</td><td class="pw-n"><b class="${leftTone}">${known(left) ? `${fr(left, 1)} t` : '—'}</b></td>
      <td class="pw-n pw-opt">${known(info.sinceStop) ? info.sinceStop : '—'}</td><td class="pw-n pw-stand">${pitCell(feed, car)}</td></tr>`;
  }).join('');
  return `<div class="pw-table"><table><thead><tr><th>Pos</th><th class="pw-yellow">#</th><th>Pilote / équipe</th><th class="pw-n">${race ? 'Sur nous' : 'Meilleur / nous'}</th><th class="pw-n">Moy. 5 tours</th>
    <th>Pneus</th><th class="pw-opt">Dégâts</th><th class="pw-n">Énergie</th><th class="pw-n pw-opt">Conso / tour</th><th class="pw-n" title="Énergie restante ÷ conso moyenne sur 5 tours">Tours restants</th>
    <th class="pw-n pw-opt" title="Tours depuis son dernier arrêt">Relais</th><th class="pw-n">Stands / arrêt</th></tr></thead><tbody>${rows}</tbody></table></div>
    <p class="pw-note">${race ? 'Écart en course : + devant nous, − derrière.' : 'Meilleur tour comparé au nôtre : + plus lent.'} Rythme sur 5 tours : <span class="pw-red">rouge</span> plus rapide que nous. Tours restants : énergie ÷ conso moyenne sur 5 tours.</p>`;
}

function chrono(feed) {
  const snap = feed.snap, me = meOf(feed), ours = feed.ours, info = feed.cars[me.id] || {};
  const running = known(snap.me.cur) ? snap.me.cur + (isLive(feed) && !snap.me.pit ? age(feed) : 0) : null;
  const delta = snap.me.pit ? null : snap.me.delta;
  const lastS = info.lastSectors || [null, null, null], bestS = ours.bestSectors || [null, null, null], avgS = ours.sectors5 || [null, null, null];
  // The class's best sectors: the best each car of our class did.
  const classS = [0, 1, 2].map(index => { const values = snap.field.filter(car => car.cls === me.cls).map(car => feed.cars[car.id]?.best?.[index]).filter(value => known(value) && value > 0); return values.length ? Math.min(...values) : null; });
  const sum = list => list.every(known) ? list.reduce((a, b) => a + b, 0) : null;
  const sec = value => known(value) ? fr(value, 3) : '--.---';
  const colour = (value, index) => !known(value) ? '' : known(classS[index]) && value <= classS[index] + 0.001 ? 'pw-purple' : known(bestS[index]) && value <= bestS[index] + 0.001 ? 'pw-green' : '';
  const sectors = [0, 1, 2].map(index => `<div class="pw-sector"><span class="pw-sec">S${index + 1}</span>
    <b class="${colour(lastS[index], index)}">${sec(lastS[index])}</b><b>${sec(avgS[index])}</b><b class="pw-green">${sec(bestS[index])}</b><b class="pw-purple">${sec(classS[index])}</b></div>`).join('');
  const classBest = Math.min(...snap.field.filter(car => car.cls === me.cls && car.best > 0).map(car => car.best));
  const record = me.best > 0 && me.best <= classBest + 0.001;
  const laps = [...(ours.laps || [])].reverse();
  const timed = laps.filter(lap => lap.t > 0 && !lap.pit).map(lap => lap.t), best = timed.length ? Math.min(...timed) : null;
  const history = laps.length ? laps.map(lap => `<tr><td class="pw-pos">T${lap.n}</td><td class="pw-n${lap.t && lap.t === best ? ' pw-green' : ''}">${lapTime(lap.t)}</td>
    <td class="pw-n">${lap.t && lap.t === best ? chip('RECORD', 'good') : known(best) && lap.t > 0 ? `+${fr(lap.t - best, 3)}s` : '—'}</td>
    ${[0, 1, 2].map(index => `<td class="pw-n pw-opt">${known(lap.s?.[index]) ? fr(lap.s[index], 3) : '—'}</td>`).join('')}
    <td class="pw-n pw-yellow">${known(lap.fuel) ? `${fr(lap.fuel, 2)} L` : '—'}</td><td class="pw-n pw-cyan">${known(lap.ve) ? `${fr(lap.ve, 2)} %` : '—'}</td>
    <td class="pw-name pw-opt">${esc(lap.driver || '')}</td><td class="pw-stand">${lap.pit ? chip('STAND', 'warn') : ''}</td></tr>`).join('')
    : '<tr><td colspan="10" class="pw-note">Les tours s’ajoutent ici à chaque passage sur la ligne.</td></tr>';
  const limits = known(snap.me.limits) ? snap.me.limits : 0, pen = me.pen ?? 0, clean = !limits && !pen;
  return `<div class="pw-grid pw-chrono-grid">
    ${card('⏱️ Chronométrage', `<div class="pw-session-pill">Temps restant <b>${clock(timeLeft(feed))}</b></div>
      <div class="pw-hero"><div class="pw-box pw-lapno"><span>Tour actuel</span><b>T ${(me.laps || 0) + 1}</b></div>
        <div class="pw-box pw-live"><span>Temps au tour en direct</span><b>${lapTime(running)}</b></div></div>
      <div class="pw-row3">
        ${box('Delta meilleur', known(delta) ? `${signed(delta, 3)}s` : '—', known(delta) ? delta < 0 ? 'plus rapide que notre meilleur' : 'plus lent que notre meilleur' : '', known(delta) ? delta < 0 ? 'good' : 'bad' : '')}
        ${box('Dernier tour', lapTime(me.last), 'tour précédent')}
        ${box('Meilleur tour', lapTime(me.best), record ? 'meilleur de la catégorie' : 'record perso de séance', record ? 'purple' : 'good')}
      </div>`)}
    ${card('🚩 Secteurs du tour', `<div class="pw-sector pw-sector-head"><span></span><span>Dernier</span><span>Moy. 5</span><span>Perso</span><span>Catégorie</span></div>${sectors}
      <div class="pw-sector pw-sector-foot"><span class="pw-sec">Σ</span><b>${lapTime(me.last)}</b><b>${lapTime(ours.avg5)}</b><b class="pw-green">${lapTime(sum(bestS))}</b><b class="pw-purple">${lapTime(sum(classS))}</b></div>`)}
    ${card('🚫 Limites de piste', `<div class="pw-row2">${box('Points', fr(limits, limits % 1 ? 1 : 0), 'cette séance', limits ? 'warn' : 'good')}${box('Pénalités', pen, '', pen ? 'bad' : 'good')}</div>`,
      chip(clean ? 'CONFORME' : 'ATTENTION', clean ? 'good' : 'warn'))}
  </div>
  ${card(`📜 Historique des tours <small>${laps.length} tours</small>`, `<div class="pw-table"><table><thead><tr><th>Tour</th><th class="pw-n">Temps</th><th class="pw-n">Écart</th><th class="pw-n pw-opt">S1</th><th class="pw-n pw-opt">S2</th><th class="pw-n pw-opt">S3</th>
    <th class="pw-n">Carburant</th><th class="pw-n">Énergie</th><th class="pw-opt">Pilote</th><th></th></tr></thead><tbody>${history}</tbody></table></div>`)}`;
}

// Colours of temperatures: blue cold, green in its window, yellow then red too hot.
const tyreColor = value => !known(value) ? 'var(--pw-muted)' : value < 60 ? 'var(--pw-blue)' : value < 75 ? 'var(--pw-cyan)' : value <= 100 ? 'var(--pw-green)' : value <= 110 ? 'var(--pw-yellow)' : 'var(--pw-red)';
const brakeColor = value => !known(value) ? 'var(--pw-muted)' : value < 250 ? 'var(--pw-blue)' : value <= 650 ? 'var(--pw-green)' : value <= 850 ? 'var(--pw-orange)' : 'var(--pw-red)';
const wearColor = value => !known(value) ? 'var(--pw-muted)' : value > 60 ? 'var(--pw-green)' : value > 35 ? 'var(--pw-yellow)' : 'var(--pw-red)';

function car(feed) {
  const snap = feed.snap, me = snap.me, control = me.control || {}, energy = energyOf(feed), pace = ourPace(feed), now = lastFrame(feed);
  const service = me.service, stops = feed.ours.stops || [];
  const stopFor = kind => stationary(kind, {service, energy:known(me.ve) ? me.ve : null, fuel:me.fuel, capacity:me.capacity, stops});
  const gauge = (icon, label, value, max) => `<div class="pw-gauge"><span>${icon} ${label}</span><i style="--level:${known(value) ? Math.max(0, Math.min(100, value / max * 100)) : 0}%"></i><b>${known(value) ? `${fr(value, 0)}°C` : '—'}</b></div>`;
  const setting = (label, value, tone, text = value) => known(value) ? `<div class="pw-set ${tone}"><span>${label}</span><b>${text}</b></div>` : '';
  const settings = [setting('ABS', control.abs, 'red'), setting('Répartition', control.bias, 'red', `${fr(control.bias, 1)}%`),
    setting('TC', control.tc, 'blue'), setting('TC Cut', control.cut, 'blue'), setting('TC Slip', control.slip, 'blue'),
    setting('Carto moteur', control.map, 'yellow'), setting('Migration', control.mig, 'yellow'), setting('Barre AV', control.arbF, 'grey'), setting('Barre AR', control.arbR, 'grey')].join('');
  const cockpit = card('🎛️ Poste de pilotage', `<div class="pw-cockpit">
      <div class="pw-gauges">${gauge('💧', 'Eau', me.water, 130)}${gauge('🛢️', 'Huile', me.oil, 150)}</div>
      <div class="pw-speedo"><b class="pw-gear">${now ? gearText(now.gear) : '–'}</b><div><b class="pw-speed">${now ? fr(now.v, 0) : '—'}</b><span>km/h</span></div></div>
      <div class="pw-pitstate">${box('Stands', me.pit === 2 ? 'GARAGE' : me.pit ? 'PIT LANE' : 'PISTE', '', me.pit ? 'warn' : 'good')}${box('Météo', known(snap.rain) ? `${fr(snap.rain * 100, 0)}% pluie` : '—', known(snap.trackTemp) ? `piste ${fr(snap.trackTemp, 0)}°C · air ${fr(snap.air, 0)}°C` : '')}</div>
    </div>${settings ? `<div class="pw-settings">${settings}</div>` : ''}`);
  const damage = known(me.damage) ? me.damage : null;
  const damageCard = card('🛠️ Dégâts', `<div class="pw-damage" style="--level:${damage || 0}%;--bar:${!damage ? 'var(--pw-green)' : damage < 30 ? 'var(--pw-yellow)' : damage < 65 ? 'var(--pw-orange)' : 'var(--pw-red)'}">
      <b>${known(damage) ? `${fr(damage, 0)}%` : '—'}</b><i></i></div>`,
    known(damage) ? chip(!damage ? 'AUCUN DÉGÂT' : damage < 30 ? 'DÉGÂTS MINEURS' : damage < 65 ? 'DÉGÂTS MOYENS' : 'DÉGÂTS GRAVES', !damage ? 'good' : damage < 65 ? 'warn' : 'bad') : '', 'pw-damage-card');
  // Fuel and virtual energy side by side, each with what it lasts at the 5-lap average.
  const tank = (title, icon, value, unit, full, last, perLap, cls) => {
    const laps = known(value) && perLap > 0 ? value / perLap : null;
    return `<div class="pw-tank-card ${cls}"><div class="pw-tank-head"><span>${icon} ${title}</span><b>${known(value) ? `${fr(value, 1)} ${unit}` : '—'}</b></div>
      <i class="pw-level" style="--level:${known(value) && full > 0 ? Math.max(0, Math.min(100, value / full * 100)) : 0}%"></i>
      <div class="pw-row2">${box('Dernier tour', known(last) ? `${fr(last, 2)} ${unit}` : '—')}${box('Moyenne 5 tours', known(perLap) ? `${fr(perLap, 2)} ${unit}/t` : '—')}
        ${box('Tours estimés', known(laps) ? `${fr(laps, 1)} t` : '—')}${box('Temps restant', known(laps) && pace ? clock(laps * pace) : '—')}</div></div>`;
  };
  const ours = feed.ours, ve = known(me.ve);
  const energyCard = card('⚡ Énergie et consommation', `<div class="pw-row2 pw-tanks${ve ? '' : ' single'}">
      ${tank('Carburant', '⛽', me.fuel, 'L', me.capacity, ours.lastFuel, ours.fuel5, 'fuel')}
      ${ve ? tank('Énergie virtuelle', '⚡', me.ve, '%', 100, ours.lastVe, ours.ve5, 've') : ''}
    </div>
    <h3>🧮 Ravitaillement</h3>
    <div class="pw-row3">
      ${box('Pour finir', known(energy.need) ? `${fr(energy.need, 1)} ${energy.unit}` : '—', known(energy.left) ? `${fr(energy.left, 1)} tours à notre moyenne` : 'à notre moyenne')}
      ${box('Il manque', known(energy.missing) ? `${fr(energy.missing, 1)} ${energy.unit}` : '—', 'en plus de ce qu’il reste', energy.missing > 0 ? 'warn' : 'good')}
      ${box('Arrêts', known(energy.stops) ? energy.stops : '—', 'pleins pour aller au bout')}
      ${box('Plein', known(energy.room) ? `${fr(energy.room, 1)} ${energy.unit}` : '—', 'place libre')}
      ${box('Arrêt plein', known(stopFor('energy')) ? `${fr(stopFor('energy'), 1)} s` : '—', 'immobile')}
      ${box('Plein + 4 pneus', known(stopFor('tyres')) ? `${fr(stopFor('tyres'), 1)} s` : '—', 'immobile')}
    </div>`);
  const wheel = (w, index) => {
    const wear5 = ours.wear5?.[index], lastWear = ours.laps?.at(-1)?.wear?.[index];
    return `<div class="pw-wheel"><div class="pw-wheel-head"><b>${WHEELS[index]}</b>${me.compound ? chip(esc(me.compound.toUpperCase()), 'compound') : ''}<span>Pression <b class="pw-cyan">${known(w.kpa) ? fr(w.kpa, 0) : '—'}</b> kPa</span></div>
      <div class="pw-wheel-body${index % 2 ? ' right' : ''}">
        <div class="pw-tyre" style="--temp:${tyreColor(w.carcass)}"><b>${known(w.carcass) ? `${fr(w.carcass, 0)}°C` : '—'}</b><small>carcasse</small></div>
        <div class="pw-brake" style="--temp:${brakeColor(w.brake)}"><i></i><b>${known(w.brake) ? `${fr(w.brake, 0)}°C` : '—'}</b><small>frein</small></div>
      </div>
      <div class="pw-row3">${box('Restante', `<span style="color:${wearColor(w.left)}">${known(w.left) ? `${fr(w.left, 1)}%` : '—'}</span>`)}${box('Moyenne', known(wear5) ? `${fr(wear5, 2)}%/t` : '—')}${box('Dernier tour', known(lastWear) ? `${fr(lastWear, 2)}%` : '—')}</div></div>`;
  };
  const tyres = card('🛞 Pneus et freins', `<div class="pw-wheels">${me.wheels.map(wheel).join('')}</div>`);
  return `<div class="pw-grid pw-car-top">${cockpit}${damageCard}</div><div class="pw-grid pw-car-bottom">${energyCard}${tyres}</div>`;
}

// The last minute of our car as curves (drawn into the canvases after each redraw), and our laps as graphs.
const CURVES = [['pedals', [['Accélérateur', 'green'], ['Frein', 'red']], now => now ? `Accél. <b class="pw-green">${fr(now.throttle, 0)}%</b> Frein <b class="pw-red">${fr(now.brake, 0)}%</b>` : ''],
  ['v', [['Vitesse (km/h)', 'cyan'], ['Rapport', 'purple']], now => now ? `Vitesse <b class="pw-cyan">${fr(now.v, 0)} km/h</b> Rapport <b class="pw-purple">${gearText(now.gear)}</b>` : ''],
  ['steer', [['Volant (%)', 'yellow']], now => now ? `Volant <b class="pw-yellow">${signed(now.steer, 0)}%</b>` : '']];
function tele(feed) {
  const list = teles.get(feed.key) || [], now = lastFrame(feed);
  const pedal = (label, value, cls) => `<div class="pw-pedal ${cls}"><i style="--level:${known(value) ? Math.max(0, Math.min(100, value)) : 0}%"></i><b>${known(value) ? `${fr(value, 0)}%` : '—'}</b><span>${label}</span></div>`;
  const steer = known(now?.steer) ? Math.max(-100, Math.min(100, now.steer)) : 0;
  const live = card('🕹️ Pédales et volant', `<div class="pw-tele-live">
      <div class="pw-panel pw-pedals">${pedal('Frein', now?.brake, 'brake')}${pedal('Accél.', now?.throttle, 'gas')}</div>
      <div class="pw-panel pw-wheelbar"><span>Direction (volant) <b>${now ? `${signed(now.steer, 0)}%` : '—'}</b></span><div class="pw-steer"><i style="left:${50 + steer / 2}%"></i></div></div>
      <div class="pw-panel pw-speedo small"><b class="pw-gear">${now ? gearText(now.gear) : '–'}</b><div><b class="pw-speed">${now ? fr(now.v, 0) : '—'}</b><span>km/h</span></div></div>
    </div>`);
  const status = `<div class="pw-acq pw-card"><span class="pw-pill ${now ? 'on' : 'off'}"><i></i>${now ? 'Acquisition en direct' : 'En attente des données'}</span><small>Fenêtre glissante : 60 secondes</small></div>`;
  const curves = list.length ? CURVES.map(([id, legend, values]) => `<div class="pw-card pw-curve"><div class="pw-card-head">${legend.map(([label, tone]) => chip(label.toUpperCase(), `line ${tone}`)).join('')}<span class="pw-curve-now">${values(now)}</span></div><canvas data-curve="${id}" height="150"></canvas></div>`).join('')
    : '<p class="pw-note">Les courbes arrivent quand le pilote roule avec le plugin 2.0 et que cette page est ouverte.</p>';
  return `${live}${status}${curves}${card('📊 Nos tours', lapGraphs(feed))}`;
}

// One bar per lap: its time (pit laps faded) and what it used.
function lapGraphs(feed) {
  const laps = (feed.ours.laps || []).slice(-40);
  const timed = laps.filter(lap => lap.t > 0 && !lap.pit).map(lap => lap.t);
  if (timed.length < 2) return '<p class="pw-note">Les graphes s’affichent après deux tours chronométrés.</p>';
  const graph = (title, pick, digits, unit, tone) => {
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
    return `<figure class="pw-graph ${tone}"><figcaption>${chip(title.toUpperCase(), `line ${tone}`)} <small>tours ${laps[0].n} à ${laps.at(-1).n} · ${digits === 'lap' ? `${lapTime(low)} à ${lapTime(high)}` : `${fr(low, digits)} à ${fr(high, digits)} ${unit}`}</small></figcaption>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label="${title} par tour">${bars}</svg></figure>`;
  };
  const ve = laps.some(lap => known(lap.ve));
  return `${graph('Temps au tour', lap => lap.t > 0 ? lap.t : null, 'lap', '', 'cyan')}${graph(ve ? 'Énergie par tour' : 'Carburant par tour', lap => ve ? lap.ve : lap.fuel, 2, ve ? '%' : 'L', ve ? 'cyan' : 'yellow')}`;
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
    ctx.strokeStyle = style.getPropertyValue('--pw-grid'); ctx.lineWidth = 1;
    for (const y of [0.25, 0.5, 0.75]) { ctx.beginPath(); ctx.moveTo(0, y * height); ctx.lineTo(width, y * height); ctx.stroke(); }
    for (const x of [0.25, 0.5, 0.75]) { ctx.beginPath(); ctx.moveTo(x * width, 0); ctx.lineTo(x * width, height); ctx.stroke(); }
    const line = (pick, color, min, max) => {
      ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.shadowColor = color; ctx.shadowBlur = 6; ctx.beginPath();
      let open = false, before = null;
      for (const item of list) {
        const value = pick(item);
        if (item.t < start || !known(value) || (before && item.t - before.t > 1)) { open = false; before = item; if (!known(value)) continue; }
        const x = (item.t - start) / 60 * width, y = height - 4 - (Math.max(min, Math.min(max, value)) - min) / (max - min) * (height - 8);
        if (open) ctx.lineTo(x, y); else { ctx.moveTo(x, y); open = true; }
        before = item;
      }
      ctx.stroke();
      ctx.shadowBlur = 0;
    };
    const kind = canvas.dataset.curve, color = name => style.getPropertyValue(`--pw-${name}`);
    if (kind === 'v') { line(item => item.v, color('cyan'), 0, Math.max(100, ...list.map(item => item.v || 0))); line(item => item.gear, color('purple'), 0, Math.max(6, ...list.map(item => item.gear || 0))); }
    if (kind === 'pedals') { line(item => item.throttle, color('green'), 0, 100); line(item => item.brake, color('red'), 0, 100); }
    if (kind === 'steer') line(item => item.steer, color('yellow'), -100, 100);
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
  const classes = [...new Set(snap.field.map(car => car.cls).filter(Boolean))];
  const head = `${chip(esc(snap.track.toUpperCase()), 'line cyan')}${known(snap.length) ? chip(`${fr(snap.length / 1000, 2)} km`) : ''}${chip(`${cars.length} voitures`)}
    <div class="pw-legend">${classes.map(name => `<span><i style="background:${classColor(name)}"></i>${esc(clsName(name))}</span>`).join('')}<span><i class="us"></i>NOUS</span></div>`;
  if (!points.length) { frame = null; return card('🗺️ Carte du circuit en direct', '<p class="pw-note">Les positions arrivent dès que la voiture roule.</p>', head); }
  const xs = points.map(p => p[0]), zs = points.map(p => p[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minZ = Math.min(...zs), maxZ = Math.max(...zs);
  const k = 940 / (Math.max(maxX - minX, maxZ - minZ) || 1);
  frame = {feed, minX, maxZ, k};
  const width = (maxX - minX) * k + 60, height = (maxZ - minZ) * k + 60;
  const px = v => (30 + (v - minX) * k).toFixed(1), pz = v => (30 + (maxZ - v) * k).toFixed(1);
  const path = lines.map(line => `M${line.points.map(([x, z]) => `${px(x)},${pz(z)}`).join('L')}${line.closed ? 'Z' : ''}`).join('');
    const dot = (car, fill, r, ours = false) => { const [x, z] = placed(feed, car);
    return `<g data-car="${car.id}"${ours ? ' class="us"' : ''} transform="translate(${px(x)},${pz(z)})"><circle r="${r}" fill="${fill}"/><text dy="0.36em">${placeOf(feed, car)}</text></g>`; };
  const others = cars.filter(car => car.id !== snap.me.id).map(car => dot(car, classColor(car.cls), 11)).join('');
  const me = cars.find(car => car.id === snap.me.id);
  return card('🗺️ Carte du circuit en direct', `<div class="pw-map-box"><svg class="pw-map" viewBox="0 0 ${width.toFixed(0)} ${height.toFixed(0)}" role="img" aria-label="Position des voitures sur le circuit">
    ${path ? `<path class="road" d="${path}"/><path class="line" d="${path}"/>` : ''}${others}${me ? dot(me, 'var(--pw-cyan)', 15, true) : ''}</svg></div>`, head, 'pw-map-card');
}

function glide() {
  requestAnimationFrame(glide);
  if (still || document.hidden || !frame || view.tab !== 'map') return;
  const svg = app.querySelector('.pw-map');
  if (!svg) return;
  const {feed, minX, maxZ, k} = frame, field = new Map(feed.snap.field.map(car => [car.id, car]));
  for (const node of svg.querySelectorAll('[data-car]')) {
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
    app.innerHTML = `${header(null)}<div class="pw-card pw-empty"><h1>Personne ne roule en ce moment</h1>
      <p>Le mur s’allume dès qu’un pilote de l’équipe roule avec le plugin SimHub, « Partager ma voiture en direct » coché. Cette page se met à jour toute seule.</p></div>`;
    return;
  }
  const scroll = window.scrollY;
  app.innerHTML = `${header(feed)}${driverCard(feed)}${carsStrip()}${tabs()}<div class="pw-panel-wrap pw-${view.tab}" role="tabpanel">${PANELS[view.tab](feed)}</div>`;
  if (scroll) window.scrollTo(0, scroll);
  if (view.tab === 'tele') drawCurves(feed);
  if (view.tab === 'map') fitMap();
}

// The map fills what is left of the window under the header and tabs, never more: no scrolling to see the track.
function fitMap() {
  const svg = app.querySelector('.pw-map');
  if (!svg) return;
  const top = svg.getBoundingClientRect().top + window.scrollY;
  svg.style.setProperty('--fit', `${Math.max(240, window.innerHeight - top - 52)}px`);
}
window.addEventListener('resize', () => { if (view.tab === 'map') fitMap(); });

function showTab(tab) {
  view.tab = tab;
  history.replaceState(null, '', `#${view.tab}`);
  remember();
  tellView();
  window.scrollTo(0, 0);
  render();
}
app.addEventListener('click', event => {
  const button = event.target.closest('button');
  if (!button) return;
  if (button.dataset.tab) return showTab(button.dataset.tab);
  if (button.dataset.mode) { view.mode = button.dataset.mode; remember(); }
  else if (button.dataset.cls) view.cls = button.dataset.cls;
  else if (button.dataset.feed) view.key = button.dataset.feed;
  else if ('full' in button.dataset) {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else document.documentElement.requestFullscreen().catch(() => {});
    return;
  } else return;
  render();
});
// Keys 1 to 5 open the tabs, as on PitData.
document.addEventListener('keydown', event => {
  if (event.ctrlKey || event.metaKey || event.altKey || /input|textarea|select/i.test(event.target.tagName)) return;
  const tab = TABS[Number(event.key) - 1];
  if (tab) showTab(tab[0]);
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
