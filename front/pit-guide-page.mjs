// Mémo des circuits (stands.html): one sheet per circuit and car, the same for every pilot of the site
// (server/training.mjs, /api/training/memo). Three sources, each with its colour and its shape: the viewer (a dot),
// the pilots of the site (a band and the median's line), the game (a triangle). The stop calculator applies the
// game's rule (shared/training.mjs, stopTime) to the car's service times.
import {stopTime} from '../shared/training.mjs';

const app = document.getElementById('pit-guide');
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num = (value, digits = 1) => value === null || value === undefined ? '—' : Number(value).toFixed(digits).replace('.', ',');
const view = {data:null, calc:{arrive:50, leave:100, tyres:4, driver:false, wing:false, ductFront:false, ductRear:false, brakes:false}};

// 80.887 -> 1:20.887 (times from the spreadsheet have two decimals).
const lap = (seconds, digits = 2) => seconds ? `${Math.floor(seconds / 60)}:${(seconds % 60).toFixed(digits).padStart(digits + 3, '0')}` : '—';
const row = (label, value, kind = '', note = '') => `<div class="memo-row"><dt>${label}</dt><dd class="${kind}">${value}${note ? `<small>${note}</small>` : ''}</dd></div>`;

// One scale: the pilots' band and their median's line once they are enough, else the viewer's own band from their
// lowest to their highest lap; the game's triangle and the viewer's dot on top.
function band(item, unit, digits) {
  const pilots = item.median !== null, own = !pilots && item.youMin !== null && item.youMax !== null && item.youMax > item.youMin;
  if (!pilots && !own) return '';
  const low = pilots ? item.low : item.youMin, high = pilots ? item.high : item.youMax;
  const values = [low, high, item.you, item.game].filter(value => value !== null && value !== undefined);
  const min = Math.min(...values) * 0.97, max = Math.max(...values) * 1.03, at = value => `${((value - min) / (max - min) * 100).toFixed(1)}%`;
  return `<div class="memo-band${own ? ' is-own' : ''}" role="img" aria-label="${pilots ? 'Pilotes' : 'Toi'} de ${num(low, digits)} à ${num(high, digits)} ${unit}">
    <span class="memo-iqr" style="left:${at(low)};width:calc(${at(high)} - ${at(low)})"></span>${pilots ? `<span class="memo-median" style="left:${at(item.median)}"></span>` : ''}
    ${item.game ? `<span class="memo-game" style="left:${at(item.game)}"></span>` : ''}${item.you ? `<span class="memo-you" style="left:${at(item.you)}"></span>` : ''}</div>
    <div class="memo-scale ${pilots ? '' : 'is-you'}"><span>${pilots ? '' : 'min '}${num(low, digits)} ${unit}</span><span>${pilots ? `${item.pilots} pilotes · ${item.laps} tours` : 'ta fourchette'}</span><span>${pilots ? '' : 'max '}${num(high, digits)} ${unit}</span></div>`;
}

// The four tyres around the car, front at the top, each with its figure and a line under it.
const TYRES = ['Avant gauche', 'Avant droit', 'Arrière gauche', 'Arrière droit'];
const car = (kind, cells, label) => `<div class="memo-car ${kind}" role="img" aria-label="${label}">${cells.map((cell, index) => `<div class="memo-tyre"><small>${TYRES[index]}</small><b>${cell.main}</b>${cell.sub ? `<small>${cell.sub}</small>` : ''}</div>`).join('')}<span class="memo-car-body" aria-hidden="true"></span></div>`;

// The colour of a figure is the colour of where it comes from: the pilots' median, else the viewer, else the game.
const source = item => !item ? '' : item.median !== null && item.median !== undefined ? 'is-pilots' : item.you !== null && item.you !== undefined ? 'is-you' : 'is-game';

function perLap(title, item, unit, digits, extra = '') {
  const main = item.median ?? item.you ?? item.game;
  const kind = source(item);
  return `<div class="memo-block"><h3>${title}</h3><p class="memo-big ${kind}">${num(main, digits)}<span>${unit} / tour</span></p>${band(item, unit, digits)}
    <dl>${item.you !== null ? row('Toi', `${num(item.you, digits)} ${unit}`, 'is-you') : ''}${item.game ? row('Prévu par le jeu', `${num(item.game, digits)} ${unit}`, 'is-game') : ''}${extra}</dl></div>`;
}

function calculator(data) {
  const service = data.service?.source === 'game' ? data.service : null;
  if (!service) return `<p class="training-note memo-small">Le calcul d’un arrêt arrive quand le plugin envoie les temps de service de cette voiture.</p>`;
  const c = view.calc, energy = Math.max(0, c.leave - c.arrive), ratio = data.fuel.ratio, capacity = data.capacity;
  // Litres follow the energy through the fuel ratio, as in the pit menu.
  const fuel = ratio && capacity ? energy / 100 * capacity * ratio : 0;
  const stopped = stopTime(service, {fuel, energy, tyres:c.tyres, wing:c.wing, driver:c.driver, ductFront:c.ductFront, ductRear:c.ductRear, brakes:c.brakes});
  const check = (key, label, seconds) => seconds ? `<label class="memo-toggle"><input type="checkbox" data-calc="${key}"${c[key] ? ' checked' : ''}><span>${label}</span><small>${num(seconds, 0)} s</small></label>` : '';
  return `<form class="memo-calc" aria-label="Calculer un arrêt">
    <label for="memo-arrive">Énergie à l’arrivée <output>${c.arrive} %</output></label><input id="memo-arrive" type="range" min="0" max="100" step="5" value="${c.arrive}" data-calc="arrive">
    <label for="memo-leave">Énergie en sortant <output>${c.leave} %</output></label><input id="memo-leave" type="range" min="0" max="100" step="5" value="${c.leave}" data-calc="leave">
    <fieldset><legend>Pneus</legend>${[[0, 'Aucun'], [2, '2 pneus'], [4, '4 pneus']].map(([value, label]) => `<label class="memo-toggle"><input type="radio" name="memo-tyres" value="${value}" data-calc="tyres"${c.tyres === value ? ' checked' : ''}><span>${label}</span></label>`).join('')}</fieldset>
    <fieldset><legend>Pendant le plein</legend>${check('driver', 'Pilote', service.driver)}${check('wing', 'Aileron arrière', service.wing)}</fieldset>
    <fieldset><legend>En plus du plein</legend>${check('ductFront', 'Écopes avant', service.ductFront)}${check('ductRear', 'Écopes arrière', service.ductRear)}${check('brakes', 'Freins', service.brakes)}</fieldset>
  </form>
  <dl>${row('Remis', `${energy} %${fuel ? ` · ${num(fuel, 1)} L` : ''}`)}${row('Temps arrêté', `${num(stopped)} s`, 'is-game')}
    ${data.lane ? row('<strong>Temps perdu</strong>', `<strong>${num(data.lane.through + stopped)} s</strong>`, '', 'traversée + arrêt') : ''}</dl>`;
}

// Reference lap times by level, as a table (the names of the spreadsheet, never its percentages): the hotlap the
// spreadsheet gives (the class's aliens), each level's race pace, the viewer's row and the next level to reach.
function levels(data) {
  const ref = data.levels;
  if (!ref) return '';
  const you = ref.you;
  const range = band => band.from === null ? `jusqu’à ${lap(band.to)}` : band.to === null ? `plus de ${lap(band.from)}` : `${lap(band.from)} à ${lap(band.to)}`;
  const rows = ref.bands.map((band, index) => {
    const mine = you?.level === band.name, goal = you?.next?.name === band.name;
    return `<tr class="${mine ? 'is-mine' : goal ? 'is-goal' : ''}"><th scope="row">${esc(band.name)}${mine ? ' <span class="memo-chip is-you">ton niveau</span>' : goal ? ' <span class="memo-chip">objectif</span>' : ''}</th>
      <td>${index ? '<span class="memo-none">—</span>' : lap(ref.q)}</td><td>${range(band)}</td></tr>`;
  }).join('');
  return `<section class="training-card memo-wide"><p class="memo-scope">Circuit · catégorie · tableur d’Ohne Speed</p><h2>Chronos de référence</h2>
    <div class="memo-table-wrap"><table class="memo-table"><caption>Chronos de référence par niveau, ${esc(ref.track)}</caption>
      <thead><tr><th scope="col">Niveau</th><th scope="col">Chrono<small>tour lancé</small></th><th scope="col">Rythme de course<small>tour moyen en course</small></th></tr></thead>
      <tbody>${you ? `<tr class="is-you-row"><th scope="row">Toi <span class="memo-chip is-you">${esc(you.level)}</span></th><td>${lap(you.best, 3)}<small>ton meilleur tour</small></td><td>${lap(you.pace, 3)}<small>ton tour médian</small></td></tr>` : ''}${rows}</tbody></table></div>
    <p class="training-note memo-small">${you?.next ? `<span>Objectif : ${esc(you.next.name)} en ${lap(you.next.time)}.</span> ` : ''}${ref.fastest ? `Plus rapide : ${esc(ref.fastest.car)} en ${lap(ref.fastest.time)}. ` : ''}Version ${esc(ref.patch)} du jeu.</p></section>`;
}

// The car's line in LMU's BoP for this circuit, with what changed since the previous BoP.
const COMPOUNDS = {Soft:'Tendre', Medium:'Médium', Hard:'Dur'};
function bop(data) {
  const b = data.bop;
  if (!b) return '';
  const change = key => b.changes?.[key] ? ` (${b.changes[key] > 0 ? '+' : ''}${num(b.changes[key], Number.isInteger(b.changes[key]) ? 0 : 1)})` : '';
  const line = (label, key, value, note = '') => b[key] === null || b[key] === undefined ? '' : row(label, `${value}${change(key)}`, '', note);
  const power = b.carClass === 'Hypercar' ? `${num(b.power, 0)} kW` : typeof b.power === 'number' ? `${num(b.power, 1).replace(',0', '')} %` : esc(b.power);
  return `<section class="training-card"><p class="memo-scope">Circuit · voiture · BoP officielle</p><h2>BoP LMU ${esc(b.version)}</h2>
    <p class="training-note memo-small">${esc(b.car)} · ${esc(b.layout)}${b.changes ? ' · (écart avec la BoP précédente)' : ''}</p>
    <dl>${line('Poids minimum', 'weight', `${num(b.weight, 0)} kg`)}${line('Puissance maximale', 'power', power)}
      ${line('Énergie max par relais', 'energy', `${num(b.energy, 0)} MJ`, '= 100 %')}
      ${b.carClass === 'Hypercar' ? line('Branchement avant la recharge', 'docking', `${num(b.docking, 1)} s`) : ''}
      ${line('Réservoir', 'tank', `${num(b.tank, 0)} L`)}${line('Débit du ravitaillement', 'refuel', `${num(b.refuel, 2)} L/s`)}
      ${b.wingMin !== undefined ? row('Aileron arrière autorisé', `${num(b.wingMin, 1)}° à ${num(b.wingMax, 1)}°`) : ''}
      ${b.compounds.length ? row('Gommes sèches autorisées', b.compounds.map(item => COMPOUNDS[item] || esc(item)).join(', ')) : ''}</dl>
    <p class="training-note"><a href="${esc(b.url)}" target="_blank" rel="noopener">BoP officielle LMU ${esc(b.version)}</a> du ${esc(b.date.split('-').reverse().join('/'))}.</p></section>`;
}

function render() {
  const data = view.data;
  if (!data.circuit) {
    app.innerHTML = `<div class="memo-head"><p class="memo-kicker">Mémo officiel · commun à tous les pilotes</p><h1>Mémo des circuits</h1>
      <p class="memo-sub">Pas encore de fiche : elles se remplissent toutes seules quand les pilotes du site roulent avec le plugin SimHub ou le synchroniseur.</p></div>`;
    return;
  }
  const circuit = data.circuits.find(item => item.key === data.circuit.key);
  const s = data.service, tyre = data.tyres[0];
  // Service times in the two groups of the game's rule: what is done during the refuel (only the longest counts)
  // and what is added to it.
  const during = s ? [row('Carburant', s.fuelRate ? `${num(s.fuelRate)} L/s` : '—', '', s.connect ? `+ ${num(s.connect, 0)} s pour brancher` : ''),
    s.energyRate ? row('Énergie', `${num(s.energyRate)} %/s`) : '', s.driver ? row('Pilote', `${num(s.driver, 0)} s`) : '', s.wing ? row('Aileron arrière', `${num(s.wing, 0)} s`) : ''].join('') : '';
  const added = s ? [row('4 pneus', s.tyres4 ? `${num(s.tyres4)} s` : '—'), s.tyres2 ? row('2 pneus', `${num(s.tyres2)} s`) : '',
    s.ductFront ? row('Écopes avant · arrière', `${num(s.ductFront, 0)} s · ${num(s.ductRear, 0)} s`) : '', s.brakes ? row('Freins', `${num(s.brakes, 0)} s`) : '',
    s.source === 'game' ? row('Pressions, grille', '0 s', '', 'avec des pneus') : ''].join('') : '';
  const cars = circuit.cars;
  const st = data.stint, stintKind = source(st.by === 'energy' ? data.energy : data.fuel), wearKind = source(data.tyres[0]);
  app.innerHTML = `<div class="memo-head"><p class="memo-kicker">Mémo officiel · commun à tous les pilotes</p><h1>${esc(data.circuit.name)}</h1>
    
    <div class="memo-pick">
      <label class="memo-select">Circuit<select data-pick="circuit">${data.circuits.map(item => `<option value="${esc(item.key)}"${item.key === data.circuit.key ? ' selected' : ''}>${esc(item.name)}</option>`).join('')}</select></label>
      <label class="memo-select">Voiture<select data-pick="car">${cars.map(item => `<option value="${esc(item.car)}"${item.car === data.car.car ? ' selected' : ''}>${esc(item.car)}</option>`).join('')}</select></label>
    </div>
    <p class="memo-key"><span class="is-you"><i class="dot"></i>Toi</span><span class="is-pilots"><i class="bar"></i>Les pilotes du site</span><span class="is-game"><i class="tri"></i>Le jeu</span></p></div>
    <div class="memo-grid">
    ${levels(data)}
    <section class="training-card"><p class="memo-scope">Circuit · voiture</p><h2>Stand</h2>
      <dl>${row('Traversée de la voie', data.lane ? `${num(data.lane.through)} s` : '—', 'is-pilots', data.lane ? 'aussi le prix d’un drive-through' : 'pas encore mesurée')}</dl>
      ${calculator(data)}
      ${s?.source === 'game' ? '<p class="training-note memo-small">Le jeu ajoute jusqu’à 3 s au hasard.</p>' : ''}</section>
    <section class="training-card"><p class="memo-scope">Voiture · donné par le jeu</p><h2>Temps de service</h2>
      ${s ? `<p class="memo-tag ${s.source === 'game' ? 'is-game' : 'is-pilots'}">${s.source === 'game' ? 'Valeurs exactes du jeu' : 'Mesuré sur les arrêts'}</p>
      <div class="memo-group"><h3>Pendant le plein <small>seul le plus long compte</small></h3><dl class="${s.source === 'game' ? 'is-game' : 'is-pilots'}">${during}</dl></div>
      <div class="memo-group"><h3>En plus du plein <small>s’ajoutent</small></h3><dl class="${s.source === 'game' ? 'is-game' : 'is-pilots'}">${added}</dl></div>`
      : '<p class="training-empty">Pas encore relevé pour cette voiture.</p>'}</section>
    <section class="training-card"><p class="memo-scope">Circuit · voiture · par tour</p><h2>Énergie et carburant</h2>
      ${data.energy.median !== null || data.energy.you !== null || data.energy.game ? perLap('Énergie', data.energy, '%', 2) : ''}
      ${perLap('Carburant', data.fuel, 'L', 2, data.fuel.ratio ? row('Ratio carburant conseillé', num(data.fuel.ratio, 2), source(data.fuel)) : '')}</section>
    <section class="training-card"><p class="memo-scope">Circuit · voiture · gomme</p><h2>Pneus${tyre ? ` · ${esc(tyre.name)}` : ''}</h2>
      ${tyre ? `<div class="memo-block"><p class="memo-big ${source(tyre)}">${num(tyre.median ?? tyre.you, 2)}<span>% / tour · moyenne des 4 pneus</span></p>${band(tyre, '%', 2)}
        ${tyre.wheels ? car(source(tyre), tyre.wheels.map(wheel => ({main:wheel.wear === null ? '—' : `${num(wheel.wear, 2)} %`,
          sub:`${wheel.min !== null ? `${num(wheel.min, 2)} – ${num(wheel.max, 2)} %` : ''}${wheel.temp ? `<br>${wheel.temp} °C` : ''}`})), 'Usure par tour de chaque pneu, avec son minimum, son maximum et sa température moyenne') : ''}
        <dl>${tyre.median !== null && tyre.you !== null ? row('Ton usure moyenne', `${num(tyre.you, 2)} % / tour`, 'is-you') : ''}
        ${tyre.ideal ? row('Température idéale', `${num(tyre.ideal, 0)} °C`, 'is-game') : ''}${tyre.track !== null ? row('Piste pendant les mesures', `${num(tyre.track)} °C`) : ''}</dl></div>
        ${data.tyres.length > 1 ? `<p class="training-note">Autres gommes : ${data.tyres.slice(1).map(item => `${esc(item.name)} ${num(item.median ?? item.you, 2)} %`).join(', ')}.</p>` : ''}`
      : '<p class="training-empty">Pas encore de tour mesuré.</p>'}</section>
    ${bop(data)}
    <section class="training-card${data.bop ? '' : ' memo-wide'}"><p class="memo-scope">Circuit · voiture · un relais</p><h2>Relais</h2>
      ${st.laps ? `<p class="memo-big ${stintKind}">${st.laps}<span>tours ${st.by === 'energy' ? 'avec 100 % d’énergie' : 'avec un plein'}</span></p>
      <dl>${st.by === 'energy' && st.fuel ? row('Carburant pour les faire', `${num(st.fuel, 1)} L`, stintKind, data.fuel.ratio ? `ratio conseillé ${num(data.fuel.ratio, 2)}` : '') : ''}
</dl>
      ${st.wear ? `${car(wearKind, st.wear.map(value => ({main:value === null ? '—' : `−${num(value, 1)} %`, sub:''})), 'Usure de chaque pneu sur un relais')}
        <p class="training-note memo-small">Usure de chaque pneu sur le relais.</p>` : ''}`
      : '<p class="training-empty">Pas encore de tour mesuré.</p>'}</section>
    </div>
    ${data.source ? `<p class="memo-credit">Chronos de référence : <a href="${esc(data.source.url)}" target="_blank" rel="noopener">${esc(data.source.title)}</a> de ${esc(data.source.name)}${data.source.updated ? `, mis à jour le ${esc(data.source.updated.split('-').reverse().join('/'))}` : ''}.</p>` : ''}`;
}

async function load(params = '') {
  try {
    const response = await fetch(`/api/training/memo${params}`, {credentials:'same-origin', cache:'no-store', headers:{Accept:'application/json'}});
    const data = await response.json().catch(() => ({}));
    if (!response.ok) { app.innerHTML = `<p class="training-empty">${esc(data.error || 'Mémo indisponible.')}</p>`; return; }
    view.data = data;
    render();
  } catch { app.innerHTML = '<p class="training-empty">Mémo indisponible pour l’instant.</p>'; }
}

app.addEventListener('change', event => {
  const pick = event.target.closest('[data-pick]');
  if (pick) {
    const params = new URLSearchParams({circuit:pick.dataset.pick === 'circuit' ? pick.value : view.data.circuit.key});
    if (pick.dataset.pick === 'car') params.set('car', pick.value); else params.set('class', view.data.car.carClass);
    load(`?${params}`);
  }
});
app.addEventListener('input', event => {
  const input = event.target.closest('[data-calc]');
  if (!input) return;
  const key = input.dataset.calc;
  view.calc[key] = input.type === 'checkbox' ? input.checked : Number(input.value);
  if (key === 'arrive' && view.calc.leave < view.calc.arrive) view.calc.leave = view.calc.arrive;
  if (key === 'leave' && view.calc.leave < view.calc.arrive) view.calc.arrive = view.calc.leave;
  const focus = input.id;
  render();
  if (focus) document.getElementById(focus)?.focus();
});
app.addEventListener('submit', event => event.preventDefault());

load();
