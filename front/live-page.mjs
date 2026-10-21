// « Mur des stands » (server/live.mjs, shared/live.mjs): the team's cars live, for the teammates watching (never for
// the pilot at the wheel). Each car whose pilot shares from the SimHub plugin is a feed; the page shows one at a time:
// the standings (session times in practice), the map, our car, and in a race the race panel (time and energy to the
// flag, where we would rejoin after a stop, LMU's fair share, stints and stops). Raw numbers only, no advice.
import {COLORS, conditionOf} from '../shared/combos.mjs';
import {addToPath, fairShare, isRace, lapsLeft, median, outlineLines, patch, readFeed, rejoin, stationary, LIVE_FOR} from '../shared/live.mjs';

const app = document.getElementById('live-app');
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const known = value => value !== null && value !== undefined && Number.isFinite(Number(value));
const fr = (value, digits = 1) => known(value) ? Number(value).toLocaleString('fr-FR', {minimumFractionDigits:digits, maximumFractionDigits:digits}) : '—';
const lapTime = seconds => known(seconds) && seconds > 0 ? `${Math.floor(seconds / 60)}:${(seconds % 60).toFixed(3).padStart(6, '0').replace('.', ',')}` : '—';
const clock = value => { if (!known(value)) return '—'; const s = Math.max(0, Math.round(value)); return `${Math.floor(s / 3600)}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; };
const WHEELS = ['Avant gauche', 'Avant droit', 'Arrière gauche', 'Arrière droit'];
const PIT = ['track', 'pits', 'pits'], PIT_LABEL = ['En piste', 'Aux stands', 'Au garage'];
const STOP_KINDS = [['energy', 'Énergie seule'], ['tyres', 'Énergie + 4 pneus']];

const view = {raw:new Map(), feeds:new Map(), key:null, tab:'car', cls:'all', open:null, stop:'tyres', offset:0, connected:false, error:'', targets:new Map(), started:false};

async function call(path) {
  let response;
  try { response = await fetch(path, {credentials:'same-origin', cache:'no-store', headers:{Accept:'application/json'}}); }
  catch { throw Object.assign(Error('Connexion au site impossible. Vérifie ta connexion puis réessaie.'), {status:0}); }
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(Error(result.error || `Action impossible (${response.status}).`), {status:response.status});
  return result;
}

function renderError(error) {
  const login = error.status === 401 ? `<a class="primary-button" href="/api/auth/discord?return=${encodeURIComponent('/mur-des-stands.html')}">Se connecter avec Discord</a>` : '<a class="secondary-button" href="/lmu/">Retour aux courses</a>';
  app.innerHTML = `<section class="members-panel members-error"><h1>Mur des stands</h1><p>${esc(error.message)}</p>${login}</section>`;
}

// ---------- Live connection ----------

let socket = null, retry = 2000;
function connect() {
  const url = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/combos/live`;
  socket = new WebSocket(url);
  socket.addEventListener('open', () => { view.connected = true; retry = 2000; viewSent = null; tellView(); render(); });
  socket.addEventListener('message', event => {
    let message;
    try { message = JSON.parse(event.data); } catch { return; }
    if (known(message.now)) view.offset = Date.now() - message.now;
    if (message.type === 'hello') { view.raw.clear(); for (const feed of message.feeds || []) keep(feed, message.pos?.[feed.key]); }
    if (message.type === 'feed' && message.feed?.key) keep(message.feed, message.pos);
    // Only what changed since the last message: onto our copy, else everything again.
    if (message.type === 'patch' && message.key) {
      const before = view.raw.get(message.key);
      if (before) keep(patch(before, message.patch), message.pos);
      else tellView(true);
    }
    pick();
    render();
  });
  socket.addEventListener('close', () => {
    view.connected = false;
    render();
    // Closed by the site to check the rights again, or the network dropped: open again, a little later each time.
    setTimeout(connect, retry);
    retry = Math.min(retry * 2, 30000);
  });
}

// The room sends only to a page on screen, and the cars' positions only while it shows the map.
// Wide screens show every panel side by side (styles/live.css), the map included.
let viewSent = null;
const wide = matchMedia('(min-width: 1180px)');
wide.addEventListener('change', () => tellView());
function tellView(again = false) {
  const state = {type:'view', watch:document.visibilityState !== 'hidden', map:view.tab === 'map' || wide.matches};
  const text = JSON.stringify(state);
  if (!socket || socket.readyState !== WebSocket.OPEN || (text === viewSent && !again)) return;
  socket.send(JSON.stringify(again ? {...state, again:true} : state));
  viewSent = text;
}
document.addEventListener('visibilitychange', () => tellView());

// Only the session under way: a car's feed in a new session replaces its earlier ones (and is shown in their place).
// pos: [id, x, z] of the cars, when the map is shown.
function keep(input, pos = null) {
  view.raw.set(input.key, input);
  const feed = readFeed(input, view.feeds.get(input.key));
  if (Array.isArray(pos)) {
    const at = new Map(pos.map(([id, x, z]) => [id, [x, z]]));
    for (const car of feed.snap.field) [car.x, car.z] = at.get(car.id) || [null, null];
  }
  for (const [key, other] of view.feeds) {
    if (key === feed.key || other.snap.me.vehicle !== feed.snap.me.vehicle) continue;
    // Another of us in the same car but in a session of his own: both stay, the strip of cars picks one.
    if (other.pilot?.id && feed.pilot?.id && other.pilot.id !== feed.pilot.id && Math.abs(other.updated - feed.updated) < LIVE_FOR) continue;
    if (other.updated > feed.updated) return;
    view.feeds.delete(key);
    view.raw.delete(key);
    motions.delete(key);
    if (view.key === key) view.key = feed.key;
  }
  view.feeds.set(feed.key, feed);
  record(feed);
  loadLap(feed.snap.track);
}

const age = feed => Math.max(0, (Date.now() - view.offset - feed.updated) / 1000);
const isLive = feed => age(feed) * 1000 < LIVE_FOR;
const feedList = () => [...view.feeds.values()].sort((a, b) => isLive(b) - isLive(a) || b.updated - a.updated);
// The car shown: the one picked, else the live race car, else the most recent.
function pick() {
  const list = feedList();
  if (view.key && view.feeds.has(view.key)) return;
  view.key = (list.find(feed => isLive(feed) && isRace(feed.snap.session)) || list[0])?.key || null;
}
const current = () => view.feeds.get(view.key) || null;
// Two of our feeds in the same session (teammates on track together): same track and kind, the game's clocks agree.
const sameRun = (a, b) => a.snap.track === b.snap.track && a.snap.session === b.snap.session
  && Math.abs(a.snap.et - b.snap.et - (a.updated - b.updated) / 1000) < 10;

// Each pilot's colour on the site, else one of the fiches' colours by name.
const nameColor = name => COLORS[[...String(name || '')].reduce((sum, char) => sum + char.charCodeAt(0), 0) % COLORS.length];
const feedColor = feed => feed.pilot?.color || nameColor(feed.pilot?.name || feed.snap.me.driver);
const driverColor = (feed, name) => name && name === feed.snap.me.driver ? feedColor(feed) : nameColor(name);
const feedName = feed => feed.pilot?.name || feed.snap.me.driver || 'Pilote';

// The fiche combo's energy per lap to hold, as the fiche shows it: the longest stint every pilot holds (the pilot
// using the most sets it), for the condition on track now.
async function loadTarget(feed) {
  const combo = `${feed.snap.track}\u0000${feed.snap.me.car}`;
  if (!feed.snap.me.car || view.targets.has(combo)) return;
  view.targets.set(combo, null);
  try {
    const sheet = await call(`/api/combos/sheet?${new URLSearchParams({track:feed.snap.track, car:feed.snap.me.car})}`);
    view.targets.set(combo, sheet);
    render();
  } catch {}
}
function targetOf(feed) {
  const sheet = view.targets.get(`${feed.snap.track}\u0000${feed.snap.me.car}`);
  if (!sheet) return null;
  const cond = conditionOf(feed.snap.rain, feed.snap.wet);
  const pilots = (sheet.conditions?.[cond]?.drivers || []).filter(row => known(row.ve) && row.ve > 0);
  const worst = pilots.length ? Math.max(...pilots.map(row => row.ve)) : null;
  const laps = worst ? Math.max(2, Math.floor(100 / worst)) : null;
  return {laps, ve:laps ? 100 / laps : null, laneThrough:sheet.pit?.laneThrough ?? null};
}

// ---------- Drawing ----------

function classColor(name) {
  const value = String(name || '').toLowerCase();
  if (/hyper|lmh|lmdh/.test(value)) return 'var(--lw-hyper)';
  if (/p2|lmp/.test(value)) return 'var(--lw-lmp2)';
  if (/gt3|gte|gt/.test(value)) return 'var(--lw-gt3)';
  return 'var(--lw-other)';
}
// The entry's name without its number (shown apart).
const model = car => String(car.vehicle || '').replace(/\s*#\s*\d+\b/, '').trim() || car.vehicle;
const sign = value => value > 0 ? '+' : value < 0 ? '−' : '±';
function delta(value, ref, digits = 2) {
  if (!known(value) || !known(ref)) return '';
  const d = value - ref, kind = Math.abs(d) < 0.005 ? 'same' : d > 0 ? 'up' : 'down';
  return `<em class="${kind}">${sign(d)}${fr(Math.abs(d), digits)}</em>`;
}

function order(feed) {
  const race = isRace(feed.snap.session), field = [...feed.snap.field];
  return race ? field.sort((a, b) => (a.place || 999) - (b.place || 999))
    : field.sort((a, b) => (a.best > 0 ? a.best : 1e9) - (b.best > 0 ? b.best : 1e9));
}

function header(feed) {
  if (!feed) return `<div class="lw-top"><div><div class="lw-crumb">Équipe</div><h1>Mur des stands</h1></div>${linkState(null)}</div>`;
  const snap = feed.snap, race = isRace(snap.session), sorted = order(feed), me = sorted.find(car => car.id === snap.me.id);
  const classPlace = sorted.filter(car => car.cls === me.cls).indexOf(me) + 1;
  const left = snap.end ? snap.end - snap.et - (isLive(feed) ? age(feed) : 0) : null;
  const best = Math.min(...[...view.feeds.values()].filter(item => sameRun(item, feed))
    .map(item => item.snap.field.find(car => car.id === item.snap.me.id)?.best).filter(value => value > 0));
  const facts = race
    ? `<div class="lw-fact"><span>Reste</span><b class="lw-num">${clock(left)}</b></div><div class="lw-fact"><span>Position</span><b class="lw-num">P${me.place || sorted.indexOf(me) + 1} · ${esc(me.cls)} P${classPlace}</b></div><div class="lw-fact"><span>Tour</span><b class="lw-num">${me.laps + 1}</b></div>`
    : `<div class="lw-fact"><span>Séance</span><b class="lw-num">${clock(left)}</b></div><div class="lw-fact"><span>Meilleur de l’équipe</span><b class="lw-num">${lapTime(Number.isFinite(best) ? best : null)}</b></div>`;
  return `<div class="lw-top"><div><div class="lw-crumb">${esc(snap.track)} · ${race ? 'course' : snap.session >= 5 && snap.session <= 8 ? 'qualifications' : 'essais'}</div><h1>Mur des stands</h1></div>
    <div class="lw-facts">${facts}</div>${linkState(feed)}</div>`;
}

function linkState(feed) {
  if (!view.connected) return '<div class="lw-link"><span class="lw-dot late"></span><span>Reconnexion au site…</span></div>';
  if (!feed) return '<div class="lw-link"><span class="lw-dot"></span><span>Relié, en attente d’un pilote</span></div>';
  return isLive(feed) ? '<div class="lw-link"><span class="lw-dot on"></span><span>En direct</span></div>'
    : '<div class="lw-link"><span class="lw-dot"></span><span>Hors ligne</span></div>';
}

function carsStrip() {
  const list = feedList();
  if (list.length < 2) return '';
  return `<div class="lw-cars" role="group" aria-label="Nos voitures">${list.map(feed => {
    const pit = feed.snap.me.pit, live = isLive(feed);
    return `<button type="button" class="lw-car" data-feed="${esc(feed.key)}" aria-pressed="${feed.key === view.key}"><i style="background:${esc(feedColor(feed))}"></i><b>${esc(feedName(feed))}</b>
      <span>${esc(feed.snap.track)}${isRace(feed.snap.session) ? ' · course' : ''}</span><span class="lw-pill ${live ? PIT[pit] : 'off'}">${live ? PIT_LABEL[pit] : 'Hors ligne'}</span></button>`;
  }).join('')}</div>`;
}

function tabs(race) {
  const list = [['board', race ? 'Classement' : 'Temps'], ['car', 'Voiture'], ['map', 'Carte'], ...(race ? [['race', 'Course']] : [])];
  if (!list.some(([key]) => key === view.tab)) view.tab = 'car';
  return `<nav class="lw-tabs" aria-label="Écrans">${list.map(([key, name]) => `<button type="button" data-tab="${key}" aria-pressed="${key === view.tab}">${name}</button>`).join('')}</nav>`;
}

function board(feed) {
  const snap = feed.snap, race = isRace(snap.session), sorted = order(feed), us = snap.me.id;
  const classes = [...new Set(sorted.map(car => car.cls).filter(Boolean))];
  if (view.cls !== 'all' && !classes.includes(view.cls)) view.cls = 'all';
  // One tower per class, like the WEC's TV timing tower, each with its own places and gaps (LMU runs the classes
  // together on track): on a phone. A wide panel shows the full table below instead (styles/live.css).
  const groups = [...new Set(sorted.map(car => car.cls))].filter(name => view.cls === 'all' || name === view.cls).map(name => sorted.filter(car => car.cls === name));
  const split = classes.length > 1;
  const extra = id => feed.cars[id] || {};
  // Our feeds' other cars in this session (practice: teammates on track at the same time).
  const mates = new Map([...view.feeds.values()].filter(item => item.key !== feed.key && sameRun(item, feed))
    .map(item => [item.snap.me.vehicle, item]));
  const bestOfAll = Math.min(...sorted.map(car => car.best > 0 ? car.best : 1e9));
  // Race: measured on track by the room (to the class leader, to the car ahead), in laps once a whole lap down.
  // Practice: best lap against theirs. Nothing rather than a dash when a value is not known.
  const gapRace = (car, ref, name) => {
    const info = extra(car.id);
    return info[`${name}Laps`] ? `+${info[`${name}Laps`]} t` : info[name] > 0 ? `+${fr(info[name], 1)}` : '';
  };
  const gapBest = ref => car => car.best > 0 && ref?.best > 0 ? `+${fr(car.best - ref.best, 3)}` : '';
  const sessionBest = [0, 1, 2].map(index => Math.min(...Object.values(feed.cars).map(item => item.best?.[index]).filter(known)));
  const timeOf = value => value > 0 ? `<span class="${value === bestOfAll ? 'best' : ''}">${lapTime(value)}</span>` : '';
  const line = (car, index, mine) => {
    const info = extra(car.id), mate = car.id === us ? feed : mates.get(car.vehicle), open = view.open === car.id;
    const who = mate ? feedName(mate) : car.driver, overall = race ? car.place || sorted.indexOf(car) + 1 : sorted.indexOf(car) + 1;
    const ahead = index ? (race ? gapRace(car, mine[index - 1], 'ahead') : gapBest(mine[index - 1])(car)) : '';
    const lead = index ? (race ? gapRace(car, mine[0], 'lead') : gapBest(mine[0])(car)) : '';
    // Race: last lap on top, best below; practice the other way round.
    const [main, other] = race ? [car.last, car.best] : [car.best, car.last];
    const stint = car.pit ? 0 : info.sinceStop;
    const facts = [['Tours', car.laps], ['Dernier', car.last > 0 ? timeOf(car.last) : null], ['Meilleur', car.best > 0 ? timeOf(car.best) : null],
      ['Moy. 5 t.', known(info.avg5) ? lapTime(info.avg5) : null], ['Relais', known(stint) ? `${stint} t` : null],
      ['Dernier arrêt', known(info.stop) ? `${fr(info.stop, 1)} s` : null], ['Arrêts', car.stops ?? null], ['Pénalités', car.pen > 0 ? car.pen : null],
      ['Secteurs', info.lastSectors ? info.lastSectors.map((value, k) => `<span class="${value <= sessionBest[k] ? 'best' : value <= info.best?.[k] ? 'pb' : ''}">S${k + 1} ${fr(value, 3)}</span>`).join(' ') : null]]
      .filter(([, value]) => value !== null && value !== undefined && value !== '');
    return `<div class="lw-trow${car.id === us ? ' us' : mate ? ' mate' : ''}${open ? ' open' : ''}" data-car="${car.id}" role="button" tabindex="0" aria-expanded="${open}" style="--us:${esc(mate ? feedColor(mate) : 'inherit')}">
      <div class="t-pos">${split ? index + 1 : overall}${split ? `<small>${overall}e</small>` : ''}</div><div class="t-num">${esc(car.num)}</div>
      <div class="t-who"><b>${car.pit ? `<span class="lw-pill pits">${car.pit === 2 ? 'Garage' : 'Stands'}</span> ` : ''}${esc(who)}</b><small>${esc(model(car))}</small></div>
      <div class="t-times">${car.pit && race ? '<span class="t-muted">aux stands</span>' : timeOf(main)}<small>${timeOf(other)}</small></div>
      <div class="t-gap">${index ? `<b>${ahead}</b><small>${lead}</small>` : '<b>Leader</b>'}</div>
      ${open ? `<dl class="t-more">${facts.map(([name, value]) => `<div><dt>${name}</dt><dd>${value}</dd></div>`).join('')}</dl>` : ''}</div>`;
  };
  const towers = groups.map(cars => `<section class="lw-tower" style="--cls:${classColor(cars[0].cls)}">
    <h3>${esc(cars[0].cls || 'Classement')}<small>${cars.length} voiture${cars.length > 1 ? 's' : ''}</small></h3>
    ${cars.map((car, index) => line(car, index, cars)).join('')}</section>`).join('');
  // A wide panel (computer): the same standings as a full table, one block per class. A column nobody has a value for
  // yet is left out; a single unknown value stays blank.
  const rows = groups.flat(), any = test => rows.some(test);
  const stintOf = car => car.pit ? 0 : extra(car.id).sinceStop;
  const cols = [
    ['Tours', 't-n', () => true, car => car.laps],
    [race ? 'Devant' : 'Écart préc.', 't-g', () => true, (car, index, mine) => index ? `<b>${race ? gapRace(car, mine[index - 1], 'ahead') : gapBest(mine[index - 1])(car)}</b>` : '<b>Leader</b>'],
    ['Leader', 't-g', () => true, (car, index, mine) => index ? (race ? gapRace(car, mine[0], 'lead') : gapBest(mine[0])(car)) : ''],
    ['Dernier', 't-t', () => any(car => car.last > 0), car => car.pit && race ? '<span class="t-muted">aux stands</span>' : timeOf(car.last)],
    ['Meilleur', 't-t', () => any(car => car.best > 0), car => timeOf(car.best)],
    ['Moy. 5 t.', 't-t w-md', () => any(car => known(extra(car.id).avg5)), car => known(extra(car.id).avg5) ? lapTime(extra(car.id).avg5) : ''],
    ...[0, 1, 2].map(k => [`S${k + 1}`, 't-s w-lg', () => any(car => known(extra(car.id).lastSectors?.[k])), car => {
      const info = extra(car.id), value = info.lastSectors?.[k];
      return known(value) ? `<span class="${value <= sessionBest[k] ? 'best' : value <= info.best?.[k] ? 'pb' : ''}">${fr(value, 3)}</span>` : '';
    }]),
    ['Relais', 't-n', () => any(car => known(stintOf(car))), car => known(stintOf(car)) ? `${stintOf(car)} t` : ''],
    ['Arrêt', 't-n w-md', () => any(car => known(extra(car.id).stop)), car => known(extra(car.id).stop) ? `${fr(extra(car.id).stop, 1)} s` : ''],
    ['Arr.', 't-n', () => any(car => known(car.stops)), car => car.stops ?? ''],
    ['Pén.', 't-n', () => any(car => car.pen > 0), car => car.pen > 0 ? car.pen : ''],
  ].filter(([, , shown]) => shown());
  const tableRow = (car, index, mine) => {
    const mate = car.id === us ? feed : mates.get(car.vehicle), who = mate ? feedName(mate) : car.driver;
    const overall = race ? car.place || sorted.indexOf(car) + 1 : sorted.indexOf(car) + 1;
    return `<tr class="${car.id === us ? 'us' : mate ? 'mate' : ''}" style="--us:${esc(mate ? feedColor(mate) : 'inherit')}">
      <td class="t-pos">${split ? index + 1 : overall}${split ? `<small>${overall}e</small>` : ''}</td><td><span class="t-num">${esc(car.num)}</span></td>
      <td class="t-who"><b>${car.pit ? `<span class="lw-pill pits">${car.pit === 2 ? 'Garage' : 'Stands'}</span> ` : ''}${esc(who)}</b><small>${esc(model(car))}</small></td>
      ${cols.map(([, cls, , cell]) => `<td class="${cls}">${cell(car, index, mine)}</td>`).join('')}</tr>`;
  };
  const table = `<table class="lw-wide"><thead><tr><th class="t-pos">Pos</th><th class="t-numh">#</th><th class="t-who">Pilote · voiture</th>${cols.map(([name, cls]) => `<th class="${cls}">${name}</th>`).join('')}</tr></thead>
    ${groups.map(cars => `<tbody style="--cls:${classColor(cars[0].cls)}"><tr class="t-cls"><th colspan="${cols.length + 3}">${esc(cars[0].cls || 'Classement')}<small>${cars.length} voiture${cars.length > 1 ? 's' : ''}</small></th></tr>
      ${cars.map((car, index) => tableRow(car, index, cars)).join('')}</tbody>`).join('')}</table>`;
  return `<h2>${race ? 'Classement' : 'Temps de la séance'} <small>${sorted.length} voitures</small></h2>
    ${classes.length > 1 ? `<div class="lw-chips" role="group" aria-label="Classe">${[['all', 'Toutes'], ...classes.map(name => [name, name])].map(([key, name]) => `<button type="button" data-cls="${esc(key)}" aria-pressed="${key === view.cls}">${esc(name)}</button>`).join('')}</div>` : ''}
    <div class="lw-towers">${towers}</div>${table}`;
}

function carPanel(feed) {
  const snap = feed.snap, me = snap.me, ours = feed.ours, row = snap.field.find(car => car.id === me.id), info = feed.cars[me.id] || {};
  const target = targetOf(feed), energy = known(me.ve);
  const amount = energy ? me.ve : me.fuel, unit = energy ? '%' : 'L';
  const perLap = energy ? ours.ve5 ?? ours.stintVe : ours.fuel5 ?? ours.stintFuel;
  const fill = energy ? me.ve : me.capacity > 0 ? me.fuel / me.capacity * 100 : 0;
  const ref = energy ? target?.ve : null;
  const stint = ours.stints.at(-1);
  const stintLaps = stint ? stint.laps : 0, stintMin = stint ? Math.floor((stint.end - stint.start) / 60) : 0;
  const cur = known(me.cur) ? me.cur + (isLive(feed) && !me.pit ? age(feed) : 0) : null;
  const sectors = info.lastSectors;
  const best = ours.bestSectors;
  const wheel = (index, w) => `<div class="lw-tyre"><div class="t">${WHEELS[index]}</div>
    <div class="lw-tyre-main lw-num"><span>${fr(w.left, 0)}<small> %</small></span><span>${fr(w.carcass, 0)}<small> °C</small></span></div>
    <div class="lw-wear" aria-hidden="true"><i style="width:${known(w.left) ? Math.max(0, Math.min(100, w.left)) : 0}%"></i></div>
    <dl><div><dt>Usure / t.</dt><dd class="lw-num">${known(ours.wear5[index]) ? `${fr(ours.wear5[index], 2)} %` : '—'}</dd></div>
      <div><dt>Pression</dt><dd class="lw-num">${fr(w.kpa, 0)} kPa</dd></div><div><dt>Frein</dt><dd class="lw-num">${fr(w.brake, 0)} °C</dd></div></dl></div>`;
  return `<div class="lw-head"><span class="lw-who"><i style="background:${esc(feedColor(feed))}"></i>${esc(feedName(feed))}</span>
      <span class="lw-meta">${row.num ? `#${esc(row.num)} · ` : ''}${esc(me.car || me.vehicle)}${me.compound ? ` · ${esc(me.compound)}` : ''}</span>
      <span class="lw-pill ${isLive(feed) ? PIT[me.pit] : 'off'}">${isLive(feed) ? PIT_LABEL[me.pit] : 'Hors ligne'}</span></div>
    <div class="lw-carbody"><div class="lw-stack">
    <div class="lw-sub first">
      <h3>${energy ? 'Énergie virtuelle' : 'Carburant'}</h3>
      <div class="lw-row2"><div class="lw-big lw-num">${fr(amount, 1)}<small>${unit}</small></div><div class="lw-meter${energy ? '' : ' grey'}" aria-hidden="true"><i style="width:${Math.max(0, Math.min(100, fill || 0))}%"></i></div></div>
      <dl class="lw-kv"><div><dt>Dernier tour</dt><dd class="lw-num">${fr(energy ? ours.lastVe : ours.lastFuel, 2)} ${unit}${delta(energy ? ours.lastVe : ours.lastFuel, ref)}</dd></div>
        <div><dt>Moy. 5 tours</dt><dd class="lw-num">${fr(energy ? ours.ve5 : ours.fuel5, 2)} ${unit}${delta(energy ? ours.ve5 : ours.fuel5, ref)}</dd></div>
        <div><dt>Moy. du relais</dt><dd class="lw-num">${fr(energy ? ours.stintVe : ours.stintFuel, 2)} ${unit}</dd></div><div><dt>Tours possibles</dt><dd class="lw-num">${known(perLap) && perLap > 0 ? fr(amount / perLap, 1) : '—'}</dd></div></dl>
      ${ref ? `<p class="lw-target">Fiche combo, relais de ${target.laps} tours : <b>${fr(ref, 2)} % / tour à tenir</b></p>` : ''}
    </div>
    <div class="lw-sub"><h3>Rythme <span>tour ${row.laps + 1} en cours</span></h3>
      <div class="lw-lap lw-num">${me.pit ? '—' : lapTime(cur)}</div>
      <table class="lw-sectors lw-num"><thead><tr><th></th><th>S1</th><th>S2</th><th>S3</th><th>Tour</th></tr></thead><tbody>
        <tr><td>Dernier</td>${[0, 1, 2].map(k => `<td class="${sectors && best[k] !== null && sectors[k] <= best[k] ? 'best' : ''}">${fr(sectors?.[k], 3)}</td>`).join('')}<td>${lapTime(row.last)}</td></tr>
        <tr><td>Moy. 5 t.</td>${ours.sectors5.map(value => `<td>${fr(value, 3)}</td>`).join('')}<td>${lapTime(ours.avg5)}</td></tr>
        <tr><td>Meilleur</td>${best.map(value => `<td>${fr(value, 3)}</td>`).join('')}<td class="best">${lapTime(row.best)}</td></tr></tbody></table>
      <div class="lw-stint"><span><b class="lw-num">${stintLaps}</b>tours de relais</span><span><b class="lw-num">${stintMin}</b>min</span>${known(ours.stintAvg) ? `<span><b class="lw-num">${lapTime(ours.stintAvg)}</b>moyenne du relais</span>` : ''}</div>
    </div></div><div class="lw-stack">
    <div class="lw-sub"><h3>Pneus <span>${esc(me.compound)}</span></h3>
      <div class="lw-tyres">${me.wheels.map((w, index) => wheel(index, w)).join('')}</div>
    </div>
    <div class="lw-sub"><h3>Conditions</h3>
      <dl class="lw-cond"><div><dt>Piste</dt><dd class="lw-num">${fr(snap.trackTemp, 1)} °C</dd></div><div><dt>Air</dt><dd class="lw-num">${fr(snap.air, 1)} °C</dd></div>
        <div><dt>Pluie</dt><dd class="lw-num">${known(snap.rain) ? `${fr(snap.rain * 100, 0)} %` : '—'}</dd></div><div><dt>Piste mouillée</dt><dd class="lw-num">${known(snap.wet) ? `${fr(snap.wet * 100, 0)} %` : '—'}</dd></div></dl>
    </div></div></div>`;
}

// Seen from above, north up: x to the right and z up (LMU's world, checked on Le Mans driven clockwise), as the lap
// analysis of the fiches. The outline: a lap the team recorded on this track (the fiches' trace), else the game's map
// of the track, else the path the field drives (the room's, kept from one session to the next, completed with what
// this page sees).
//
// The cars glide: each one is drawn where it was PLAYBACK_DELAY seconds ago in the game's time, between the two
// positions around that moment, so a message coming late or two coming together does not make it stop or jump. A
// step longer than JUMP metres (the pits, back on track) is not drawn as a glide. Not with « reduce motion ».
const PLAYBACK_DELAY = 1.8, JUMP = 400, KEPT = 6;
const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
const motions = new Map();
let frame = null;
function record(feed) {
  if (!feed) return;
  let motion = motions.get(feed.key);
  const snap = feed.snap, seen = performance.now() / 1000;
  // A new session or a restart: from scratch.
  if (motion && (motion.since !== feed.since || snap.et < motion.et - 5)) { motions.delete(feed.key); motion = null; }
  if (!motion) motions.set(feed.key, motion = {since:feed.since, cars:new Map(), offset:null, et:-Infinity, path:null, box:null});
  motion.path = addToPath(motion.path, snap);
  if (snap.et <= motion.et) return;
  motion.et = snap.et;
  // The game's clock against the page's: smoothed, so one late message does not move every car back.
  const offset = snap.et - seen;
  motion.offset = motion.offset === null || Math.abs(offset - motion.offset) > 3 ? offset : motion.offset + (offset - motion.offset) * 0.1;
  for (const car of snap.field) {
    if (!known(car.x) || !known(car.z)) continue;
    // Every place a car was seen on track: the map's frame only grows, so it does not move with the cars.
    if (car.pit !== 2) { const box = motion.box ||= [car.x, car.x, car.z, car.z]; box[0] = Math.min(box[0], car.x); box[1] = Math.max(box[1], car.x); box[2] = Math.min(box[2], car.z); box[3] = Math.max(box[3], car.z); }
    const list = motion.cars.get(car.id) || [];
    list.push({et:snap.et, x:car.x, z:car.z, pit:car.pit});
    if (list.length > KEPT) list.shift();
    motion.cars.set(car.id, list);
  }
}
// Where a car is drawn now, in the game's metres.
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
// A lap recorded on the track by one of us (any car), once per track and page: the whole outline from the start.
const laps = new Map();
async function loadLap(track) {
  if (!track || laps.has(track)) return;
  laps.set(track, null);
  try {
    const result = await call(`/api/combos/outline?${new URLSearchParams({track})}`);
    if (Array.isArray(result.points) && result.points.length > 20) { laps.set(track, result.points); render(); }
  } catch { laps.delete(track); }
}
// The outline to draw: our recorded lap, the game's map, else the room's path with the gaps this page has seen filled.
function outlineFor(feed) {
  const lap = laps.get(feed.snap.track);
  if (lap) return outlineLines(lap);
  if (feed.mapFromGame) return outlineLines(feed.outline);
  const room = feed.outline || [], mine = motions.get(feed.key)?.path || [];
  const merged = mine.length === room.length || !room.length ? mine.map((point, index) => room[index] || point) : room;
  return outlineLines(merged, feed.snap.length);
}

function mapPanel(feed) {
  const snap = feed.snap, lines = outlineFor(feed), outline = lines.flatMap(line => line.points);
  const cars = snap.field.filter(car => known(car.x) && known(car.z) && car.pit !== 2);
  // The frame: the game's map, else every place a car was seen (it only grows, the map does not move with the cars).
  const whole = feed.mapFromGame || laps.get(snap.track), box = whole ? null : motions.get(feed.key)?.box;
  const points = [...outline, ...(box ? [[box[0], box[2]], [box[1], box[3]]] : whole ? [] : cars.map(car => [car.x, car.z]))];
  if (!points.length) { frame = null; return `<h2>Carte</h2><p class="lw-empty">Les positions arrivent dès que la voiture roule.</p>`; }
  const xs = points.map(p => p[0]), zs = points.map(p => p[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minZ = Math.min(...zs), maxZ = Math.max(...zs);
  const size = Math.max(maxX - minX, maxZ - minZ) || 1, k = 940 / size;
  frame = {feed, minX, maxZ, k};
  const width = (maxX - minX) * k + 60, height = (maxZ - minZ) * k + 60;
  const px = v => (30 + (v - minX) * k).toFixed(1), pz = v => (30 + (maxZ - v) * k).toFixed(1);
  const path = lines.map(line => `M${line.points.map(([x, z]) => `${px(x)},${pz(z)}`).join('L')}${line.closed ? 'Z' : ''}`).join('');
  const mates = new Set([...view.feeds.values()].filter(item => item.key !== feed.key && sameRun(item, feed)).map(item => item.snap.me.vehicle));
  // Every car with its place in the standings (in practice, by best lap), ours on top of the others.
  const sorted = order(feed), placeOf = car => (isRace(snap.session) && car.place) || sorted.indexOf(car) + 1;
  const dot = (car, fill, r, ours = false) => { const [x, z] = placed(feed, car);
    return `<g data-car="${car.id}"${ours ? ' class="us"' : ''} transform="translate(${px(x)},${pz(z)})"><circle r="${r}" fill="${fill}"/><text dy="0.36em">${placeOf(car)}</text></g>`; };
  const others = cars.filter(car => car.id !== snap.me.id).map(car => dot(car, classColor(car.cls), mates.has(car.vehicle) ? 22 : 18)).join('');
  const me = cars.find(car => car.id === snap.me.id);
  const us = me ? dot(me, esc(feedColor(feed)), 25, true) : '';
  const classes = [...new Set(snap.field.map(car => car.cls).filter(Boolean))];
  return `<h2>Carte <small>${esc(snap.track)}</small></h2>
    <svg class="lw-mapbox" viewBox="0 0 ${width.toFixed(0)} ${height.toFixed(0)}" role="img" aria-label="Position des voitures sur le circuit">${path ? `<path class="road" d="${path}"/><path class="edge" d="${path}"/>` : ''}${others}${us}</svg>
    <div class="lw-legend">${classes.map(name => `<span><i style="background:${classColor(name)}"></i>${esc(name)}</span>`).join('')}<span><i style="background:${esc(feedColor(feed))};outline:2px solid var(--text)"></i>Nous</span></div>`;
}

// Between two redraws, only the cars move (nothing while the page is hidden or the map not shown).
function glide() {
  requestAnimationFrame(glide);
  if (still || document.hidden || !frame) return;
  const box = document.querySelector('#lw-map .lw-mapbox');
  if (!box || !box.getClientRects().length) return;
  const {feed, minX, maxZ, k} = frame, field = new Map(feed.snap.field.map(car => [car.id, car]));
  for (const node of box.querySelectorAll('[data-car]')) {
    const car = field.get(Number(node.dataset.car));
    if (!car) continue;
    const [x, z] = placed(feed, car);
    node.setAttribute('transform', `translate(${(30 + (x - minX) * k).toFixed(1)},${(30 + (maxZ - z) * k).toFixed(1)})`);
  }
}

// What a stop of this kind costs: the lane on top of the same stretch of track (our stops this session, measured by
// the plugin), plus the time stopped (the game's service times, or our stops of that kind).
function stopLoss(feed, kind) {
  const snap = feed.snap, me = snap.me, ours = feed.ours, target = targetOf(feed);
  const measured = median(ours.stops.map(stop => stop.drive));
  const lap = ours.avg5 || feed.cars[me.id]?.avg5;
  const row = snap.field.find(car => car.id === me.id);
  const rest = lap && snap.length ? 1 - (row.dist || 0) / snap.length : 0;
  const atEntry = (value, perLap) => known(value) ? Math.max(0, value - rest * (perLap || 0)) : null;
  const still = stationary(kind, {service:me.service, energy:known(me.ve) ? atEntry(me.ve, ours.ve5) : null, fuel:atEntry(me.fuel, ours.fuel5), capacity:me.capacity, stops:ours.stops});
  const drive = measured ?? target?.laneThrough ?? null;
  return {drive, measured:measured !== null, still, loss:known(drive) && known(still) ? drive + still : null};
}

function rejoinBlock(feed) {
  const cost = stopLoss(feed, view.stop);
  const result = cost.loss !== null ? rejoin(feed, cost.loss, feed.snap.et + (isLive(feed) ? age(feed) : 0)) : null;
  const chips = `<div class="lw-chips" role="group" aria-label="Type d'arrêt">${STOP_KINDS.map(([key, name]) => `<button type="button" data-stop="${key}" aria-pressed="${key === view.stop}">${name}</button>`).join('')}</div>`;
  if (!result) return `<div class="lw-sub"><h3>Ressortie si arrêt à la fin du tour</h3>${chips}<p class="lw-flag">Pas encore assez de données : il faut les temps de service de la voiture (lus par le plugin au garage ou à l’arrêt) et quelques tours chronométrés.</p></div>`;
  const line = item => `<div><b class="lw-num">${item.gap > 0 ? '+' : '−'}${fr(Math.abs(item.gap), 1)} s <small>±${fr(item.plus, 1)}</small></b><i style="background:${classColor(item.car.cls)}"></i>
    <span>${item.car.num ? `#${esc(item.car.num)} ` : ''}${esc(model(item.car))} <small>${esc(item.car.cls)}${item.pits ? ' · aux stands' : ''}</small></span><small class="lw-num">P${item.car.place || '—'}</small></div>`;
  return `<div class="lw-sub"><h3>Ressortie si arrêt à la fin du tour</h3>${chips}
    <div class="lw-rel">${result.ahead.map(line).join('')}<div class="me"><b class="lw-num">0</b><i style="background:${esc(feedColor(feed))}"></i><span>Nous</span><small class="lw-num">P${result.place} · ${esc(feed.snap.me.cls)} P${result.classPlace}</small></div>${result.behind.map(line).join('')}</div>
    <p class="lw-flag">+ = devant nous à la sortie des stands. Arrêt compté <b class="lw-num">${fr(result.loss, 1)} s</b>.</p></div>`;
}

function fairBlock(feed, left) {
  const fair = fairShare(feed.ours.drivers, left);
  if (!fair.rows.length) return '';
  const rows = fair.rows.map(row => `<tr><td style="color:${esc(driverColor(feed, row.name))};font-weight:600">${esc(row.name)}
      <div class="lw-bar" aria-hidden="true"><i style="width:${fair.end ? Math.min(100, row.laps / (fair.end * 1.6) * 100) : 100}%;background:${esc(driverColor(feed, row.name))}"></i><s style="left:${100 / 1.6}%"></s></div></td>
      <td class="lw-num">${row.laps}</td><td class="lw-num">${row.missingNow ? row.missingNow : '<span class="lw-ok">ok</span>'}</td><td class="lw-num">${row.missingEnd ? row.missingEnd : '<span class="lw-ok">ok</span>'}</td></tr>`).join('');
  return `<div class="lw-sub"><h3>Fair share <span>trait = minimum estimé à l’arrivée</span></h3>
    <p class="lw-flag">Minimum ${fr(fair.share * 100, 1)} % des tours chacun : <b class="lw-num">${fair.now} t.</b> aujourd’hui, ≈ <b class="lw-num">${fair.end} t.</b> à l’arrivée.</p>
    <table class="lw-drive"><thead><tr><th>Pilote</th><th>Tours</th><th>Manque (auj.)</th><th>Manque (arrivée)</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

function racePanel(feed) {
  const snap = feed.snap, me = snap.me, ours = feed.ours, energy = known(me.ve);
  const lap = ours.avg5 || feed.cars[me.id]?.avg5;
  const leftTime = snap.end ? snap.end - snap.et - (isLive(feed) ? age(feed) : 0) : null;
  const left = lapsLeft(snap, lap);
  const perLap = energy ? ours.stintVe ?? ours.ve5 : ours.stintFuel ?? ours.fuel5;
  const need = known(left) && known(perLap) ? left * perLap - (energy ? me.ve : me.fuel) : null;
  const tank = energy ? 100 : me.capacity;
  const stopsLeft = known(need) && tank > 0 ? Math.max(0, Math.ceil(need / tank)) : null;
  const stints = ours.stints.filter(stint => stint.laps > 0 || stint === ours.stints.at(-1));
  return `<h2>Course <small>${known(leftTime) && snap.end ? `${fr(leftTime / 3600, 1)} h restantes sur ${fr(snap.end / 3600, 1)}` : ''}</small></h2>
    <div class="lw-row2"><div class="lw-clock lw-num">${clock(leftTime)}</div><div class="lw-meter grey" aria-hidden="true"><i style="width:${snap.end ? Math.min(100, snap.et / snap.end * 100) : 0}%"></i></div></div>
    <dl class="lw-kv"><div><dt>Tours restants</dt><dd class="lw-num">${known(left) ? `≈ ${fr(left, 0)}` : '—'}</dd></div><div><dt>${energy ? 'Énergie' : 'Carburant'} pour finir</dt><dd class="lw-num">${known(need) ? `${fr(Math.max(0, need), 0)} ${energy ? '%' : 'L'}` : '—'}</dd></div>
      <div><dt>Arrêts restants</dt><dd class="lw-num">${stopsLeft ?? '—'}</dd></div></dl>
    ${rejoinBlock(feed)}
    ${fairBlock(feed, left)}
    ${stints.length ? `<div class="lw-sub"><h3>Relais</h3>
      <table class="lw-stops lw-num"><thead><tr><th>Pilote</th><th>Tours</th><th>Moyenne</th><th>${energy ? 'Énergie' : 'Carbu'}</th><th>Arrêt</th></tr></thead><tbody>
      ${stints.map((stint, index) => [stint, index]).reverse().map(([stint, index]) => {
        const now = stint === ours.stints.at(-1), stop = stint.stop;
        return `<tr class="${now ? 'now' : ''}"><td><i class="lw-pin" style="background:${esc(driverColor(feed, stint.driver))}"></i>${esc(stint.driver || '?')}<small>Relais ${index + 1}${now ? ' · en cours' : ''}</small></td>
          <td>${stint.laps}<small>${Math.round((stint.end - stint.start) / 60)} min</small></td><td>${lapTime(stint.avg)}</td><td>${fr(energy ? stint.ve : stint.fuel, 2)}${energy ? ' %' : ' L'}<small>par tour</small></td>
          <td>${stop ? `${fr(stop.lane, 1)} s<small>${stop.tyres || 0} pneu${stop.tyres > 1 ? 's' : ''}</small>` : '—'}</td></tr>`;
      }).join('')}</tbody></table></div>` : ''}`;
}

function render() {
  if (!view.started) return;
  const feed = current();
  if (!feed) {
    app.innerHTML = `${header(null)}<section class="lw-panel"><h2>Personne ne partage en ce moment</h2>
      <p class="lw-empty">Le mur des stands s’allume dès qu’un pilote de l’équipe roule avec le plugin SimHub des fiches combo (version 1.3 ou plus, « Partager ma voiture en direct » coché). Cette page se met à jour toute seule.</p></section>`;
    return;
  }
  loadTarget(feed);
  const race = isRace(feed.snap.session);
  const panel = (id, tab, html) => `<section class="lw-panel${view.tab === tab ? ' on' : ''}" id="${id}">${html}</section>`;
  // The open row and the scroll stay where they are: the panels are redrawn in place every second.
  app.innerHTML = `${header(feed)}${carsStrip()}${tabs(race)}<div class="lw-wall${race ? '' : ' practice'}">
    <div class="lw-col">${panel('lw-board', 'board', board(feed))}${panel('lw-carpanel', 'car', carPanel(feed))}</div>
    <div class="lw-col">${panel('lw-map', 'map', mapPanel(feed))}${race ? panel('lw-race', 'race', racePanel(feed)) : ''}</div></div>`;
}

app.addEventListener('click', event => {
  const row = event.target.closest('.lw-trow');
  if (row) { const id = Number(row.dataset.car); view.open = view.open === id ? null : id; render(); return; }
  const button = event.target.closest('button');
  if (!button) return;
  if (button.dataset.tab) { view.tab = button.dataset.tab; tellView(); }
  else if (button.dataset.stop) view.stop = button.dataset.stop;
  else if (button.dataset.cls) view.cls = button.dataset.cls;
  else if (button.dataset.feed) { view.key = button.dataset.feed; view.open = null; }
  else return;
  render();
});

app.addEventListener('keydown', event => {
  const row = event.key === 'Enter' || event.key === ' ' ? event.target.closest?.('.lw-trow') : null;
  if (!row) return;
  event.preventDefault();
  const id = Number(row.dataset.car); view.open = view.open === id ? null : id; render();
  app.querySelector(`.lw-trow[data-car="${id}"]`)?.focus();
});

async function start() {
  try { await call('/api/combos'); }
  catch (error) { renderError(error); return; }
  view.started = true;
  render();
  connect();
  // Clocks and ages move between two messages too.
  setInterval(render, 1000);
  requestAnimationFrame(glide);
}
start();
