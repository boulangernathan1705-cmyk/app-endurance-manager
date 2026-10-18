// « Fiches combo » (server/combos.mjs, module "combos"): what the team measured in practice on one car and one
// track, sent by each pilot's SimHub plugin. Raw numbers only, no advice: each pilot in his colour, the white
// « Équipage » row is the plain mean of the pilots shown (each counts once). Conditions are framed blocks.
import {COLORS, CONDITIONS} from '../shared/combos.mjs';

const app = document.getElementById('combos-app');
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const known = value => value !== null && value !== undefined && Number.isFinite(Number(value));
const fr = (value, digits = 2) => known(value) ? Number(value).toLocaleString('fr-FR', {minimumFractionDigits:digits, maximumFractionDigits:digits}) : '—';
const lapTime = seconds => known(seconds) ? `${Math.floor(seconds / 60)}:${(seconds % 60).toFixed(3).padStart(6, '0').replace('.', ',')}` : '—';
const day = ms => new Date(ms).toLocaleDateString('fr-FR', {day:'numeric', month:'short', year:'numeric'});
// Sessions and periods are in milliseconds; links and notes, like the rest of the site, in seconds.
const seconds = value => value * 1000;
const dayTime = ms => new Date(ms).toLocaleString('fr-FR', {day:'numeric', month:'short', hour:'2-digit', minute:'2-digit'});
const COND = {dry:['Sec', ''], damp:['Humide', 'damp'], rain:['Pluie', 'rain']};
const WHEELS = ['Avant gauche', 'Avant droit', 'Arrière gauche', 'Arrière droit'];
const CREW = {id:'crew', name:'Équipage', color:'#f0f3f2', crew:true};
const STORE = 'em-combos-hidden';

const view = {
  combos:[], combo:null, sheet:null, compare:null, link:null, code:'', copied:false, linkBusy:false,
  event:'', version:'', setup:'', compareEvent:'', cond:null, compound:null, stint:12, hidden:new Set(),
  pit:{before:8, after:100, tyres:4, driver:true, wing:false, brakes:false}, pitOpen:false, periodsOpen:false, linkOpen:null,
  editing:null, message:'', error:''
};
try { view.hidden = new Set(JSON.parse(localStorage.getItem(STORE) || '[]')); } catch {}
const saveHidden = () => { try { localStorage.setItem(STORE, JSON.stringify([...view.hidden])); } catch {} };

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
  const login = error.status === 401 ? `<a class="primary-button" href="/api/auth/discord?return=${encodeURIComponent('/fiches-combo.html')}">Se connecter avec Discord</a>` : '<a class="secondary-button" href="/lmu/">Retour aux courses</a>';
  app.innerHTML = `<section class="members-panel members-error"><h1>Fiches combo</h1><p>${esc(error.message)}</p>${login}</section>`;
}

// ---------- Loading ----------

const comboKey = combo => `${combo.car}\u0000${combo.track}`;
const sheetQuery = (event = view.event) => {
  const query = new URLSearchParams({track:view.combo.track, car:view.combo.car});
  if (event) query.set('event', event);
  if (view.version) query.set('version', view.version);
  if (view.setup) query.set('setup', view.setup);
  return query;
};

async function start() {
  const params = new URLSearchParams(location.search);
  view.event = params.get('event') || ''; view.version = params.get('version') || ''; view.setup = params.get('setup') || '';
  try {
    const [list, link] = await Promise.all([call('/api/combos'), call('/api/combos/link')]);
    view.combos = list.combos; view.link = link;
  } catch (error) { renderError(error); return; }
  const wanted = view.combos.find(item => item.track === params.get('track') && item.car === params.get('car'));
  view.combo = wanted || view.combos[0] || null;
  if (view.combo) await loadSheet(); else render();
}

async function loadSheet() {
  try {
    const [sheet, compare] = await Promise.all([call(`/api/combos/sheet?${sheetQuery()}`),
      view.compareEvent && view.compareEvent !== view.event ? call(`/api/combos/sheet?${sheetQuery(view.compareEvent)}`) : null]);
    view.sheet = sheet; view.compare = compare; view.error = '';
  } catch (error) {
    if (error.status === 401 || error.status === 403) { renderError(error); return; }
    view.error = error.message;
  }
  if (view.sheet) {
    const conditions = view.sheet.conditions;
    if (!view.cond || !conditions[view.cond]?.laps) view.cond = CONDITIONS.find(cond => conditions[cond].laps) || 'dry';
    const query = sheetQuery();
    history.replaceState(null, '', `${location.pathname}?${query}`);
  }
  render();
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

const mean = values => { const list = values.filter(known).map(Number); return list.length ? list.reduce((a, b) => a + b, 0) / list.length : null; };
const meanOf = (rows, key) => mean(rows.map(row => row[key]));
const meanFour = (rows, key) => [0, 1, 2, 3].map(index => mean(rows.map(row => row[key]?.[index])));
const minOf = values => { const list = values.filter(known).map(Number); return list.length ? Math.min(...list) : null; };

function paceRows(condition, sheet = view.sheet) {
  const who = people();
  const rows = (sheet?.conditions[condition]?.drivers || []).filter(row => !view.hidden.has(row.id) && who.has(row.id))
    .map(row => ({...row, ...who.get(row.id), laps:row.laps}));
  if (rows.length < 2) return rows;
  const sectors = rows.filter(row => row.sectors);
  return [{...CREW, laps:rows.reduce((sum, row) => sum + row.laps, 0), ve:meanOf(rows, 've'), fuel:meanOf(rows, 'fuel'), avg:meanOf(rows, 'avg'),
    best:minOf(rows.map(row => row.best)), slope:meanOf(rows, 'slope'),
    sectors:sectors.length ? {laps:sectors.reduce((sum, row) => sum + row.sectors.laps, 0), avg:[0, 1, 2].map(index => mean(sectors.map(row => row.sectors.avg[index]))),
      best:[0, 1, 2].map(index => minOf(sectors.map(row => row.sectors.best[index])))} : null}, ...rows];
}

function tyreRows(condition, compound) {
  const who = people();
  const rows = (view.sheet.conditions[condition]?.compounds[compound]?.drivers || []).filter(row => !view.hidden.has(row.id) && who.has(row.id))
    .map(row => ({...row, ...who.get(row.id), laps:row.laps}));
  if (rows.length < 2) return rows;
  return [{...CREW, laps:rows.reduce((sum, row) => sum + row.laps, 0), wear:meanFour(rows, 'wear'), temp:meanFour(rows, 'temp'), kpa:meanFour(rows, 'kpa'), brake:meanFour(rows, 'brake')}, ...rows];
}

const nameCell = (row, dot = false) => `<td class="cb-name" style="--dc:${esc(row.color)}">${dot ? '<span class="cb-dot"></span>' : ''}${esc(row.name)}${row.me ? ' (moi)' : ''}</td>`;
const rowClass = row => row.crew ? ' class="cb-crew"' : '';
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

function linkCard() {
  const link = view.link || {};
  const open = view.linkOpen ?? (!link.linked || Boolean(view.code));
  const state = link.linked ? `<span class="cb-state is-on" aria-hidden="true"></span><b>SimHub relié</b><span>${link.lastSeen ? `dernier contact le ${esc(dayTime(seconds(link.lastSeen)))}` : 'en attente de la première séance'}</span>`
    : '<span class="cb-state" aria-hidden="true"></span><b>Relier SimHub</b><span>une seule fois, pour que tes séances arrivent ici toutes seules</span>';
  const code = view.code ? `<div class="cb-code"><input type="text" readonly value="${esc(view.code)}" aria-label="Ton code de liaison" data-code><button type="button" class="cb-btn" data-action="copy-code">Copier le code</button></div>
    <p class="${view.copied ? 'cb-ok' : 'cb-src'}">${view.copied ? 'Code copié. Ouvre le menu « Fiches combo » de SimHub : il le trouve tout seul.' : 'Copie ce code, puis colle-le dans SimHub.'} Il ne s’affiche qu’une fois : un nouveau code remplace l’ancien.</p>` : '';
  return `<details class="cb-link" data-fold="link"${open ? ' open' : ''}><summary>${state}</summary><div class="cb-link-body">
    <ol class="cb-steps">
      <li><b>Installe le plugin</b> : double-clique sur « Installer le plugin », livré avec <code>EnduranceManager.SimHub.dll</code>. Il ferme et relance SimHub ; accepte le nouveau plugin.</li>
      <li><b>Crée ton code</b> avec le bouton ci-dessous : il est copié tout seul.</li>
      <li><b>Ouvre le menu « Fiches combo » de SimHub</b> : il trouve le code tout seul. Ensuite, roule : chaque séance part toute seule quand tu reviens au menu.</li>
    </ol>
    <div class="cb-actions"><button type="button" class="cb-btn is-main" data-action="new-code"${view.linkBusy ? ' disabled' : ''}>${link.linked ? 'Créer un nouveau code' : 'Créer mon code'}</button>
      ${link.linked ? '<button type="button" class="cb-btn is-quiet" data-action="unlink">Retirer la liaison</button>' : ''}</div>
    ${code}</div></details>`;
}

function header() {
  const sheet = view.sheet, combo = view.combo;
  const choices = view.combos.length > 1 ? `<label class="cb-crumb">Combo <select data-field="combo">${view.combos.map(item => `<option value="${esc(comboKey(item))}"${comboKey(item) === comboKey(combo) ? ' selected' : ''}>${esc(item.car)} · ${esc(item.track)}</option>`).join('')}</select></label>` : '';
  return `<div class="cb-topline"><div><div class="cb-crumb">Fiches combo · Le Mans Ultimate</div><h1>${esc(combo.car)} · ${esc(combo.track)}</h1></div>
    <div class="cb-actions">${sheet?.combo.carClass ? `<span class="cb-crumb">${esc(sheet.combo.carClass)}</span>` : ''}${choices}<button type="button" class="cb-btn" data-action="export">Exporter la fiche</button></div></div>`;
}

function filters() {
  const {periods, setups} = view.sheet;
  const option = (value, label, current) => `<option value="${esc(value)}"${value === current ? ' selected' : ''}>${esc(label)}</option>`;
  return `<div class="cb-filters">
    <label>Épreuve<select data-field="event">${option('', 'Toutes les dates', view.event)}${periods.events.map(item => option(item.id, item.name, view.event)).join('')}</select></label>
    <label>Version / BoP<select data-field="version">${option('', 'Toutes les versions', view.version)}${periods.versions.map(item => option(item.id, item.name, view.version)).join('')}</select></label>
    <label>Comparer avec<select data-field="compare">${option('', 'Rien', view.compareEvent)}${periods.events.filter(item => item.id !== view.event).map(item => option(item.id, item.name, view.compareEvent)).join('')}</select></label>
    <label>Réglage<select data-field="setup">${option('', 'Tous les réglages', view.setup)}${setups.map(item => option(item.name, `${item.name} · ${item.laps} tours`, view.setup)).join('')}${view.setup && !setups.some(item => item.name === view.setup) ? option(view.setup, view.setup, view.setup) : ''}</select></label>
  </div>`;
}

function sample() {
  const s = view.sheet.sample;
  if (!s.laps) return '<p class="cb-empty">Aucune séance sur ces dates.</p>';
  return `<div class="cb-sample"><span><b>${s.laps}</b> tours mesurés</span><span><b>${s.drivers}</b> pilote${s.drivers > 1 ? 's' : ''}</span><span><b>${s.sessions}</b> séance${s.sessions > 1 ? 's' : ''}</span>
    <span>du <b>${esc(day(s.from))}</b> au <b>${esc(day(s.to))}</b></span>${view.compare ? `<span>comparé à <b>${esc(compareName())}</b></span>` : ''}</div>`;
}

function drivers() {
  const list = [...people().values()];
  if (!list.length) return '';
  const me = list.find(item => item.me);
  const swatches = me ? `<div class="cb-colors"><span>Ma couleur</span>${COLORS.map(color => `<button type="button" class="cb-swatch" style="--dc:${color}" data-color="${color}" aria-label="Couleur ${color}" aria-pressed="${color === me.color}"></button>`).join('')}</div>` : '';
  return `<div class="cb-drivers" role="group" aria-label="Pilotes affichés"><span>Pilotes affichés</span>${list.map(item => `<button type="button" class="cb-chip" style="--dc:${esc(item.color)}" data-driver="${esc(item.id)}" aria-pressed="${!view.hidden.has(item.id)}"><i></i>${esc(item.name)}${item.me ? ' (moi)' : ''}</button>`).join('')}</div>${swatches}`;
}

function conditions() {
  const conds = view.sheet.conditions;
  return `<div class="cb-conds" role="group" aria-label="Conditions de piste">${CONDITIONS.map(cond => `<button type="button" class="cb-cond ${COND[cond][1]}" data-cond="${cond}" aria-pressed="${cond === view.cond}"><b>${COND[cond][0]}</b>${conds[cond].laps} tours</button>`).join('')}</div>`;
}

function energy(rows) {
  const table = `<thead><tr><th>Pilote</th><th>Tours</th><th>Énergie / tour</th><th>Tours / relais</th><th>Carburant / tour</th></tr></thead><tbody>${rows.length ? rows.map(row =>
    `<tr${rowClass(row)}>${nameCell(row)}<td>${row.laps}</td><td>${known(row.ve) ? `${fr(row.ve)} %` : '—'}${delta(row, 've', 2, ' %')}</td><td>${known(row.ve) && row.ve > 0 ? fr(100 / row.ve, 1) : '—'}</td><td>${known(row.fuel) ? `${fr(row.fuel)} L` : '—'}</td></tr>`).join('') : none(5)}</tbody>`;
  // How much energy a lap may use for a stint of N laps, and which pilots stay under it.
  const pilots = rows.filter(row => !row.crew && known(row.ve) && row.ve > 0);
  const worst = pilots.length ? Math.max(...pilots.map(row => row.ve)) : null;
  const whole = worst ? Math.max(2, Math.floor(100 / worst)) : null;
  const stints = whole ? `<div class="cb-wrap"><table><thead><tr><th>Relais de</th><th>Énergie / tour à tenir</th><th style="text-align:left">Pilotes en dessous</th></tr></thead><tbody>${[whole - 1, whole, whole + 1, whole + 2].map(laps => {
    const under = pilots.filter(row => row.ve <= 100 / laps);
    return `<tr><td>${laps} tours</td><td>${fr(100 / laps)} %</td><td><div class="cb-dots">${under.map(row => `<span class="cb-dot" style="--dc:${esc(row.color)}" title="${esc(row.name)}"></span>`).join('') || '<span class="cb-src">aucun</span>'}</div></td></tr>`;
  }).join('')}</tbody></table></div>` : '';
  return `<section><div class="cb-head"><h2>Énergie virtuelle</h2><span class="cb-src">tours propres, hors tours de stand</span></div>
    <div class="cb-tables"><div class="cb-wrap"><table>${table}</table></div>${stints ? `<div>${stints}</div>` : ''}</div></section>`;
}

function tyres() {
  const compounds = view.sheet.conditions[view.cond].compounds;
  const names = Object.keys(compounds);
  if (!names.length) return '<section><div class="cb-head"><h2>Pneus</h2></div><p class="cb-empty">Pas encore de tour propre dans cette condition.</p></section>';
  if (!names.includes(view.compound)) view.compound = names.sort((a, b) => compounds[b].laps - compounds[a].laps)[0];
  return `<section><div class="cb-head"><h2>Pneus</h2><span class="cb-src">usure en % de la gomme par tour</span></div>
    <div class="cb-compounds" role="group" aria-label="Gomme">${names.map(name => `<button type="button" class="cb-pill" data-compound="${esc(name)}" aria-pressed="${name === view.compound}">${esc(name)}<small>${compounds[name].laps} tours</small></button>`).join('')}</div>
    <div class="cb-stint"><label for="cb-stint">Usure affichée pour un relais de</label><input type="number" id="cb-stint" min="1" max="60" value="${view.stint}" data-field="stint"><span>tours</span></div>
    <div class="cb-tyres" data-tyres>${tyreCards()}</div></section>`;
}

function tyreCards() {
  const rows = tyreRows(view.cond, view.compound);
  return WHEELS.map((wheel, index) => `<div class="cb-tyre"><div class="cb-tyre-name">${wheel}</div><table class="cb-mini"><thead><tr><th></th><th>% / tour</th><th>Sur ${view.stint} t.</th><th>Carcasse</th><th>Pression</th><th>Frein</th></tr></thead><tbody>${rows.length ? rows.map(row =>
    `<tr${rowClass(row)}>${nameCell(row, true)}<td>${fr(row.wear[index])}</td><td>${known(row.wear[index]) ? `${fr(row.wear[index] * view.stint, 1)} %` : '—'}</td><td>${known(row.temp[index]) ? `${fr(row.temp[index], 0)} °C` : '—'}</td><td>${known(row.kpa[index]) ? `${fr(row.kpa[index], 0)} kPa` : '—'}</td><td>${known(row.brake[index]) ? `${fr(row.brake[index], 0)} °C` : '—'}</td></tr>`).join('') : none(6)}</tbody></table></div>`).join('');
}

function pace(rows) {
  const slope = value => known(value) ? `${value > 0 ? '+' : value < 0 ? '−' : ''}${fr(Math.abs(value), 3)} s` : '—';
  const table = `<thead><tr><th>Pilote</th><th>Tours</th><th>Moyenne</th><th>Meilleur</th><th>Perte / tour en relais</th></tr></thead><tbody>${rows.length ? rows.map(row =>
    `<tr${rowClass(row)}>${nameCell(row)}<td>${row.laps}</td><td>${lapTime(row.avg)}${delta(row, 'avg', 2, ' s')}</td><td>${lapTime(row.best)}</td><td>${slope(row.slope)}</td></tr>`).join('') : none(5)}</tbody>`;
  // Sectors: the mean, with the best below; the ideal lap adds up the best three.
  const sectorRows = rows.filter(row => row.sectors);
  const seconds = value => known(value) ? fr(value, 3) : '—';
  const sectors = sectorRows.length ? `<div class="cb-wrap" style="max-width:760px"><table><thead><tr><th>Pilote</th><th>Secteur 1</th><th>Secteur 2</th><th>Secteur 3</th><th>Tour idéal</th></tr></thead><tbody>${sectorRows.map(row => {
    const ideal = row.sectors.best.every(known) ? row.sectors.best.reduce((a, b) => a + b, 0) : null;
    return `<tr${rowClass(row)}>${nameCell(row)}${[0, 1, 2].map(index => `<td>${seconds(row.sectors.avg[index])}<span class="cb-sub">meilleur ${seconds(row.sectors.best[index])}</span></td>`).join('')}<td>${lapTime(ideal)}<span class="cb-sub">${row.sectors.laps} tours</span></td></tr>`;
  }).join('')}</tbody></table></div>` : '';
  return `<section><div class="cb-head"><h2>Rythme</h2><span class="cb-src">tours propres, hors tours de stand</span></div><div class="cb-wrap" style="max-width:760px"><table>${table}</table></div>
    ${sectors ? `<div class="cb-head"><h2>Secteurs</h2><span class="cb-src">moyenne, et meilleur temps en dessous</span></div>${sectors}` : ''}</section>`;
}

// The game's rule, as in the old pit guide: fuel, energy, wing and driver change run together; tyres and
// brakes come after. Service times are the game's own for this car.
function pitNumbers() {
  const {service, laneThrough} = view.sheet.pit;
  const crew = paceRows(view.cond)[0];
  const p = view.pit, energyAdded = Math.max(0, p.after - p.before);
  const fuel = crew && known(crew.ve) && crew.ve > 0 && known(crew.fuel) ? energyAdded / crew.ve * crew.fuel : null;
  const fill = fuel > 0 && known(service?.fuelRate) && service.fuelRate > 0 ? (service.connect || 0) + fuel / service.fuelRate : 0;
  const charge = known(service?.energyRate) && service.energyRate > 0 ? energyAdded / service.energyRate : 0;
  const along = Math.max(fill, charge, p.wing ? service?.wing || 0 : 0, p.driver ? service?.driver || 0 : 0);
  const after = (p.tyres === 4 ? service?.tyres4 || 0 : p.tyres === 2 ? service?.tyres2 || 0 : 0) + (p.brakes ? service?.brakes || 0 : 0);
  const stopped = along + after;
  return {energyAdded, fuel, charge, after, stopped, laneThrough, total:known(laneThrough) ? stopped + laneThrough : null};
}

function pitResult() {
  const n = pitNumbers(), pit = view.sheet.pit;
  return `<div><span>Énergie ajoutée</span><b>${n.energyAdded} %</b></div><div><span>Carburant ajouté</span><b>${known(n.fuel) ? `${fr(n.fuel, 1)} L` : '—'}</b></div>
    <div><span>Ravitaillement (énergie)</span><b>${fr(n.charge, 1)} s</b></div><div><span>Pneus et freins</span><b>${fr(n.after, 1)} s</b></div>
    <div><span>Temps arrêté</span><b>${fr(n.stopped, 1)} s</b></div><div><span>Traversée de la voie des stands</span><b>${known(n.laneThrough) ? `${fr(n.laneThrough, 1)} s` : '—'}</b></div>
    <div class="cb-total"><span>Temps total au stand</span><b>${known(n.total) ? `${fr(n.total, 1)} s` : '—'}</b></div>
    <p>Temps de service lus dans le jeu pour cette voiture. ${pit.stops ? `Traversée mesurée sur ${pit.stops} arrêt${pit.stops > 1 ? 's' : ''} de l’équipe.` : 'Traversée : pas encore d’arrêt mesuré.'}</p>`;
}

function pitSummary() {
  const n = pitNumbers();
  return `${n.energyAdded} % · ${view.pit.tyres ? `${view.pit.tyres} pneus` : 'sans pneus'}${known(n.total) ? ` · ${fr(n.total, 1)} s au total` : ''}`;
}

function pitStop() {
  const service = view.sheet.pit.service;
  if (!service) return '<details class="cb-fold"><summary><h2>Simulateur d’arrêt au stand</h2><span>temps de service pas encore lus</span></summary><div class="cb-fold-body"><p class="cb-empty">Le plugin lit les temps de service de la voiture quand elle est arrêtée aux stands. Ils apparaîtront après une séance avec un passage au stand.</p></div></details>';
  const p = view.pit, s = value => known(value) ? `<small>${fr(value, 1)} s</small>` : '';
  return `<details class="cb-fold" data-fold="pit"${view.pitOpen ? ' open' : ''}><summary><h2>Simulateur d’arrêt au stand</h2><span data-pit-summary>${esc(pitSummary())}</span></summary><div class="cb-fold-body">
    <form class="cb-form" data-pit>
      <div class="cb-ctrl"><label for="cb-before">Énergie dans la voiture à l’arrivée <output data-out="before">${p.before} %</output></label><input type="range" id="cb-before" min="0" max="100" value="${p.before}" data-pit-field="before"></div>
      <div class="cb-ctrl"><label for="cb-after">Énergie au départ du stand <output data-out="after">${p.after} %</output></label><input type="range" id="cb-after" min="0" max="100" value="${p.after}" data-pit-field="after"></div>
      <fieldset><legend>Pneus</legend>${[[0, 'Aucun', null], [2, '2 pneus', service.tyres2], [4, '4 pneus', service.tyres4]].map(([value, label, time]) => `<label class="cb-toggle"><input type="radio" name="cb-tyres" value="${value}" data-pit-field="tyres"${p.tyres === value ? ' checked' : ''}> ${label} ${s(time)}</label>`).join('')}</fieldset>
      <fieldset><legend>Pendant le ravitaillement</legend><label class="cb-toggle"><input type="checkbox" data-pit-field="driver"${p.driver ? ' checked' : ''}> Changement de pilote ${s(service.driver)}</label><label class="cb-toggle"><input type="checkbox" data-pit-field="wing"${p.wing ? ' checked' : ''}> Aileron ${s(service.wing)}</label></fieldset>
      <fieldset><legend>Après le ravitaillement</legend><label class="cb-toggle"><input type="checkbox" data-pit-field="brakes"${p.brakes ? ' checked' : ''}> Freins ${s(service.brakes)}</label></fieldset>
    </form><div class="cb-result" aria-live="polite" data-pit-result>${pitResult()}</div></div></details>`;
}

function notes() {
  const list = view.sheet.notes;
  return `<section style="max-width:760px"><div class="cb-head"><h2>Notes de l’équipe</h2></div>
    <form class="cb-form" data-note-form><textarea maxlength="1000" placeholder="Une info utile sur ce combo (pressions, limites de piste, sortie des stands…)" data-note-body aria-label="Nouvelle note"></textarea><div><button type="submit" class="cb-btn">Ajouter la note</button></div></form>
    <div class="cb-notes">${list.map(note => view.editing === note.id
      ? `<form class="cb-note cb-form" data-note-edit="${esc(note.id)}"><textarea maxlength="1000" aria-label="Modifier la note">${esc(note.body)}</textarea><div class="cb-actions"><button type="submit" class="cb-btn">Enregistrer</button><button type="button" class="cb-btn is-quiet" data-action="cancel-note">Annuler</button></div></form>`
      : `<div class="cb-note"><div class="cb-note-meta"><span>${esc(note.author)} · ${esc(day(seconds(note.createdAt)))}</span>${note.mine ? `<button type="button" data-action="edit-note" data-id="${esc(note.id)}">Modifier</button><button type="button" data-action="delete-note" data-id="${esc(note.id)}">Supprimer</button>` : ''}</div><p>${esc(note.body)}</p></div>`).join('') || '<p class="cb-empty">Pas encore de note.</p>'}</div></section>`;
}

// Races being prepared and game versions: a session belongs to them by its date.
function periodsCard() {
  const {events, versions} = view.sheet.periods;
  const item = (period, detail) => `<div class="cb-period"><span>${esc(period.name)} <small>${esc(detail)}</small></span><button type="button" class="cb-btn is-quiet" data-action="delete-period" data-id="${esc(period.id)}" aria-label="Supprimer ${esc(period.name)}">Supprimer</button></div>`;
  return `<details class="cb-fold" data-fold="periods"${view.periodsOpen ? ' open' : ''}><summary><h2>Épreuves et versions</h2><span>${events.length} épreuve${events.length > 1 ? 's' : ''} · ${versions.length} version${versions.length > 1 ? 's' : ''}</span></summary><div class="cb-fold-body">
    <div class="cb-periods"><b>Épreuves préparées</b>${events.map(period => item(period, `${day(period.startsAt)} → ${day(period.endsAt)}${period.track ? '' : ' · tous les circuits'}`)).join('') || '<p class="cb-empty">Aucune.</p>'}
      <form class="cb-form" data-period="event"><input type="text" maxlength="80" placeholder="24h du Mans 2026" aria-label="Nom de l’épreuve" data-name required>
        <div class="cb-row"><label class="cb-src">Du<input type="date" data-start required></label><label class="cb-src">Au<input type="date" data-end required></label></div>
        <label class="cb-check"><input type="checkbox" data-this-track checked> Seulement sur ${esc(view.combo.track)}</label><div><button type="submit" class="cb-btn">Ajouter l’épreuve</button></div></form></div>
    <div class="cb-periods"><b>Versions du jeu / BoP</b>${versions.map(period => item(period, `depuis le ${day(period.startsAt)}`)).join('') || '<p class="cb-empty">Aucune.</p>'}
      <form class="cb-form" data-period="version"><input type="text" maxlength="80" placeholder="BoP du 3 octobre" aria-label="Nom de la version" data-name required>
        <label class="cb-src">À partir du<input type="date" data-start required></label><p class="cb-src">Une version dure jusqu’au début de la suivante.</p><div><button type="submit" class="cb-btn">Ajouter la version</button></div></form></div>
  </div></details>`;
}

function render() {
  const message = view.message ? `<p class="cb-message" role="status">${esc(view.message)}</p>` : '';
  if (!view.combo) {
    app.innerHTML = `<div class="cb-topline"><div><div class="cb-crumb">Fiches combo · Le Mans Ultimate</div><h1>Fiches combo</h1></div></div>${message}
      <p class="cb-empty">Aucune séance reçue pour l’instant. Relie SimHub et roule : la fiche de chaque voiture et de chaque circuit se remplit toute seule, avec les chiffres de chaque pilote.</p>${linkCard()}`;
    return;
  }
  if (!view.sheet) {
    app.innerHTML = `${header()}${message}<p class="cb-message is-error">${esc(view.error || 'Fiche indisponible.')}</p>${linkCard()}`;
    return;
  }
  const rows = paceRows(view.cond);
  const c = view.sheet.conditions[view.cond];
  const track = c.trackTemp ? ` · piste ${fr(c.trackTemp[0], 0)} à ${fr(c.trackTemp[1], 0)} °C` : '';
  app.innerHTML = `${header()}${message}${view.error ? `<p class="cb-message is-error">${esc(view.error)}</p>` : ''}${linkCard()}${filters()}${sample()}${drivers()}${conditions()}
    <div class="cb-frame ${COND[view.cond][1]}"><span class="cb-tag">${COND[view.cond][0]}</span><span class="cb-meta">${c.laps} tours${track}</span>
      ${c.laps ? energy(rows) + tyres() + pace(rows) : '<p class="cb-empty">Pas encore de tour propre dans cette condition.</p>'}</div>
    ${pitStop()}${notes()}${periodsCard()}`;
}

// ---------- Actions ----------

async function act(work, success = '') {
  view.message = '';
  try { await work(); view.message = success; }
  catch (error) { view.message = error.message; }
}

async function copy(text) {
  try { await navigator.clipboard.writeText(text); return true; }
  catch {
    const field = app.querySelector('[data-code]');
    if (!field) return false;
    field.select();
    try { return document.execCommand('copy'); } catch { return false; }
  }
}

async function newCode() {
  if (view.link?.linked && !confirm('Un nouveau code remplace l’ancien : il faudra le recoller dans SimHub. Continuer ?')) return;
  view.linkBusy = true; render();
  await act(async () => {
    const result = await call('/api/combos/link', 'POST', {});
    view.code = result.code; view.linkOpen = true;
    view.link = await call('/api/combos/link');
  });
  view.linkBusy = false;
  render();
  if (view.code) { view.copied = await copy(view.code); render(); }
}

const dateOf = (value, endOfDay = false) => { const [y, m, d] = String(value).split('-').map(Number); return y ? new Date(y, m - 1, d, endOfDay ? 23 : 0, endOfDay ? 59 : 0, endOfDay ? 59 : 0).getTime() : null; };

async function exportSheet() {
  await act(async () => {
    const base = new URLSearchParams({track:view.combo.track, car:view.combo.car});
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

app.addEventListener('click', async event => {
  const target = event.target.closest('button');
  if (!target || !app.contains(target)) return;
  if (target.dataset.driver) {
    const id = target.dataset.driver;
    view.hidden.has(id) ? view.hidden.delete(id) : view.hidden.add(id);
    saveHidden(); render(); return;
  }
  if (target.dataset.cond) { view.cond = target.dataset.cond; render(); return; }
  if (target.dataset.compound) { view.compound = target.dataset.compound; render(); return; }
  if (target.dataset.color) {
    await act(() => call('/api/combos/color', 'PUT', {color:target.dataset.color}));
    await loadSheet(); return;
  }
  switch (target.dataset.action) {
    case 'new-code': await newCode(); break;
    case 'copy-code': view.copied = await copy(view.code); render(); break;
    case 'unlink':
      if (!confirm('Retirer la liaison ? Ton plugin n’enverra plus rien tant que tu ne recolles pas un nouveau code.')) return;
      await act(async () => { await call('/api/combos/link', 'DELETE', {}); view.link = await call('/api/combos/link'); view.code = ''; }, 'Liaison retirée.');
      render(); break;
    case 'export': await exportSheet(); break;
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
  const field = event.target.dataset.field;
  if (field === 'combo') {
    view.combo = view.combos.find(item => comboKey(item) === event.target.value) || view.combo;
    view.setup = ''; view.compareEvent = ''; view.cond = null; view.compound = null;
    await loadSheet();
  } else if (['event', 'version', 'setup'].includes(field)) {
    view[field] = event.target.value;
    if (field === 'event' && view.compareEvent === view.event) view.compareEvent = '';
    await loadSheet();
  } else if (field === 'compare') { view.compareEvent = event.target.value; await loadSheet(); }
});

app.addEventListener('input', event => {
  const target = event.target;
  if (target.dataset.field === 'stint') {
    view.stint = Math.min(60, Math.max(1, Math.round(Number(target.value)) || 12));
    const cards = app.querySelector('[data-tyres]');
    if (cards) cards.innerHTML = tyreCards();
    return;
  }
  const pitField = target.dataset.pitField;
  if (!pitField) return;
  if (pitField === 'tyres') view.pit.tyres = Number(target.value);
  else if (target.type === 'checkbox') view.pit[pitField] = target.checked;
  else view.pit[pitField] = Number(target.value);
  if (pitField === 'before' && view.pit.after < view.pit.before) view.pit.after = view.pit.before;
  for (const key of ['before', 'after']) {
    const output = app.querySelector(`[data-out="${key}"]`);
    if (output) output.textContent = `${view.pit[key]} %`;
  }
  const after = app.querySelector('[data-pit-field="after"]');
  if (after && Number(after.value) !== view.pit.after) after.value = view.pit.after;
  app.querySelector('[data-pit-result]').innerHTML = pitResult();
  app.querySelector('[data-pit-summary]').textContent = pitSummary();
});

// The folds keep their state when the page is drawn again.
app.addEventListener('toggle', event => {
  const fold = event.target.dataset?.fold;
  if (fold === 'pit') view.pitOpen = event.target.open;
  if (fold === 'periods') view.periodsOpen = event.target.open;
  if (fold === 'link') view.linkOpen = event.target.open;
}, true);

app.addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.target;
  if (form.matches('[data-note-form]')) {
    const body = form.querySelector('[data-note-body]').value.trim();
    if (!body) return;
    await act(() => call('/api/combos/notes', 'POST', {track:view.combo.track, car:view.combo.car, body}));
    await loadSheet();
  } else if (form.dataset.noteEdit) {
    const body = form.querySelector('textarea').value.trim();
    if (!body) return;
    await act(() => call(`/api/combos/notes/${encodeURIComponent(form.dataset.noteEdit)}`, 'PATCH', {body}));
    view.editing = null;
    await loadSheet();
  } else if (form.dataset.period) {
    const kind = form.dataset.period;
    const input = {kind, name:form.querySelector('[data-name]').value, startsAt:dateOf(form.querySelector('[data-start]').value)};
    if (kind === 'event') Object.assign(input, {endsAt:dateOf(form.querySelector('[data-end]').value, true), track:form.querySelector('[data-this-track]').checked ? view.combo.track : ''});
    await act(() => call('/api/combos/periods', 'POST', input), kind === 'event' ? 'Épreuve ajoutée.' : 'Version ajoutée.');
    await loadSheet();
  }
});

start();
