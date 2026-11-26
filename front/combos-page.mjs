// « Fiche mémo » (module Plugin SimHub; server/combos.mjs, module "combos"): what the team measured in practice on one car and one
// track, sent by each pilot's SimHub plugin. Raw numbers only, no advice: each pilot in his colour, the white
// « Équipage » row is the plain mean of the pilots shown (each counts once). Conditions are framed blocks.
import {memoPicker} from './combos-picker.mjs';
import {memoCandidates, memoRequestLabel, NOTE_THEMES} from '../shared/memo-links.mjs';
import {COLORS, CONDITIONS, NIGHT_BELOW} from '../shared/combos.mjs';
import {known, paceStats, tyreStats, bestOf, isBest, localDayEnd, stintProjection, refuelDuration, availableLaps, tyreRemaining} from './combos-stats.mjs';
import {analysisBody, distanceUnder, prepare, showCursor} from './combos-analysis.mjs?v=8';

const app = document.getElementById('combos-app');
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const fr = (value, digits = 2) => known(value) ? Number(value).toLocaleString('fr-FR', {minimumFractionDigits:digits, maximumFractionDigits:digits}) : '—';
const lapTime = seconds => known(seconds) ? `${Math.floor(seconds / 60)}:${(seconds % 60).toFixed(3).padStart(6, '0').replace('.', ',')}` : '—';
const day = ms => new Date(ms).toLocaleDateString('fr-FR', {day:'numeric', month:'short', year:'numeric'});
// Sessions and periods are in milliseconds; links and notes, like the rest of the site, in seconds.
const seconds = value => value * 1000;
const dayTime = ms => new Date(ms).toLocaleString('fr-FR', {day:'numeric', month:'short', hour:'2-digit', minute:'2-digit'});
const COND = {dry:['Sec', ''], damp:['Humide', 'damp'], rain:['Pluie', 'rain']};
const WHEELS = ['Avant gauche', 'Avant droit', 'Arrière gauche', 'Arrière droit'];
const STORE = 'em-combos-hidden';

const view = {
  combos:[], combo:null, sheet:null, compare:null, link:null,
  event:'', version:'', since:'', until:'', setup:'', moment:'', trackMin:'', trackMax:'', compareEvent:'', cond:null, compound:null, stint:null, hidden:new Set(),
  pit:{before:8, after:100, tyres:4, pressure:false, driver:true, wing:'', frontWing:'', radiator:false, brakes:false, repair:''}, pitOpen:false, periodsOpen:false,
  editing:null, message:'', error:'',
  // « Mon analyse »: the combo's sessions, the one looked at and the one it is compared with, the map's colouring.
  tab:'sheet', statsTab:'pace', analysis:{list:null, key:'', mine:'', other:'', metric:'speed', pick:0, size:450, zone:null, sort:'lap', sessions:new Map(), loading:false, error:''}
};
view.scope='all'; view.favorites=new Set(); view.recent=[];
function readPrefs(scope) {
  if (!scope || view.preferenceScope===scope) return;
  view.preferenceScope=scope; view.hidden=new Set(); view.favorites=new Set(); view.recent=[];
  try { const saved=JSON.parse(localStorage.getItem(STORE+':'+scope)||'{}');
    view.recent=Array.isArray(saved.recent)?saved.recent.slice(0,6):[];
    view.hidden=new Set(Array.isArray(saved.hidden)?saved.hidden:[]);
    view.favorites=new Set(Array.isArray(saved.favorites)?saved.favorites:[]);
  } catch {}
}
const saveHidden=()=>{if(!view.preferenceScope)return;try{localStorage.setItem(STORE+':'+view.preferenceScope,JSON.stringify({hidden:[...view.hidden],favorites:[...view.favorites],recent:view.recent}));}catch{}};
function hiddenFor(sheet=view.sheet) {
  if(view.scope==='all')return new Set();
  if(view.scope==='custom')return view.hidden;
  return new Set((sheet?.drivers||[]).filter(d=>view.scope==='me'?!d.me:!view.crew?.members.includes(d.id)).map(d=>d.id));
}
function crewMatches(combo) {
  if(!view.crew||!combo)return false;
  const q=new URLSearchParams({circuit:view.crew.circuit});
  if(view.crew.car)q.set('car',view.crew.car);
  return memoCandidates([combo],q).length===1;
}

async function call(path, method = 'GET', data) {
  let response;
  try {
    response = await fetch(path, {method, credentials:'same-origin', cache:'no-store',
      headers:method === 'GET' ? {Accept:'application/json'} : {Accept:'application/json', 'Content-Type':'application/json'},
      body:method === 'GET' ? undefined : JSON.stringify(data || {})});
  } catch { throw Object.assign(Error('Connexion au site impossible. Vérifie ta connexion puis réessaie.'), {status:0}); }
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(Error(result.error || `Action impossible (${response.status}).`), {status:response.status});
  return result;
}

function renderError(error) {
  const login = error.status === 401 ? `<a class="primary-button" href="/api/auth/discord?return=${encodeURIComponent(location.pathname + location.search + location.hash)}">Se connecter avec Discord</a>` : '<a class="secondary-button" href="/lmu/">Retour aux courses</a>';
  app.innerHTML = `<section class="members-panel members-error"><h1>Fiche mémo</h1><p>${esc(error.message)}</p>${login}</section>`;
}

// ---------- Loading ----------

const wholeNumber = (value,min,max,fallback) => value == null || value === '' || !Number.isFinite(Number(value))
  ? fallback : Math.min(max,Math.max(min,Math.round(Number(value))));
const comboKey = combo => `${combo.car}\u0000${combo.track}`;
// A day picked in the filters (YYYY-MM-DD) → its local midnight in ms, and back; « to » runs to the end of its day.
const dayStart = text => { const [y, m, d] = text.split('-').map(Number); return new Date(y, m - 1, d).getTime(); };
const dayText = ms => { const date = new Date(ms); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; };
const dayParam = value => /^\d+$/.test(value || '') ? dayText(Number(value)) : '';
// The comparison reads another race's dates: the days picked by hand only narrow the sheet itself.
const sheetQuery = (event = view.event, compare = false) => {
  const query = new URLSearchParams({track:view.combo.track, car:view.combo.car});
  if (event) query.set('event', event);
  if (compare) query.set('comparison','1');
  else if (view.raceId) query.set('race',view.raceId);
  if (view.since && !compare) query.set('from', dayStart(view.since));
  if (view.until && !compare) query.set('to', localDayEnd(view.until));
  if (view.version) query.set('version', view.version);
  if (view.setup) query.set('setup', view.setup);
  if (view.moment) query.set('moment', view.moment);
  if (view.trackMin !== '') query.set('tmin', view.trackMin);
  if (view.trackMax !== '') query.set('tmax', view.trackMax);
  return query;
};

export async function startMemo(link) {
  const params = new URLSearchParams(location.search);
  view.compareEvent = params.get('compare') || '';
  view.raceId = params.get('race') || '';
  view.cond = CONDITIONS.includes(params.get('cond')) ? params.get('cond') : null;
  view.explicitCondition = Boolean(view.cond);
  view.scope = ['all','crew','me','custom'].includes(params.get('scope')) ? params.get('scope') : 'all';
  view.reserve = wholeNumber(params.get('reserve'),0,50,3);
  view.stint = wholeNumber(params.get('laps'),1,60,null);
  view.tyreInitial = wholeNumber(params.get('rubber'),0,100,100);
  view.tyreRelays = wholeNumber(params.get('tyres'),1,3,1);
  view.event = params.get('event') || ''; view.version = params.get('version') || ''; view.setup = params.get('setup') || '';
  view.moment = ['day', 'night'].includes(params.get('moment')) ? params.get('moment') : '';
  view.trackMin = params.get('tmin') || ''; view.trackMax = params.get('tmax') || '';
  view.since = dayParam(params.get('from')); view.until = dayParam(params.get('to'));
  if (params.get('tab') === 'analyse') view.tab = 'analysis';
  if (params.get('tab') === 'stats') view.tab = 'stats';
  try {
    const list = await call('/api/combos');
    view.combos = list.combos; view.link = link; readPrefs(list.preferenceScope);
  } catch (error) { renderError(error); return; }
  if (params.get('crew')) { try { view.crew=await call('/api/combos/crew?id='+encodeURIComponent(params.get('crew'))); } catch { view.message='Équipage indisponible : la fiche reste accessible pour la communauté.'; } }
  selectRequestedCombo(params);
  if (!params.has('scope') && crewMatches(view.combo)) view.scope='crew';
  if (view.scope==='crew' && !crewMatches(view.combo)) view.scope='all';
  if (view.combo) await loadSheet(); else render();
}

function selectRequestedCombo(params) {
  const label = memoRequestLabel(params);
  const candidates = memoCandidates(view.combos, params);
  view.combo = label ? (candidates.length === 1 ? candidates[0] : null) : view.combos.find(item=>view.favorites.has(comboKey(item))) || view.combos[0] || null;
  view.requested = !view.combo ? label : '';
  view.candidates = view.requested ? candidates : [];
}

let sheetRequest = 0;
async function loadSheet(fresh = false) {
  const request = ++sheetRequest;
  view.sheetLoading = true; view.error = ''; view.sheet = null; view.compare = null; view.history = null;
  render();
  try {
    const [sheet, compare] = await Promise.all([call(`/api/combos/sheet?${sheetQuery()}`),
      view.compareEvent && view.compareEvent !== view.event ? call(`/api/combos/sheet?${sheetQuery(view.compareEvent, true)}`) : null]);
    if (request !== sheetRequest) return;
    view.sheet = sheet; view.compare = compare; view.error = ''; view.loadedAt = Date.now();
  } catch (error) {
    if (request !== sheetRequest) return;
    if (error.status === 401 || error.status === 403) { view.sheetLoading = false; renderError(error); return; }
    view.error = error.message;
  }
  view.sheetLoading = false;
  if (view.sheet) {
    const key=comboKey(view.combo);
    if (view.recent[0]!==key) {view.recent=[key,...view.recent.filter(item=>item!==key)].slice(0,6); saveHidden();}
    const conditions = view.sheet.conditions;
    // A condition left empty by the day/night or track temperature choice stays chosen: its frame says why it is empty.
    const narrowed = view.moment || view.trackMin !== '' || view.trackMax !== '';
    if (!view.cond || (!narrowed && !view.explicitCondition && !conditions[view.cond]?.laps)) view.cond = CONDITIONS.find(cond => conditions[cond].laps) || 'dry';
    remember();
  }
  if (view.tab === 'analysis' && view.sheet) await loadAnalysis(fresh); else render();
}

// The new sessions without reloading the page: the list of combos, the plugin's link, then the sheet or the analysis
// as they are, filters and choices kept.
async function refresh() {
  view.refreshing = true; render();
  try {
    const [list, link] = await Promise.all([call('/api/combos'), call('/api/combos/link')]);
    view.combos = list.combos; view.link = link; readPrefs(list.preferenceScope);
    if (view.crew) {try{view.crew=await call('/api/combos/crew?id='+encodeURIComponent(view.crew.id));}catch{view.crew=null;if(view.scope==='crew')view.scope='all';view.message='Équipage indisponible.';}}
    if (!view.combo && !view.requested) view.combo = view.combos[0] || null;
    if (view.requested) selectRequestedCombo(new URLSearchParams(location.search));
  } catch (error) { view.message = error.message; }
  if (view.combo) await loadSheet(true);
  view.refreshing = false; render();
}

// Another car or circuit: its own sheet, without the choices that belong to the previous one.
async function openCombo(track, car) {
  const combo = view.combos.find(item => item.track === track && item.car === car);
  if (!combo || (view.combo && comboKey(combo) === comboKey(view.combo))) { render(); return; }
  Object.assign(view, {combo, requested:'', candidates:[], event:'', setup:'', compareEvent:'', cond:null, compound:null, stint:null, tyreInitial:100, tyreRelays:1});
  if(view.scope==='crew'&&!crewMatches(combo))view.scope='all';
  view.analysis.zone = null;
  await loadSheet();
}

function remember() {
  const query = sheetQuery();
  if(view.crew&&crewMatches(view.combo))query.set('crew',view.crew.id);
  if (view.cond) query.set('cond',view.cond);
  if (view.scope !== 'all') query.set('scope',view.scope);
  if (view.reserve !== 3) query.set('reserve',view.reserve);
  if (view.stint) query.set('laps',view.stint);
  if (view.tyreInitial !== 100) query.set('rubber',view.tyreInitial);
  if (view.tyreRelays !== 1) query.set('tyres',view.tyreRelays);
  if (view.tab === 'analysis') query.set('tab', 'analyse');
  if (view.tab === 'stats') query.set('tab', 'stats');
  if (view.compareEvent) query.set('compare', view.compareEvent);
  history.replaceState(null, '', `${location.pathname}?${query}${location.hash}`);
}

// ---------- « Mon analyse » ----------

// The combo's sessions once, then the two looked at (each kept once loaded: a trace weighs a few hundred kB).
let analysisRequest = 0;
async function loadAnalysis(fresh = false) {
  const request = ++analysisRequest;
  const a = view.analysis, key = comboKey(view.combo);
  const current = () => request === analysisRequest && view.combo && comboKey(view.combo) === key;
  try {
    if (a.key !== key) Object.assign(a, {list:null, key, mine:'', other:'', sessions:new Map()});
    if (fresh) a.sessions.clear();
    if (!a.list || fresh) {
      const result = await call(`/api/combos/analysis?${new URLSearchParams({track:view.combo.track, car:view.combo.car})}`);
      if (!current()) return;
      a.list = result.sessions;
    }
    const list = analysisSessions(a);
    const useful = item => item.trace || item.expert;
    if (!list.some(item => item.id === a.mine)) a.mine = (list.find(item => item.mine && useful(item)) || list.find(item => item.mine) || list.find(useful) || list[0])?.id || '';
    const mine = list.find(item => item.id === a.mine);
    // Compared by default with the fastest traced lap of a teammate.
    const compatible = list.filter(item=>item.id!==a.mine && comparableTrace(mine?.trace,item.trace));
    if (a.other !== 'none' && !compatible.some(item=>item.id===a.other)) {
      const others = compatible.filter(item=>item.userId!==mine.userId).sort((x,y)=>x.trace.time-y.trace.time);
      a.other = others[0]?.id || 'none';
    }
    a.loading = true; render();
    const entries = await Promise.all([a.mine, a.other].filter(id => id && id !== 'none' && !a.sessions.has(id)).map(async id => [id, await call(`/api/combos/analysis/session?id=${encodeURIComponent(id)}`)]));
    if (!current()) return;
    for (const [id, data] of entries) a.sessions.set(id, data);
    a.error = '';
  } catch (error) {
    if (!current()) return;
    if (error.status === 401 || error.status === 403) { renderError(error); return; }
    a.error = error.message;
  }
  a.loading = false;
  render();
}

// Laps taken out of the sheet by their pilot, or put back: the session, the list and the sheet are read again.
async function ignoreLaps(which, ignored) {
  const a = view.analysis, data = a.sessions.get(a.mine);
  if (!data) return;
  const laps = which === 'all' ? data.list.map(lap => lap.n) : [Number(which)];
  if (which === 'all' && ignored && !confirm('Retirer tous les tours de cette séance des fiches ? Tu pourras les remettre.')) return;
  await act(() => call('/api/combos/laps', 'PATCH', {session:a.mine, laps, ignored}), ignored ? 'Tour retiré des fiches.' : 'Tour remis dans les fiches.');
  a.sessions.delete(a.mine);
  await loadSheet(true);
}

// Each pilot in his sheet colour; a second session of the same pilot in white.
const prepared = new WeakMap();
const traceOf = data => { if (!prepared.has(data)) prepared.set(data, prepare(data.trace)); return prepared.get(data); };
function analysisSides() {
  const a = view.analysis, colour = people();
  const side = (id, fallback) => {
    const data = a.sessions.get(id), item = a.list?.find(entry => entry.id === id);
    if (!data || !item) return null;
    const color = colour.get(item.userId)?.color || item.color || fallback;
    return {data, item, trace:traceOf(data), lapsOpen:a.lapsOpen, expertOpen:a.expertOpen, color, label:`${item.name}${item.mine ? ' (moi)' : ''} · ${dayTime(item.startedAt)}`, short:item.name};
  };
  const mine = side(a.mine, COLORS[0]);
  let other = a.other !== 'none' ? side(a.other, COLORS[1]) : null;
  if (mine && other && other.item.userId === mine.item.userId) other = {...other, color:'#f0f3f2', short:`${other.short} (${dayTime(other.item.startedAt)})`};
  return mine ? [mine, ...(other ? [other] : [])] : [];
}

// The session looked at, then who it is compared with: each teammate's best traced lap and the pilot's own best other
// session one tap away, any other session in the list below.
const SESSION_LABELS = {practice:'Essais',qualifying:'Qualifications',warmup:'Warm-up',race:'Course',unknown:'Type inconnu'};
function sessionGroup(type) {
  if (!Number.isInteger(type)) return 'unknown';
  if (type<=4) return 'practice';
  if (type<=8) return 'qualifying';
  return type===9?'warmup':'race';
}
const analysisSessions = a => (a.list || []).filter(item=>!a.type || sessionGroup(item.type)===a.type);
function comparableTrace(a,b) {
  return Boolean(a && b && a.cond===b.cond && (!known(a.temp)||!known(b.temp)||Math.abs(a.temp-b.temp)<=5) &&
    (!known(a.light)||!known(b.light)||(a.light<NIGHT_BELOW)===(b.light<NIGHT_BELOW)));
}

function analysisChoices() {
  const a = view.analysis, list = analysisSessions(a), colour = people();
  const label = item => `${dayTime(item.startedAt)} · ${item.laps} tours · ${lapTime(item.best)} · ${SESSION_LABELS[sessionGroup(item.type)]}${item.trace ? ' · '+COND[item.trace.cond][0] : ' · sans tracé'}`;
  const option = (item, current, withName) => `<option value="${esc(item.id)}"${item.id === current ? ' selected' : ''}>${withName ? `${esc(item.name)} · ` : ''}${esc(label(item))}</option>`;
  const mineList = list.filter(item => item.mine);
  const mine = list.find(item => item.id === a.mine);
  const traced = list.filter(item => item.id !== a.mine && comparableTrace(mine?.trace,item.trace)).sort((x, y) => x.trace.time - y.trace.time);
  // The fastest traced lap of each pilot, the pilot of the session first.
  const best = new Map();
  for (const item of traced) if (!best.has(item.userId)) best.set(item.userId, item);
  const chips = [...best.values()].sort((x, y) => (y.userId === mine?.userId) - (x.userId === mine?.userId));
  const chip = item => {
    const own = item.userId === mine?.userId;
    return `<button type="button" class="an-chip" data-other="${esc(item.id)}" aria-pressed="${item.id === a.other}" style="--dc:${esc(own ? '#f0f3f2' : colour.get(item.userId)?.color || item.color || COLORS[1])}">
      <i></i><span>${own ? 'Ma meilleure autre séance' : esc(item.name)}</span><b>${lapTime(item.trace.time)}</b></button>`;
  };
  const rest = traced.filter(item => !chips.includes(item));
  const typeFilter = `<label>Type de séance <select data-field="an-type"><option value="">Tous</option>${Object.entries(SESSION_LABELS).map(([key,value])=>`<option value="${key}"${a.type===key?' selected':''}>${value}</option>`).join('')}</select></label>`;
  if (!list.length) return `<div class="an-choices">${typeFilter}<p>Aucune séance de ce type.</p></div>`;
  return `<div class="an-choices">${typeFilter}
    <label>Séance<select data-field="an-mine">${mineList.length ? `<optgroup label="Mes séances">${mineList.map(item => option(item, a.mine)).join('')}</optgroup>` : ''}
      ${list.some(item => !item.mine) ? `<optgroup label="${mineList.length ? 'Coéquipiers' : 'Séances de l’équipe'}">${list.filter(item => !item.mine).map(item => option(item, a.mine, true)).join('')}</optgroup>` : ''}</select></label>
    <div class="an-compare"><span>Comparer avec · conditions compatibles</span><div class="an-chips">${chips.map(chip).join('')}<button type="button" class="an-chip" data-other="none" aria-pressed="${a.other === 'none'}"><span>Personne</span></button></div>
      ${rest.length ? `<select data-field="an-other" aria-label="Une autre séance"><option value="">Une autre séance…</option>${rest.map(item => option(item, a.other, true)).join('')}</select>` : ''}</div></div>`;
}

function analysis() {
  const a = view.analysis;
  if (a.error) return `<p class="cb-message is-error">${esc(a.error)}</p>`;
  if (!a.list) return '<p class="cb-empty">Chargement…</p>';
  if (!a.list.length) return '<p class="cb-empty">Aucune séance sur ce combo pour l’instant.</p>';
  const sides = analysisSides();
  const body = sides.length ? analysisBody(sides, a.metric, a.pick, a.size, a.zone, a.sort) : a.loading ? '<p class="cb-empty">Chargement…</p>' : '';
  return `${analysisChoices()}<div class="an-body${a.loading ? ' is-loading' : ''}">${body}</div>`;
}

// Each pilot's colour: his own choice, else the first colour nobody took, in the order of the sheet.
function colours(drivers) {
  const taken = new Set(drivers.map(driver => driver.color).filter(Boolean));
  const free = COLORS.filter(color => !taken.has(color));
  return new Map(drivers.map((driver, index) => [driver.id, driver.color || free.shift() || COLORS[index % COLORS.length]]));
}

function people() {
  const drivers = view.sheet?.drivers || [];
  const colour = colours(drivers);
  return new Map(drivers.map(driver => [driver.id, {...driver, color:colour.get(driver.id)}]));
}

// ---------- The crew row ----------

function paceRows(condition, sheet = view.sheet) {
  return paceStats(sheet?.conditions[condition]?.drivers || [], people(), hiddenFor(sheet));
}

function tyreRows(condition, compound) {
  return tyreStats(view.sheet.conditions[condition]?.compounds[compound]?.drivers || [], people(), hiddenFor());
}

const nameCell = (row, dot = false) => `<td class="cb-name" style="--dc:${esc(row.color)}">${dot ? '<span class="cb-dot"></span>' : ''}${esc(row.name)}${row.me ? ' (moi)' : ''}</td>`;
const rowClass = row => row.crew ? ' class="cb-crew"' : '';
const cell = (row, value, best, html) => `<td${isBest(row, value, best) ? ' class="cb-best"' : ''}>${html}</td>`;
const none = columns => `<tr><td colspan="${columns}" class="cb-empty">Aucun pilote affiché dans cette condition.</td></tr>`;
const compareName = () => view.sheet.periods.events.find(item => item.id === view.compareEvent)?.name || '';

// The same pilot (or the crew) in the edition compared with: higher in amber, lower in blue.
function delta(row, key, digits, unit) {
  if (!view.compare) return '';
  const before = paceRows(view.cond, view.compare).find(item => item.id === row.id)?.[key];
  if (!known(before) || !known(row[key])) return '';
  const diff = row[key] - before;
  const kind = Math.abs(diff) < 10 ** -digits / 2 ? 'same' : diff > 0 ? 'up' : 'down';
  return `<span class="cb-delta ${kind}">${diff > 0 ? '+' : diff < 0 ? '−' : '±'}${fr(Math.abs(diff), digits)}${unit} vs ${esc(compareName())}</span>`;
}

// ---------- Rendering ----------

// Not linked yet: the install and the link are on the module's home page (simhub.html).
function linkCard() {
  return '<p class="cb-message">SimHub n’est pas encore relié : tes séances n’arrivent pas ici. <a href="/simhub.html#installer">Installer et relier le plugin</a></p>';
}

function header() {
  const sheet = view.sheet, favourite = view.favorites.has(comboKey(view.combo));
  const time = view.loadedAt ? `À jour à ${new Date(view.loadedAt).toLocaleTimeString('fr-FR', {hour:'2-digit', minute:'2-digit'})}` : 'Actualiser';
  return `<div class="cb-hero"><div class="cb-hero-top"><span class="cb-crumb">Fiche mémo · LMU</span>
      <div class="cb-tools"><button type="button" class="cb-btn is-quiet" data-picker="quick" aria-haspopup="dialog">Accès rapides</button><button type="button" class="cb-btn is-quiet" data-action="favorite" aria-label="${favourite?'Retirer des favoris':'Ajouter aux favoris'}" title="${favourite?'Retirer des favoris':'Ajouter aux favoris'}" aria-pressed="${favourite}">${favourite?'★':'☆'}</button>
      <button type="button" class="cb-btn is-quiet" data-action="refresh"${view.refreshing?' disabled':''} title="${esc(time)}" aria-label="Actualiser">↻</button>
      <details class="cb-more"><summary aria-label="Autres actions">⋯</summary><div><button type="button" class="cb-btn is-quiet" data-action="export">Exporter JSON</button></div></details></div></div>
      ${picker.header()}${sheet?sample():''}</div>
    <nav class="cb-tabs cb-workspace-tabs" aria-label="Vue">${[['sheet','Préparation'],['stats','Statistiques'],['analysis','Analyse']].map(([tab,label])=>`<button type="button" data-tab="${tab}" aria-pressed="${tab===view.tab}">${label}</button>`).join('')}</nav>`;
}

function dialog(title,content) {
  const box=document.createElement('dialog');
  box.className='cb-dialog';
  box.setAttribute('aria-label',title);
  box.innerHTML=`<div class="cb-dialog-head"><h2>${esc(title)}</h2><button type="button" class="cb-btn" aria-label="Fermer">×</button></div>${content}`;
  app.append(box);
  box.querySelector('.cb-dialog-head button').onclick=()=>box.close();
  box.addEventListener('close',()=>box.remove(),{once:true});
  box.showModal();
  return box;
}
app.addEventListener('error',event=>{
  if(event.target.matches?.('.cb-tile img'))event.target.hidden=true;
},true);
const picker=memoPicker({view,esc,comboKey,openCombo,dialog});

function filters() {
  const {periods, setups} = view.sheet;
  const option = (value, label, current) => `<option value="${esc(value)}"${value === current ? ' selected' : ''}>${esc(label)}</option>`;
  return `<div class="cb-filters">
    <label>Épreuve<select data-field="event">${option('', 'Toutes les dates', view.event)}${periods.events.map(item => option(item.id, item.name, view.event)).join('')}</select></label>
    <label>Version / BoP<select data-field="version">${option('', 'Toutes les versions', view.version)}${periods.versions.map(item => option(item.id, item.name, view.version)).join('')}</select></label>
    <label>Comparer à l’épreuve<select data-field="compare">${option('', 'Aucune', view.compareEvent)}${periods.events.map(item => option(item.id, item.name, view.compareEvent)).join('')}</select></label>
    <label>Réglage<select data-field="setup">${option('', 'Tous les réglages', view.setup)}${setups.map(item => option(item.name, `${item.name} · ${item.laps} tours`, view.setup)).join('')}${view.setup && !setups.some(item => item.name === view.setup) ? option(view.setup, view.setup, view.setup) : ''}</select></label>
    <div class="cb-range cb-dates"><span>Dates</span><div><input type="date" value="${esc(view.since)}" data-field="since" aria-label="Du"><input type="date" value="${esc(view.until)}" data-field="until" aria-label="Au"></div></div>
    <div class="cb-range"><span>Piste (°C)</span><div><input type="number" inputmode="numeric" min="-30" max="80" step="1" placeholder="de" value="${esc(view.trackMin)}" data-field="trackMin" aria-label="Température de piste minimale"><input type="number" inputmode="numeric" min="-30" max="80" step="1" placeholder="à" value="${esc(view.trackMax)}" data-field="trackMax" aria-label="Température de piste maximale"></div></div>
  </div>`;
}

function sample() {
  const s = view.sheet.sample;
  if (!s.laps) return '<div class="cb-sample">Aucune séance sur ces dates.</div>';
  const span = day(s.from) === day(s.to) ? `le <b>${esc(day(s.from))}</b>` : `du <b>${esc(day(s.from))}</b> au <b>${esc(day(s.to))}</b>`;
  return `<div class="cb-sample"><span><b>${s.laps}</b> tours</span><span><b>${s.drivers}</b> pilote${s.drivers > 1 ? 's' : ''}</span><span><b>${s.sessions}</b> séance${s.sessions > 1 ? 's' : ''}</span>
    <span>${span}</span>${view.compare ? `<span>comparé à <b>${esc(compareName())}</b></span>` : ''}</div>`;
}

function drivers() {
  const list = [...people().values()];
  if (!list.length) return '';
  const hidden=hiddenFor();
  return `<div class="cb-drivers" role="group" aria-label="Pilotes affichés">${list.map(item => `<button type="button" class="cb-chip" style="--dc:${esc(item.color)}" data-driver="${esc(item.id)}" aria-pressed="${!hidden.has(item.id)}" title="${hidden.has(item.id) ? 'Afficher' : 'Masquer'} ${esc(item.name)}"><i></i>${esc(item.name)}${item.me ? ' (moi)' : ''}</button>`).join('')}</div>`;
}

function swatches() {
  const me = [...people().values()].find(item => item.me);
  return me ? `<div class="cb-colors"><span class="cb-side-label">Ma couleur</span>${COLORS.map(color => `<button type="button" class="cb-swatch" style="--dc:${color}" data-draft-color="${color}" aria-label="Couleur ${color}" aria-pressed="${color === me.color}"></button>`).join('')}</div>` : '';
}

// Above the sheet, over its whole width: the pilots shown, and the filters folded in one line.
function toolbar() {
  const scopes=[['all','Communauté'],...(crewMatches(view.combo)?[['crew','Mon équipage']]:[]),['me','Moi'],['custom','Personnalisé']];
  const conds=view.sheet.conditions;
  return `<div class="cb-toolbar cb-context"><div class="cb-context-main">
    <div class="cb-drivers" role="group" aria-label="Périmètre des statistiques">${scopes.map(([key,label])=>`<button type="button" class="cb-chip" data-scope="${key}" aria-pressed="${view.scope===key}">${label}</button>`).join('')}</div>
    <div class="cb-conds" role="group" aria-label="Conditions de piste">${CONDITIONS.map(cond=>`<button type="button" class="cb-cond ${COND[cond][1]}" data-cond="${cond}" aria-pressed="${cond===view.cond}"><b>${COND[cond][0]}</b><small>${conds[cond].laps} t.</small></button>`).join('')}</div>
    ${conditions()}<label class="cb-mobile-filter">Piste<select data-compact="cond">${CONDITIONS.map(key=>`<option value="${key}"${view.cond===key?' selected':''}>${COND[key][0]} · ${conds[key].laps} t.</option>`).join('')}</select></label>
    <label class="cb-mobile-filter">Moment<select data-compact="moment">${[['','Jour et nuit'],['day','Jour'],['night','Nuit']].map(([key,name])=>`<option value="${key}"${view.moment===key?' selected':''}>${name}</option>`).join('')}</select></label>
    <button type="button" class="cb-btn cb-advanced" data-action="advanced" aria-haspopup="dialog">Filtres avancés <b>${filterSummary().length}</b></button></div>
    ${view.scope==='crew'?'<p class="cb-src">'+esc(view.crew.name)+' · '+view.crew.members.length+' pilotes inscrits</p>':''}
    ${view.scope==='custom'?drivers():''}${filterSummary().length?`<p class="cb-src">${esc(filterSummary().join(' · '))}</p>`:''}</div>`;
}
function conditions() {
  const moments=view.sheet.conditions[view.cond].moments;
  return `<div class="cb-moments" role="group" aria-label="Jour ou nuit">${[['','Jour et nuit',null],['day','Jour',moments.day],['night','Nuit',moments.night]].map(([value,label,laps])=>`<button type="button" data-moment="${value}" aria-pressed="${value===view.moment}">${label}${laps===null?'':` <small>${laps}</small>`}</button>`).join('')}</div>`;
}

// The game's FUEL RATIO for these laps: litres of fuel per percent of virtual energy (0.86 = 86 L for a full energy).
const ratio = row => known(row.ve) && row.ve > 0 && known(row.fuel) && row.fuel > 0 ? row.fuel / row.ve : null;

function energy(rows) {
  const bestVe = bestOf(rows, row => row.ve > 0 ? row.ve : null), bestFuel = bestOf(rows, row => row.fuel > 0 ? row.fuel : null);
  const table = `<thead><tr><th>Pilote</th><th>Tours</th><th>Énergie / tour (%)</th><th>Tours avec 100 %</th><th>Carbu / tour (L)</th><th title="Litres de carburant par % d'énergie virtuelle : le FUEL RATIO du menu des stands">Ratio carbu (L / %)</th></tr></thead><tbody>${rows.length ? rows.map(row =>
    `<tr${rowClass(row)}>${nameCell(row)}<td>${row.laps}</td>${cell(row, row.ve, bestVe, `${fr(row.ve)}${delta(row, 've', 2, ' %')}`)}${cell(row, row.ve, bestVe, known(row.ve) && row.ve > 0 ? fr(100 / row.ve, 1) : '—')}${cell(row, row.fuel, bestFuel, fr(row.fuel))}<td>${fr(ratio(row))}</td></tr>`).join('') : none(6)}</tbody>`;
  // How much energy a lap may use for a stint of N laps, and which pilots stay under it.
  const pilots = rows.filter(row => !row.crew && known(row.ve) && row.ve > 0);
  const worst = pilots.length ? Math.max(...pilots.map(row => row.ve)) : null;
  const whole = worst ? Math.max(2, Math.floor(100 / worst)) : null;
  // Each stint's length in time, at the crew's mean lap.
  const crew = rows.find(row => row.crew) || rows[0];
  const minutes = laps => known(crew?.avg) ? `${Math.floor(laps * crew.avg / 60)} min ${String(Math.round(laps * crew.avg % 60)).padStart(2, '0')}` : '—';
  const stints = whole ? `<div class="cb-wrap"><table class="cb-stints"><thead><tr><th>Relais de</th><th>Énergie / tour à tenir (%)</th><th>Durée</th><th>Pilotes qui tiennent</th></tr></thead><tbody>${[whole - 1, whole, whole + 1, whole + 2].map(laps => {
    const under = pilots.filter(row => stintProjection(100, row.ve, 0) >= laps);
    return `<tr><td>${laps} tours</td><td>${fr(100 / laps)}</td><td>${minutes(laps)}</td><td><div class="cb-names">${under.map(row => `<span style="--dc:${esc(row.color)}">${esc(row.name)}</span>`).join('') || '<span class="cb-src">aucun</span>'}</div></td></tr>`;
  }).join('')}</tbody></table></div>` : '';
  const measured=rows.filter(row=>!row.crew && known(row.fuel) && row.fuel>0).sort((a,b)=>a.fuel-b.fuel);
  const fuelChart=measured.length>1?`<section class="cb-card cb-pace-chart"><h2>Carburant par tour</h2>${measured.map(row=>`<div class="cb-pace-row" style="--dc:${esc(row.color)}"><span>${esc(row.name)}</span><strong>${fr(row.fuel)} L</strong><div class="cb-meter"><i style="width:${100*row.fuel/measured.at(-1).fuel}%"></i></div></div>`).join('')}</section>`:'';
  return `${fuelChart}<section><div class="cb-head"><h2>Énergie virtuelle</h2></div>
    <div class="cb-wrap"><table>${table}</table></div>${stints}
    <p class="cb-src">Tours avec 100 % : tours qu’un plein d’énergie permet à cette consommation. Ratio carbu : litres par % d’énergie, la valeur FUEL RATIO du menu des stands. Durée au tour moyen de l’équipage.</p></section>`;
}

// The stint the tyre wear is shown for: chosen by the pilot, else as many laps as the crew's energy allows.
function stintLaps() {
  if (view.stint) return view.stint;
  const crew = paceRows(view.cond)[0];
  return Math.max(1, Math.min(60, availableLaps(view.sheet.combo.capacity,crew?.fuel,crew?.ve,view.reserve) ?? 12));
}

function tyres() {
  const compounds = view.sheet.conditions[view.cond].compounds;
  const names = Object.keys(compounds);
  if (!names.length) return '<section><div class="cb-head"><h2>Pneus</h2></div><p class="cb-empty">Pas encore de tour propre dans cette condition.</p></section>';
  if (!names.includes(view.compound)) view.compound = names.sort((a, b) => compounds[b].laps - compounds[a].laps)[0];
  return `<section><div class="cb-head"><h2>Pneus</h2></div>
    <div class="cb-compounds" role="group" aria-label="Gomme">${names.map(name => `<button type="button" class="cb-pill" data-compound="${esc(name)}" aria-pressed="${name === view.compound}">${esc(name)}<small>${compounds[name].laps} tours${compounds[name].trackTemp ? ` · piste ${fr(compounds[name].trackTemp[0], 0)}–${fr(compounds[name].trackTemp[1], 0)} °C` : ''}</small></button>`).join('')}</div>
    <div class="cb-stint"><label for="cb-stint">Usure sur un relais de</label><input type="number" id="cb-stint" min="1" max="60" value="${stintLaps()}" data-field="stint"><span>tours${view.stint ? '' : ' <span class="cb-src">(selon les consommations disponibles, ou 12 tours à défaut)</span>'}</span></div>
    <div class="cb-stint"><label for="cb-tyre-initial">Gomme restante au départ (%)</label><input type="number" id="cb-tyre-initial" min="0" max="100" value="${view.tyreInitial ?? 100}" data-field="tyreInitial"><label for="cb-tyre-relays">Relais cumulés</label><select id="cb-tyre-relays" data-field="tyreRelays">${[1,2,3].map(n=>`<option value="${n}"${n===(view.tyreRelays||1)?' selected':''}>${n}</option>`).join('')}</select></div><p class="cb-src">Projection linéaire, sans changement de gomme.</p><div class="cb-tyres" data-tyres>${tyreCards()}</div></section>`;
}

function tyreCards() {
  const rows = tyreRows(view.cond, view.compound);
  // Least worn tyre at each corner; its tread left after the stint is the highest.
  const best = [0, 1, 2, 3].map(index => bestOf(rows, row => row.wear[index]));
  return WHEELS.map((wheel, index) => `<div class="cb-tyre"><div class="cb-tyre-name">${wheel}</div><table class="cb-mini"><thead><tr><th></th><th><span class="cb-word">Usure </span>/ tour (%)</th><th><span class="cb-word">Restant après ${stintLaps()*(view.tyreRelays||1)} t.</span><span class="cb-short">Reste</span> (%)</th><th>Carcasse (°C)</th><th>Pression (kPa)</th><th>Frein (°C)</th></tr></thead><tbody>${rows.length ? rows.map(row =>
    `<tr${rowClass(row)}>${nameCell(row, true)}${cell(row, row.wear[index], best[index], fr(row.wear[index]))}${cell(row, row.wear[index], best[index], known(row.wear[index]) ? fr(tyreRemaining(view.tyreInitial ?? 100,row.wear[index],stintLaps()*(view.tyreRelays||1)), 1) : '—')}<td>${fr(row.temp[index], 0)}</td><td>${fr(row.kpa[index], 0)}</td><td>${fr(row.brake[index], 0)}</td></tr>`).join('') : none(6)}</tbody></table></div>`).join('');
}

function pace(rows) {
  const top = {avg:bestOf(rows, row => row.avg), best:bestOf(rows, row => row.best), slope:bestOf(rows, row => row.slope)};
  const slope = value => known(value) ? `${value > 0 ? '+' : value < 0 ? '−' : ''}${fr(Math.abs(value), 3)}` : '—';
  const table = `<thead><tr><th>Pilote</th><th>Tours</th><th>Moyenne</th><th>Meilleur</th><th>Évolution / tour (s)</th></tr></thead><tbody>${rows.length ? rows.map(row =>
    `<tr${rowClass(row)}>${nameCell(row)}<td>${row.laps}</td>${cell(row, row.avg, top.avg, `${lapTime(row.avg)}${delta(row, 'avg', 2, ' s')}`)}${cell(row, row.best, top.best, lapTime(row.best))}${cell(row, row.slope, top.slope, slope(row.slope))}</tr>`).join('') : none(5)}</tbody>`;
  // Sectors: the mean, with the best below; the ideal lap adds up the best three.
  const sectorRows = rows.filter(row => row.sectors);
  const seconds = value => known(value) ? fr(value, 3) : '—';
  const idealOf = row => row.sectors.best.every(known) ? row.sectors.best.reduce((a, b) => a + b, 0) : null;
  const topAvg = [0, 1, 2].map(index => bestOf(sectorRows, row => row.sectors.avg[index]));
  const topBest = [0, 1, 2].map(index => bestOf(sectorRows, row => row.sectors.best[index]));
  const topIdeal = bestOf(sectorRows, idealOf);
  const sectors = sectorRows.length ? `<div class="cb-wrap"><table><thead><tr><th>Pilote</th><th>Secteur 1</th><th>Secteur 2</th><th>Secteur 3</th><th>Tour idéal</th></tr></thead><tbody>${sectorRows.map(row => {
    const ideal = idealOf(row);
    const sub = index => `<span class="cb-sub${isBest(row, row.sectors.best[index], topBest[index]) ? ' cb-best-sub' : ''}"><span class="cb-word">meilleur </span>${seconds(row.sectors.best[index])}</span>`;
    return `<tr${rowClass(row)}>${nameCell(row)}${[0, 1, 2].map(index => cell(row, row.sectors.avg[index], topAvg[index], `${seconds(row.sectors.avg[index])}${sub(index)}`)).join('')}${cell(row, ideal, topIdeal, `${lapTime(ideal)}<span class="cb-sub"><span class="cb-word">sur </span>${row.sectors.laps} t<span class="cb-word">ours</span></span>`)}</tr>`;
  }).join('')}</tbody></table></div>` : '';
  return `<section><div class="cb-head"><h2>Rythme</h2></div><div class="cb-wrap"><table>${table}</table></div>
    <p class="cb-src">Évolution / tour : ce que le chrono gagne (−) ou perd (+) à chaque tour au fil d’un relais.</p>
    ${sectors ? `<div class="cb-head"><h2>Secteurs</h2><span class="cb-src">moyenne, meilleur en dessous ; tour idéal = somme des meilleurs secteurs</span></div>${sectors}` : ''}</section>`;
}

// The game's own service times and order for this car: a job the game marks "concurrent" runs during the refuelling
// (the longest of them counts), the others come after it one by one. Without the game's mark, the old pit guide's rule:
// driver change and wings during, tyres, brakes and repairs after.
const along = (service, key, fallback) => known(service?.[key]) ? service[key] === 1 : fallback;
const WINGS = {'':'Rien', adjust:'Réglage', new:'Remplacement'};
const REPAIRS = {'':'Aucune', aero:'Aéro', all:'Tout'};

function pitJobs() {
  const service = view.sheet.pit.service || {}, p = view.pit;
  const tyres = p.tyres >= 3 ? service.tyres4 : p.tyres >= 1 ? service.tyres2 : p.pressure ? service.pressure : 0;
  const jobs = [
    [p.tyres ? `${p.tyres} pneus` : 'Pressions', tyres, along(service, 'tyresAlong', false), p.tyres ? service.tyresRandom : 0],
    ['Pilote', p.driver ? service.driver : 0, along(service, 'driverAlong', true), p.driver ? service.driverRandom : 0],
    ['Aileron arrière', p.wing === 'new' ? service.wingNew : p.wing === 'adjust' ? service.wing : 0, true, 0],
    ['Aileron avant', p.frontWing === 'new' ? service.frontWingNew : p.frontWing === 'adjust' ? service.frontWing : 0, true, 0],
    ['Grille de radiateur', p.radiator ? service.radiator : 0, true, 0],
    ['Freins', p.brakes ? service.brakes : 0, along(service, 'brakesAlong', false), 0],
    ['Réparation', p.repair === 'all' ? service.repair : p.repair === 'aero' ? service.aeroRepair : 0, along(service, 'repairAlong', false), p.repair ? service.repairRandom : 0]
  ];
  return jobs.filter(([,time])=>!known(time) || time>0).map(([name,time,during,random])=>({name,time,during,random:known(random)?random:0}));
}

function pitNumbers() {
  const {service, laneThrough} = view.sheet.pit;
  const crew = paceRows(view.cond)[0];
  const p = view.pit, fuelMode = p.mode === 'fuel', added = Math.max(0,p.after-p.before), energyAdded = fuelMode?0:added;
  const fuel = added===0?0:fuelMode?(known(view.sheet.combo.capacity)?added*view.sheet.combo.capacity/100:null):crew && known(crew.ve) && crew.ve>0 && known(crew.fuel)?energyAdded/crew.ve*crew.fuel:null;
  const refuel = refuelDuration({fuel,energy:energyAdded,fuelRate:service?.fuelRate,energyRate:service?.energyRate,connect:service?.connect,fuelOnly:fuelMode});
  const jobs = pitJobs();
  const during = jobs.some(job=>job.during&&!known(job.time))?null:Math.max(0,...jobs.filter(job=>job.during).map(job=>job.time));
  const after = jobs.some(job=>!job.during&&!known(job.time))?null:jobs.filter(job=>!job.during).reduce((sum,job)=>sum+job.time,0);
  const stopped = [refuel,during,after].every(known)?Math.max(refuel,during)+after:null;
  const random = jobs.reduce((sum, job) => sum + job.random, energyAdded > 0 && known(service?.fuelRandom) ? service.fuelRandom : 0);
  return {energyAdded, fuel, fuelMode, missing:jobs.filter(job=>!known(job.time)).map(job=>job.name), refuel, during, after, stopped, random, laneThrough, total:known(laneThrough) && known(stopped) ? stopped + laneThrough : null};
}

function pitResult() {
  const n = pitNumbers(), pit = view.sheet.pit;
  const row = (label, value) => `<div><span>${label}</span><b>${value}</b></div>`;
  return `${n.fuelMode?'':row('Énergie ajoutée', `${n.energyAdded} %`)}${row('Carburant ajouté', known(n.fuel) ? `${fr(n.fuel, 1)} L` : '—')}
    ${row('Ravitaillement', `${fr(n.refuel, 1)} s`)}${row('En même temps', `${fr(n.during, 1)} s`)}${row('Après le ravitaillement', `${fr(n.after, 1)} s`)}
    ${row('Temps arrêté', `${fr(n.stopped, 1)} s`)}${row('Traversée de la voie des stands', known(n.laneThrough) ? `${fr(n.laneThrough, 1)} s` : '—')}
    <div class="cb-total"><span>Temps total au stand</span><b>${known(n.total) ? `${fr(n.total, 1)} s` : '—'}</b></div>
    ${n.missing.length?`<p>Temps de service inconnus : ${esc(n.missing.join(', '))}. Total indisponible.</p>`:''}
    ${!known(n.refuel)?'<p>Ravitaillement : données insuffisantes.</p>':''}
    ${n.random ? `<p>Le jeu peut ajouter jusqu’à ${fr(n.random, 0)} s au hasard.</p>` : ''}
    ${pitComparison(n)}
    <p>Temps de service lus dans le jeu pour cette voiture. ${pit.stops ? `Traversée mesurée sur ${pit.stops} arrêt${pit.stops > 1 ? 's' : ''} de l’équipe.` : 'Traversée : pas encore d’arrêt mesuré.'} Les écopes de frein n’ont pas de temps dans le jeu.</p>`;
}

function pitComparison(estimate) {
  if (!known(estimate.stopped)||!known(estimate.fuel)) return '';
  const data = view.history?.data;
  if (!data) return '<p>Charge l’historique pour comparer aux arrêts enregistrés.</p>';
  const p = view.pit;
  if (p.driver||p.brakes||p.pressure||p.wing||p.frontWing||p.radiator||p.repair)
    return '<p>La comparaison est disponible pour le ravitaillement et les pneus seuls. Les autres interventions ne sont pas détaillées dans l’historique.</p>';
  const visible = new Set(paceRows(view.cond).map(row=>row.id));
  const matches = data.stops.filter(stop=>visible.has(stop.pilot)&&!stop.repair&&stop.tyres===p.tyres&&
    Math.abs(stop.fuel-estimate.fuel)<=5&&Math.abs(stop.ve-estimate.energyAdded)<=5);
  if (!matches.length) return '<p>Aucun arrêt mesuré avec les mêmes pneus et des ajouts à ±5 L et ±5 % de VE.</p>';
  const mean = matches.reduce((sum,stop)=>sum+stop.stopped,0)/matches.length;
  const gap = mean-estimate.stopped;
  return `<p>Temps immobilisé · ${fr(estimate.stopped,1)} s simulées · ${fr(mean,1)} s mesurées (${matches.length} arrêts) · écart ${gap>=0?'+':''}${fr(gap,1)} s.</p>`;
}

function pitSummary() {
  const n = pitNumbers();
  return `${n.fuelMode?(known(n.fuel)?`+${fr(n.fuel,1)} L`:'Carburant non mesuré'):`+${n.energyAdded} % d’énergie`} · ${view.pit.tyres ? `${view.pit.tyres} pneus` : 'sans pneus'}${known(n.total) ? ` · ${fr(n.total, 1)} s au stand` : ''}`;
}

function pitQuick() {
  const n=pitNumbers();
  const time=value=>known(value)?fr(value,1)+' s':'—';
  return `<div class="cb-pit-quick"><span><small>Ravitaillement</small><strong>${time(n.refuel)}</strong></span><span><small>Immobilisation</small><strong>${time(n.stopped)}</strong></span><span><small>Durée totale</small><strong>${time(n.total)}</strong></span></div>`;
}
function pitStop() {
  const service = view.sheet.pit.service;
  if (!service) return '<details class="cb-fold"><summary><h2>Simulateur d’arrêt au stand</h2><span>temps de service pas encore lus</span></summary><div class="cb-fold-body"><p class="cb-empty">Le plugin lit les temps de service de la voiture quand elle est arrêtée aux stands. Ils apparaîtront après une séance avec un passage au stand.</p></div></details>';
  const p = view.pit;
  // A job's time as the game gives it; « pas lu » until a plugin that reads it has stopped in the pits.
  const s = value => `<small>${known(value) ? `${fr(value, 1)} s` : 'pas lu'}</small>`;
  const check = (field, label, time) => `<label class="cb-toggle"><input type="checkbox" data-pit-field="${field}"${p[field] ? ' checked' : ''}> ${label} ${s(time)}</label>`;
  const radios = (field, labels, times) => Object.entries(labels).map(([value, label]) => `<label class="cb-toggle"><input type="radio" name="cb-${field}" value="${value}" data-pit-field="${field}"${String(p[field]) === value ? ' checked' : ''}> ${label}${value === '' || value === '0' ? '' : ` ${s(times[value])}`}</label>`).join('');
  return `<details class="cb-fold" data-fold="pit"${view.pitOpen ? ' open' : ''}><summary class="cb-pit-heading"><div><h2>Simulateur d’arrêt au stand</h2><span data-pit-summary>${esc(pitSummary())}</span></div><div data-pit-quick>${pitQuick()}</div><span class="cb-pit-configure">Configurer</span></summary><div class="cb-fold-body">
    <form class="cb-form" data-pit>
      <label>Mode de ravitaillement <select data-field="pitMode"><option value="energy"${p.mode!=='fuel'?' selected':''}>Énergie virtuelle + carburant</option><option value="fuel"${p.mode==='fuel'?' selected':''}>Carburant seul</option></select></label>
      ${p.mode==='fuel'?`<p class="cb-src">Capacité du réservoir : ${known(view.sheet.combo.capacity)?`${fr(view.sheet.combo.capacity,1)} L`:'non mesurée'}. Pour les voitures sans énergie virtuelle.</p>`:''}
      <div class="cb-ctrl"><label for="cb-before">${p.mode==='fuel'?'Réservoir':'Énergie dans la voiture'} à l’arrivée <output data-out="before">${p.before} %</output></label><input type="range" id="cb-before" min="0" max="100" value="${p.before}" data-pit-field="before"></div>
      <div class="cb-ctrl"><label for="cb-after">${p.mode==='fuel'?'Réservoir':'Énergie'} au départ du stand <output data-out="after">${p.after} %</output></label><input type="range" id="cb-after" min="0" max="100" value="${p.after}" data-pit-field="after"></div>
      <fieldset><legend>Pneus</legend>${radios('tyres', {0:'Aucun', 2:'1 ou 2 pneus', 4:'3 ou 4 pneus'}, {2:service.tyres2, 4:service.tyres4})}${p.tyres ? '' : check('pressure', 'Pressions seules', service.pressure)}</fieldset>
      <fieldset><legend>Pilote</legend>${check('driver', 'Changement de pilote', service.driver)}</fieldset>
      <details class="cb-pit-advanced" data-fold="pit-advanced"${view.pitAdvancedOpen?' open':''}><summary>Autres interventions</summary><fieldset><legend>Aileron arrière</legend>${radios('wing', WINGS, {adjust:service.wing, new:service.wingNew})}</fieldset>
      ${known(service.frontWing) || known(service.frontWingNew) ? `<fieldset><legend>Aileron avant (si la voiture en a un)</legend>${radios('frontWing', WINGS, {adjust:service.frontWing, new:service.frontWingNew})}</fieldset>` : ''}
      <fieldset><legend>Freins et radiateur</legend>${check('brakes', 'Changer les freins', service.brakes)}${check('radiator', 'Grille de radiateur', service.radiator)}</fieldset>
      <fieldset><legend>Réparation des dégâts (temps de base)</legend>${radios('repair', REPAIRS, {aero:service.aeroRepair, all:service.repair})}</fieldset></details>
    </form><div class="cb-result" aria-live="polite" data-pit-result>${pitResult()}</div></div></details>`;
}

function notes() {
  const {notes:list,race,canManageNotes} = view.sheet;
  const fields = (note = {}) => `<div class="cb-note-fields"><label>Thème <select name="theme">${Object.entries(NOTE_THEMES).map(([key,name])=>`<option value="${key}"${key===note.theme?' selected':''}>${name}</option>`).join('')}</select></label>
    ${race?`<label>Portée <select name="eventId"><option value="">Permanente</option><option value="${esc(race.id)}"${note.eventId===race.id?' selected':''}>${esc(race.name)}</option></select></label>`:''}</div>
    <textarea name="body" maxlength="1000" required aria-label="${note.id?'Modifier la note':'Nouvelle note'}">${esc(note.body||'')}</textarea>`;
  return `<section class="cb-card"><div class="cb-head"><h2>Notes de l’équipe</h2></div>
    <details class="cb-note-new" data-fold="note-new"${view.noteNewOpen?" open":""}><summary>+ Nouvelle note</summary><form class="cb-form" data-note-form>${fields()}<div><button type="submit" class="cb-btn">Ajouter la note</button></div></form></details>
    <div class="cb-notes">${list.map(note => view.editing === note.id
      ? `<form class="cb-note cb-form" data-note-edit="${esc(note.id)}">${fields(note)}<div class="cb-actions"><button type="submit" class="cb-btn">Enregistrer</button><button type="button" class="cb-btn is-quiet" data-action="cancel-note">Annuler</button></div></form>`
      : `<article class="cb-note${note.pinned?" is-pinned":""}"><div class="cb-note-meta"><span>${note.pinned?'📌 ':''}${esc(NOTE_THEMES[note.theme])} · ${esc(note.eventId?race?.name:'Permanente')} · ${esc(note.author)} · ${esc(day(seconds(note.createdAt)))}</span>
        ${canManageNotes?`<button type="button" data-action="pin-note" data-id="${esc(note.id)}" aria-pressed="${note.pinned}">${note.pinned?'Désépingler':'Épingler'}</button>`:''}
        ${note.mine || canManageNotes ? `<button type="button" data-action="edit-note" data-id="${esc(note.id)}">Modifier</button><button type="button" data-action="delete-note" data-id="${esc(note.id)}">Supprimer</button>` : ''}</div><p>${esc(note.body)}</p></article>`).join('') || '<p class="cb-empty">Pas encore de note.</p>'}</div></section>`;
}

async function saveNote(form) {
  const input = Object.fromEntries(new FormData(form));
  const id = form.dataset.noteEdit;
  if (!input.body?.trim()) return;
  const button = form.querySelector('[type="submit"]');
  button.disabled = true;
  try {
    if (id) await call('/api/combos/notes/'+encodeURIComponent(id),'PATCH',input);
    else await call('/api/combos/notes','POST',{track:view.combo.track,car:view.combo.car,...input});
    view.editing = null; view.noteNewOpen=false;
    view.message = 'Note enregistrée.';
    await loadSheet();
  } catch (error) {
    const status = form.querySelector('[role="alert"]') || form.appendChild(document.createElement('p'));
    status.setAttribute('role','alert');
    status.textContent = error.message;
    button.disabled = false;
  }
}

// Races being prepared and game versions: a session belongs to them by its date.
function periodsCard() {
  const {events, versions} = view.sheet.periods;
  const item = (period, detail) => `<div class="cb-period"><span>${esc(period.name)} <small>${esc(detail)}</small></span>${view.sheet.canManagePeriods ? `<button type="button" class="cb-btn is-quiet" data-action="delete-period" data-id="${esc(period.id)}" aria-label="Supprimer ${esc(period.name)}">Supprimer</button>` : ''}</div>`;
  return `<details class="cb-fold" data-fold="periods"${view.periodsOpen ? ' open' : ''}><summary><h2>Épreuves et versions</h2><span>${events.length} épreuve${events.length > 1 ? 's' : ''} · ${versions.length} version${versions.length > 1 ? 's' : ''}</span></summary><div class="cb-fold-body">
    <div class="cb-periods"><b>Épreuves préparées</b>${events.map(period => item(period, `${day(period.startsAt)} → ${day(period.endsAt)}${period.track ? '' : ' · tous les circuits'}`)).join('') || '<p class="cb-empty">Aucune.</p>'}
      ${view.sheet.canManagePeriods ? `<form class="cb-form" data-period="event"><input type="text" maxlength="80" placeholder="24h du Mans 2026" aria-label="Nom de l’épreuve" data-name required>
        <div class="cb-row"><label class="cb-src">Du<input type="date" data-start required></label><label class="cb-src">Au<input type="date" data-end required></label></div>
        <label class="cb-check"><input type="checkbox" data-this-track checked> Seulement sur ${esc(view.combo.track)}</label><div><button type="submit" class="cb-btn">Ajouter l’épreuve</button></div></form>` : ''}</div>
    <div class="cb-periods"><b>Versions du jeu / BoP</b>${versions.map(period => item(period, `depuis le ${day(period.startsAt)}`)).join('') || '<p class="cb-empty">Aucune.</p>'}
      ${view.sheet.canManagePeriods ? `<form class="cb-form" data-period="version"><input type="text" maxlength="80" placeholder="BoP du 3 octobre" aria-label="Nom de la version" data-name required>
        <label class="cb-src">À partir du<input type="date" data-start required></label><p class="cb-src">Une version dure jusqu’au début de la suivante.</p><div><button type="submit" class="cb-btn">Ajouter la version</button></div></form>` : ''}</div>
  </div></details>`;
}

function historyKey() { const q=sheetQuery(); q.set('cond',view.cond); return q.toString(); }
async function loadHistory() {
  if (!view.sheet) return;
  const key=historyKey(), pending={key,loading:true,data:null,error:''};
  view.history=pending; render();
  try {
    const data=await call('/api/combos/history?'+key);
    if (view.history!==pending || !view.sheet || historyKey()!==key) return;
    view.history={key,loading:false,data,error:''};
  } catch(error) {
    if (view.history!==pending) return;
    view.history={key,loading:false,data:null,error:error.message};
  }
  render();
}
function historyCard() {
  const key=historyKey(), h=view.history?.key===key?view.history:null;
  const names=people(),hidden=hiddenFor(),show=id=>view.scope==='crew'?view.crew.members.includes(id):view.scope==='me'?names.get(id)?.me===true:!hidden.has(id);
  const name=id=>esc(names.get(id)?.name || 'Pilote');
  const rows=(h?.data?.stints||[]).filter(row=>show(row.pilot));
  const stops=(h?.data?.stops||[]).filter(row=>show(row.pilot));
  const content=h?.loading?'<p role="status">Chargement…</p>':h?.error?`<p class="cb-message is-error">${esc(h.error)}</p>`:h?.data?`
    <h3>Relais mesurés</h3><p class="cb-src">Tours retenus dans les conditions et filtres choisis. La durée représente le temps cumulé des tours retenus, pas nécessairement le relais entier.</p>
    <div class="cb-history"><table><thead><tr><th>Pilote / date</th><th>Tours retenus</th><th>Rythme</th><th>VE / t.</th><th>L / t.</th></tr></thead><tbody>${rows.map(row=>`<tr><td>${name(row.pilot)}<small>${esc(dayTime(row.at))} · t. ${row.first}–${row.last}</small></td><td>${row.laps}/${row.timed}</td><td>${lapTime(row.pace)}</td><td>${fr(row.ve)}</td><td>${fr(row.fuel)}</td></tr>`).join('')||none(5)}</tbody></table></div>
    ${h.data.moreStints?'<p class="cb-src">100 derniers relais maximum. Réduis la période pour voir les précédents.</p>':''}
    <h3>Arrêts enregistrés</h3><p class="cb-src">Arrêts sur la période choisie, toutes conditions et tous réglages confondus. Temps voie des stands ≠ temps perdu en course.</p>
    <div class="cb-history"><table><thead><tr><th>Pilote / tour</th><th>Immobilisé</th><th>Voie</th><th>Ajouts</th></tr></thead><tbody>${stops.map(row=>`<tr><td>${name(row.pilot)}<small>${esc(dayTime(row.at))} · t. ${row.lap}</small></td><td>${fr(row.stopped,1)} s</td><td>${fr(row.lane,1)} s</td><td>${fr(row.fuel,1)} L · ${fr(row.ve,1)} %<small>${row.tyres} pneus${row.repair?' · réparation':''}</small></td></tr>`).join('')||none(4)}</tbody></table></div>
    ${h.data.moreStops?'<p class="cb-src">100 derniers arrêts maximum.</p>':''}`:'<p class="cb-src">Charge les relais et arrêts enregistrés pour cette fiche.</p>';
  return `<details class="cb-fold" data-fold="history"${view.historyOpen?' open':''}><summary><h2>Relais et arrêts mesurés</h2><span>Historique</span></summary><div class="cb-fold-body">${content}<div><button type="button" data-action="history" class="cb-btn"${h?.loading?' disabled':''}>${h?.data?'Actualiser':'Charger l’historique'}</button></div></div></details>`;
}

function summaryCards(rows) {
  const row=rows.find(item=>item.crew)||rows[0];
  if(!row) return '<p class="cb-empty">Aucune mesure pour les pilotes et conditions sélectionnés.</p>';
  const laps=availableLaps(view.sheet.combo.capacity,row.fuel,row.ve,view.reserve);
  const duration=known(row.avg)&&(known(laps)||view.stint)?Math.round(row.avg*stintLaps()):null;
  const virtual=known(row.ve)&&row.ve>0;
  const items=[
    ['Rythme moyen',lapTime(row.avg),'Meilleur : '+lapTime(row.best)],
    ['Autonomie estimée',known(laps)?laps+' tours':'—','Réserve '+view.reserve+' %'],
    [virtual?'Énergie / tour':'Carburant / tour',virtual?fr(row.ve)+' %':known(row.fuel)?fr(row.fuel)+' L':'—',virtual&&known(row.fuel)?fr(row.fuel)+' L / tour':'Consommation mesurée'],
    ['Durée du relais',known(duration)?Math.floor(duration/60)+' min '+String(duration%60).padStart(2,'0')+' s':'—',stintLaps()+' tours · hors stands']
  ];
  return `<section class="cb-overview" aria-label="Synthèse des données">${items.map(([label,value,sub])=>`<div><small>${esc(label)}</small><strong>${esc(value)}</strong><small>${esc(sub)}</small></div>`).join('')}</section>`;
}

function preparation(rows) {
  const laps = stintLaps(), reserve = view.reserve;
  return `<section class="cb-card cb-prep"><div class="cb-head"><h2>Préparation de course</h2>
    <div class="cb-actions cb-no-print"><button type="button" class="cb-btn" data-action="share-prep">Partager</button><button type="button" class="cb-btn" data-action="print-prep">Imprimer</button></div></div>
    ${view.sheet.race?'<p class="cb-race-name">'+esc(view.sheet.race.name)+'</p>':''}
    <p class="cb-print-context">${esc(view.combo.track)} · ${esc(view.combo.car)} · ${COND[view.cond][0]}</p>
    ${summaryCards(rows)}<div class="cb-note-fields cb-no-print"><label>Réserve du plein (%) <input type="number" data-field="reserve" min="0" max="50" value="${reserve}"></label>
      <label>Objectif (tours) <input type="number" data-field="prepLaps" min="1" max="60" value="${laps}"></label></div>${!view.stint&&!rows.some(row=>known(availableLaps(view.sheet.combo.capacity,row.fuel,row.ve,view.reserve)))?'<p class="cb-src">Objectif de 12 tours par défaut, faute de consommation exploitable. Ajuste-le avant la course.</p>':''}
    <div data-prep-results>${preparationResults(rows)}</div>
  </section>`;
}

function preparationResults(rows) {
  const capacity=view.sheet.combo.capacity,laps=stintLaps(),reserve=view.reserve;
  const duration=pace=>!known(pace)?'—':`${Math.floor(Math.round(laps*pace)/60)} min ${String(Math.round(laps*pace)%60).padStart(2,'0')} s`;
  const target=(full,unit)=>known(full)?fr(full*(1-reserve/100)/laps)+' '+unit:'—';
  const actual=(value,unit)=>known(value)?fr(value)+' '+unit:'—';
  const row=rows.find(item=>item.crew)||rows[0];
  const limits=row?[known(row.fuel)&&row.fuel>0&&known(capacity),known(row.ve)&&row.ve>0]:[];
  return `<div class="cb-targets"><strong>Objectifs par tour</strong><span>${target(capacity,'L')}${rows.some(row=>row.ve>0)?' · '+target(100,'% VE'):''}</span><small>${laps} tours · réserve ${reserve} %</small></div>
  ${row&&limits.filter(Boolean).length===1&&limits[1]?'<p class="cb-src">Autonomie partielle : limite carburant non mesurée.</p>':''}
  ${preparationTyres(laps)}
  <details class="cb-fold cb-prep-detail" data-fold="prep-detail"${view.prepDetailOpen?' open':''}><summary><h2>Objectif par pilote</h2><span>${rows.filter(row=>!row.crew).length} pilotes</span></summary>
  <div class="cb-pilot-targets">${rows.map(row=>{const max=availableLaps(capacity,row.fuel,row.ve,reserve);return `<article style="--dc:${esc(row.color)}"><strong>${esc(row.name)}</strong><span>${actual(row.fuel,'L')} · ${actual(row.ve,'% VE')}</span><span>${known(max)?max+' tours · '+(max>=laps?'objectif tenu':'objectif non tenu'):'Autonomie inconnue'} · ${duration(row.avg)}</span></article>`;}).join('')||'<p>Aucun pilote affiché.</p>'}</div></details>
  <p class="cb-src">Estimations à partir des consommations disponibles. Durées hors stands.</p>`;
}
function preparationTyres(laps) {
  const compounds=view.sheet.conditions[view.cond].compounds;
  const names=Object.keys(compounds);
  if(!names.length)return '<section class="cb-prep-tyres"><h2>Pneus</h2><p class="cb-empty">Aucune mesure dans ces conditions.</p></section>';
  if(!names.includes(view.compound))view.compound=names.sort((a,b)=>compounds[b].laps-compounds[a].laps)[0];
  const rows=tyreRows(view.cond,view.compound),row=rows.find(item=>item.crew)||rows[0];
  const remaining=(n,i)=>row?tyreRemaining(view.tyreInitial,row.wear[i],laps*n):null;
  const minimum=n=>{const values=[0,1,2,3].map(i=>remaining(n,i)).filter(known);return values.length?Math.min(...values):null;};
  return `<section class="cb-prep-tyres"><div class="cb-head"><h2>Pneus</h2><span class="cb-src">Gomme restante estimée</span></div>
  <div class="cb-compounds" role="group" aria-label="Gomme">${names.map(name=>`<button type="button" class="cb-pill" data-compound="${esc(name)}" aria-pressed="${name===view.compound}">${esc(name)}</button>`).join('')}</div>
  <div class="cb-tyre-projection"><div class="cb-wheel-diagram" aria-label="Gomme restante aux quatre roues après un relais"><svg class="cb-car-plan" aria-hidden="true" viewBox="0 0 70 146"><g fill="var(--em-panel-2)" stroke="var(--em-muted)" stroke-width="2"><rect x="4" y="26" width="10" height="25" rx="3"/><rect x="56" y="26" width="10" height="25" rx="3"/><rect x="4" y="102" width="12" height="26" rx="3"/><rect x="54" y="102" width="12" height="26" rx="3"/><path d="M24 7 Q35 1 46 7 L56 22 59 45 52 64 51 86 59 103 59 131 Q35 143 11 131 L11 103 19 86 18 64 11 45 14 22Z"/><path d="M20 47 Q35 33 50 47 L45 64 25 64Z M25 88 L45 88 50 105 Q35 111 20 105Z" fill="var(--em-faint)"/><path d="M8 130 H62 V136 H8Z"/></g></svg>${WHEELS.map((wheel,i)=>`<div><small>${wheel}</small><strong>${known(remaining(1,i))?fr(remaining(1,i),0)+' %':'—'}</strong></div>`).join('')}</div>
  <div class="cb-relay-bars">${[1,2,3].map((n,i)=>{const value=minimum(n);return `<div><span>${['Simple','Double','Triple'][i]} relais</span><strong>${known(value)?fr(value,1)+' %':'—'}</strong><div class="cb-meter"><i style="width:${known(value)?value:0}%"></i></div></div>`;}).join('')}</div></div>
  <label class="cb-no-print cb-rubber">Gomme restante au départ (%) <input type="number" min="0" max="100" data-field="tyreInitial" value="${view.tyreInitial}"></label>
  <p class="cb-src">Projection linéaire · pneu le plus usé parmi les mesures disponibles.</p></section>`;
}
function statistics(rows) {
  const tabs=[['pace','Performances'],['energy','Consommation'],['tyres','Pneus'],['history','Historique']];
  const c=view.sheet.conditions[view.cond];
  const pilots=rows.filter(row=>!row.crew&&known(row.avg)).sort((a,b)=>a.avg-b.avg);
  const ref=pilots[0]?.avg, max=pilots.length?Math.max(0.001,pilots.at(-1).avg-ref):1;
  const chart=pilots.length?`<section class="cb-card cb-pace-chart"><h2>Rythme moyen · écart au plus rapide</h2>${pilots.map(row=>`<div class="cb-pace-row" style="--dc:${esc(row.color)}"><span>${esc(row.name)}</span><strong>${lapTime(row.avg)}</strong><span>+${fr(row.avg-ref,3)} s</span><div class="cb-meter"><i style="width:${(row.avg-ref)/max*100}%"></i></div></div>`).join('')}</section>`:'';
  const content=view.statsTab==='pace'?chart+pace(rows):view.statsTab==='energy'?energy(rows):view.statsTab==='tyres'?tyres():historyCard()+periodsCard();
  return `<nav class="cb-stat-tabs" aria-label="Catégories statistiques">${tabs.map(([key,label])=>`<button type="button" class="cb-chip" data-stats-tab="${key}" aria-pressed="${key===view.statsTab}">${label}</button>`).join('')}</nav>
  <div class="cb-stat-content">${content}</div><details class="cb-method"><summary>Comment les tours sont-ils retenus ?</summary><p class="cb-src">${c.laps} tours. Chronométrés, valides, hors stands, à moins de 7 % du meilleur tour du pilote, dans un relais d’au moins 3 tours (sauf meilleur tour retenu). Moyenne = pilotes affichés. En violet : meilleur pilote de la colonne.</p></details>`;
}

function render() {
  const message = view.message ? `<p class="cb-message" role="status">${esc(view.message)}</p>` : '';
  if (!view.combo) {
    if (view.requested) {
      const candidates = view.candidates || [];
      const choices = candidates.map(item => `<button type="button" class="cb-pick" data-combo data-track="${esc(item.track)}" data-car="${esc(item.car)}"><b>${esc(item.car)}</b><span>${esc(item.track)} · ${item.laps} tours</span></button>`).join('');
      app.innerHTML = `${message}<section class="cb-card"><div class="cb-head"><h2>${esc(view.requested)}</h2></div>${choices ? '<p>Choisis la voiture et le circuit exacts.</p><div class="cb-pick-cars">'+choices+'</div>' : '<p class="cb-empty">Aucune séance disponible pour cette combinaison.</p>'}<p><a href="/simhub.html">Voir les autres fiches</a> · <button type="button" class="cb-btn" data-action="refresh">Actualiser</button></p></section>${view.link?.linked ? '' : linkCard()}`; return;
    }
    app.innerHTML = `${message}
      <p class="cb-empty">Aucune séance reçue pour l’instant. Relie SimHub et roule : la fiche de chaque voiture et de chaque circuit se remplit toute seule, avec les chiffres de chaque pilote.</p>${linkCard()}`;
    return;
  }
  if (view.sheetLoading) { app.innerHTML = `${header()}<p class="cb-empty" role="status">Chargement de la fiche…</p>`; return; }
  if (!view.sheet) {
    app.innerHTML = `${header()}${message}<p class="cb-message is-error">${esc(view.error || 'Fiche indisponible.')}</p>${linkCard()}`;
    return;
  }
  const linked = Boolean(view.link?.linked);
  if (view.tab === 'analysis') {
    app.innerHTML = `${header()}${message}${linked ? '' : linkCard()}${analysis()}`;
    return;
  }
  const rows=paceRows(view.cond);
  app.innerHTML=`${header()}${message}${view.error?'<p class="cb-message is-error">'+esc(view.error)+'</p>':''}${linked?'':linkCard()}
    ${toolbar()}
    ${view.tab==='stats'?statistics(rows):preparation(rows)+`<div class="cb-prep-bottom">${pitStop()}${notes()}</div>`}`;
}

function filterSummary() {
  const {events,versions}=view.sheet.periods;
  const name=(items,id)=>items.find(item=>item.id===id)?.name || id;
  return [view.event && name(events,view.event),view.compareEvent && 'Comparaison avec '+name(events,view.compareEvent),
    view.version && name(versions,view.version),view.setup,
    view.since && 'Du '+view.since,view.until && 'Au '+view.until,
    view.trackMin && 'Piste ≥ '+view.trackMin+' °C',view.trackMax && 'Piste ≤ '+view.trackMax+' °C'].filter(Boolean);
}

function advanced() {
  const box=dialog('Filtres avancés',`<form>${filters()}${swatches()}
    <div class="cb-dialog-actions"><button type="button" class="cb-btn is-quiet" data-clear>Réinitialiser</button><button type="submit" class="cb-btn">Appliquer</button></div></form>`);
  const form=box.querySelector('form');
  const fields=Object.fromEntries([...form.querySelectorAll('[data-field]')].map(input=>[input.dataset.field,input]));
  const swatchesList=[...form.querySelectorAll('[data-draft-color]')];
  const initial=swatchesList.find(button=>button.getAttribute('aria-pressed')==='true')?.dataset.draftColor;
  let color=initial;
  function setColor(value) {
    color=value;
    for(const button of swatchesList)button.setAttribute('aria-pressed',String(button.dataset.draftColor===color));
  }
  for(const button of swatchesList)button.onclick=()=>setColor(button.dataset.draftColor);
  function validate() {
    fields.until.min=fields.since.value;
    fields.trackMax.min=fields.trackMin.value || '-30';
    for(const opt of fields.compare.options)opt.disabled=Boolean(opt.value && opt.value===fields.event.value);
    if(fields.compare.value===fields.event.value)fields.compare.value='';
  }
  form.oninput=validate;
  form.onchange=event=>{event.stopPropagation();validate();};
  validate();
  form.querySelector('[data-clear]').onclick=()=>{
    for(const field of Object.values(fields))field.value='';
    setColor(initial);validate();
  };
  form.onsubmit=async event=>{
    event.preventDefault();event.stopPropagation();
    const changes=Object.entries(fields).map(([key,field])=>[key==='compare'?'compareEvent':key,field.value]);
    const modified=changes.some(([key,value])=>view[key]!==value);
    box.close();
    if(color!==initial)await act(()=>call('/api/combos/color','PUT',{color}));
    if(modified || color!==initial) {Object.assign(view,Object.fromEntries(changes));await loadSheet();}
  };
}

// ---------- Actions ----------

async function act(work, success = '') {
  view.message = '';
  try { await work(); view.message = success; }
  catch (error) { view.message = error.message; }
}

const dateOf = (value, endOfDay = false) => { const [y, m, d] = String(value).split('-').map(Number); return y ? new Date(y, m - 1, d, endOfDay ? 23 : 0, endOfDay ? 59 : 0, endOfDay ? 59 : 0, endOfDay ? 999 : 0).getTime() : null; };

async function exportSheet() {
  await act(async () => {
    const base = new URLSearchParams({track:view.combo.track, car:view.combo.car});
    if (view.sheet?.race) base.set('race',view.sheet.race.id);
    let page = await call(`/api/combos/export?${base}`);
    const out = {...page, sessions:[...page.sessions]};
    while (page.next) {
      page = await call(`/api/combos/export?${base}&after=${encodeURIComponent(page.next)}`);
      out.sessions.push(...page.sessions);
    }
    delete out.next;
    const url = URL.createObjectURL(new Blob([JSON.stringify(out, null, 2)], {type:'application/json'}));
    const link = Object.assign(document.createElement('a'), {href:url, download:`fiche-${view.combo.car}-${view.combo.track}.json`.replace(/[^\w.-]+/g, '-')});
    document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, 'Fiche exportée.');
  render();
}

// Drawn again without losing the place in the list of portions.
function renderKeepingGaps() {
  const top = app.querySelector('[data-gaps]')?.scrollTop || 0;
  render();
  const list = app.querySelector('[data-gaps]');
  if (list) list.scrollTop = top;
}

app.addEventListener('click', async event => {
  // A portion, in the list or on the map: the charts zoom on it; again, the whole lap.
  const zone = event.target.closest?.('[data-zone-pick]');
  if (zone && app.contains(zone)) {
    const n = Number(zone.dataset.zonePick);
    view.analysis.zone = view.analysis.zone === n ? null : n;
    renderKeepingGaps(); return;
  }
  const target = event.target.closest('button');
  if (!target || !app.contains(target)) return;
  if(target.dataset.picker){picker.show(target.dataset.picker);return;}
  if(target.dataset.action==='advanced'){advanced();return;}
  if (target.dataset.statsTab) {view.statsTab=target.dataset.statsTab; if(view.statsTab==='history')view.historyOpen=true; render(); return;}
  if (target.dataset.scope) {view.scope=target.dataset.scope;remember();render();return;}
  if(target.dataset.action==='favorite'){const key=comboKey(view.combo);view.favorites.has(key)?view.favorites.delete(key):view.favorites.add(key);saveHidden();render();return;}
  if (target.dataset.driver) {
    if(view.scope!=='custom'){view.hidden=hiddenFor();view.scope='custom';}
    const id = target.dataset.driver;
    view.hidden.has(id) ? view.hidden.delete(id) : view.hidden.add(id);
    saveHidden(); render(); return;
  }
  if (target.dataset.cond) { view.cond = target.dataset.cond; view.explicitCondition = true; remember(); render(); return; }
  if (target.dataset.combo !== undefined) { await openCombo(target.dataset.track, target.dataset.car); return; }
  if (target.dataset.tab) {
    if (!view.sheet) return;
    view.tab = target.dataset.tab; remember();
    if (view.tab === 'analysis') await loadAnalysis(); else render();
    return;
  }
  if (target.dataset.ignore) { await ignoreLaps(target.dataset.ignore, !target.dataset.back); return; }
  if (target.dataset.metric) { view.analysis.metric = target.dataset.metric; renderKeepingGaps(); return; }
  if (target.dataset.zoneSort) { view.analysis.sort = target.dataset.zoneSort; render(); return; }
  if (target.dataset.other) { Object.assign(view.analysis, {other:target.dataset.other, zone:null}); await loadAnalysis(); return; }
  if (target.dataset.pick) { view.analysis.pick = Number(target.dataset.pick); render(); return; }
  if (target.dataset.compound) { view.compound = target.dataset.compound; render(); return; }
  if (target.dataset.moment !== undefined) { view.moment = target.dataset.moment; await loadSheet(); return; }
  switch (target.dataset.action) {
    case 'export': await exportSheet(); break;
    case 'share-prep':
      remember();
      try {
        if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(location.href);
        else if (navigator.share) await navigator.share({title:'Préparation de course',url:location.href});
        else throw Error();
        view.message = 'Lien de préparation partagé.';
      } catch { view.message = 'Lien de préparation disponible dans la barre d’adresse.'; }
      render(); break;
    case 'print-prep': window.print(); break;
    case 'pin-note': {
      const note = view.sheet.notes.find(item=>item.id===target.dataset.id);
      if (!note) return;
      await act(() => call('/api/combos/notes/'+encodeURIComponent(note.id),'PATCH',{pinned:!note.pinned}));
      await loadSheet(); break;
    }
    case 'refresh': await refresh(); break;
    case 'history': await loadHistory(); break;
    case 'edit-note': view.editing = target.dataset.id; render(); break;
    case 'cancel-note': view.editing = null; render(); break;
    case 'delete-note':
      if (!confirm('Supprimer cette note ?')) return;
      await act(() => call(`/api/combos/notes/${encodeURIComponent(target.dataset.id)}`, 'DELETE', {}));
      await loadSheet(); break;
    case 'delete-period':
      if (!confirm('Supprimer cette période ? Les séances restent, seules leurs étiquettes changent.')) return;
      await act(() => call(`/api/combos/periods/${encodeURIComponent(target.dataset.id)}`, 'DELETE', {}));
      if (view.event === target.dataset.id) view.event = '';
      if (view.version === target.dataset.id) view.version = '';
      if (view.compareEvent === target.dataset.id) view.compareEvent = '';
      await loadSheet(); break;
  }
});

app.addEventListener('change', async event => {
  if(event.target.dataset.compact==='cond'){view.cond=event.target.value;view.explicitCondition=true;remember();render();return;}
  if(event.target.dataset.compact==='moment'){view.moment=event.target.value;await loadSheet();return;}
  const field = event.target.dataset.field;
  if (['reserve','prepLaps','tyreInitial','stint'].includes(field)) {
    if (field==='reserve') view.reserve=wholeNumber(event.target.value,0,50,3);
    if (field==='prepLaps'||field==='stint') view.stint=wholeNumber(event.target.value,1,60,null);
    if (field==='tyreInitial') view.tyreInitial=wholeNumber(event.target.value,0,100,100);
    remember(); render(); return;
  }
  if (field === 'pitMode') { view.pit.mode=event.target.value; render(); return; }
  if (field === 'tyreRelays') { view.tyreRelays = Number(event.target.value); remember(); render(); return; }
  if (field === 'an-type') { Object.assign(view.analysis,{type:event.target.value,mine:'',other:'',zone:null}); await loadAnalysis(); return; }
  if (field === 'an-size') { Object.assign(view.analysis, {size:Number(event.target.value) || 450, zone:null}); render(); return; }
  if (field === 'an-mine' || field === 'an-other') {
    if (!event.target.value) return;
    view.analysis[field === 'an-mine' ? 'mine' : 'other'] = event.target.value;
    view.analysis.zone = null;
    await loadAnalysis(); return;
  }

});

app.addEventListener('input', event => {
  const target = event.target;
  if (['reserve','prepLaps'].includes(target.dataset.field)) {
    if (target.value === '' || !target.validity.valid) return;
    if (target.dataset.field==='reserve') view.reserve = Number(target.value);
    else view.stint = Number(target.value);
    remember();
    const rows=paceRows(view.cond);
    const results=app.querySelector('[data-prep-results]'); if(results)results.innerHTML=preparationResults(rows);
    const overview=app.querySelector('.cb-overview');
    if (overview && rows.length) {
      const container=document.createElement('div');
      container.innerHTML=summaryCards(rows);
      overview.replaceWith(container.firstElementChild);
    }
    return;
  }
  if (target.dataset.field === 'tyreInitial') {
    if (target.value === '') return;
    view.tyreInitial = Math.min(100, Math.max(0, Number(target.value)));
    const cards = app.querySelector('[data-tyres]'); if (cards) cards.innerHTML = tyreCards(); return;
  }
  if (target.dataset.field === 'stint') {
    view.stint = Math.min(60, Math.max(1, Math.round(Number(target.value)) || stintLaps()));
    const cards = app.querySelector('[data-tyres]');
    if (cards) cards.innerHTML = tyreCards();
    return;
  }
  const pitField = target.dataset.pitField;
  if (!pitField) return;
  if (target.type === 'checkbox') view.pit[pitField] = target.checked;
  else if (target.type === 'radio' && pitField !== 'tyres') view.pit[pitField] = target.value;
  else view.pit[pitField] = Number(target.value);
  // The pressures alone only make sense without new tyres: the choice is shown or hidden.
  if (pitField === 'tyres') {
    const form = app.querySelector('[data-pit]'), open = view.pitOpen;
    if (form) { app.querySelector('[data-fold="pit"]').outerHTML = pitStop(); view.pitOpen = open; }
  }
  if (view.pit.after < view.pit.before) view.pit.after = view.pit.before;
  for (const key of ['before', 'after']) {
    const output = app.querySelector(`[data-out="${key}"]`);
    if (output) output.textContent = `${view.pit[key]} %`;
  }
  const after = app.querySelector('[data-pit-field="after"]');
  if (after && Number(after.value) !== view.pit.after) after.value = view.pit.after;
  app.querySelector('[data-pit-result]').innerHTML = pitResult();
  app.querySelector('[data-pit-summary]').textContent = pitSummary();
  const quick=app.querySelector('[data-pit-quick]'); if(quick)quick.innerHTML=pitQuick();
});

// « Mon analyse »: the point under the pointer, on the map and along the lap.
app.addEventListener('pointermove', event => {
  if (view.tab !== 'analysis' || !event.target.closest?.('[data-chart], [data-map]')) return;
  const sides = analysisSides(), d = distanceUnder(event, sides);
  if (d !== null) showCursor(app, sides, d);
});

// The folds keep their state when the page is drawn again.
app.addEventListener('toggle', event => {
  const fold = event.target.dataset?.fold;
  if (fold === 'prep-detail') view.prepDetailOpen=event.target.open;
  if (fold === 'note-new') view.noteNewOpen=event.target.open;
  if (fold === 'measurements') view.measurementsOpen = event.target.open;
  if (fold === 'pit-advanced') view.pitAdvancedOpen=event.target.open;
  if (fold === 'pit') view.pitOpen = event.target.open;
  if (fold === 'history') view.historyOpen = event.target.open;
  if (fold === 'periods') view.periodsOpen = event.target.open;

  if (fold === 'expert') view.analysis.expertOpen = event.target.open;
  if (fold === 'laps') view.analysis.lapsOpen = event.target.open;

}, true);

app.addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.target;
  if (form.matches('[data-note-form], [data-note-edit]')) {
    await saveNote(form);
  } else if (form.dataset.period) {
    const kind = form.dataset.period;
    const input = {kind, name:form.querySelector('[data-name]').value, startsAt:dateOf(form.querySelector('[data-start]').value)};
    if (kind === 'event') Object.assign(input, {endsAt:dateOf(form.querySelector('[data-end]').value, true), track:form.querySelector('[data-this-track]').checked ? view.combo.track : ''});
    await act(() => call('/api/combos/periods', 'POST', input), kind === 'event' ? 'Épreuve ajoutée.' : 'Version ajoutée.');
    await loadSheet();
  }
});
