// Module « Plugin SimHub » (simhub.html): one page, two tabs (Nathan, 2026-11-24). « Fiche mémo » (front/combos-page.mjs)
// and « Mur des stands » (front/pit-wall.mjs, also alone in full screen at mur.html) load the first time they are shown.
// The plugin's install and link to the site sit in a pill at the top right that opens them. The testers' reports are in
// Administration › Plateforme.
import {installerFor} from '../shared/combos.mjs';

const body = document.getElementById('simhub-body');
const pill = document.getElementById('simhub-pill');
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const dayTime = seconds => new Date(seconds * 1000).toLocaleString('fr-FR', {day:'numeric', month:'short', hour:'2-digit', minute:'2-digit'});

const view = {link:null, plugin:null, code:'', copied:false, busy:false, message:'', open:false};

async function call(path, method = 'GET') {
  let response;
  try { response = await fetch(path, {method, credentials:'same-origin', cache:'no-store', headers:{Accept:'application/json', ...(method === 'GET' ? {} : {'Content-Type':'application/json'})}, body:method === 'GET' ? undefined : '{}'}); }
  catch { throw Object.assign(Error('Connexion au site impossible. Vérifie ta connexion puis réessaie.'), {status:0}); }
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(Error(result.error || `Action impossible (${response.status}).`), {status:response.status});
  return result;
}

// ---------- The two tabs ----------

// The wall's own tabs write their name in the address (#board, #chrono…): they belong to the « Mur des stands » tab.
const WALL = ['mur', 'board', 'chrono', 'car', 'tele', 'map'];
const PAGES = {memo:'/front/combos-page.mjs?v=18', wall:'/front/pit-wall.mjs?v=22'};
const loaded = new Set();
function show(panel, write = false) {
  for (const tab of document.querySelectorAll('.sh-tabs [data-panel]')) tab.setAttribute('aria-selected', String(tab.dataset.panel === panel));
  for (const part of document.querySelectorAll('[data-sh-panel]')) part.hidden = part.dataset.shPanel !== panel;
  if (write) history.replaceState(null, '', panel === 'wall' ? '#mur' : location.pathname + location.search);
  if (!loaded.has(panel)) { loaded.add(panel); import(PAGES[panel]); }
  // The wall stops asking for the cars while it is hidden (front/pit-wall.mjs).
  document.dispatchEvent(new Event('sh-panel'));
}
const fromHash = () => WALL.includes(location.hash.slice(1)) ? 'wall' : 'memo';
document.querySelector('.sh-tabs').addEventListener('click', event => {
  const tab = event.target.closest('[data-panel]');
  if (!tab) return;
  event.preventDefault();
  show(tab.dataset.panel, true);
});
// The fiche's « Installer et relier le plugin » link (#installer) opens the pill.
window.addEventListener('hashchange', () => {
  if (location.hash === '#installer') { history.replaceState(null, '', location.pathname + location.search); setOpen(true); return; }
  show(fromHash());
});

// ---------- The pill and what it opens ----------

function setOpen(open) {
  view.open = open;
  render();
  if (open) body.scrollIntoView({block:'nearest', behavior:'smooth'});
}

function pillMarkup() {
  const link = view.link || {};
  const version = view.plugin ? String(view.plugin.version) : '';
  const beta = version.startsWith('0.') ? '<span class="sh-beta">bêta</span>' : '';
  const inner = link.linked ? `<span class="sh-dot is-on" aria-hidden="true"></span>SimHub relié${version ? `<em>· ${esc(version)}</em>` : ''}${beta}`
    : '<span class="sh-dot" aria-hidden="true"></span>Plugin à lier';
  return `<button type="button" class="sh-pill${link.linked ? '' : ' is-todo'}" data-action="pill" aria-expanded="${view.open}" aria-controls="simhub-body">${inner}</button>`;
}

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

function render() {
  pill.innerHTML = view.link ? pillMarkup() : '';
  body.hidden = !view.open && !view.message;
  const message = view.message ? `<p class="cb-message" role="status">${esc(view.message)}</p>` : '';
  body.innerHTML = `${message}${view.open ? pluginCard() : ''}`;
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

document.getElementById('simhub-app').addEventListener('click', async event => {
  const target = event.target.closest('button');
  if (!target) return;
  switch (target.dataset.action) {
    case 'pill': view.message = ''; setOpen(!view.open); break;
    case 'download': await download(); break;
    case 'code': await newCode(); break;
    case 'copy': view.copied = await copy(view.code); render(); break;
    case 'unlink':
      if (!confirm('Retirer la liaison ? Ton plugin n’enverra plus rien tant que tu ne recolles pas un nouveau code.')) return;
      await act(async () => { await call('/api/combos/link', 'DELETE'); view.link = await call('/api/combos/link'); view.code = ''; }, 'Liaison retirée.');
      break;
  }
});

async function start() {
  const opening = location.hash === '#installer';
  if (opening) history.replaceState(null, '', location.pathname + location.search);
  show(fromHash());
  // The plugin build this site hands out, when there is one (scripts/build.mjs). The tab shows its own errors (sign-in…).
  const plugin = fetch('/downloads/simhub/v0/plugin.json', {cache:'no-store'}).then(response => response.ok ? response.json() : null).catch(() => null);
  try { view.link = await call('/api/combos/link'); } catch { return; }
  view.plugin = await plugin;
  view.open = opening;
  render();
}
start();
