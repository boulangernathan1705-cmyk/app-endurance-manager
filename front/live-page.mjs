// « Mur des stands » (server/live.mjs, shared/live.mjs): the team's cars live, for the teammates watching (never for
// the pilot at the wheel). Each car whose pilot shares from the SimHub plugin is a feed; the page shows one at a time:
// the standings (session times in practice), the map, our car, and in a race the race panel (time and energy to the
// flag, where we would rejoin after a stop, LMU's fair share, stints and stops). Raw numbers only, no advice.
import {COLORS, conditionOf} from '../shared/combos.mjs';
import {fairShare, isRace, lapsLeft, median, readFeed, rejoin, stationary, LIVE_FOR} from '../shared/live.mjs';

const app = document.getElementById('live-app');
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const known = value => value !== null && value !== undefined && Number.isFinite(Number(value));
const fr = (value, digits = 1) => known(value) ? Number(value).toLocaleString('fr-FR', {minimumFractionDigits:digits, maximumFractionDigits:digits}) : '—';
const lapTime = seconds => known(seconds) && seconds > 0 ? `${Math.floor(seconds / 60)}:${(seconds % 60).toFixed(3).padStart(6, '0').replace('.', ',')}` : '—';
const clock = value => { if (!known(value)) return '—'; const s = Math.max(0, Math.round(value)); return `${Math.floor(s / 3600)}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; };
const WHEELS = ['Avant gauche', 'Avant droit', 'Arrière gauche', 'Arrière droit'];
const PIT = ['track', 'pits', 'pits'], PIT_LABEL = ['En piste', 'Aux stands', 'Au garage'];
const STOP_KINDS = [['energy', 'Énergie seule'], ['tyres', 'Énergie + 4 pneus']];

const view = {feeds:new Map(), key:null, tab:'car', cls:'all', open:null, stop:'tyres', offset:0, connected:false, error:'', targets:new Map(), started:false};

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
  socket.addEventListener('open', () => { view.connected = true; retry = 2000; render(); });
  socket.addEventListener('message', event => {
    let message;
    try { message = JSON.parse(event.data); } catch { return; }
    if (known(message.now)) view.offset = Date.now() - message.now;
    if (message.type === 'hello') for (const feed of message.feeds || []) view.feeds.set(feed.key, readFeed(feed));
    if (message.type === 'feed' && message.feed?.key) view.feeds.set(message.feed.key, readFeed(message.feed, view.feeds.get(message.feed.key)));
    pick();
    move(current());
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
// Hypercar → H, LMP2 → P2, LMGT3 → GT3: the class's short name before the place in it.
const classShort = name => { const value = String(name || ''); return /hyper/i.test(value) ? 'H' : /p2/i.test(value) ? 'P2' : /gt3/i.test(value) ? 'GT3' : value.slice(0, 3); };
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
  const best = Math.min(...[...view.feeds.values()].filter(item => item.snap.track === snap.track && item.snap.session === snap.session)
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
  const rows = sorted.filter(car => view.cls === 'all' || car.cls === view.cls);
  const classPos = car => sorted.filter(other => other.cls === car.cls).indexOf(car) + 1;
  const extra = id => feed.cars[id] || {};
  const leader = sorted[0];
  const ours = sorted.find(car => car.id === us), ourAvg = feed.ours.avg5 ?? extra(us).avg5;
  // Our feeds' other cars in this session (practice: teammates on track at the same time).
  const mates = new Map([...view.feeds.values()].filter(item => item.key !== feed.key && item.snap.track === snap.track && item.snap.session === snap.session)
    .map(item => [item.snap.me.vehicle, item]));
  const bestOfAll = Math.min(...sorted.map(car => car.best > 0 ? car.best : 1e9));
  const gapRace = (seconds, laps) => laps > 0 ? `+${laps} t` : seconds > 0 ? `+${fr(seconds, 1)}` : '—';
  const gapBest = (car, ref) => car === ref || !(car.best > 0) || !(ref?.best > 0) ? '—' : `+${fr(car.best - ref.best, 3)}`;
  const d5 = car => {
    const avg = extra(car.id).avg5;
    if (car.id === us || car.cls !== ours?.cls || !known(avg) || !known(ourAvg)) return '—';
    return `<span class="${avg < ourAvg ? 'up' : 'down'}">${sign(avg - ourAvg)}${fr(Math.abs(avg - ourAvg), 1)}</span>`;
  };
  const sessionBest = [0, 1, 2].map(index => Math.min(...Object.values(feed.cars).map(item => item.best?.[index]).filter(known)));
  const head = `<tr><th class="c-pos">Pos</th><th class="c-num w2">#</th><th class="c-car">Voiture · pilote</th><th class="c-laps w3">Tours</th>
    <th class="c-gap">Écart</th><th class="c-int w2" title="Écart avec la voiture devant">Int.</th><th class="c-d5 w2" title="Moyenne de leurs 5 derniers tours moins la nôtre (même classe)">Δ 5 t.</th>
    <th class="c-last">${race ? 'Dernier' : 'Meilleur'}</th><th class="c-avg w2">Moy. 5 t.</th><th class="c-best w3">${race ? 'Meilleur' : 'Dernier'}</th>
    <th class="c-stint" title="Tours depuis leur dernier arrêt">Relais</th><th class="c-pit w2" title="Durée de leur dernier arrêt, voie comprise">Arrêt</th><th class="c-stops w1" title="Nombre d'arrêts">Arr.</th><th class="c-pen w2" title="Pénalités">Pén.</th></tr>`;
  const body = rows.map(car => {
    const index = sorted.indexOf(car), ahead = sorted[index - 1], info = extra(car.id), mate = car.id === us ? feed : mates.get(car.vehicle);
    const main = race ? car.last : car.best, other = race ? car.best : car.last;
    const who = mate ? feedName(mate) : car.driver;
    const row = `<tr class="row ${car.id === us ? 'us' : mate ? 'mate' : ''}" data-car="${car.id}" style="--cls:${classColor(car.cls)};--us:${esc(mate ? feedColor(mate) : 'inherit')}" aria-expanded="${view.open === car.id}">
      <td class="c-pos">${race ? car.place || index + 1 : index + 1}<small>${esc(classShort(car.cls))}${classPos(car)}</small></td><td class="c-num w2">${esc(car.num)}</td>
      <td class="c-car car">${car.pit ? `<span class="lw-pill pits">${car.pit === 2 ? 'Garage' : 'Stands'}</span> ` : ''}${esc(who)}<small>${car.num ? `#${esc(car.num)} · ` : ''}${esc(model(car))}</small></td>
      <td class="c-laps w3">${car.laps}</td>
      <td class="c-gap">${race ? (car === leader ? '—' : gapRace(car.behind, car.lapsBehind)) : gapBest(car, leader)}</td>
      <td class="c-int w2">${ahead ? (race ? gapRace(car.next, car.lapsNext) : gapBest(car, ahead)) : '—'}</td>
      <td class="c-d5 w2">${d5(car)}</td>
      <td class="c-last ${main > 0 && main === bestOfAll ? 'best' : ''}">${lapTime(main)}</td>
      <td class="c-avg w2">${lapTime(info.avg5)}</td><td class="c-best w3 ${other > 0 && other === bestOfAll ? 'best' : ''}">${lapTime(other)}</td>
      <td class="c-stint">${car.pit ? 0 : info.sinceStop ?? '—'}</td><td class="c-pit w2">${known(info.stop) ? fr(info.stop, 1) : '—'}</td><td class="c-stops w1">${car.stops ?? '—'}</td><td class="c-pen w2">${car.pen || '—'}</td></tr>`;
    if (view.open !== car.id) return row;
    const sectors = info.lastSectors ? info.lastSectors.map((value, k) => `<span class="${value <= sessionBest[k] ? 'best' : value <= info.best?.[k] ? 'pb' : ''}">S${k + 1} ${fr(value, 3)}</span>`).join(' · ') : '—';
    return row + `<tr class="detail"><td colspan="14"><dl class="lw-grid">
      <div><dt>Pilote</dt><dd>${esc(who)}</dd></div><div><dt>Tours</dt><dd>${car.laps}</dd></div>
      <div><dt>Intervalle</dt><dd>${ahead ? (race ? gapRace(car.next, car.lapsNext) : gapBest(car, ahead)) : '—'}</dd></div><div><dt>Δ 5 t. vs nous</dt><dd>${d5(car)}</dd></div>
      <div><dt>Moy. 5 tours</dt><dd>${lapTime(info.avg5)}</dd></div><div><dt>Meilleur</dt><dd>${lapTime(car.best)}</dd></div>
      <div><dt>Relais</dt><dd>${info.sinceStop ?? '—'} tours</dd></div><div><dt>Dernier arrêt</dt><dd>${known(info.stop) ? `${fr(info.stop, 1)} s` : '—'}</dd></div>
      <div><dt>Arrêts</dt><dd>${car.stops ?? '—'}</dd></div><div><dt>Pénalités</dt><dd>${car.pen || 'aucune'}</dd></div>
      <div class="wide"><dt>Secteurs du dernier tour</dt><dd>${sectors}</dd></div></dl></td></tr>`;
  }).join('');
  return `<h2>${race ? 'Classement' : 'Temps de la séance'} <small>${sorted.length} voitures</small></h2>
    ${classes.length > 1 ? `<div class="lw-chips" role="group" aria-label="Classe">${[['all', 'Toutes'], ...classes.map(name => [name, name])].map(([key, name]) => `<button type="button" data-cls="${esc(key)}" aria-pressed="${key === view.cls}">${esc(name)}</button>`).join('')}</div>` : ''}
    <table class="lw-board"><thead>${head}</thead><tbody>${body}</tbody></table>`;
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
  const wheel = (index, w) => `<div class="lw-tyre"><div class="t"><span>${WHEELS[index]}</span><span class="left lw-num">${fr(w.left, 0)}<small> %</small></span></div>
    <div class="lw-wear" aria-hidden="true"><i style="width:${known(w.left) ? Math.max(0, Math.min(100, w.left)) : 0}%"></i></div>
    <dl><div><dt>Usure / t. (5 t.)</dt><dd class="lw-num">${known(ours.wear5[index]) ? `${fr(ours.wear5[index], 2)} %` : '—'}</dd></div><div><dt>Carcasse</dt><dd class="lw-num">${fr(w.carcass, 0)} °C</dd></div>
      <div><dt>Pression</dt><dd class="lw-num">${fr(w.kpa, 0)} kPa</dd></div><div><dt>Frein</dt><dd class="lw-num">${fr(w.brake, 0)} °C</dd></div></dl></div>`;
  const control = me.control;
  const settings = [control && known(control.tc) && ['TC', fr(control.tc, 0)], control && known(control.abs) && ['ABS', fr(control.abs, 0)],
    control && known(control.bias) && ['Frein', `${fr(control.bias, 1)} %`], control && known(control.map) && ['Carto', fr(control.map, 0)],
    known(me.damage) && ['Dégâts', `${fr(me.damage, 0)} %`], known(me.limits) && ['Track limits', fr(me.limits, 0)]].filter(Boolean);
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
    ${settings.length ? `<div class="lw-sub"><h3>Réglages et dégâts</h3><dl class="lw-cond">${settings.map(([name, value]) => `<div><dt>${name}</dt><dd class="lw-num">${value}</dd></div>`).join('')}</dl></div>` : ''}
    <div class="lw-sub"><h3>Conditions</h3>
      <dl class="lw-cond"><div><dt>Piste</dt><dd class="lw-num">${fr(snap.trackTemp, 1)} °C</dd></div><div><dt>Air</dt><dd class="lw-num">${fr(snap.air, 1)} °C</dd></div>
        <div><dt>Pluie</dt><dd class="lw-num">${known(snap.rain) ? `${fr(snap.rain * 100, 0)} %` : '—'}</dd></div><div><dt>Piste mouillée</dt><dd class="lw-num">${known(snap.wet) ? `${fr(snap.wet * 100, 0)} %` : '—'}</dd></div></dl>
    </div></div></div>`;
}

// Seen from above, x to the right and z down (as the lap analysis of the fiches), from the game's map of the track or
// the path the field drives. The cars glide from one position to the next (the plugin sends one a second).
const motion = {key:null, cars:new Map()}, GLIDE_MAX = 2500;
let frame = null;
// A new snapshot: each car leaves from where it is drawn now towards its new position, over the time between two
// messages; it jumps instead when the step is too long to be driving (the line, the pits, a new session).
function move(feed) {
  if (!feed) return;
  if (motion.key !== feed.key) { motion.key = feed.key; motion.cars.clear(); }
  const now = performance.now(), size = frame?.size || 1;
  for (const car of feed.snap.field) {
    if (!known(car.x) || !known(car.z)) continue;
    const old = motion.cars.get(car.id), to = [car.x, car.z];
    if (old && old.to[0] === to[0] && old.to[1] === to[1]) continue;
    const from = old ? where(old, now) : to;
    const jump = !old || Math.hypot(to[0] - from[0], to[1] - from[1]) > size * 0.1 || Boolean(old.pit) !== Boolean(car.pit);
    motion.cars.set(car.id, {from:jump ? to : from, to, at:now, span:old ? Math.min(GLIDE_MAX, Math.max(400, now - old.at)) : 1000, pit:car.pit});
  }
}
function where(item, now) {
  const f = Math.min(1, (now - item.at) / item.span);
  return [item.from[0] + (item.to[0] - item.from[0]) * f, item.from[1] + (item.to[1] - item.from[1]) * f];
}
const placed = car => { const item = motion.cars.get(car.id); return item ? where(item, performance.now()) : [car.x, car.z]; };

function mapPanel(feed) {
  const snap = feed.snap, outline = feed.outline || [];
  const cars = snap.field.filter(car => known(car.x) && known(car.z) && car.pit !== 2);
  // The frame from the track alone once it is known (cars moving do not rescale it).
  const points = outline.length > 20 ? outline : [...outline, ...cars.map(car => [car.x, car.z])];
  if (!points.length) { frame = null; return `<h2>Carte</h2><p class="lw-empty">Les positions arrivent dès que la voiture roule.</p>`; }
  const xs = points.map(p => p[0]), zs = points.map(p => p[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minZ = Math.min(...zs), maxZ = Math.max(...zs);
  const size = Math.max(maxX - minX, maxZ - minZ) || 1, k = 940 / size;
  frame = {minX, minZ, k, size};
  const width = (maxX - minX) * k + 60, height = (maxZ - minZ) * k + 60;
  const px = v => (30 + (v - minX) * k).toFixed(1), pz = v => (30 + (v - minZ) * k).toFixed(1);
  const path = outline.length > 20 ? `M${outline.map(([x, z]) => `${px(x)},${pz(z)}`).join('L')}Z` : '';
  const mates = new Set([...view.feeds.values()].filter(item => item.key !== feed.key && item.snap.track === snap.track && item.snap.session === snap.session).map(item => item.snap.me.vehicle));
  const others = cars.filter(car => car.id !== snap.me.id).map(car => { const [x, z] = placed(car);
    return `<circle data-car="${car.id}" cx="${px(x)}" cy="${pz(z)}" r="${mates.has(car.vehicle) ? 13 : 10}" fill="${classColor(car.cls)}" stroke="var(--bg, #0a0b0c)" stroke-width="2.5"/>`; }).join('');
  const me = cars.find(car => car.id === snap.me.id), [mx, mz] = me ? placed(me) : [0, 0];
  const us = me ? `<g data-car="${me.id}" transform="translate(${px(mx)},${pz(mz)})"><circle r="17" fill="${esc(feedColor(feed))}" stroke="var(--text)" stroke-width="4"/><text x="24" y="8">${me.place ? `P${me.place}` : 'Nous'}</text></g>` : '';
  const classes = [...new Set(snap.field.map(car => car.cls).filter(Boolean))];
  return `<h2>Carte <small>${esc(snap.track)}</small></h2>
    <svg class="lw-mapbox" viewBox="0 0 ${width.toFixed(0)} ${height.toFixed(0)}" role="img" aria-label="Position des voitures sur le circuit">${path ? `<path class="road" d="${path}"/><path class="edge" d="${path}"/>` : ''}${others}${us}</svg>
    <div class="lw-legend">${classes.map(name => `<span><i style="background:${classColor(name)}"></i>${esc(name)}</span>`).join('')}<span><i style="background:${esc(feedColor(feed))};outline:2px solid var(--text)"></i>Nous</span></div>`;
}

// Between two redraws, only the cars move (nothing while the page is hidden or the map not shown).
function glide() {
  requestAnimationFrame(glide);
  if (document.hidden || !frame) return;
  const box = document.querySelector('#lw-map .lw-mapbox');
  if (!box || !box.getClientRects().length) return;
  const now = performance.now(), {minX, minZ, k} = frame;
  for (const node of box.querySelectorAll('[data-car]')) {
    const item = motion.cars.get(Number(node.dataset.car));
    if (!item) continue;
    const [x, z] = where(item, now), cx = (30 + (x - minX) * k).toFixed(1), cy = (30 + (z - minZ) * k).toFixed(1);
    if (node.tagName === 'g') node.setAttribute('transform', `translate(${cx},${cy})`);
    else { node.setAttribute('cx', cx); node.setAttribute('cy', cy); }
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
  const row = event.target.closest('tr[data-car]');
  if (row) { const id = Number(row.dataset.car); view.open = view.open === id ? null : id; render(); return; }
  const button = event.target.closest('button');
  if (!button) return;
  if (button.dataset.tab) view.tab = button.dataset.tab;
  else if (button.dataset.stop) view.stop = button.dataset.stop;
  else if (button.dataset.cls) view.cls = button.dataset.cls;
  else if (button.dataset.feed) { view.key = button.dataset.feed; view.open = null; move(current()); }
  else return;
  render();
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
