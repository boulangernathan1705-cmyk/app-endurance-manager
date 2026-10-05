// « Mon entraînement » (server/training.mjs): the pilot's own LMU sessions turned into a guide. The sync program sends
// them on its own; dropping a results file here does the same by hand.
import {shortDateLabel, timeAt} from './dates.mjs';
import {todaySession, lapLabel} from '../shared/training.mjs';

const app = document.getElementById('training-app');
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num = (value, digits = 1) => value === null || value === undefined ? '—' : Number(value).toFixed(digits).replace('.', ',');
const stamp = ms => `${shortDateLabel(ms)} · ${timeAt(ms)}`;
const KINDS = {Practice1:'Essais', Practice2:'Essais', Practice3:'Essais', Practice4:'Essais', Qualify:'Qualif', Warmup:'Warm-up', Race:'Course'};
const MINUTES = [20, 30, 45, 60, 90];
const view = {track:null, carClass:null, minutes:readMinutes(), data:null, busy:'', simhub:''};

function readMinutes() { try { const value = Number(localStorage.getItem('training-minutes')); return MINUTES.includes(value) ? value : 30; } catch { return 30; } }

async function call(path, options = {}) {
  let response;
  try { response = await fetch(path, {credentials:'same-origin', cache:'no-store', ...options, headers:{Accept:'application/json', ...(options.headers || {})}}); }
  catch { throw Object.assign(Error('Connexion au site impossible. Vérifie ta connexion puis réessaie.'), {status:0}); }
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(Error(result.error || `Action impossible (${response.status}).`), {status:response.status});
  return result;
}

async function load() {
  const query = new URLSearchParams();
  if (view.track) query.set('track', view.track);
  if (view.carClass) query.set('class', view.carClass);
  try {
    view.data = await call(`/api/training?${query}`);
    view.track = view.data.track?.key || null; view.carClass = view.data.carClass || null;
    render();
  } catch (error) { renderError(error); }
}

function renderError(error) {
  const login = error.status === 401 ? `<a class="primary-button" href="/api/auth/discord?return=${encodeURIComponent('/entrainement.html')}">Se connecter avec Discord</a>` : '<a class="secondary-button" href="/">Retour à l’accueil</a>';
  app.innerHTML = `<section class="members-panel members-error"><h1>Mon entraînement</h1><p>${esc(error.message)}</p>${login}</section>`;
}

const daysUntil = ms => Math.max(0, Math.ceil((ms - Date.now()) / 86400000));

function hero(data) {
  const race = data.race;
  const days = race ? daysUntil(race.startsAt) : null;
  const tracks = data.tracks.length > 1 ? `<label class="training-select"><span>Circuit</span><select data-track>${data.tracks.map(track => `<option value="${esc(track.key)}"${track.key === view.track ? ' selected' : ''}>${esc(track.venue)}${track.course && track.course !== track.venue ? ` · ${esc(track.course)}` : ''}</option>`).join('')}</select></label>` : '';
  const classes = data.classes.length > 1 ? `<label class="training-select"><span>Catégorie</span><select data-class>${data.classes.map(item => `<option${item === view.carClass ? ' selected' : ''}>${esc(item)}</option>`).join('')}</select></label>` : '';
  return `<header class="training-intro">
    <div><p class="training-kicker">Entraînement individuel · Le Mans Ultimate</p><h1>Mon entraînement</h1>
    <p class="training-lead">${data.track ? `${esc(data.track.venue)}${data.carClass ? ` · ${esc(data.carClass)}` : ''}` : 'Roule, le guide fait le reste.'}</p></div>
    ${race ? `<a class="training-race" href="/lmu/#event=${esc(race.eventId)}"><strong>${days === 0 ? 'Aujourd’hui' : `J-${days}`}</strong><span>${esc(race.name)}</span><small>${esc(race.category || '')}</small></a>` : ''}
    ${tracks || classes ? `<div class="training-filters">${tracks}${classes}</div>` : ''}
  </header>`;
}

function stats(a, live) {
  const litres = live?.fuelPerLap || a.fuelLitres;
  const items = [['Meilleur tour', lapLabel(a.best)], ['Tours roulés', a.totalLaps], ['Carburant / tour', litres ? `${num(litres, 2)} L` : a.fuelPerLap ? `${num(a.fuelPerLap)} %` : '—'],
    ['Énergie / tour', a.energyPerLap ? `${num(a.energyPerLap)} %` : '—'], ['Tours avec un plein', live?.tankLaps ?? a.tankLaps ?? '—'], ['Régularité', a.regularity !== null && a.regularity !== undefined ? `± ${num(a.regularity, 2)} s` : '—']];
  return `<div class="training-stats">${items.map(([label, value]) => `<div><small>${label}</small><strong>${esc(value)}</strong></div>`).join('')}</div>`;
}

function today(data) {
  const days = data.race ? daysUntil(data.race.startsAt) : null;
  const plan = todaySession(data.analysis, data.steps, {minutes:view.minutes, daysLeft:days});
  const total = plan.blocks.reduce((sum, block) => sum + block.laps, 0) || 1;
  return `<section class="training-card training-today"><div class="training-card-head"><h2>Séance du jour</h2>
    <div class="training-chips" role="group" aria-label="Temps disponible">${MINUTES.map(value => `<button type="button" data-minutes="${value}" aria-pressed="${value === view.minutes}">${value} min</button>`).join('')}</div></div>
    <p class="training-focus">Objectif : <strong>${esc(plan.focus)}</strong></p>
    <div class="training-blocks-bar" aria-hidden="true">${plan.blocks.map((block, index) => `<span class="block-${index % 3}" style="flex:${block.laps}"></span>`).join('')}</div>
    <ol class="training-blocks">${plan.blocks.map((block, index) => `<li class="block-${index % 3}"><strong>${block.laps} tour${block.laps > 1 ? 's' : ''}</strong><span><b>${esc(block.title)}</b>${esc(block.tip)}</span></li>`).join('')}</ol>
    <p class="training-note">${total} tours en tout${data.analysis.median ? `, sur la base de tes tours en ${lapLabel(data.analysis.median)}` : ''}.</p></section>`;
}

function program(data) {
  const done = data.steps.filter(step => step.done).length;
  return `<section class="training-card"><div class="training-card-head"><h2>Programme</h2><span class="training-count">${done} / ${data.steps.length}</span></div>
    <div class="training-progress"><span style="width:${done / data.steps.length * 100}%"></span></div>
    <ol class="training-steps">${data.steps.map((step, index) => `<li class="${step.done ? 'is-done' : ''}">
      <span class="training-step-mark" aria-hidden="true">${step.done ? '✓' : index + 1}</span>
      <div><strong>${esc(step.title)}</strong><p>${esc(step.advice)}</p>${step.proof ? `<small>${esc(step.proof)}</small>` : ''}</div>
      ${step.auto ? '<span class="training-auto" data-tip="Validé par tes tours">Auto</span>' : `<label class="training-tick"><input type="checkbox" data-step="${esc(step.key)}"${step.manual ? ' checked' : ''}${data.track ? '' : ' disabled'}><span>Fait</span></label>`}
    </li>`).join('')}</ol></section>`;
}

function advice(data) {
  return `<section class="training-card"><h2>Conseils tirés de tes tours</h2><div class="training-advice">${data.advice.map(item => `<article class="advice-${esc(item.key)}"><strong>${esc(item.title)}</strong><p>${esc(item.text)}</p></article>`).join('')}</div></section>`;
}

// The last session, lap by lap: clean laps in colour, the others greyed out.
function chart(a) {
  const laps = (a.last?.laps || []).filter(lap => lap.t);
  if (laps.length < 2) return '';
  const times = laps.filter(lap => lap.clean).map(lap => lap.t);
  const best = Math.min(...(times.length ? times : laps.map(lap => lap.t)));
  const top = best + Math.max(2, (Math.max(...(times.length ? times : [best + 2])) - best) * 1.3);
  const width = 640, height = 160, step = width / laps.length;
  const bars = laps.map((lap, index) => {
    const value = Math.min(lap.t, top), h = Math.max(6, (top - value) / (top - best + 0.0001) * (height - 24) + 6);
    return `<rect x="${(index * step + step * 0.15).toFixed(1)}" y="${(height - h).toFixed(1)}" width="${(step * 0.7).toFixed(1)}" height="${h.toFixed(1)}" rx="2" class="${lap.pit ? 'is-pit' : lap.clean ? (lap.t === best ? 'is-best' : 'is-clean') : 'is-slow'}"><title>Tour ${lap.n} · ${lapLabel(lap.t)}${lap.pit ? ' · stands' : lap.clean ? '' : ' · hors rythme'}</title></rect>`;
  }).join('');
  return `<section class="training-card"><div class="training-card-head"><h2>Dernière séance</h2><span class="training-count">${esc(stamp(a.last.at))}</span></div>
    <svg class="training-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Temps au tour de la dernière séance : plus la barre est haute, plus le tour est rapide">${bars}</svg>
    <p class="training-legend"><span class="is-best"></span>Meilleur tour <span class="is-clean"></span>Tour propre <span class="is-slow"></span>Hors rythme <span class="is-pit"></span>Stands</p></section>`;
}

function comparison(data) {
  const c = data.comparison;
  if (!c) return '';
  if (!c.rank) return `<section class="training-card"><h2>Face aux autres pilotes</h2><p class="training-empty">${c.pilots} pilote${c.pilots > 1 ? 's' : ''} du site ${c.pilots > 1 ? 'ont' : 'a'} roulé ici dans cette catégorie. La comparaison s’affiche à partir de 3, sans aucun nom.</p></section>`;
  const sectors = c.sectorGaps.map((gap, index) => gap === null ? '' : `<div><small>Secteur ${index + 1}</small><strong class="${gap < 0.15 ? 'is-close' : ''}">+${num(gap, 2)} s</strong></div>`).join('');
  return `<section class="training-card"><div class="training-card-head"><h2>Face aux autres pilotes</h2><span class="training-count">${c.pilots} pilotes · 120 jours</span></div>
    <p class="training-rank"><strong>${c.rank}<sup>${c.rank === 1 ? 'er' : 'e'}</sup></strong> sur ${c.pilots} · plus rapide que ${c.faster} % des pilotes du site</p>
    <div class="training-stats">${c.rank > 1 ? `<div><small>Écart au meilleur</small><strong>+${num(c.gap, 3)} s</strong></div>` : '<div><small>Meilleur tour du site</small><strong>C’est toi</strong></div>'}${sectors}${c.fuelGap !== null ? `<div><small>Conso vs les autres</small><strong>${c.fuelGap > 0 ? '+' : ''}${Math.round(c.fuelGap)} %</strong></div>` : ''}</div>
    <p class="training-note">Ton rang n’est visible que par toi. Les autres pilotes ne sont jamais nommés.</p></section>`;
}

const WHEELS = ['Avant gauche', 'Avant droit', 'Arrière gauche', 'Arrière droit'];

// Fuel and energy: litres per lap, energy per lap and the ratio to set at the stop so both run out together.
function fuel(live) {
  if (!live || (!live.fuelPerLap && !live.energyPerLap)) return '';
  const items = [['Carburant / tour', live.fuelPerLap ? `${num(live.fuelPerLap, 2)} L` : '—'], ['Énergie / tour', live.energyPerLap ? `${num(live.energyPerLap)} %` : '—'],
    ['Tours avec un plein', live.tankLaps ?? '—'], ['Tours avec 100 % d’énergie', live.energyLaps ?? '—']];
  return `<section class="training-card"><div class="training-card-head"><h2>Carburant et énergie</h2>${live.capacity ? `<span class="training-count">Réservoir ${num(live.capacity, 0)} L</span>` : ''}</div>
    <div class="training-stats">${items.map(([label, value]) => `<div><small>${label}</small><strong>${esc(value)}</strong></div>`).join('')}</div>
    ${live.ratio ? `<p class="training-ratio">Rapport carburant conseillé : <strong>${num(live.ratio, 2)}</strong></p>
    <p class="training-note">Règle ce rapport au stand : le carburant et l’énergie s’épuisent alors au même tour, et tu ne charges pas de carburant pour rien.${live.ratio > 1 ? ' Au-dessus de 1, c’est le carburant qui limite ton relais.' : ''}</p>` : ''}</section>`;
}

// Tyres per compound: wear per lap, temperatures and pressures, wheel by wheel, as on the car.
function tyres(live) {
  if (!live?.compounds?.length) return '';
  const cell = (item, index) => `<div class="training-wheel${item.wear[index] !== null && item.wear[index] === Math.max(...item.wear.filter(value => value !== null)) ? ' is-worst' : ''}">
    <small>${WHEELS[index]}</small><strong>${item.wear[index] !== null ? `${num(item.wear[index], 2)} %` : '—'}</strong>
    <span>${item.temp[index] !== null ? `${num(item.temp[index], 0)} °C` : '—'} · ${item.kpa[index] ? `${num(item.kpa[index], 0)} kPa` : '—'}</span>
    <span>Freins ${item.brake[index] !== null ? `${num(item.brake[index], 0)} °C` : '—'}</span></div>`;
  return `<section class="training-card"><div class="training-card-head"><h2>Pneus</h2>${live.trackTemp !== null ? `<span class="training-count">Piste ${num(live.trackTemp, 0)} °C${live.airTemp !== null ? ` · air ${num(live.airTemp, 0)} °C` : ''}</span>` : ''}</div>
    ${live.compounds.map(item => `<div class="training-compound"><p><strong>${esc(item.name)}</strong> · ${item.laps} tour${item.laps > 1 ? 's' : ''}${item.track !== null ? ` · piste ${num(item.track, 0)} °C` : ''}${item.lapsTo50 ? ` · environ ${item.lapsTo50} tours pour user un pneu à moitié` : ''}</p>
      <div class="training-wheels">${[0, 1, 2, 3].map(index => cell(item, index)).join('')}</div></div>`).join('')}
    <p class="training-note">Usure par tour, en pourcentage du pneu.${live.source === 'results' ? ' Tirée de tes fichiers de résultats : les températures et les pressions arrivent avec la lecture en direct (synchroniseur ou plugin SimHub).' : ' Température moyenne de la bande de roulement, hors stands.'}${live.top ? ` Vitesse max : <strong>${num(live.top, 0)} km/h</strong>${live.topMedian ? ` (${num(live.topMedian, 0)} km/h en moyenne par tour)` : ''}.` : ''}</p></section>`;
}

// The stops measured in training, broken down: crossing the pit lane, tyres, refuelling, repairs.
function stops(live) {
  const pit = live?.pit;
  if (!pit) return '';
  const items = [['Traversée de la voie', pit.through !== null ? `${num(pit.through)} s` : '—'], ['4 pneus seuls', pit.tyres4 !== null ? `${num(pit.tyres4)} s` : '—'],
    ['2 pneus seuls', pit.tyres2 !== null ? `${num(pit.tyres2)} s` : '—'], ['Remplissage', pit.fuelRate ? `${num(pit.fuelRate, 2)} L/s` : '—'],
    ['Réparation', pit.repair !== null ? `${num(pit.repair)} s` : '—']];
  return `<section class="training-card"><div class="training-card-head"><h2>Arrêts aux stands</h2><span class="training-count">${pit.stops} arrêt${pit.stops > 1 ? 's' : ''} mesuré${pit.stops > 1 ? 's' : ''}</span></div>
    <div class="training-stats">${items.map(([label, value]) => `<div><small>${label}</small><strong>${esc(value)}</strong></div>`).join('')}</div>
    <ul class="training-stops">${pit.last.map(stop => `<li><strong>Tour ${stop.lap}</strong><span>${num(stop.lane)} s dans la voie, ${num(stop.stopped)} s arrêté</span>
      <small>${[stop.fuel > 1 ? `${num(stop.fuel, 0)} L` : '', stop.tyres ? `${stop.tyres} pneus` : '', stop.repair ? 'réparation' : ''].filter(Boolean).join(' · ') || 'sans service'}</small></li>`).join('')}</ul>
    <p class="training-note">Traversée : le temps dans la voie des stands sans l’arrêt. Pour isoler un temps, fais des arrêts avec un seul service : 4 pneus seuls, puis du carburant seul. <a href="/stands.html">Guide des stands</a></p></section>`;
}

// Online, every driver of a results file is marked as the player: the pilot's name in LMU tells which one he is.
function lmuName(data) {
  const pending = data.pending;
  if (pending) return `<form class="training-name is-pending" data-name-form><p><strong>${pending.files} séance${pending.files > 1 ? 's' : ''} en ligne attend${pending.files > 1 ? 'ent' : ''} ton nom.</strong> En multijoueur, LMU met tous les pilotes dans le fichier : choisis lequel est toi.</p>
    <div class="training-code"><select name="lmuName" aria-label="Ton nom dans LMU">${pending.drivers.map(name => `<option${name === data.lmuName ? ' selected' : ''}>${esc(name)}</option>`).join('')}</select><button type="submit" class="primary-button">C’est moi</button></div></form>`;
  return `<form class="training-name" data-name-form><label for="training-lmu-name">Ton nom dans LMU</label>
    <div class="training-code"><input id="training-lmu-name" name="lmuName" type="text" maxlength="60" value="${esc(data.lmuName || '')}" placeholder="Tel qu’il apparaît en course"><button type="submit" class="secondary-button">Enregistrer</button></div>
    <small>Sert à retrouver tes tours dans les séances en ligne. Le synchroniseur le trouve tout seul.</small></form>`;
}

function sync(data) {
  const device = data.device;
  const status = device.linked
    ? `<p class="training-linked"><span aria-hidden="true">●</span> Synchronisation active${device.lastSeen ? ` · dernière séance reçue le ${esc(stamp(device.lastSeen * 1000))}` : ' · en attente de ta première séance'}</p>`
    : '<ol class="training-howto"><li>Télécharge le synchroniseur.</li><li>Double-clique dessus, une seule fois.</li><li>Roule : chaque séance LMU arrive ici toute seule.</li></ol>';
  return `<section class="training-card training-sync"><h2>${device.linked ? 'Ton jeu est relié' : 'Relie ton jeu en une fois'}</h2>${status}
    <div class="training-actions"><form method="post" action="/api/training/sync"><button type="submit" class="${device.linked ? 'secondary-button' : 'primary-button'}">${device.linked ? 'Retélécharger' : 'Télécharger le synchroniseur'}</button></form>
    ${device.linked ? '<button type="button" class="secondary-button" data-unlink>Retirer la liaison</button>' : ''}</div>
    <p class="training-note">Petit programme Windows, sans fenêtre, qui lit les résultats de LMU (dossier UserData\\Log\\Results) et, pendant que tu roules, les données que le jeu publie (pneus, carburant, vitesse, arrêts). Il ne modifie rien dans le jeu. Windows peut afficher un avertissement au premier lancement : clique sur « Informations complémentaires » puis « Exécuter quand même ».</p>
    ${lmuName(data)}
    <details class="training-simhub"${view.simhub ? ' open' : ''}><summary>Tu utilises SimHub ?</summary>
      <p>Le plugin Endurance Manager pour SimHub fait la même chose que le synchroniseur. Dans SimHub, ouvre ses réglages et colle ce code. Un nouveau code remplace la liaison précédente : n’utilise que le plugin ou que le synchroniseur.</p>
      ${view.simhub ? `<div class="training-code"><input type="text" readonly value="${esc(view.simhub)}" aria-label="Code de liaison SimHub" data-code><button type="button" class="secondary-button" data-copy>Copier</button></div>` : '<button type="button" class="secondary-button" data-simhub>Obtenir mon code SimHub</button>'}</details>
    <label class="training-drop" data-drop><input type="file" accept=".xml" multiple data-file><strong>Ou dépose tes fichiers de résultats ici</strong><small>Documents ou Steam › Le Mans Ultimate › UserData › Log › Results</small></label>
    ${view.busy ? `<p class="training-busy" role="status">${esc(view.busy)}</p>` : ''}</section>`;
}

function sessions(data) {
  if (!data.sessions.length) return '';
  return `<section class="training-card"><h2>Mes séances</h2><ul class="training-sessions">${data.sessions.map(item => `<li>
    <div><strong>${esc(item.venue)}</strong><small>${esc(stamp(item.at))} · ${esc(KINDS[item.kind] || item.kind)} · ${esc(item.car)}</small></div>
    <span>${item.laps} tours</span><span>${lapLabel(item.best)}</span>
    <button type="button" class="training-delete" data-delete="${esc(item.id)}" aria-label="Supprimer la séance du ${esc(stamp(item.at))}">✕</button></li>`).join('')}</ul></section>`;
}

function render() {
  const data = view.data;
  const empty = !data.analysis.totalLaps;
  app.innerHTML = `${hero(data)}
    ${empty ? `<section class="training-card training-welcome"><h2>Ta première séance</h2><p>Relie ton jeu ci-dessous puis roule dans Le Mans Ultimate. Dès la fin de ta séance, tes tours arrivent ici : programme, séance du jour, conseils et comparaison avec les autres pilotes.</p></section>` : stats(data.analysis, data.live)}
    <div class="training-grid"><div>${today(data)}${program(data)}${fuel(data.live)}</div><div>${advice(data)}${chart(data.analysis)}${comparison(data)}${stops(data.live)}</div></div>
    ${tyres(data.live)}
    ${sync(data)}${sessions(data)}`;
}

async function upload(files) {
  const list = [...files].filter(file => /\.xml$/i.test(file.name));
  if (!list.length) { view.busy = 'Choisis un fichier .xml du dossier Results.'; render(); return; }
  let added = 0, errors = [];
  for (const [index, file] of list.entries()) {
    view.busy = `Envoi ${index + 1} / ${list.length}…`; render();
    try { const result = await call('/api/training/sessions', {method:'POST', headers:{'Content-Type':'application/xml'}, body:file}); if (result.created) added++; else if (result.pending) errors.push(`${file.name} : choisis ton nom ci-dessus.`); }
    catch (error) { errors.push(`${file.name} : ${error.message}`); }
  }
  view.busy = [added ? `${added} séance${added > 1 ? 's' : ''} ajoutée${added > 1 ? 's' : ''}.` : 'Aucune nouvelle séance.', ...errors].join(' ');
  await load();
}

async function act(task) {
  try { await task(); await load(); } catch (error) { view.busy = error.message; render(); }
}

app.addEventListener('change', event => {
  const target = event.target;
  if (target.matches('[data-track]')) { view.track = target.value; view.carClass = null; load(); }
  else if (target.matches('[data-class]')) { view.carClass = target.value; load(); }
  else if (target.matches('[data-file]')) upload(target.files);
  else if (target.matches('[data-step]')) act(() => call('/api/training/marks', {method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({track:view.track, step:target.dataset.step, done:target.checked})}));
});
app.addEventListener('click', event => {
  const minutes = event.target.closest('[data-minutes]');
  if (minutes) { view.minutes = Number(minutes.dataset.minutes); try { localStorage.setItem('training-minutes', String(view.minutes)); } catch {} render(); return; }
  const remove = event.target.closest('[data-delete]');
  if (remove && confirm('Supprimer cette séance ?')) act(() => call(`/api/training/sessions/${remove.dataset.delete}`, {method:'DELETE'}));
  if (event.target.closest('[data-simhub]')) act(async () => { view.simhub = (await call('/api/training/sync/code', {method:'POST', headers:{'Content-Type':'application/json'}, body:'{}'})).code; });
  if (event.target.closest('[data-copy]')) { const input = app.querySelector('[data-code]'); input.select(); navigator.clipboard?.writeText(input.value).catch(() => {}); }
  if (event.target.closest('[data-unlink]') && confirm('Retirer la liaison ? Le synchroniseur n’enverra plus rien. Tu peux le supprimer du dossier Démarrage de Windows.')) act(() => call('/api/training/sync', {method:'DELETE'}));
});
app.addEventListener('submit', event => {
  const form = event.target.closest('[data-name-form]');
  if (!form) return;
  event.preventDefault();
  const name = new FormData(form).get('lmuName');
  act(async () => {
    const result = await call('/api/training/profile', {method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({lmuName:name})});
    view.busy = result.added ? `${result.added} séance${result.added > 1 ? 's' : ''} ajoutée${result.added > 1 ? 's' : ''}.` : 'Nom enregistré.';
  });
});
app.addEventListener('dragover', event => { const zone = event.target.closest('[data-drop]'); if (zone) { event.preventDefault(); zone.classList.add('is-over'); } });
app.addEventListener('dragleave', event => event.target.closest('[data-drop]')?.classList.remove('is-over'));
app.addEventListener('drop', event => { const zone = event.target.closest('[data-drop]'); if (zone) { event.preventDefault(); upload(event.dataTransfer.files); } });

load();
