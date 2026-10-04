import {nextSession} from '../shared/preparation.mjs';

const root = document.getElementById('preparation-app');
const crewId = new URL(location.href).searchParams.get('crew');
const path = `/api/crews/${encodeURIComponent(crewId || '')}/preparation`;
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const labels = {worked:'Pratiqué', partial:'À compléter', todo:'À faire', unknown:'Sans données', optional:'Facultatif'};
const views = {training:'Entraînement', followup:'Suivi', crew:'Équipage'};
let data, minutes = 30, loading = false;
const currentView = () => {
  const view = new URL(location.href).searchParams.get('view');
  return Object.hasOwn(views, view) ? view : 'training';
};
const clock = seconds => {
  if (seconds == null) return '—';
  const ms = Math.round(seconds * 1000);
  return `${Math.floor(ms / 60000)}:${((ms % 60000) / 1000).toFixed(3).padStart(6, '0')}`;
};
const elapsed = seconds => seconds == null ? '—' : `${Math.floor(seconds / 60)} min ${Math.floor(seconds % 60).toString().padStart(2, '0')} s`;
const conditionLabel = c => !c ? 'Conditions non mesurées' : `${c.wet === true ? 'Mouillé' : c.wet === false ? 'Sec' : 'Adhérence non mesurée'} · ${c.night === true ? 'Nuit' : c.night === false ? 'Jour' : 'Lumière non mesurée'}`;
const date = ms => esc(new Date(ms).toLocaleString('fr-FR', {day:'numeric', month:'short', hour:'2-digit', minute:'2-digit'}));

async function api(suffix = '', method = 'GET', body) {
  const response = await fetch(path + suffix, {method, credentials:'same-origin', cache:'no-store', headers:body ? {'Content-Type':'application/json'} : {}, body:body ? JSON.stringify(body) : undefined});
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw Error(result.error || 'Action momentanément indisponible.');
  return result;
}
function message(text, error = false) {
  const element = root.querySelector('[data-message]');
  if (element) { element.className = `prep-message${error ? ' is-error' : ''}`; element.textContent = text; }
}
function table(caption, headers, rows, wide = false) {
  return `<div class="prep-table-wrap${wide ? ' is-wide' : ''}" tabindex="0" role="region" aria-label="${esc(caption)}"><table><caption class="sr-only">${esc(caption)}</caption><thead><tr>${headers.map(h => `<th scope="col">${h}</th>`).join('')}</tr></thead><tbody>${rows.map(row => `<tr>${row.map((cell,i) => i === 0 ? `<th scope="row">${cell}</th>` : `<td>${cell}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}
function tip(id, text) {
  return `<span class="prep-help"><button type="button" data-help aria-label="Explication" aria-describedby="${id}" aria-expanded="false">?</button><span class="prep-tooltip" id="${id}" role="tooltip">${esc(text)}</span></span>`;
}
function heading(title, help = '') { return `<div class="prep-section-heading"><h2>${title}</h2>${help}</div>`; }
function status(item, total = data.analysis.total) {
  const key = total ? item?.status || 'unknown' : item?.status === 'optional' ? 'optional' : 'unknown';
  return `<span class="prep-status ${key}"><i aria-hidden="true"></i>${labels[key]}</span>`;
}
function trainingMarkup() {
  const next = nextSession(data.analysis, data.level, minutes);
  return `<div class="prep-controls"><label>Ton parcours<select data-level><option value="discover"${data.level === 'discover' ? ' selected' : ''}>Je découvre la piste</option><option value="familiar"${data.level === 'familiar' ? ' selected' : ''}>Je connais la piste</option></select></label><label>Temps disponible<select data-minutes>${[20,30,45,60].map(n => `<option value="${n}"${n === minutes ? ' selected' : ''}>${n} minutes</option>`).join('')}</select></label></div>
    <section class="prep-objective"><span class="prep-eyebrow">Séance conseillée</span><h2>${esc(next.title)}</h2><p>${esc(next.goal)}</p>${next.stintAdvice ? `<p class="prep-warning">${esc(next.stintAdvice)}</p>` : ''}</section>
    <section>${heading('Plan de séance')}${table('Étapes de la séance', ['Étape', 'À faire'], next.phases.map((phase,i) => [
      `<span class="prep-step">${i + 1}</span><strong>${esc(phase.title)}</strong><small>${phase.startMinute}–${phase.endMinute} min</small>`,
      `<ul class="prep-instructions">${phase.actions.map(action => `<li>${esc(action)}</li>`).join('')}</ul>`
    ]))}<p class="prep-note">Durées indicatives : termine le tour en cours avant de passer à la suite.</p></section>`;
}
function followupMarkup() {
  const a = data.analysis;
  const topics = a.coverage.filter(item => !['wet','night'].includes(item.key) || data.conditions[item.key] === true || (item.key === 'wet' ? a.wetSeconds : a.nightSeconds) > 0);
  const progress = `<section>${heading('Préparation enregistrée', tip('status-help', 'Vert : pratiqué. Orange : à compléter. Rouge : à faire. Gris : données absentes. Ces repères montrent la pratique enregistrée, pas un niveau de maîtrise.'))}${table('Suivi des thèmes de préparation', ['Thème', 'État', 'Observation'], topics.map(item => [esc(item.label), status(item), a.total ? esc(item.evidence) : 'Aucune donnée reçue']), true)}</section>`;
  const metrics = !a.total ? '<p class="prep-empty">Aucune séance enregistrée pour le moment.</p>' : `<section>${heading('Repères de relais', tip('pace-help', 'Les chronos et consommations utilisent le plus grand groupe de tours valides, sans stands ni interruption, dans une même séance et les mêmes catégories de conditions. Les contacts, l’usure et le setup réellement utilisé ne sont pas mesurés.'))}<p class="prep-note">Référence : ${esc(conditionLabel(a.paceConditions))}${a.paceStartedAt ? ' · ' + date(a.paceStartedAt) : ''} · ${a.paceSamples} tours comparables</p>${table('Données de roulage', ['Indicateur', 'Mesure'], [
    ['Chrono médian', clock(a.paceSeconds)],
    ['Écart médian au rythme', a.deviationSeconds == null ? 'Non mesuré' : a.deviationSeconds.toFixed(3) + ' s'],
    ['Meilleur tour du groupe', clock(a.bestSeconds)],
    ['Plus long relais continu', a.longestSeconds ? elapsed(a.longestSeconds) : 'Non mesuré'],
    ['Tours valides identifiés', a.knownValidity ? `${a.valid} / ${a.knownValidity} · ${a.validPercent.toFixed(1)} %` : 'Non mesurés'],
    ['Validité non renseignée', `${a.unknownValidity} tours`],
    ['Roulage enregistré', elapsed(a.rollingSeconds)],
    ['Carburant médian par tour', a.fuelPerLap == null ? 'Non mesuré' : `${a.fuelPerLap.toFixed(3)} L · ${a.fuelSamples} tours`],
    ['Énergie virtuelle par tour', a.energyPerLap == null ? 'Non mesurée' : `${a.energyPerLap.toFixed(3)} % · ${a.energySamples} tours`],
    ['Roulage sur le mouillé', a.wetKnown ? elapsed(a.wetSeconds) : 'Non mesuré'],
    ['Roulage de nuit', a.nightKnown ? elapsed(a.nightSeconds) : 'Non mesuré']
  ])}</section>`;
  const sessions = !data.sessions.length ? '' : `<section>${heading('Carnet de roulage')}${table('Séances enregistrées', ['Séance', 'Roulage', 'Tours', 'Relais continu', 'Rythme médian'], data.sessions.map(s => [date(s.startedAt), elapsed(s.rollingSeconds), s.total, s.longestSeconds ? elapsed(s.longestSeconds) : '—', clock(s.paceSeconds)]), true)}<p class="prep-note">Les 12 dernières séances, sur les 60 derniers jours, avec cette voiture et ce circuit.</p></section>`;
  return `${progress}${metrics}${sessions}<section class="prep-connection">${heading('Connexion SimHub')}<p class="prep-note">Le connecteur est un prototype à tester en jeu. Aucun installateur n’est disponible. Cette configuration sert aux tests et contient ta clé personnelle.</p><p class="prep-connection-state">${data.device.lastSeen ? 'Dernières données reçues : ' + date(data.device.lastSeen * 1000) : data.device.linked ? 'Liaison créée · en attente de données' : 'Aucune liaison créée'}</p><div class="prep-actions"><button class="secondary-button" data-device ${data.crew.car ? '' : 'disabled'}>Configuration de test</button>${data.device.linked ? '<button class="link-button" data-unlink>Retirer la liaison</button>' : ''}</div></section>`;
}
function conditionOptions(value) {
  return [[null,'À confirmer'],[false,'Non'],[true,'Oui']].map(([v,label]) => `<option value="${v === null ? 'unknown' : String(v)}"${v === value ? ' selected' : ''}>${label}</option>`).join('');
}
function crewMarkup() {
  const hasCar = Boolean(data.crew.car);
  const conditionText = key => data.conditions[key] === true ? 'Prévu' : data.conditions[key] === false ? 'Non prévu' : 'À confirmer';
  const conditionRows = [
    ['Piste mouillée', data.manage ? `<select name="wet" aria-label="Piste mouillée prévue">${conditionOptions(data.conditions.wet)}</select>` : conditionText('wet')],
    ['Roulage de nuit', data.manage ? `<select name="night" aria-label="Roulage de nuit prévu">${conditionOptions(data.conditions.night)}</select>` : conditionText('night')],
    ['Durée cible du relais', data.manage ? `<label class="prep-inline-input"><input name="stintMinutes" aria-label="Durée cible du relais en minutes" type="number" min="20" max="180" value="${data.conditions.stintMinutes}" required><span>min</span></label>` : data.conditions.stintMinutes + ' min']
  ];
  const rosterStatus = (pilot,key) => {
    const item = pilot.coverage.find(x => x.key === key);
    return item ? status(item,pilot.minutes) : 'Non prévu';
  };
  return `<section>${heading('Voiture et setup commun')}${table('Voiture et setup de l’équipage', ['Élément', 'Référence'], [
    ['Voiture', esc(data.crew.car || 'À choisir dans l’équipage')],
    ['Setup commun', data.setup ? `<div class="prep-setup-file"><span>${esc(data.setup.name)}</span><a class="secondary-button" href="${path}/setup">Télécharger</a></div>` : 'Aucun fichier ajouté']
  ])}${data.manage ? `<label class="prep-upload">${data.setup ? 'Remplacer le setup' : 'Ajouter le setup'}<input type="file" accept=".svm,.sto" data-setup ${hasCar ? '' : 'disabled'}></label><p class="prep-note">Fichier .svm ou .sto · 128 Ko maximum.</p>` : ''}</section>
    <section>${heading('Conditions de course')}${data.manage ? '<form data-conditions>' : ''}${table('Conditions à préparer', ['Condition', data.manage ? 'Réglage de l’équipage' : 'Prévu'], conditionRows)}${data.manage ? '<div class="prep-form-actions"><button class="secondary-button" type="submit">Enregistrer les conditions</button></div></form>' : ''}</section>
    <section>${heading('Roulage de l’équipage')}${table('Préparation des pilotes', ['Pilote', 'Roulage', 'Relais continu', 'Mouillé', 'Nuit'], data.roster.map(p => [esc(p.name) + (p.mine ? '<small>Toi</small>' : ''), p.minutes ? p.minutes + ' min' : '—', p.longestMinutes ? p.longestMinutes + ' min' : '—', rosterStatus(p,'wet'), rosterStatus(p,'night')]), true)}</section>`;
}
function render() {
  const view = currentView();
  const back = `/${data.event.game}/#event=${encodeURIComponent(data.event.id)}`;
  const pages = {training:trainingMarkup, followup:followupMarkup, crew:crewMarkup};
  root.innerHTML = `<a class="prep-back" href="${back}">← Retour à la course</a><h1>Préparer la course</h1><p class="prep-subtitle">${esc(data.crew.name)} · ${esc(data.event.circuitName)}</p><nav class="prep-tabs" aria-label="Pages de préparation">${Object.entries(views).map(([key,label]) => `<a href="/preparation.html?crew=${encodeURIComponent(crewId)}&view=${key}" data-view="${key}"${view === key ? ' aria-current="page"' : ''}>${label}</a>`).join('')}</nav><p data-message role="status" class="prep-message"></p><div class="prep-page" aria-label="${views[view]}">${pages[view]()}</div>`;
}
async function reload() { data = await api(); render(); }
async function action(run) {
  if (loading) return;
  loading = true;
  try { await run(); } catch (error) { message(error.message, true); } finally { loading = false; }
}
root.addEventListener('change', event => {
  if (event.target.matches('[data-minutes]')) { minutes = Number(event.target.value); render(); root.querySelector('[data-minutes]').focus(); return; }
  if (event.target.matches('[data-level]')) action(async () => { await api('/profile','PATCH',{level:event.target.value}); await reload(); message('Parcours enregistré.'); });
  if (event.target.matches('[data-setup]')) action(async () => {
    const file = event.target.files[0];
    if (!file) return;
    if (file.size > 128000) throw Error('Setup limité à 128 Ko.');
    const response = await fetch(path + '/setup', {method:'PUT', credentials:'same-origin', headers:{'Content-Type':'application/octet-stream','X-Setup-Name':file.name}, body:file});
    if (!response.ok) throw Error((await response.json()).error || 'Échec de l’envoi.');
    await reload(); message('Setup commun enregistré.');
  });
});
root.addEventListener('submit', event => {
  if (!event.target.matches('[data-conditions]')) return;
  event.preventDefault();
  const form = new FormData(event.target), flag = key => form.get(key) === 'unknown' ? null : form.get(key) === 'true';
  action(async () => { await api('/conditions','PATCH',{wet:flag('wet'), night:flag('night'), stintMinutes:Number(form.get('stintMinutes'))}); await reload(); message('Conditions enregistrées.'); });
});
function closeHelp() {
  for (const help of root.querySelectorAll('[data-help]')) { help.setAttribute('aria-expanded','false'); help.parentElement.classList.remove('is-open'); }
}
root.addEventListener('click', event => {
  const help = event.target.closest('[data-help]');
  if (help) { const open = help.getAttribute('aria-expanded') !== 'true'; closeHelp(); help.setAttribute('aria-expanded', String(open)); help.parentElement.classList.toggle('is-open',open); return; }
  closeHelp();
  const link = event.target.closest('[data-view]');
  if (link && event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) {
    event.preventDefault(); history.pushState(null,'',link.href); render(); root.querySelector(`[data-view="${currentView()}"]`).focus(); return;
  }
  if (event.target.closest('[data-device]')) action(async () => {
    const config = await api('/device','POST'), blob = new Blob([JSON.stringify(config,null,2)], {type:'application/json'}), url = URL.createObjectURL(blob), link = document.createElement('a');
    link.href = url; link.download = 'EnduranceManager.connection.json'; link.click(); URL.revokeObjectURL(url); await reload(); message('Configuration téléchargée. Conserve ta clé personnelle sur ton PC.');
  });
  if (event.target.closest('[data-unlink]')) action(async () => { await api('/device','DELETE'); await reload(); message('Liaison retirée.'); });
});
root.addEventListener('keydown', event => { if (event.key === 'Escape') closeHelp(); });
window.addEventListener('popstate', () => { if (data) render(); });
if (crewId) reload().catch(error => { root.innerHTML = `<h1>Préparation indisponible</h1><p>${esc(error.message)}</p><a class="secondary-button" href="/">Retour au site</a>`; });
else root.innerHTML = '<h1>Choisis ton équipage</h1><p>Ouvre ta course puis « Ouvrir ma préparation ».</p><a class="secondary-button" href="/">Retour au site</a>';
