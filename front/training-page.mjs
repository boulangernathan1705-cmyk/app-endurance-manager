// « Entraînement » (server/training.mjs, server/training-prep.mjs): the next LMU race the pilot is entered in, his
// level and figures there, and the race's preparation shared with the crew. SimHub sends the sessions on its own;
// without it the pilot types his pace and gives each step its status himself.
import {shortDateLabel, timeAt} from './dates.mjs';
import {lapLabel} from '../shared/training.mjs';
import {PREP_PHASES, PREP_STEPS, PREP_LABELS, PREP_STATUSES, NOTE_LIMIT, availableAt, proposeStints, relayHour} from '../shared/training-prep.mjs';
import {turnsOf} from '../shared/circuit-turns.mjs';
import {strategySummary, strategyDetails} from './strategy-view.mjs';

const app = document.getElementById('training-app');
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num = (value, digits = 1) => value === null || value === undefined ? '—' : Number(value).toFixed(digits).replace('.', ',');
const stamp = ms => `${shortDateLabel(ms)} · ${timeAt(ms)}`;
const KINDS = {Practice1:'Essais', Practice2:'Essais', Practice3:'Essais', Practice4:'Essais', Qualify:'Qualif', Warmup:'Warm-up', Race:'Course'};
const view = {strategyOpen:false, brush:null, race:null, track:null, carClass:null, data:null, busy:'', simhub:'', method:'simhub', sessionsOpen:false, linkOpen:null, prepOpen:false, crewView:false, editing:null, message:''};
let loadController;


async function call(path, options = {}) {
  let response;
  try { response = await fetch(path, {credentials:'same-origin', cache:'no-store', ...options, headers:{Accept:'application/json', ...(options.headers || {})}}); }
  catch { throw Object.assign(Error('Connexion au site impossible. Vérifie ta connexion puis réessaie.'), {status:0}); }
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(Error(result.error || `Action impossible (${response.status}).`), {status:response.status});
  return result;
}

async function load() {
  loadController?.abort();
  const controller=new AbortController();loadController=controller;
  const query = new URLSearchParams();
  if (view.race) query.set('race', view.race);
  if (view.track) query.set('track', view.track);
  if (view.carClass) query.set('class', view.carClass);
  try {
    const data = await call(`/api/training?${query}`,{signal:controller.signal});
    if(controller.signal.aborted)return;
    view.data=data;
    view.race = data.race ? `${data.race.eventId}:${data.race.departureId}` : null;
    view.track = data.track?.key || null; view.carClass = data.carClass || null;
    render();
  } catch (error) { if(!controller.signal.aborted)renderError(error); }
}

function renderError(error) {
  const login = error.status === 401 ? `<a class="primary-button" href="/api/auth/discord?return=${encodeURIComponent('/entrainement.html')}">Se connecter avec Discord</a>` : '<a class="secondary-button" href="/">Retour à l’accueil</a>';
  app.innerHTML = `<section class="members-panel members-error"><h1>Mon entraînement</h1><p>${esc(error.message)}</p>${login}</section>`;
}

const daysUntil = ms => Math.max(0, Math.ceil((ms - Date.now()) / 86400000));
const relative = at => { const days=Math.floor((Date.now()-at)/86400000); return days<=0?'aujourd’hui':days===1?'hier':'il y a '+days+' jours'; };
const raceKey = race => race.eventId + ':' + race.departureId;

// The circuit and the class of the figures: the race's by default, any other one the pilot drove.
function trackPick(data) {
  const tracks = data.tracks.length > 1 ? '<label class="training-select">Circuit<select data-track>' + data.tracks.map(t => '<option value="' + esc(t.key) + '"' + (t.key === data.track?.key ? ' selected' : '') + '>' + esc(t.venue) + '</option>').join('') + '</select></label>' : '';
  const classes = data.classes.length > 1 ? '<label class="training-select">Catégorie<select data-class>' + data.classes.map(c => '<option' + (c === data.carClass ? ' selected' : '') + '>' + esc(c) + '</option>').join('') + '</select></label>' : '';
  return tracks + classes;
}

function hero(data) {
  const race = data.race;
  if (!race) return '<header class="preparation-head"><p class="memo-kicker">Entraînement · LMU</p><h1>Mon entraînement</h1><p class="preparation-sub">Inscris-toi à une course LMU : sa préparation s’ouvre ici.</p>' + (trackPick(data) ? '<div class="training-filters">' + trackPick(data) + '</div>' : '') + '</header>';
  const days = daysUntil(race.startsAt);
  const pick = data.races.length > 1 ? '<label class="training-select">Course<select data-race>' + data.races.map(item => '<option value="' + esc(raceKey(item)) + '"' + (raceKey(item) === raceKey(race) ? ' selected' : '') + '>' + esc(item.name + ' · ' + shortDateLabel(item.startsAt)) + '</option>').join('') + '</select></label>' : '';
  const chips = [race.category, data.crew?.car, stamp(race.startsAt), days ? 'dans ' + days + ' jour' + (days > 1 ? 's' : '') : 'aujourd’hui'].filter(Boolean);
  const filters = pick + trackPick(data);
  return '<header class="preparation-head"><p class="memo-kicker">Ma prochaine course</p><h1>' + esc(race.name) + '</h1><div class="prep-chips">' + chips.map(chip => '<span>' + esc(chip) + '</span>').join('') + '</div>' + (filters ? '<div class="training-filters">' + filters + '</div>' : '') + '</header>';
}

// Four figures: the level first (with what the next one asks), then the pilot's own numbers. Without the game linked,
// the pace and the fuel are typed.
function figures(data) {
  const a = data.analysis, l = data.live, level = data.level, race = data.race;
  const memo = race ? '/stands.html?' + new URLSearchParams({circuit:race.circuit, class:data.carClass || race.category}) : '/stands.html';
  const levelTile = '<div class="prep-stat is-level"><small>Mon niveau</small><strong>' + esc(level?.level || '—') + '</strong><span>' +
    (level?.next ? '<b>' + num(level.next.gap, 1) + ' s</b> pour passer ' + esc(level.next.name) : level ? 'Le meilleur niveau' : 'Roule ou écris ton rythme') + ' · <a href="' + esc(memo) + '">voir la grille</a></span></div>';
  if (!a.totalLaps) {
    if (!race) return '';
    const manual = data.manual || {};
    return '<form class="prep-stats" data-manual>' + levelTile +
      '<label class="prep-stat"><small>Mon tour moyen en course</small><input name="pace" inputmode="decimal" placeholder="1:42.3" value="' + esc(manual.pace ? lapLabel(manual.pace).replace(/0+$/, '').replace(/\.$/, '') : '') + '"><span>Écrit à la main</span></label>' +
      '<label class="prep-stat"><small>Conso / tour (L)</small><input name="fuel" inputmode="decimal" placeholder="3,4" value="' + esc(manual.fuel ? num(manual.fuel, 2) : '') + '"><span>Facultatif</span></label>' +
      '<div class="prep-stat prep-save"><button type="submit" class="primary-button">Enregistrer</button><span>Avec SimHub, tout se remplit seul.</span></div></form>';
  }
  const energy = l?.energyPerLap ?? a.energyPerLap, litres = l?.fuelPerLap ?? a.fuelLitres, laps = l?.energyLaps ?? l?.tankLaps ?? a.tankLaps;
  const conso = litres ? num(litres, 2) + ' L' : energy ? num(energy, 2) + ' %' : '—';
  return '<div class="prep-stats">' + levelTile +
    '<div class="prep-stat"><small>Meilleur tour</small><strong>' + lapLabel(a.best) + '</strong><span>' + (a.last ? 'dernière séance ' + esc(relative(a.last.at)) : '') + '</span></div>' +
    '<div class="prep-stat"><small>Rythme de course</small><strong>' + lapLabel(a.median) + '</strong><span>' + (a.longestRun >= 5 && a.regularity !== null ? '± ' + num(a.regularity, 2) + ' s sur ' + a.longestRun + ' tours' : 'tour médian') + '</span></div>' +
    '<div class="prep-stat"><small>Conso / tour</small><strong>' + conso + '</strong><span>' + (laps ? 'relais de ' + laps + ' tours' : '') + '</span></div></div>';
}

// The details behind the four figures: the consumption and the tyres, then the laps (sector to gain, pace beside
// the crew's).
const figure = (label, value, note = '', kind = 'is-you', noteKind = '') => '<div class="memo-row"><dt>' + esc(label) + '</dt><dd class="' + kind + '">' + esc(value) + '<small class="' + noteKind + '">' + esc(note) + '</small></dd></div>';
const average = values => { const list = values.filter(v => Number.isFinite(v)); return list.length ? list.reduce((a, b) => a + b, 0) / list.length : null; };
function details(data) {
  const a = data.analysis, l = data.live;
  if (!a.totalLaps && !l) return '';
  const energy = l?.energyPerLap ?? a.energyPerLap, litres = l?.fuelPerLap ?? a.fuelLitres;
  const wear = average(l?.compounds?.[0]?.wear || []);
  const team = average(data.crew?.pilots.map(p => p.energy) || []);
  const laps = l?.energyLaps ?? l?.tankLaps ?? a.tankLaps;
  const conso = '<section class="training-card"><h2>Conso et pneus</h2><dl>' +
    figure('Énergie / tour', energy ? num(energy, 2) + ' %' : '—', team ? 'équipage ' + num(team, 2) + ' %' : '') +
    figure('Carburant / tour', litres ? num(litres, 2) + ' L' : '—', data.game?.fuel ? 'jeu ' + num(data.game.fuel, 2) + ' L' : '', 'is-you', 'is-game') +
    figure('Usure / tour', wear !== null ? num(wear, 2) + ' %' : '—', wear !== null ? 'moyenne des pneus · ' + (l.compounds[0].name || '') : '') +
    figure('Relais', laps ? laps + ' tours' : '—', l?.energyLaps ? 'avec 100 % d’énergie' : laps ? 'avec un plein' : '') + '</dl></section>';
  const losses = (a.sectors || []).map((v, i) => v ? {sector:i + 1, gap:v.median - v.best} : null).filter(Boolean).sort((x, y) => y.gap - x.gap);
  const paces = [a.median, ...(data.crew?.pilots.map(p => p.pace) || [])].filter(v => Number.isFinite(v) && v > 0);
  const low = paces.length ? Math.min(...paces) - 0.5 : 0, high = paces.length ? Math.max(...paces) + 0.5 : 0, at = value => ((value - low) / (high - low) * 100) + '%';
  const band = high && data.crew ? '<div class="preparation-pace"><h3>Rythme de course</h3><div class="memo-band"><span class="memo-iqr" style="left:' + at(Math.min(...paces)) + ';width:' + ((Math.max(...paces) - Math.min(...paces)) / (high - low) * 100) + '%"></span>' +
    data.crew.pilots.filter(p => !p.you && p.pace).map(p => '<span class="memo-you preparation-peer" style="left:' + at(p.pace) + '" title="' + esc(p.name + ' · ' + lapLabel(p.pace)) + '"></span>').join('') +
    (a.median ? '<span class="memo-you" style="left:' + at(a.median) + '" title="Ton rythme"></span>' : '') + '</div><div class="memo-scale"><span>' + lapLabel(low) + '</span><span>L’équipage</span><span>' + lapLabel(high) + '</span></div></div>' : '';
  const chronos = a.totalLaps ? '<section class="training-card"><h2>Mes chronos</h2><dl>' + figure('Meilleur tour', lapLabel(a.best)) + figure('Rythme de course', lapLabel(a.median), 'tour médian') +
    figure('Secteur à gagner', losses.length ? 'S' + losses[0].sector + ' +' + num(losses[0].gap, 2) + ' s' : '—', losses.length ? 'sur ton meilleur S' + losses[0].sector : '') + '</dl>' + band + '</section>' : '';
  return '<div class="prep-details">' + conso + chronos + '</div>';
}

function crewCards(data) {
  if (!data.crew) return '';
  return '<section class="training-card"><h2>Mon équipage · ' + esc(data.crew.name) + '</h2><div class="prep-crew">' + data.crew.pilots.map(p =>
    '<div class="' + (p.you ? 'is-you' : '') + '"><b>' + esc(p.you ? 'Toi' : p.name) + '</b><span>' + (p.pace ? esc((p.level ? p.level + ' · ' : '') + lapLabel(p.pace)) : 'Pas encore roulé') + '</span>' +
    (p.last ? '<small>' + esc(relative(p.last.at)) + ' · ' + p.last.laps + ' tours</small>' : '') + '</div>').join('') + '</div></section>';
}

// « V4 » in a note, with the turn's name beside it when the circuit has one.
function noteText(text, turns) {
  return esc(text).replace(/\bV(\d{1,2}[ab]?)\b/gi, (match, n) => {
    const turn = turns.find(item => item.n.toLowerCase() === n.toLowerCase());
    return '<span class="prep-turn">V' + esc(n) + (turn?.name ? ' · ' + esc(turn.name) : '') + '</span>';
  });
}

function notesBlock(step, prep, turns) {
  const notes = prep.notes.filter(note => note.step === step.key);
  let html = notes.map(note => '<p class="prep-note"><b>' + esc(note.author) + '</b><span>' + noteText(note.text, turns) + '</span>' + (note.you ? '<button type="button" class="prep-note-delete" data-note-delete="' + esc(note.id) + '" aria-label="Supprimer ma note">✕</button>' : '') + '</p>').join('');
  if (view.editing === step.key) {
    const chips = (step.turns ? turns : []).map(turn => '<button type="button" data-hint="V' + esc(turn.n) + ' :" title="' + esc(turn.name || '') + '">V' + esc(turn.n) + (turn.name ? ' <span>' + esc(turn.name) + '</span>' : '') + '</button>').join('');
    html += '<form class="prep-editor" data-note-form="' + esc(step.key) + '">' + (chips ? '<div class="prep-hints prep-turns" aria-label="Virages">' + chips + '</div>' : '') +
      '<div class="prep-hints">' + step.hints.map(hint => '<button type="button" data-hint="' + esc(hint) + '">' + esc(hint) + '</button>').join('') + '</div>' +
      '<textarea name="text" maxlength="' + NOTE_LIMIT + '" rows="2" placeholder="Une note pour toi' + (prep.crew ? ' et ton équipage' : '') + '"></textarea>' +
      '<div class="prep-editor-actions"><small>' + (prep.crew ? 'Visible par ton équipage' : 'Visible par toi') + '</small><button type="button" class="secondary-button" data-note-cancel>Annuler</button><button type="submit" class="primary-button">Partager</button></div></form>';
  } else html += '<button type="button" class="prep-add" data-note-add="' + esc(step.key) + '">+ Ajouter une note' + (prep.crew ? ' pour l’équipage' : '') + '</button>';
  return '<div class="prep-notes">' + html + '</div>';
}

// The relay plan: a pilot picked, then the relays touched (or swept) take his colour. The number of relays comes from
// the laps and the consumption, the crew can change it; « Proposer » shares them from the hours each pilot ticked.
const initials = name => name === 'Toi' ? 'Toi' : String(name).trim().slice(0, 3);
// Estimated starts, to five minutes: the strategy's when the crew keeps its number of relays, else spread evenly.
const relayStart = (stints, relay) => {
  const plan = stints.estimate.strategy, at = plan && plan.relays.length === stints.count ? plan.relays[relay].start : relay * stints.minutes * 60 / stints.count;
  return stints.startsAt + Math.round(at / 300) * 300000;
};
const relayFree = (stints, pilot, relay) => availableAt(pilot.status, relayHour(relay, stints.count, stints.minutes));
function relayCell(stints, relay) {
  const id = stints.plan[relay], index = stints.pilots.findIndex(pilot => pilot.id === id), pilot = stints.pilots[index];
  const brush = stints.pilots.find(item => item.id === view.brush);
  const away = pilot && !relayFree(stints, pilot, relay), off = brush && !relayFree(stints, brush, relay);
  const at = timeAt(relayStart(stints, relay));
  const label = 'Relais ' + (relay + 1) + ', vers ' + at + ' : ' + (pilot ? pilot.name + (away ? ' (pas dispo)' : '') : 'personne');
  return '<button type="button" class="stint-cell' + (pilot ? ' is-p' + (index % 6) : '') + (away ? ' is-away' : '') + (off ? ' is-off' : '') + '" data-relay="' + relay + '" aria-label="' + esc(label) + '" title="' + esc(label) + '">' +
    '<small><strong>R' + (relay + 1) + '</strong></small><small>' + esc(at) + '</small><b>' + (pilot ? esc(initials(pilot.name)) : '') + '</b></button>';
}
function stintPlan(prep) {
  const stints = prep.stints;
  if (!stints) return '<p class="training-note">Rejoins un équipage pour planifier les relais avec lui.</p>';
  if (!stints.pilots.some(pilot => pilot.id === view.brush)) view.brush = stints.pilots.find(pilot => pilot.you)?.id || stints.pilots[0]?.id || null;
  const count = id => stints.plan.filter(item => item === id).length, guess = stints.estimate;
  const chips = stints.pilots.map((pilot, index) => '<button type="button" class="stint-pilot is-p' + (index % 6) + '" data-brush="' + esc(pilot.id) + '" aria-pressed="' + (view.brush === pilot.id) + '"><i></i>' + esc(pilot.name) + ' <span>' + count(pilot.id) + '</span></button>').join('');
  const rows = [];
  for (let start = 0; start < stints.count; start += 6) rows.push('<div class="stint-track">' + Array.from({length:Math.min(6, stints.count - start)}, (_, i) => relayCell(stints, start + i)).join('') + '</div>');
  const empty = stints.plan.filter(id => !id).length;
  const away = stints.plan.map((id, relay) => { const pilot = stints.pilots.find(item => item.id === id); return pilot && !relayFree(stints, pilot, relay) ? pilot.name + ' (R' + (relay + 1) + ')' : null; }).filter(Boolean);
  return '<div class="stint-plan"><div class="stint-count"><button type="button" data-relay-count="-1" aria-label="Un relais de moins"' + (stints.count <= 1 ? ' disabled' : '') + '>−</button><b>' + stints.count + ' relais</b><button type="button" data-relay-count="1" aria-label="Un relais de plus"' + (stints.count >= 60 ? ' disabled' : '') + '>+</button>' +
    '<small>Estimé : ' + esc(guess.strategy ? strategySummary(guess.strategy) : guess.count + ' relais d’environ 50 min') + '.' + (stints.count !== guess.count ? ' <button type="button" class="link-button" data-relay-reset>Reprendre l’estimation</button>' : '') + '</small></div>' +
    (guess.strategy ? strategyDetails(guess.strategy, {startsAt:stints.startsAt, open:view.strategyOpen}) : '') +
    '<div class="stint-pilots" role="group" aria-label="Pilote à placer">' + chips + '</div>' +
    '<div class="stint-tracks">' + rows.join('') + '</div>' +
    (empty ? '<p class="stint-warn">' + (empty === stints.count ? 'Choisis un pilote puis touche ses relais, ou laisse le site proposer.' : empty + ' relais sans pilote.') + '</p>' : '<p class="stint-ok">Chaque relais a son pilote.</p>') +
    (away.length ? '<p class="stint-warn">Pas disponible : ' + esc(away.join(', ')) + '.</p>' : '') +
    '<div class="stint-actions"><button type="button" class="secondary-button" data-stint-propose>' + (empty === stints.count ? 'Proposer un planning' : 'Proposer à nouveau') + '</button>' +
    (empty < stints.count ? '<button type="button" class="link-button" data-stint-clear>Tout effacer</button>' : '') + '</div></div>';
}

function prepSection(data) {
  const prep = data.prep;
  if (!prep) return '';
  const turns = turnsOf(data.race.circuit);
  const useful = PREP_STEPS.filter(step => prep.statuses[step.key] !== 'skip'), done = useful.filter(step => prep.statuses[step.key] === 'done').length;
  const next = PREP_STEPS.find(step => step.key === prep.next);
  const title = prep.crew ? 'Prépa de l’équipage' : 'Ma prépa';
  let body;
  if (view.crewView && prep.crew) {
    body = '<table class="prep-matrix"><thead><tr><th scope="col">Étape</th>' + prep.crew.pilots.map(p => '<th scope="col">' + esc(p.name) + '</th>').join('') + '</tr></thead><tbody>' +
      PREP_PHASES.map(phase => '<tr><th colspan="' + (prep.crew.pilots.length + 1) + '" class="prep-matrix-phase">' + esc(phase.title) + '</th></tr>' + phase.steps.map(step => {
        const count = prep.notes.filter(note => note.step === step.key).length;
        return '<tr><th scope="row">' + esc(step.title) + (count ? ' <small>· ' + count + ' note' + (count > 1 ? 's' : '') + '</small>' : '') + '</th>' + prep.crew.pilots.map(p => '<td><i class="prep-dot is-' + p.statuses[step.key] + '" title="' + esc(PREP_LABELS[p.statuses[step.key]]) + '"></i></td>').join('') + '</tr>';
      }).join('')).join('') + '</tbody></table>';
  } else {
    body = PREP_PHASES.map(phase => {
      const list = phase.steps.filter(step => prep.statuses[step.key] !== 'skip');
      return '<div class="prep-phase"><h3><span>' + esc(phase.title) + '</span><span>' + list.filter(step => prep.statuses[step.key] === 'done').length + ' / ' + list.length + '</span></h3>' + phase.steps.map(step => {
        const status = prep.statuses[step.key], proof = prep.proofs[step.key];
        return '<div class="prep-step is-' + status + (step.key === prep.next ? ' is-next' : '') + '"><span class="prep-step-title">' + esc(step.title) + '</span>' +
          '<div class="prep-seg" role="group" aria-label="' + esc('Statut : ' + step.title) + '">' + PREP_STATUSES.map(value => '<button type="button" data-status="' + value + '" data-step="' + esc(step.key) + '" aria-pressed="' + (status === value) + '">' + PREP_LABELS[value] + '</button>').join('') + '</div>' +
          '<p class="prep-tip">' + esc(step.tip) + (step.memo ? ' <a href="/stands.html?' + esc(new URLSearchParams({circuit:data.race.circuit, class:data.carClass || data.race.category})) + '">Voir le mémo</a>' : '') + (proof ? ' <span class="prep-proof">· Détecté : ' + esc(proof) + '</span>' : '') + '</p>' +
          (step.plan ? stintPlan(prep) : notesBlock(step, prep, turns)) + '</div>';
      }).join('') + '</div>';
    }).join('');
  }
  const last = prep.last?.notes.length ? '<details class="training-card prep-last"><summary><h2>La dernière fois ici</h2><span>' + esc(prep.last.name + ' · ' + shortDateLabel(prep.last.startsAt)) + '</span></summary>' +
    prep.last.notes.map(note => '<p class="prep-note"><b>' + esc(note.author) + '</b><span>' + noteText(note.text, turns) + '</span>' + '</p>').join('') +
    '<button type="button" class="secondary-button" data-reuse>Reprendre ces ' + prep.last.notes.length + ' notes</button></details>' : '';
  return last + '<details class="training-card prep" data-fold="prep"' + (view.prepOpen ? ' open' : '') + '><summary><div class="prep-head"><h2>' + title + '</h2><span>' + done + ' / ' + useful.length + ' faits</span></div>' +
    '<div class="prep-bar"><i style="width:' + (useful.length ? Math.round(done / useful.length * 100) : 0) + '%"></i></div>' +
    '<p class="prep-next">' + (next ? 'Prochaine étape : <b>' + esc(next.title) + '</b>' : 'Tout est prêt pour la course.') + '</p></summary>' +
    (prep.crew ? '<div class="prep-toggle" role="group" aria-label="Vue"><button type="button" data-crew-view="0" aria-pressed="' + !view.crewView + '">Ma prépa</button><button type="button" data-crew-view="1" aria-pressed="' + view.crewView + '">L’équipage</button></div>' : '') +
    body + (view.message ? '<p class="training-note" role="status">' + esc(view.message) + '</p>' : '') + '</details>';
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
  const device=data.device;
  const received=device.lastSeen?'<p class="training-linked"><span aria-hidden="true">●</span> Dernière séance reçue : '+esc(stamp(device.lastSeen*1000))+'</p>':device.linked?'<p class="training-note">Code de liaison créé. La connexion sera confirmée à la réception de ta première séance.</p>':'<p>Choisis une méthode pour envoyer tes séances LMU automatiquement.</p>';
  const simhub='<ol class="training-howto"><li><strong>Installe le plugin dans SimHub.</strong><p>Ferme SimHub, copie le fichier EnduranceManager.SimHub.dll dans le dossier de SimHub (en général C:\\Program Files (x86)\\SimHub), relance SimHub et accepte le plugin. « Endurance Manager » apparaît dans le menu de gauche.</p></li><li><strong>Relie-le à ton compte.</strong><p>Crée ton code ici et copie-le. Dans SimHub, ouvre Endurance Manager et clique sur « Coller mon code » : la liaison passe au vert.</p>'+(view.simhub?'<div class="training-code"><input type="text" readonly value="'+esc(view.simhub)+'" aria-label="Code de liaison SimHub" data-code><button type="button" class="secondary-button" data-copy>Copier le code</button></div>':'<button type="button" class="primary-button" data-simhub>'+ (device.linked?'Créer un nouveau code':'Créer mon code')+'</button>')+'</li><li><strong>Roule.</strong><p>Lance LMU avec SimHub ouvert : la carte Le Mans Ultimate du plugin indique « En piste ». Fais quelques tours avec un arrêt au stand puis reviens au menu. La séance arrive ici une à deux minutes après.</p></li></ol>';
  const windows='<ol class="training-howto"><li><strong>Télécharge ton synchroniseur personnel.</strong><form method="post" action="/api/training/sync"><button type="submit" class="primary-button">Télécharger le synchroniseur Windows</button></form><p>Le fichier est déjà lié à ton compte. Garde-le sur le PC où tu joues à LMU.</p></li><li><strong>Lance-le une première fois.</strong><p>Double-clique sur EnduranceManagerSync.exe. Il fonctionne sans fenêtre et démarre ensuite avec Windows. Vérifie que le fichier vient bien de ce site avant de l’autoriser si Windows affiche un avertissement.</p></li><li><strong>Roule puis vérifie l’arrivée d’une séance.</strong><p>Reviens au menu LMU après quelques tours. Attends une à deux minutes puis recharge cette page : la dernière séance reçue doit apparaître ci-dessus.</p></li></ol>';
  return '<section class="training-sync">'+received+'<div class="training-methods" role="group" aria-label="Méthode de liaison"><button type="button" data-method="simhub" aria-pressed="'+(view.method==='simhub')+'">Avec SimHub</button><button type="button" data-method="windows" aria-pressed="'+(view.method==='windows')+'">Sans SimHub · Windows</button></div>'+(view.method==='simhub'?simhub:windows)+'<p class="training-note">Utilise une seule méthode. Créer un code ou télécharger un nouveau synchroniseur remplace la liaison précédente.</p><details class="training-troubleshooting"><summary>La séance n’arrive pas ?</summary><ul><li>Vérifie que LMU et SimHub sont ouverts sur le même PC, ou que le synchroniseur Windows est lancé.</li><li>Reviens au menu du jeu et attends deux minutes : les échantillons restent sur ton PC pendant que tu roules.</li><li>Dans SimHub, l’écran Endurance Manager doit indiquer « Relié à '+esc(location.host)+' ». Sinon, crée un code ici et clique sur « Changer de code » dans SimHub.</li><li>Pour le synchroniseur, lance le dernier fichier téléchargé.</li><li>Si une séance en ligne attend ton nom LMU, renseigne-le ci-dessous.</li></ul>'+lmuName(data)+'</details><details class="training-troubleshooting"><summary>Importer un fichier manuellement</summary><p class="training-note">Pour une séance manquante, dépose son fichier XML depuis Steam › steamapps › common › Le Mans Ultimate › UserData › Log › Results.</p><label class="training-drop" data-drop><input type="file" accept=".xml" multiple data-file><strong>Choisir ou déposer des fichiers XML</strong></label></details>'+(device.linked?'<button type="button" class="secondary-button" data-unlink>Retirer la liaison</button>':'')+(view.busy?'<p class="training-busy" role="status">'+esc(view.busy)+'</p>':'')+'</section>';
}

function sessions(data) {
  if (!data.sessions.length) return '';
  return '<details class="training-card preparation-sessions" data-fold="sessions"'+(view.sessionsOpen?' open':'')+'><summary>Mes séances <span>'+data.sessions.length+(data.sessions.length===1?' séance récente':' dernières')+'</span></summary><ul class="training-sessions">'+data.sessions.map(item=>'<li><div><small>'+esc(relative(item.at))+'</small><span>'+esc(item.venue+' · '+item.car+' · '+(KINDS[item.kind]||item.kind))+'</span></div><span>'+item.laps+' tours</span><button type="button" class="training-delete" data-delete="'+esc(item.id)+'" aria-label="Supprimer la séance du '+esc(stamp(item.at))+'">✕</button></li>').join('')+'</ul></details>';
}

function render() {
  const data=view.data;
  app.innerHTML=hero(data)+figures(data)+details(data)+prepSection(data)+crewCards(data)+sessions(data)+'<details class="training-card preparation-details" data-fold="link"'+((view.linkOpen??!data.device.linked)||data.pending||view.busy||view.simhub?' open':'')+'><summary>Relier mon jeu'+(data.device.linked?' · relié':'')+'</summary>'+sync(data)+'</details>';
}

async function prepCall(path, payload, method = 'POST') {
  const race = view.data.race;
  await call(path, {method, headers:{'Content-Type':'application/json'}, body:JSON.stringify({eventId:race.eventId, departureId:race.departureId, ...payload})});
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

// Saves the relays changed (and the number of relays); the plan on screen goes back if the server refuses.
function saveStints(changes, before) {
  const stints = view.data.prep.stints;
  view.message = ''; render();
  prepCall('/api/training/prep/stints', {count:stints.count, relays:changes}, 'PUT').then(load).catch(error => { Object.assign(stints, before); view.message = error.message; render(); });
}
const snapshot = stints => ({count:stints.count, plan:[...stints.plan]});
// Touch or sweep the relays: they take the pilot picked, or are cleared when the first one touched already had him.
let painting = null;
function paint(cell) {
  const relay = Number(cell.dataset.relay), stints = view.data.prep.stints;
  if (painting.seen.has(relay)) return;
  painting.seen.add(relay);
  stints.plan[relay] = painting.value;
  painting.changes[relay] = painting.value;
  cell.outerHTML = relayCell(stints, relay);
}
app.addEventListener('pointerdown', event => {
  const cell = event.target.closest('[data-relay]');
  if (!cell || event.button > 0 || !view.brush) return;
  const stints = view.data.prep.stints, relay = Number(cell.dataset.relay);
  painting = {value:stints.plan[relay] === view.brush ? null : view.brush, seen:new Set(), changes:{}, before:snapshot(stints)};
  paint(cell);
});
app.addEventListener('pointermove', event => {
  if (!painting) return;
  const cell = document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-relay]');
  if (cell && app.contains(cell)) paint(cell);
});
const stopPainting = () => { if (!painting) return; const {changes, before} = painting; painting = null; saveStints(changes, before); };
window.addEventListener('pointerup', stopPainting);
window.addEventListener('pointercancel', stopPainting);

// field: where an error shows, the game link's panel (busy) or the preparation (message).
async function act(task, field = 'busy') {
  try { await task(); await load(); } catch (error) { view[field] = error.message; if (field === 'message') view.prepOpen = true; render(); }
}

app.addEventListener('change', event => {
  const target = event.target;
  if (target.matches('[data-race]')) { view.race = target.value; view.track = null; view.carClass = null; view.editing = null; load(); return; }
  if (target.matches('[data-track]')) { view.track = target.value; view.carClass = null; load(); }
  else if (target.matches('[data-class]')) { view.carClass = target.value; load(); }
  else if (target.matches('[data-file]')) upload(target.files);
});
app.addEventListener('click', event => {
  const status = event.target.closest('[data-status]');
  if (status) {
    const step = status.dataset.step, value = status.dataset.status, before = view.data.prep.statuses[step];
    view.data.prep.statuses[step] = value; view.message = '';
    view.data.prep.next = (PREP_STEPS.find(item => view.data.prep.statuses[item.key] === 'rework') || PREP_STEPS.find(item => view.data.prep.statuses[item.key] === 'todo'))?.key || null;
    render();
    prepCall('/api/training/prep', {step, status:value}, 'PUT').catch(error => { view.data.prep.statuses[step] = before; view.message = error.message; render(); });
    return;
  }
  const brush = event.target.closest('[data-brush]');
  if (brush) { view.brush = brush.dataset.brush; render(); return; }
  // A relay is changed by the pointer; the keyboard (detail 0) changes it here.
  const cell = event.target.closest('[data-relay]');
  if (cell) {
    if (event.detail === 0 && view.brush) { const stints = view.data.prep.stints, relay = Number(cell.dataset.relay), before = snapshot(stints); stints.plan[relay] = stints.plan[relay] === view.brush ? null : view.brush; saveStints({[relay]:stints.plan[relay]}, before); }
    return;
  }
  const more = event.target.closest('[data-relay-count], [data-relay-reset]');
  if (more) {
    const stints = view.data.prep.stints, before = snapshot(stints);
    stints.count = more.dataset.relayCount ? Math.max(1, Math.min(60, stints.count + Number(more.dataset.relayCount))) : stints.estimate.count;
    stints.plan = Array.from({length:stints.count}, (_, relay) => stints.plan[relay] || null);
    saveStints({}, before);
    return;
  }
  if (event.target.closest('[data-stint-propose], [data-stint-clear]')) {
    const stints = view.data.prep.stints, before = snapshot(stints);
    stints.plan = event.target.closest('[data-stint-propose]') ? proposeStints(stints.pilots, stints.count, relay => relayHour(relay, stints.count, stints.minutes)) : stints.plan.map(() => null);
    saveStints(Object.fromEntries(stints.plan.map((id, relay) => [relay, id]).filter(([relay, id]) => before.plan[relay] !== id)), before);
    return;
  }
  const add = event.target.closest('[data-note-add]');
  if (add) { view.editing = add.dataset.noteAdd; render(); app.querySelector('[data-note-form] textarea')?.focus(); return; }
  if (event.target.closest('[data-note-cancel]')) { view.editing = null; render(); return; }
  const hint = event.target.closest('[data-hint]');
  if (hint) { const area = hint.closest('form').elements.text; area.value = (area.value ? area.value.trimEnd() + ' ' : '') + hint.dataset.hint + ' '; area.focus(); return; }
  const removeNote = event.target.closest('[data-note-delete]');
  if (removeNote) { act(() => call('/api/training/prep/notes/' + encodeURIComponent(removeNote.dataset.noteDelete), {method:'DELETE'}), 'message'); return; }
  if (event.target.closest('[data-reuse]')) { act(async () => { const result = await call('/api/training/prep/reuse', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({eventId:view.data.race.eventId, departureId:view.data.race.departureId})}); view.prepOpen = true; view.message = result.added ? result.added + ' note' + (result.added > 1 ? 's reprises.' : ' reprise.') : 'Ces notes sont déjà là.'; }, 'message'); return; }
  const crewView = event.target.closest('[data-crew-view]');
  if (crewView) { view.crewView = crewView.dataset.crewView === '1'; render(); return; }
  const method=event.target.closest('[data-method]');
  if(method){view.method=method.dataset.method;view.linkOpen=true;render();return;}
  const remove = event.target.closest('[data-delete]');
  if (remove && confirm('Supprimer cette séance ?')) act(() => call(`/api/training/sessions/${remove.dataset.delete}`, {method:'DELETE'}));
  if(event.target.closest('[data-simhub]')){view.busy='Création du code…';render();call('/api/training/sync/code',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'}).then(result=>{view.simhub=result.code;view.data.device={linked:true,lastSeen:null};view.busy='';render();}).catch(error=>{view.busy=error.message;render();});}
  if(event.target.closest('[data-copy]')){const input=app.querySelector('[data-code]');input.select();if(navigator.clipboard)navigator.clipboard.writeText(input.value).then(()=>{view.busy='Code copié. Colle-le maintenant dans SimHub.';render();}).catch(()=>{view.busy='Sélectionne le code puis copie-le avec Ctrl+C.';render();});}
  if (event.target.closest('[data-unlink]') && confirm('Retirer la liaison ? Le plugin et le synchroniseur n’enverront plus de séances.')) act(async()=>{await call('/api/training/sync',{method:'DELETE'});view.simhub='';view.busy='Liaison retirée.';});
});
app.addEventListener('submit', event => {
  const note = event.target.closest('[data-note-form]');
  if (note) {
    event.preventDefault();
    const text = note.elements.text.value.trim();
    if (!text) return;
    act(async () => { await prepCall('/api/training/prep/notes', {step:note.dataset.noteForm, text}); view.editing = null; view.message = ''; }, 'message');
    return;
  }
  const manual = event.target.closest('[data-manual]');
  if (manual) {
    event.preventDefault();
    act(async () => { await prepCall('/api/training/manual', {pace:manual.elements.pace.value.trim(), fuel:manual.elements.fuel.value.trim()}, 'PUT'); view.message = ''; }, 'message');
    return;
  }
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

app.addEventListener('toggle',event=>{if(!app.contains(event.target))return;const fold=event.target.dataset.fold;if(fold==='sessions')view.sessionsOpen=event.target.open;if(fold==='link')view.linkOpen=event.target.open;if(fold==='prep')view.prepOpen=event.target.open;if(event.target.matches('.strategy'))view.strategyOpen=event.target.open;},true);

load();
