// Mémo des circuits (stands.html): one sheet per circuit and car, the same for every pilot of the site
// (server/training.mjs, /api/training/memo). Three sources, each with its colour and its shape: the viewer (a dot),
// the pilots of the site (a band and the median's line), the game (a triangle). The stop calculator applies the
// game's rule (shared/training.mjs, stopTime) to the car's service times.
import {stopTime} from '../shared/training.mjs';

const app = document.getElementById('pit-guide');
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num = (value, digits = 1) => value === null || value === undefined ? '—' : Number(value).toFixed(digits).replace('.', ',');
const WHEELS = ['avant gauche', 'avant droit', 'arrière gauche', 'arrière droit'];
const view = {data:null, calc:{arrive:50, leave:100, tyres:4, driver:false, wing:false, ductFront:false, ductRear:false, brakes:false}};

const row = (label, value, kind = '', note = '') => `<div class="memo-row"><dt>${label}</dt><dd class="${kind}">${value}${note ? `<small>${note}</small>` : ''}</dd></div>`;

// The pilots' band, the median's line, the game's triangle and the viewer's dot, on one scale.
function band(item, unit, digits) {
  const values = [item.low, item.high, item.you, item.game].filter(value => value !== null && value !== undefined);
  if (item.median === null) {
    return `<p class="training-note">Fourchette des pilotes à partir de 3 pilotes et 30 tours : ${item.pilots} pilote${item.pilots > 1 ? 's' : ''} et ${item.laps} tours pour l’instant.</p>`;
  }
  const min = Math.min(...values) * 0.95, max = Math.max(...values) * 1.05, at = value => `${((value - min) / (max - min) * 100).toFixed(1)}%`;
  return `<div class="memo-band" role="img" aria-label="Pilotes de ${num(item.low, digits)} à ${num(item.high, digits)} ${unit}, médiane ${num(item.median, digits)}">
    <span class="memo-iqr" style="left:${at(item.low)};width:calc(${at(item.high)} - ${at(item.low)})"></span><span class="memo-median" style="left:${at(item.median)}"></span>
    ${item.game ? `<span class="memo-game" style="left:${at(item.game)}"></span>` : ''}${item.you ? `<span class="memo-you" style="left:${at(item.you)}"></span>` : ''}</div>
    <div class="memo-scale"><span>${num(item.low, digits)} ${unit}</span><span>${item.pilots} pilotes · ${item.laps} tours</span><span>${num(item.high, digits)} ${unit}</span></div>`;
}

function perLap(title, item, unit, digits, extra = '') {
  const main = item.median ?? item.you ?? item.game;
  const kind = item.median !== null ? 'is-pilots' : item.you !== null ? 'is-you' : 'is-game';
  return `<div class="memo-block"><h3>${title}</h3><p class="memo-big ${kind}">${num(main, digits)}<span>${unit} / tour</span></p>${band(item, unit, digits)}
    <dl>${item.you !== null ? row('Toi', `${num(item.you, digits)} ${unit}`, 'is-you') : ''}${item.game ? row('Prévu par le jeu', `${num(item.game, digits)} ${unit}`, 'is-game') : ''}${extra}</dl></div>`;
}

function calculator(data) {
  const service = data.service?.source === 'game' ? data.service : null;
  if (!service) return `<p class="training-note">Le calcul d’un arrêt arrive dès qu’un pilote roule avec cette voiture et la dernière version du plugin : il lit les temps de service dans le jeu.</p>`;
  const c = view.calc, energy = Math.max(0, c.leave - c.arrive), ratio = data.fuel.ratio, capacity = data.capacity;
  // Litres follow the energy through the fuel ratio, as in the pit menu.
  const fuel = ratio && capacity ? energy / 100 * capacity * ratio : 0;
  const stopped = stopTime(service, {fuel, energy, tyres:c.tyres, wing:c.wing, driver:c.driver, ductFront:c.ductFront, ductRear:c.ductRear, brakes:c.brakes});
  const check = (key, label, seconds) => seconds ? `<label><input type="checkbox" data-calc="${key}"${c[key] ? ' checked' : ''}> ${label} · ${num(seconds, 0)} s</label>` : '';
  return `<form class="memo-calc" aria-label="Calculer un arrêt">
    <label for="memo-arrive">Énergie à l’arrivée <output>${c.arrive} %</output></label><input id="memo-arrive" type="range" min="0" max="100" step="5" value="${c.arrive}" data-calc="arrive">
    <label for="memo-leave">Énergie en sortant <output>${c.leave} %</output></label><input id="memo-leave" type="range" min="0" max="100" step="5" value="${c.leave}" data-calc="leave">
    <fieldset><legend>Pneus</legend>${[[0, 'Aucun'], [2, '2 pneus'], [4, '4 pneus']].map(([value, label]) => `<label><input type="radio" name="memo-tyres" value="${value}" data-calc="tyres"${c.tyres === value ? ' checked' : ''}> ${label}</label>`).join('')}</fieldset>
    <fieldset><legend>Pendant le plein</legend>${check('driver', 'Changement de pilote', service.driver)}${check('wing', 'Réglage de l’aileron arrière', service.wing)}</fieldset>
    <fieldset><legend>En plus</legend>${check('ductFront', 'Écopes de frein avant', service.ductFront)}${check('ductRear', 'Écopes de frein arrière', service.ductRear)}${check('brakes', 'Changement des freins', service.brakes)}</fieldset>
  </form>
  <dl>${row('Remis', `${energy} %${fuel ? ` · ${num(fuel, 1)} L` : ''}`)}${row('Temps arrêté', `${num(stopped)} s`, 'is-game')}
    ${data.lane ? row('<strong>Temps perdu</strong>', `<strong>${num(data.lane.through + stopped)} s</strong>`, '', 'traversée + arrêt') : ''}</dl>`;
}

function render() {
  const data = view.data;
  if (!data.circuit) {
    app.innerHTML = `<header class="training-intro"><div><p class="training-kicker">Mémo officiel · commun à tous les pilotes</p><h1>Mémo des circuits</h1>
      <p class="training-lead">Pas encore de fiche : elles se remplissent toutes seules quand les pilotes du site roulent avec le plugin SimHub ou le synchroniseur.</p></div></header>`;
    return;
  }
  const circuit = data.circuits.find(item => item.key === data.circuit.key);
  const s = data.service, tyre = data.tyres[0];
  const serviceRows = s ? [row('Carburant', s.fuelRate ? `${num(s.fuelRate)} L/s` : '—', '', s.connect ? `+ ${num(s.connect, 0)} s pour brancher` : ''),
    s.energyRate ? row('Énergie', `${num(s.energyRate)} %/s`) : '', row('4 pneus', s.tyres4 ? `${num(s.tyres4)} s` : '—'), s.tyres2 ? row('2 pneus', `${num(s.tyres2)} s`) : '',
    s.driver ? row('Changement de pilote', `${num(s.driver, 0)} s`, '', 'pendant le plein') : '', s.wing ? row('Réglage aileron arrière', `${num(s.wing, 0)} s`, '', 'pendant le plein') : '',
    s.ductFront ? row('Écopes de frein', `${num(s.ductFront, 0)} s · ${num(s.ductRear, 0)} s`, '', 'avant · arrière, en plus') : '',
    s.brakes ? row('Freins', `${num(s.brakes, 0)} s`, '', 'en plus') : '', s.repair ? row('Réparation', `${num(s.repair, 0)} s`) : ''].join('') : '';
  app.innerHTML = `<header class="training-intro"><div><p class="training-kicker">Mémo officiel · commun à tous les pilotes</p><h1>${esc(data.circuit.name)}</h1>
    <p class="training-lead">Ce qu’il faut savoir en course sur ce circuit avec cette voiture, mesuré par les pilotes du site.</p></div>
    <div class="training-filters">
      <label class="training-select">Circuit<select data-pick="circuit">${data.circuits.map(item => `<option value="${esc(item.key)}"${item.key === data.circuit.key ? ' selected' : ''}>${esc(item.name)}</option>`).join('')}</select></label>
      <label class="training-select">Voiture<select data-pick="car">${circuit.cars.map(item => `<option value="${esc(item.car)}"${item.car === data.car.car ? ' selected' : ''}>${esc(item.car)} · ${esc(item.carClass)}</option>`).join('')}</select></label>
    </div>
    <p class="memo-key"><span class="is-you"><i class="dot"></i>Toi</span><span class="is-pilots"><i class="bar"></i>Les pilotes du site : médiane et fourchette</span><span class="is-game"><i class="tri"></i>Le jeu</span></p></header>
    <div class="memo-grid">
    <section class="training-card"><h2>Temps perdu au stand</h2>
      <p class="training-note">Un arrêt, c’est la traversée de la voie, fixe, plus le temps arrêté, qui dépend de ce que tu fais.</p>
      <dl>${row('Traversée de la voie', data.lane ? `${num(data.lane.through)} s` : '—', 'is-pilots', data.lane ? `${data.lane.stops} arrêt${data.lane.stops > 1 ? 's' : ''} mesuré${data.lane.stops > 1 ? 's' : ''} · aussi le prix d’un drive-through` : 'pas encore d’arrêt mesuré')}</dl>
      ${calculator(data)}</section>
    <section class="training-card"><h2>Temps de service</h2>
      ${s ? `<p class="memo-tag ${s.source === 'game' ? 'is-game' : 'is-pilots'}">${s.source === 'game' ? 'Valeurs exactes du jeu' : 'Mesuré sur les arrêts'}</p><dl>${serviceRows}</dl>
      <p class="training-note">Pneus, écopes et freins se font après le plein. Carburant, énergie, aileron et changement de pilote se font en même temps : seul le plus long compte.</p>`
      : '<p class="training-empty">Pas encore relevé pour cette voiture.</p>'}</section>
    <section class="training-card"><h2>Énergie et carburant</h2>
      ${data.energy.median !== null || data.energy.you !== null || data.energy.game ? perLap('Énergie', data.energy, '%', 2) : ''}
      ${perLap('Carburant', data.fuel, 'L', 2, data.fuel.ratio ? row('Ratio carburant conseillé', num(data.fuel.ratio, 2), 'is-pilots') : '')}</section>
    <section class="training-card"><h2>Pneus${tyre ? ` · ${esc(tyre.name)}` : ''}</h2>
      ${tyre ? `<div class="memo-block"><p class="memo-big ${tyre.median !== null ? 'is-pilots' : 'is-you'}">${num(tyre.median ?? tyre.you, 2)}<span>% d’usure / tour</span></p>${band(tyre, '%', 2)}
        <dl>${tyre.you !== null ? row('Ton usure', `${num(tyre.you, 2)} % / tour`, 'is-you') : ''}${tyre.worst !== null ? row('Pneu le plus usé', WHEELS[tyre.worst]) : ''}
        ${tyre.temp ? row('Température des pilotes', `${tyre.temp} °C`, 'is-pilots') : ''}${tyre.youTemp ? row('Ta température', `${tyre.youTemp} °C`, 'is-you') : ''}
        ${tyre.ideal ? row('Température idéale', `${num(tyre.ideal, 0)} °C`, 'is-game') : ''}${tyre.track !== null ? row('Piste pendant les mesures', `${num(tyre.track)} °C`) : ''}</dl></div>
        ${data.tyres.length > 1 ? `<p class="training-note">Autres gommes : ${data.tyres.slice(1).map(item => `${esc(item.name)} ${num(item.median ?? item.you, 2)} %`).join(', ')}.</p>` : ''}`
      : '<p class="training-empty">Pas encore de tour mesuré.</p>'}</section>
    <section class="training-card memo-wide"><h2>Un relais</h2><div class="training-stats">
      <div><small>Tours avec 100 % d’énergie</small><strong>${data.stint.energyLaps ?? '—'}</strong></div>
      <div><small>Tours avec un plein${data.capacity ? ` de ${num(data.capacity, 0)} L` : ''}</small><strong>${data.stint.tankLaps ?? '—'}</strong></div>
      <div><small>Tours avant 50 % d’usure</small><strong>${data.stint.lapsTo50 ?? '—'}</strong></div></div>
      <p class="training-note">Calculé avec la médiane des pilotes, sinon avec tes chiffres, sinon avec la prévision du jeu.</p></section>
    </div>
    <section class="training-card"><h2>Comment les chiffres sont faits</h2><ul class="pit-list">
      <li><strong>Ce qui ne dépend pas du pilote</strong> : les temps de service sont lus dans le jeu, la traversée de la voie est la médiane de tous les arrêts mesurés sur ce circuit.</li>
      <li><strong>Ce qui dépend du pilote</strong>, la conso et l’usure, est montré en fourchette : la médiane des pilotes et la moitié d’entre eux autour d’elle. Chaque pilote compte une fois, sans aucun nom.</li>
      <li><strong>Tours retenus</strong> : en piste, sans arrêt, sans tour invalidé, et proches du rythme du pilote.</li>
      <li><strong>Seuil</strong> : la fourchette n’apparaît qu’à partir de ${data.min.pilots} pilotes et ${data.min.laps} tours. Avant, la fiche montre ta valeur et la prévision du jeu.</li></ul></section>`;
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
