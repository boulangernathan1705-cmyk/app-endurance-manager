// « Diagnostic » (server/discord-diagnostic.mjs): what the bot should have made now, and where it stands. Loaded when opened.
export const DIAGNOSTIC_PANEL = `<details class="discord-diagnostic" data-discord-diagnostic><summary>Diagnostic : ce que le bot a fait sur Discord</summary><div data-diagnostic-body><p class="members-help">Chargement…</p></div></details>`;
const DIAG_STATES = {ok:['ok','✓ En place'], waiting:['wait','En attente'], missing:['bad','Introuvable sur Discord']};
export const diagWhen = value => value ? new Date(value).toLocaleString('fr-FR',{timeZone:'Europe/Paris',weekday:'short',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}) : '';
const diagSim = sim => sim === 'iracing' ? 'iRacing' : 'LMU';
function diagnosticMarkup(result, esc) {
  const row = (title, meta, state) => { const [tone, label] = DIAG_STATES[state] || DIAG_STATES.waiting; return `<li class="diag-row is-${tone}"><span><strong>${esc(title)}</strong><small>${esc(meta)}</small></span><b>${label}</b></li>`; };
  const list = (title, items, empty) => `<h4>${title}</h4>${items.length ? `<ul class="diag-list">${items.join('')}</ul>` : `<p class="members-help">${empty}</p>`}`;
  const {recap, voices, announcement} = result, problems = [...result.threads, ...result.crews].filter(item => item.state !== 'ok').length;
  const facts = [
    recap.on ? `Dernier passage du bot : ${recap.lastPass ? diagWhen(recap.lastPass) : 'pas encore'}` : 'Fils des courses : éteints',
    recap.waiting ? 'Des changements attendent le prochain passage (2 min au plus).' : '',
    recap.on && !recap.sameServer ? 'Le serveur choisi n’est plus celui de la communauté : relance le réglage.' : '',
    announcement.posted ? `Annonce du jour publiée (${announcement.items} course${announcement.items > 1 ? 's' : ''}).` : '',
  ].filter(Boolean);
  const errors = [recap.error, voices.error].filter(Boolean).map(text => `<p class="settings-status" role="alert">⚠️ ${esc(text)}</p>`).join('');
  return `${errors}<ul class="members-help diag-facts">${facts.map(text => `<li>${esc(text)}</li>`).join('')}</ul>
    ${recap.on ? list('Fils des courses de la semaine', result.threads.map(item => row(item.name, `${diagSim(item.sim)} · ${diagWhen(item.startsAt)}`, item.state)), 'Aucune course cette semaine.') : ''}
    ${voices.on ? list('Vocaux des équipages', result.crews.map(item => row(item.name, `${diagSim(item.sim)} · ${item.race} · ${diagWhen(item.startsAt)}`, item.state)), 'Aucun équipage cette semaine.') : ''}
    <p class="members-help">${result.liveError ? esc(result.liveError) : result.checkedLive ? 'Vérifié sur Discord à l’instant.' : '« En place » : noté par le bot. « Vérifier sur Discord » regarde s’ils existent encore.'}</p>
    <div class="setup-actions"><button type="button" class="secondary-button" data-diagnostic-live>Vérifier sur Discord</button>${problems ? '<button type="button" class="secondary-button" data-diagnostic-repair>Réparer</button>' : ''}<span class="settings-status" role="status" aria-live="polite"></span></div>`;
}

export function installCommunityDiagnostics(app, {api, esc}) {
  async function loadDiagnostic(panel, live = false) {
    const body = panel.querySelector('[data-diagnostic-body]');
    try { body.innerHTML = diagnosticMarkup(await api(`/api/community/discord/diagnostic${live ? '?live=1' : ''}`), esc); }
    catch (error) { body.innerHTML = `<p class="settings-status" role="alert">${esc(error.message)}</p>`; }
  }
  app.addEventListener('toggle', event => {
    const panel = event.target;
    if (panel.matches?.('[data-discord-diagnostic]') && panel.open && !panel.dataset.loaded) { panel.dataset.loaded = '1'; loadDiagnostic(panel); }
  }, true);
  app.addEventListener('click', async event => {
    const button = event.target.closest('[data-diagnostic-live],[data-diagnostic-repair]');
    if (!button) return;
    const panel = button.closest('[data-discord-diagnostic]'), status = panel.querySelector('.settings-status');
    button.disabled = true; status.textContent = button.matches('[data-diagnostic-live]') ? 'Vérification…' : 'Réparation…';
    try {
      if (button.matches('[data-diagnostic-repair]')) await api('/api/community/recap/repair','POST',{});
      await loadDiagnostic(panel, button.matches('[data-diagnostic-live]'));
    } catch (error) { status.textContent = error.message; button.disabled = false; }
  });
}
