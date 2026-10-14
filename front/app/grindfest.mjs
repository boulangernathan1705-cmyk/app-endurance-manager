import {esc, state, api, isAdmin} from './core.mjs';
import {isGrindfest, streamersOf, gridfestPasswordValid} from '../../shared/grindfest.mjs';
import {soloEntryList} from './solo.mjs';

// The streamer's logo, or its initial on a coloured tile when it has none.
export function streamerLogo(streamer, extra = '') {
  return streamer.logoUrl ? `<img class="gridfest-avatar${extra}" src="${esc(streamer.logoUrl)}" alt="">`
    : `<span class="gridfest-avatar is-initial${extra}" style="--hue:${[...String(streamer.name || '?')].reduce((sum, char) => sum + char.charCodeAt(0), 0) * 47 % 360}" aria-hidden="true">${esc(String(streamer.name || '?').trim().charAt(0).toUpperCase())}</span>`;
}
function streamerRow(streamer = {}) {
  return `<div class="grindfest-streamer-form" data-streamer-id="${esc(streamer.id || crypto.randomUUID())}">
    <label class="form-label">Streamer<input name="streamerName" maxlength="60" value="${esc(streamer.name || '')}" required></label>
    <label class="form-label">Lien Twitch <small>(facultatif)</small><input name="streamerTwitch" type="url" value="${esc(streamer.twitchUrl || '')}" placeholder="https://www.twitch.tv/…"></label>
    <label class="form-label">Places<input name="streamerCapacity" type="number" min="1" max="120" value="${streamer.capacity || 15}" required></label>
    <label class="form-label">Logo<input name="streamerLogo" type="hidden" value="${esc(streamer.logoUrl || '')}"><input type="file" accept="image/png,image/jpeg,image/webp" data-streamer-logo><img class="grindfest-logo" src="${esc(streamer.logoUrl || '')}" alt="" ${streamer.logoUrl ? '' : 'hidden'}><small data-logo-error role="status"></small></label>
    <button type="button" class="link-button" data-remove-streamer>Retirer</button></div>`;
}
export function streamerFields(details) {
  return `<section data-grindfest-fields hidden><h3>Streamers</h3><div data-streamers>${(details.streamers || [{}, {}]).map(streamerRow).join('')}</div><button type="button" class="secondary-button" data-add-streamer>+ Ajouter un streamer</button><p data-grindfest-total aria-live="polite"></p><p class="creation-help">Une liste d’attente par streamer.</p></section>`;
}
export function streamerData(form) {
  return [...form.querySelectorAll('[data-streamer-id]')].map(row => ({id:row.dataset.streamerId, name:row.querySelector('[name="streamerName"]').value.trim(), twitchUrl:row.querySelector('[name="streamerTwitch"]').value.trim(), capacity:Number(row.querySelector('[name="streamerCapacity"]').value), logoUrl:row.querySelector('[name="streamerLogo"]').value}));
}
export function syncStreamerFields(form) {
  const section = form.querySelector('[data-grindfest-fields]');
  if (!section) return;
  const active = isGrindfest({details:{type:form.querySelector('[name="eventType"]:checked')?.value}});
  section.hidden = !active;
  section.querySelectorAll('input').forEach(field => { field.disabled = !active; });
  const streamers = streamerData(form), total = streamers.reduce((sum, item) => sum + item.capacity, 0);
  section.querySelector('[data-grindfest-total]').textContent = `${streamers.length} streamers · ${total} places au total`;
  section.querySelector('[data-add-streamer]').hidden = streamers.length >= 12;
  section.querySelectorAll('[data-remove-streamer]').forEach(button => { button.disabled = streamers.length <= 2; });
  const passwordTools = form.querySelector('[data-gridfest-password-tools]');
  if (passwordTools) passwordTools.hidden = !active;
  const password = form.elements.eventPassword;
  if (password) {
    if (active) password.setAttribute('pattern', '\\S{1,30}');
    else password.removeAttribute('pattern');
  }
  const addRound = form.querySelector('[data-add-round]');
  if (addRound) addRound.hidden = form.querySelectorAll('.solo-round').length >= 4;
  form.querySelectorAll('[name="roundCapacity"]').forEach(field => { field.disabled = active; if (active) field.value = ''; });
}
export function streamerColumns(event, departure) {
  const streamers = streamersOf(event);
  return `<div class="grindfest-grid" style="--streamer-columns:${Math.min(4, streamers.length)}">${streamers.map(streamer => {
    const entries = (departure.availability || []).filter(reg => reg.streamerId === streamer.id && reg.status !== 'unavailable');
    const confirmed = entries.filter(reg => !reg.waitlistPosition).length;
    const heading = `${streamerLogo(streamer)}<span class="gridfest-streamer-copy"><strong>${esc(streamer.name)}</strong>${streamer.twitchUrl ? '<small>Twitch ↗</small>' : ''}<span class="count-pill">${confirmed} / ${streamer.capacity}</span></span>`;
    const head = streamer.twitchUrl ? `<a class="grindfest-streamer-head" href="${esc(streamer.twitchUrl)}" target="_blank" rel="noopener noreferrer">${heading}</a>` : `<div class="grindfest-streamer-head">${heading}</div>`;
    return `<section class="grindfest-column">${head}${soloEntryList(event, departure, entries, {title:'Inscrits', capacity:streamer.capacity})}</section>`;
  }).join('')}</div>`;
}
export function streamerChoice(event, departure, draft) {
  if (!isGrindfest(event)) return '';
  const streamers = streamersOf(event);
  return `<fieldset class="gridfest-streamers"><legend class="form-label">Streamer <small>(obligatoire)</small></legend><div class="gridfest-streamer-cards">${streamers.map(streamer => {
    const entries = (departure.availability || []).filter(reg => reg.streamerId === streamer.id && reg.status !== 'unavailable'), confirmed = entries.filter(reg => !reg.waitlistPosition).length;
    const label = confirmed >= streamer.capacity ? 'Complet · liste d’attente' : `${streamer.capacity - confirmed} place${streamer.capacity - confirmed > 1 ? 's' : ''} libre${streamer.capacity - confirmed > 1 ? 's' : ''}`;
    return `<label class="gridfest-streamer-card"><input type="radio" name="registrationStreamer" value="${esc(streamer.id)}" ${draft.streamerId === streamer.id ? 'checked' : ''} required>${streamerLogo(streamer)}<span class="gridfest-streamer-copy"><strong>${esc(streamer.name)}</strong><small>${label}</small></span></label>`;
  }).join('')}</div><p class="registration-step-help" data-streamer-wait-notice aria-live="polite">${streamerWaitNotice(event, departure, draft.streamerId, draft.id)}</p></fieldset>`;
}
function streamerWaitNotice(event, departure, streamerId, registrationId) {
  const streamer = streamersOf(event).find(item => item.id === streamerId);
  if (!streamer) return '';
  const own = (departure.availability || []).find(reg => reg.id === registrationId);
  if (own?.streamerId === streamerId) return own.waitlistPosition ? `Liste d’attente — n° ${own.waitlistPosition}` : '';
  const count = (departure.availability || []).filter(reg => reg.streamerId === streamerId && reg.status !== 'unavailable').length;
  return count >= streamer.capacity ? `Liste d’attente — n° ${count - streamer.capacity + 1}` : '';
}

const MP_ICON = path => `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="${path}"/></svg>`;
const mpButton = (icon, label, attrs) => `<button type="button" class="planning-quick-button is-labelled" ${attrs} data-tip="${esc(label)}"><span class="planning-quick-icon">${MP_ICON(icon)}</span><span class="planning-quick-label">${esc(label)}</span></button>`;
// Admin only: one card, like the rounds, to send the server password to the confirmed pilots by Discord MP.
export function gridfestPasswordPanel(event) {
  if (!state.grindfest || !isGrindfest(event) || !isAdmin()) return '';
  const main=mpButton('M22 2 11 13M22 2l-7 20-4-9-9-4z','Envoyer le mot de passe','data-gridfest-passwords="send"');
  const configure=mpButton('M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z','Configurer le mot de passe',`data-action="edit-event" data-id="${esc(event.id)}"`);
  return `<section class="grindfest-round gridfest-mp" data-gridfest-password-panel="${esc(event.id)}">
    <div class="gridfest-mp-head"><h3>Mot de passe par MP</h3><span class="planning-quick">${configure}${main}${mpButton('M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01', 'Suivi', 'data-gridfest-passwords="status"')}</span></div>
    <div data-gridfest-password-status role="status" aria-live="polite"></div>
  </section>`;
}

function passwordResult(panel, result) {
  const labels = {pending:'À envoyer', sending:'En cours', sent:'Envoyé', failed:'Échec', incomplete:'Nom en jeu manquant'};
  const sent = result.pilots.filter(pilot => pilot.status === 'sent').length;
  panel.querySelector('[data-gridfest-password-status]').innerHTML = `<p class="gridfest-mp-count"><span class="count-pill">${sent} / ${result.pilots.length}</span> envoyés${result.waiting ? ` · ${result.waiting} en attente` : ''}${!result.ready ? ' · mot de passe à configurer' : ''}${!result.botReady ? ' · bot Discord non configuré' : ''}</p>${result.pilots.length ? `<ol class="solo-entries gridfest-mp-list">${result.pilots.map((pilot, index) => `<li class="solo-entry"><span class="solo-entry-rank">${index + 1}</span><strong class="solo-entry-name">${esc(pilot.name)}${pilot.gameName ? `<small class="gridfest-game-name">${esc(pilot.gameName)}</small>` : ''}</strong><span class="gridfest-mp-tag is-${esc(pilot.status || 'pending')}"${pilot.error ? ` title="${esc(pilot.error)}"` : ''}>${esc(labels[pilot.status] || 'À envoyer')}</span></li>`).join('')}</ol>` : ''}`;
}

if (typeof document !== 'undefined') {
  document.addEventListener('input', event => {
    const field = event.target;
    if (field.name === 'gridfestGameName' && state.drafts[field.dataset.departure]) state.drafts[field.dataset.departure].gameName = field.value;
  });
  document.addEventListener('click', async event => {
    const target = event.target.closest?.('[data-gridfest-passwords]');
    if (!target || target.disabled || state.busy) return;
    const panel = target.closest('[data-gridfest-password-panel]'), race = state.events.find(item => item.id === panel?.dataset.gridfestPasswordPanel);
    if (!race || !state.grindfest || !isGrindfest(race) || !isAdmin()) return;
    const send = target.dataset.gridfestPasswords === 'send';
    if (send && !confirm('Envoyer le mot de passe par MP Discord aux pilotes confirmés ?')) return;
    state.busy = true;
    const controls = [...panel.querySelectorAll('button')], disabled = controls.map(button => button.disabled);
    controls.forEach(button => { button.disabled = true; });
    const status = panel.querySelector('[data-gridfest-password-status]');
    const path = `/api/races/${race.id}/gridfest/passwords`;
    let sent = 0;
    try {
      if (!send) passwordResult(panel, await api(path));
      else {
        let cursor = '';
        do {
          status.textContent = `Envoi… ${sent} envoyé(s)`;
          const result = await api(path, 'POST', {version:race.version, cursor});
          sent += result.results.filter(item => item.status === 'sent').length;
          cursor = result.nextCursor;
          passwordResult(panel, result);
        } while (cursor);
      }
    } catch (error) {
      status.textContent = `${error.message} Relance l’envoi : les MP déjà partis ne sont pas renvoyés.`;
    } finally {
      state.busy = false;
      controls.forEach((button,index) => { button.disabled = disabled[index]; });
    }
  });
  document.addEventListener('click', event => {
    const form = event.target.closest?.('form[data-kind="solo-event"]');
    if (!form) return;
    if (event.target.closest('[data-add-streamer]') && streamerData(form).length < 12) form.querySelector('[data-streamers]').insertAdjacentHTML('beforeend', streamerRow());
    if (event.target.closest('[data-remove-streamer]') && streamerData(form).length > 2) event.target.closest('[data-streamer-id]').remove();
    syncStreamerFields(form);
  });
  document.addEventListener('change', async event => {
    const field = event.target, form = field.closest?.('form');
    if (field.name === 'registrationStreamer') {
      const draft = state.drafts[form.dataset.departure];
      if (!draft) return;
      draft.streamerId = field.value;
      const race = state.events.find(item => item.id === state.currentEventId), departure = race?.departures.find(item => item.id === form.dataset.departure);
      if (departure) form.querySelector('[data-streamer-wait-notice]').textContent = streamerWaitNotice(race, departure, field.value, draft.id);
    }
    if (form?.dataset.kind !== 'solo-event') return;
    syncStreamerFields(form);
    if (!field.matches('[data-streamer-logo]') || !field.files?.[0]) return;
    const row = field.closest('[data-streamer-id]'), message = row.querySelector('[data-logo-error]');
    try {
      const file = field.files[0];
      if (!['image/png','image/jpeg','image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) throw Error('Choisis une image PNG, JPEG ou WebP de moins de 5 Mo.');
      const bitmap = await createImageBitmap(file), canvas = document.createElement('canvas');
      canvas.width = 80; canvas.height = 80;
      const scale = Math.min(80 / bitmap.width, 80 / bitmap.height), width = bitmap.width * scale, height = bitmap.height * scale;
      canvas.getContext('2d').drawImage(bitmap, (80 - width) / 2, (80 - height) / 2, width, height); bitmap.close();
      const logo = canvas.toDataURL('image/webp', 0.75);
      if (logo.length > 6000) throw Error('Ce logo est trop détaillé. Choisis une image plus simple.');
      row.querySelector('[name="streamerLogo"]').value = logo;
      const preview = row.querySelector('img'); preview.src = logo; preview.hidden = false; message.textContent = '';
    } catch (error) { message.textContent = error.message; }
  });
}

