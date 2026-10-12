import {esc, state, api, isAdmin} from './core.mjs';
import {isGrindfest, streamersOf, gridfestPasswordValid, generateGridfestPassword} from '../../shared/grindfest.mjs';
import {soloEntryList} from './solo.mjs';

function streamerRow(streamer = {}) {
  return `<div class="grindfest-streamer-form" data-streamer-id="${esc(streamer.id || crypto.randomUUID())}">
    <label class="form-label">Streamer<input name="streamerName" maxlength="60" value="${esc(streamer.name || '')}" required></label>
    <label class="form-label">Lien Twitch <small>(facultatif)</small><input name="streamerTwitch" type="url" value="${esc(streamer.twitchUrl || '')}" placeholder="https://www.twitch.tv/…"></label>
    <label class="form-label">Places<input name="streamerCapacity" type="number" min="1" max="120" value="${streamer.capacity || 15}" required></label>
    <label class="form-label">Logo<input name="streamerLogo" type="hidden" value="${esc(streamer.logoUrl || '')}"><input type="file" accept="image/png,image/jpeg,image/webp" data-streamer-logo><img class="grindfest-logo" src="${esc(streamer.logoUrl || '')}" alt="" ${streamer.logoUrl ? '' : 'hidden'}><small data-logo-error role="status"></small></label>
    <button type="button" class="link-button" data-remove-streamer>Retirer</button></div>`;
}
export function streamerFields(details) {
  return `<section data-grindfest-fields hidden><h3>Streamers</h3><div data-streamers>${(details.streamers || [{}, {}]).map(streamerRow).join('')}</div><button type="button" class="secondary-button" data-add-streamer>+ Ajouter un streamer</button><p data-grindfest-total aria-live="polite"></p><p class="creation-help">Une liste d’attente par streamer. Après un désistement, le premier en attente prend automatiquement la place.</p></section>`;
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
    password.minLength = active ? 12 : 0;
    if (active) password.setAttribute('pattern', '[A-Za-z0-9_-]{12,30}');
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
    const heading = `${streamer.logoUrl ? `<img class="grindfest-logo" src="${esc(streamer.logoUrl)}" alt="">` : ''}<strong>${esc(streamer.name)}</strong>${streamer.twitchUrl ? '<small>Twitch ↗</small>' : ''}<span>${confirmed} / ${streamer.capacity} places prises</span>`;
    const head = streamer.twitchUrl ? `<a class="grindfest-streamer-head" href="${esc(streamer.twitchUrl)}" target="_blank" rel="noopener noreferrer">${heading}</a>` : `<div class="grindfest-streamer-head">${heading}</div>`;
    return `<section class="grindfest-column">${head}${soloEntryList(event, departure, entries, {title:'Inscrits', capacity:streamer.capacity})}</section>`;
  }).join('')}</div>`;
}
export function streamerChoice(event, departure, draft) {
  if (!isGrindfest(event)) return '';
  const streamers = streamersOf(event);
  return `<div class="registration-identity-grid"><label class="registration-identity-field"><span class="form-label">Streamer <small>(obligatoire)</small></span><select name="registrationStreamer" required><option value="">Choisir un streamer</option>${streamers.map(streamer => {
    const entries = (departure.availability || []).filter(reg => reg.streamerId === streamer.id && reg.status !== 'unavailable'), confirmed = entries.filter(reg => !reg.waitlistPosition).length;
    const label = confirmed >= streamer.capacity ? `Complet · liste d’attente` : `${streamer.capacity - confirmed} place(s) libre(s)`;
    return `<option value="${esc(streamer.id)}" ${draft.streamerId === streamer.id ? 'selected' : ''}>${esc(streamer.name)} · ${label}</option>`;
  }).join('')}</select></label><p class="registration-step-help" data-streamer-wait-notice aria-live="polite">${streamerWaitNotice(event, departure, draft.streamerId, draft.id)}</p></div>`;
}
function streamerWaitNotice(event, departure, streamerId, registrationId) {
  const streamer = streamersOf(event).find(item => item.id === streamerId);
  if (!streamer) return '';
  const own = (departure.availability || []).find(reg => reg.id === registrationId);
  if (own?.streamerId === streamerId) return own.waitlistPosition ? `Liste d’attente — n° ${own.waitlistPosition}` : 'Place confirmée';
  const count = (departure.availability || []).filter(reg => reg.streamerId === streamerId && reg.status !== 'unavailable').length;
  return count >= streamer.capacity ? `Liste d’attente — n° ${count - streamer.capacity + 1}. La place revient au premier en attente lors d’un désistement.` : 'Une place est disponible.';
}

export function gridfestCommunityLink() {
  const url = state.community?.discordInviteUrl || '';
  return state.grindfest && /^https:\/\/(discord\.gg|discord\.com\/invite)\/[\w-]{2,64}$/.test(url)
    ? `<a class="secondary-button" href="${esc(url)}" target="_blank" rel="noopener noreferrer">Rejoindre le Discord de ${esc(state.community?.shortName || 'TDZ')}</a>` : '';
}

export function gridfestPasswordPanel(event) {
  if (!state.grindfest || !isGrindfest(event)) return '';
  const link = gridfestCommunityLink();
  if (!isAdmin()) return `<div class="gridfest-discord-access">${link}<p>Le mot de passe sera envoyé par MP Discord aux pilotes confirmés quand l’admin le décidera. Autorise les MP des membres du serveur.</p></div>`;
  const ready = gridfestPasswordValid(event.details?.password);
  return `<section class="gridfest-password-panel" data-gridfest-password-panel="${esc(event.id)}" aria-labelledby="gridfest-password-title">
    <h3 id="gridfest-password-title">Invitations au serveur de course</h3>${link}
    <p>${ready ? 'Mot de passe enregistré.' : 'Génère et enregistre un mot de passe sécurisé dans « Modifier l’événement ».'} Configure le même mot de passe sur le serveur de course.</p>
    <p>Envoi privé aux inscrits confirmés uniquement. Les listes d’attente sont exclues ; les pilotes déjà servis ne reçoivent pas de doublon.</p>
    <div class="gridfest-password-actions"><button type="button" class="primary-button" data-gridfest-passwords="send" ${ready ? '' : 'disabled'}>Envoyer le mot de passe par MP</button><button type="button" class="secondary-button" data-gridfest-passwords="status">Vérifier les envois</button><button type="button" class="link-button" data-action="edit-event">Modifier l’événement</button></div>
    <div data-gridfest-password-status role="status" aria-live="polite"></div>
    <p class="creation-help">Pour retirer l’accès d’un pilote ayant déjà reçu le mot de passe, change-le aussi sur le serveur de course avant un nouvel envoi.</p>
  </section>`;
}

function passwordResult(panel, result) {
  const labels = {pending:'À envoyer', sending:'En cours', sent:'MP envoyé', failed:'Échec · réessaie l’envoi', incomplete:'Inscription à compléter'};
  const sent = result.pilots.filter(pilot => pilot.status === 'sent').length;
  panel.querySelector('[data-gridfest-password-status]').innerHTML = `<p>${sent} / ${result.pilots.length} pilote(s) confirmé(s) ont reçu le mot de passe · ${result.waiting} en attente.</p>${!result.botReady ? '<p>Le bot Discord doit être configuré pour envoyer les MP.</p>' : ''}<ul class="gridfest-delivery-list">${result.pilots.map(pilot => `<li><strong>${esc(pilot.name)}</strong>${pilot.gameName ? ` · ${esc(pilot.gameName)}` : ''}<span>${esc(labels[pilot.status] || 'À envoyer')}${pilot.error ? ` — ${esc(pilot.error)}` : ''}</span></li>`).join('')}</ul>`;
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
    if (send && !confirm('Envoyer le mot de passe par MP Discord aux pilotes confirmés du Gridfest ? Les envois réussis ne seront pas répétés.')) return;
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
          status.textContent = `Envoi des MP Discord… ${sent} envoyé(s).`;
          const result = await api(path, 'POST', {version:race.version, cursor});
          sent += result.results.filter(item => item.status === 'sent').length;
          cursor = result.nextCursor;
          passwordResult(panel, result);
        } while (cursor);
      }
    } catch (error) {
      status.textContent = `${error.message} Les envois déjà réussis sont conservés ; tu peux relancer l’envoi.`;
    } finally {
      state.busy = false;
      controls.forEach((button,index) => { button.disabled = disabled[index]; });
    }
  });
  document.addEventListener('click', event => {
    const form = event.target.closest?.('form[data-kind="solo-event"]');
    if (!form) return;
    if (event.target.closest('[data-gridfest-generate-password]') && isGrindfest({details:{type:form.querySelector('[name="eventType"]:checked')?.value}})) {
      form.elements.eventPassword.value = generateGridfestPassword();
    }
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

