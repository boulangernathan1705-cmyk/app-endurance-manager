// Module « Plugin SimHub » (simhub.html): the plugin's install and link to the site, then a tile for each page that
// runs on it (Fiche mémo, Mur des stands) and, for the platform managers, the testers' reports sent from the plugin.
import {installerFor} from '../shared/combos.mjs';

const body = document.getElementById('simhub-body');
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const dayTime = seconds => new Date(seconds * 1000).toLocaleString('fr-FR', {day:'numeric', month:'short', hour:'2-digit', minute:'2-digit'});
const day = ms => new Date(ms).toLocaleDateString('fr-FR', {day:'numeric', month:'short'});
const SEEN = 'em-simhub-reports-seen';

const view = {link:null, plugin:null, combos:[], reports:null, seen:0, showReports:false, code:'', copied:false, busy:false, message:''};
try { view.seen = Number(localStorage.getItem(SEEN)) || 0; } catch {}

async function call(path, method = 'GET') {
  let response;
  try { response = await fetch(path, {method, credentials:'same-origin', cache:'no-store', headers:{Accept:'application/json', ...(method === 'GET' ? {} : {'Content-Type':'application/json'})}, body:method === 'GET' ? undefined : '{}'}); }
  catch { throw Object.assign(Error('Connexion au site impossible. Vérifie ta connexion puis réessaie.'), {status:0}); }
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(Error(result.error || `Action impossible (${response.status}).`), {status:response.status});
  return result;
}

function renderError(error) {
  const action = error.status === 401 ? `<a class="primary-button" href="/api/auth/discord?return=${encodeURIComponent('/simhub.html')}">Se connecter avec Discord</a>` : '<a class="secondary-button" href="/lmu/">Retour aux courses</a>';
  body.innerHTML = `<section class="members-panel members-error"><h1>Plugin SimHub</h1><p>${esc(error.message)}</p>${action}</section>`;
}

async function start() {
  // The plugin build this site hands out, when there is one (scripts/build.mjs); the testers' reports, managers only.
  const plugin = fetch('/downloads/simhub/v0/plugin.json', {cache:'no-store'}).then(response => response.ok ? response.json() : null).catch(() => null);
  const reports = call('/api/combos/reports').then(result => result.reports, () => null);
  try {
    const [link, list] = await Promise.all([call('/api/combos/link'), call('/api/combos')]);
    view.link = link; view.combos = list.combos;
  } catch (error) { renderError(error); return; }
  view.plugin = await plugin; view.reports = await reports;
  view.showReports = location.hash === '#retours' && Boolean(view.reports);
  render();
}

const icon = path => `<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
const ICONS = {
  memo:'<path d="M4 19V5"/><path d="M4 19h16"/><path d="m7 14 4-4 3 3 5-6"/>',
  wall:'<rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8"/><path d="M12 17v4"/>',
  reports:'<path d="M14 4h6v6"/><path d="M20 4 11 13"/><path d="M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5"/>'
};

function pluginCard() {
  const link = view.link || {};
  const state = link.linked
    ? `<span class="sh-dot is-on" aria-hidden="true"></span><b>SimHub relié</b><span>${link.lastSeen ? `dernier contact le ${esc(dayTime(link.lastSeen))}` : 'en attente de la première séance'}</span>`
    : '<span class="sh-dot" aria-hidden="true"></span><b>SimHub pas encore relié</b>';
  const version = view.plugin ? String(view.plugin.version) : '';
  const beta = version.startsWith('0.');
  const get = view.plugin ? `<div class="sh-get"><button type="button" class="cb-btn is-main" data-action="download">Télécharger l’installeur</button>
    <span class="sh-version"><b>Version ${esc(version)}${beta ? '<span class="sh-beta">bêta</span>' : ''}</b><span>${beta ? 'Encore en développement. ' : ''}Mises à jour depuis SimHub.</span></span></div>`
    : '<p class="cb-src">Installeur indisponible pour l’instant.</p>';
  const code = view.code ? `<div class="sh-code"><div class="cb-code"><input type="text" readonly value="${esc(view.code)}" aria-label="Ton code de liaison" data-code><button type="button" class="cb-btn" data-action="copy">Copier le code</button></div>
    <p class="${view.copied ? 'cb-ok' : 'cb-src'}">${view.copied ? 'Code copié. Ouvre le plugin dans SimHub : il le trouve tout seul.' : 'Copie ce code, puis colle-le dans le plugin.'} Il ne s’affiche qu’une fois.</p></div>` : '';
  return `<section class="sh-card" aria-label="Ton plugin">
    <div class="sh-install"><div class="sh-state">${state}</div>${get}</div>
    <ol class="sh-steps">
      <li><span>Double-clique sur l’installeur. Il relance SimHub.</span></li>
      <li><span><button type="button" class="sh-link" data-action="code"${view.busy ? ' disabled' : ''}>${link.linked ? 'Crée un nouveau code' : 'Crée ton code'}</button> : il est copié tout seul.</span></li>
      <li><span>Ouvre le plugin dans SimHub : il se relie.</span></li>
      <li class="sh-alone">Le plugin marche aussi sans le site.</li>
    </ol>${code}
    <details class="sh-more"><summary>Windows bloque l’installeur ?</summary><p>Clique sur « Informations complémentaires » puis « Exécuter quand même ».${link.linked ? ' <button type="button" class="sh-link" data-action="unlink">Retirer la liaison</button>' : ''}</p></details>
  </section>`;
}

function tiles() {
  const laps = view.combos.reduce((sum, item) => sum + (item.laps || 0), 0);
  const last = view.combos[0]?.last;
  const memo = view.combos.length ? `${view.combos.length} combo${view.combos.length > 1 ? 's' : ''} · ${laps} tours${last ? ` · dernier le ${esc(day(last))}` : ''}` : 'Aucune séance pour l’instant';
  const fresh = (view.reports || []).filter(item => item.at > view.seen).length;
  const reports = view.reports ? `<button type="button" class="sh-tile is-private" data-action="reports" aria-expanded="${view.showReports}">${icon(ICONS.reports)}<b>Retours des testeurs</b><span class="sh-go" aria-hidden="true">${view.showReports ? '⌄' : '›'}</span>
      <span class="sh-what">Problèmes et journaux envoyés depuis le plugin. Toi seul les vois.</span>
      <span class="sh-info${fresh ? ' sh-new' : ''}">${fresh ? `${fresh} nouveau${fresh > 1 ? 'x' : ''}` : `${view.reports.length} retour${view.reports.length > 1 ? 's' : ''}`}</span></button>` : '';
  return `<h2 class="sh-section">Avec ton équipe</h2><div class="sh-tiles">
    <a class="sh-tile" href="/fiches-combo.html">${icon(ICONS.memo)}<b>Fiche mémo</b><span class="sh-go" aria-hidden="true">›</span>
      <span class="sh-what">Énergie, pneus et rythme de chaque pilote, par voiture et circuit.</span><span class="sh-info">${memo}</span></a>
    <a class="sh-tile" href="/mur.html">${icon(ICONS.wall)}<b>Mur des stands</b><span class="sh-go" aria-hidden="true">›</span>
      <span class="sh-what">La voiture de l’équipe en direct, sur téléphone ou second écran.</span><span class="sh-info">Plein écran</span></a>
    ${reports}</div>${view.showReports ? reportList() : ''}`;
}

function reportList() {
  if (!view.reports.length) return '<p class="cb-src" id="retours">Aucun retour pour l’instant. Ils restent 60 jours.</p>';
  const kind = {signal:'Problème signalé', journal:'Journal de séance'};
  return `<ul class="sh-reports" id="retours">${view.reports.map(item => `<li class="sh-report${item.at > view.seen ? ' is-new' : ''}">
    <span><b>${esc(item.pilot)}</b> · ${esc(kind[item.kind] || item.kind)} · ${esc(dayTime(item.at))}${item.version ? ` · ${esc(item.version)}` : ''}</span>
    <button type="button" class="cb-btn is-quiet" data-report="${esc(item.id)}">Télécharger</button>
    ${item.note ? `<p>${esc(item.note)}</p>` : ''}</li>`).join('')}</ul>`;
}

function render() {
  const message = view.message ? `<p class="cb-message" role="status">${esc(view.message)}</p>` : '';
  body.innerHTML = `<div class="sh-head"><div class="cb-crumb">Le Mans Ultimate</div><h1>Plugin SimHub</h1></div>${message}${pluginCard()}${tiles()}`;
}

// ---------- Actions ----------

async function act(work, success = '') {
  view.message = '';
  try { await work(); view.message = success; } catch (error) { view.message = error.message; }
  render();
}

async function copy(text) {
  try { await navigator.clipboard.writeText(text); return true; }
  catch {
    const field = body.querySelector('[data-code]');
    if (!field) return false;
    field.select();
    try { return document.execCommand('copy'); } catch { return false; }
  }
}

function save(name, blob) {
  const url = URL.createObjectURL(blob);
  const link = Object.assign(document.createElement('a'), {href:url, download:name});
  document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// The installer with this site written in: it fetches the latest plugin from here when double-clicked.
const download = () => act(async () => {
  const response = await fetch('/downloads/simhub/v0/installer.cmd', {cache:'no-store'});
  if (!response.ok) throw Error('Installeur indisponible pour l’instant.');
  save('Installer le plugin Endurance Manager.cmd', new Blob([installerFor(await response.text(), location.origin)], {type:'application/octet-stream'}));
});

async function newCode() {
  if (view.link?.linked && !confirm('Un nouveau code remplace l’ancien : il faudra le recoller dans SimHub. Continuer ?')) return;
  view.busy = true;
  await act(async () => { view.code = (await call('/api/combos/link', 'POST')).code; view.link = await call('/api/combos/link'); });
  view.busy = false;
  if (view.code) { view.copied = await copy(view.code); render(); }
}

function toggleReports() {
  view.showReports = !view.showReports;
  // Opened: what is listed counts as seen next time.
  if (view.showReports && view.reports.length) try { localStorage.setItem(SEEN, String(view.reports[0].at)); } catch {}
  history.replaceState(null, '', view.showReports ? '#retours' : location.pathname);
  render();
}

body.addEventListener('click', async event => {
  const target = event.target.closest('button');
  if (!target || !body.contains(target)) return;
  if (target.dataset.report) {
    const item = view.reports.find(report => report.id === target.dataset.report);
    await act(async () => {
      const {data} = await call(`/api/combos/reports/${encodeURIComponent(item.id)}`);
      save(`retour-${item.pilot}-${new Date(item.at * 1000).toISOString().slice(0, 16)}.json`.replace(/[^\w.-]+/g, '-'), new Blob([JSON.stringify({...item, data}, null, 2)], {type:'application/json'}));
    });
    return;
  }
  switch (target.dataset.action) {
    case 'download': await download(); break;
    case 'code': await newCode(); break;
    case 'copy': view.copied = await copy(view.code); render(); break;
    case 'reports': toggleReports(); break;
    case 'unlink':
      if (!confirm('Retirer la liaison ? Ton plugin n’enverra plus rien tant que tu ne recolles pas un nouveau code.')) return;
      await act(async () => { await call('/api/combos/link', 'DELETE'); view.link = await call('/api/combos/link'); view.code = ''; }, 'Liaison retirée.');
      break;
  }
});

start();
