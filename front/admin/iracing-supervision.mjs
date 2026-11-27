import {esc} from './markup.mjs';

const endpoint = '/api/platform/iracing';
const date = new Intl.DateTimeFormat('fr-FR',{dateStyle:'short',timeStyle:'short',timeZone:'Europe/Paris'});
const when = value => value ? date.format(value) : '—';
const states = {ok:'Réussie',partial:'Partielle',failed:'Échec',available:'Disponible',unchanged:'Inchangée',stale:'Copie conservée',unavailable:'Indisponible'};
const fields = {name:'Nom',circuit:'Circuit',layout:'Tracé',duration:'Durée',durationMinutes:'Durée',categories:'Catégories',cars:'Voitures',
  starts:'Départs',rounds:'Manches',status:'Statut',driverChangeRequired:'Changement de pilote',series:'Série'};
const reasons = {manual:'Correction locale',occupied:'Course avec inscrits',cancelled:'Annulation officielle',postponed:'Report officiel',
  partial:'Publication partielle',unknown:'Valeur inconnue',circuit:'Circuit non reconnu',configuration:'Nouveau tracé',
  unverified:'Durée officielle à confirmer',duration:'Durée officielle à confirmer',capacity:'Limite de départs',catalogue:'Catalogue à vérifier',
  series:'Série à vérifier',categories:'Catégories à vérifier',invalid:'Course invalide',starts:'Départs à vérifier',absent:'Course absente de la dernière source','official-article':'Annonce officielle sans course associée'};
const sourceLabel = name => name === 'manifest' ? 'Liste des saisons' : name === 'articles' ? 'Articles officiels' : name.replace('season:', 'Calendrier ');
const value = (field, v) => {
  if (v == null) return '—';
  if (field === 'starts' && Array.isArray(v)) return v.map(when).join(' · ') || 'Aucun';
  if (field === 'durationMinutes' && typeof v === 'number') return `${v} min`;
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
};

export const IRACING_PANEL = `<section class="settings-card"><h2>Synchronisation iRacing</h2>
  <details class="discord-diagnostic" data-iracing-supervision><summary>Ouvrir le suivi du calendrier</summary>
    <div class="setup-actions">
      <button type="button" class="secondary-button" data-iracing-control="load">Actualiser</button>
      <button type="button" class="primary-button" data-iracing-control="sync">Synchroniser maintenant</button>
    </div>
    <p class="settings-status" role="status" data-iracing-status></p>
    <div data-iracing-body></div>
  </details></section>`;

function conflictMarkup(item) {
  const entries = item.details.fields || [{reason:item.details.reason,previous:item.details.previous,incoming:item.details.incoming}];
  const changes = entries.map(entry => `<li><strong>${esc(fields[entry.field] || reasons[entry.reason] || 'Vérification')}</strong>
    ${entry.field ? ` · ${esc(reasons[entry.reason] || entry.reason)}` : ''}
    <dl><dt>Sur le site</dt><dd>${esc(value(entry.field,entry.local))}</dd>
    <dt>Dernière valeur connue</dt><dd>${esc(value(entry.field,entry.previous))}</dd>
    <dt>Officiel</dt><dd>${esc(value(entry.field,entry.incoming))}</dd></dl>
  </li>`).join('');
  return `<details class="discord-diagnostic"><summary>${esc(item.name)} · ${item.registrations} inscription(s) · ${item.crews} équipage(s)</summary>
    <ul class="members-help">${changes}</ul><div class="setup-actions">
    ${item.event_id ? `<a class="secondary-button" href="/iracing/#event=${encodeURIComponent(item.event_id)}">Ouvrir la course</a>` : ''}
    ${item.canApply ? `<button type="button" class="primary-button" data-iracing-control="resolve" data-decision="apply" data-key="${esc(item.source_key)}"
      data-revision="${item.updated_at}">Appliquer les valeurs officielles</button>` : ''}
    <button type="button" class="secondary-button" data-iracing-control="resolve" data-decision="keep" data-key="${esc(item.source_key)}"
      data-revision="${item.updated_at}">${item.event_id ? 'Conserver les valeurs actuelles' : 'Clore le signalement'}</button>
    <button type="button" class="secondary-button" data-iracing-control="later">Décider plus tard</button></div>
    ${item.event_id && !item.canApply ? '<p class="members-help">Une vérification dans la fiche course est nécessaire avant d’appliquer ces changements.</p>' : ''}
    </details>`;
}

function render(result) {
  const sourceStates = {};
  for (const run of [...result.history].reverse()) Object.assign(sourceStates, run.summary.sources || {});
  for (const entry of result.sources) sourceStates[entry.name] ||= {savedAt:entry.saved_at};
  const sources = Object.entries(sourceStates).map(([name,source]) => `<li><strong>${esc(sourceLabel(name))}</strong> ·
    ${esc(states[source.status] || 'Copie disponible')} · ${esc(when(source.savedAt))}${source.error ? ` · ${esc(source.error)}` : ''}</li>`).join('');
  const history = result.history.map(run => `<li>${esc(when(run.started_at))} · ${run.mode === 'calendar' ? 'Calendrier' : 'Special Events'} ·
    ${esc(states[run.status])} · ${run.summary.created ?? 0} ajout(s) · ${run.summary.updated ?? 0} modification(s)
    ${run.summary.errors?.length ? `<small>${esc(run.summary.errors.join(' · '))}</small>` : ''}</li>`).join('');
  const waiting = result.waiting.map(item => `<li>${esc(item.name)} · ${esc(when(item.last_start))}</li>`).join('');
  return `<ul class="members-help diag-facts">
    <li>Saison actuelle <strong>${esc(result.seasons?.current || '—')}</strong> · suivante <strong>${esc(result.seasons?.next || '—')}</strong></li>
    <li>Dernière tentative <strong>${esc(when(result.history[0]?.started_at))}</strong></li>
    <li>Dernier calendrier réussi <strong>${esc(when(result.lastCalendar))}</strong> · derniers Special Events <strong>${esc(when(result.lastSpecial))}</strong></li>
    </ul>
    <h3>Sources</h3><ul class="members-help">${sources || '<li>Aucune source vérifiée.</li>'}</ul>
    <h3>En attente d’horaires</h3><ul class="members-help">${waiting || '<li>Aucune course en attente.</li>'}</ul>
    <h3>Signalements (${result.conflicts.length})</h3>
    ${result.conflicts.map(conflictMarkup).join('') || '<p class="members-help">Aucun signalement ouvert.</p>'}
    <details class="discord-diagnostic"><summary>Historique récent</summary><ul class="members-help">${history || '<li>Aucune tentative enregistrée.</li>'}</ul></details>`;
}

export function installIracingSupervision(app, api) {
  async function refresh(panel, action, button) {
    if (action === 'later') {button.closest('details').open = false;return;}
    if (panel.dataset.busy) return;
    panel.dataset.busy = 'true';
    const status = panel.querySelector('[data-iracing-status]');
    status.textContent = action === 'sync' ? 'Synchronisation en cours…' : 'Chargement…';
    let outcome = '';
    try {
      if (action === 'sync') {
        const result = await api(endpoint,'POST',{});
        outcome = result.disabled ? 'Synchronisation désactivée.' : result.errors?.length ? 'Synchronisation partielle.' : 'Synchronisation terminée.';
      }
      if (action === 'resolve') {
        await api(endpoint,'PATCH',{key:button.dataset.key,revision:Number(button.dataset.revision),action:button.dataset.decision});
        outcome = button.dataset.decision === 'apply' ? 'Valeurs officielles appliquées.' : 'Signalement clos pour cette version des données.';
      }
    } catch (error) {
      outcome = error.message;
    }
    try {
      panel.querySelector('[data-iracing-body]').innerHTML = render(await api(endpoint));
      panel.dataset.loaded = 'true';
      status.textContent = outcome;
    } catch (error) {
      status.textContent = outcome || error.message;
    } finally {
      delete panel.dataset.busy;
    }
  }
  app.addEventListener('toggle', event => {
    const panel = event.target;
    if (panel.matches?.('[data-iracing-supervision]') && panel.open && !panel.dataset.loaded) refresh(panel,'load');
  },true);
  app.addEventListener('click', event => {
    const button = event.target.closest('[data-iracing-control]');
    if (button) refresh(button.closest('[data-iracing-supervision]'),button.dataset.iracingControl,button);
  });
}
