import {esc, state} from './core.mjs';
import {isGrindfest, streamersOf} from '../../shared/grindfest.mjs';
import {soloEntryList} from './solo.mjs';

function streamerRow(streamer = {}) {
  return `<div class="grindfest-streamer-form" data-streamer-id="${esc(streamer.id || crypto.randomUUID())}">
    <label class="form-label">Streamer<input name="streamerName" maxlength="60" value="${esc(streamer.name || '')}" required></label>
    <label class="form-label">Lien Twitch<input name="streamerTwitch" type="url" value="${esc(streamer.twitchUrl || '')}" placeholder="https://www.twitch.tv/…" required></label>
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
  const active = form.querySelector('[name="eventType"]:checked')?.value === 'Grindfest';
  section.hidden = !active;
  section.querySelectorAll('input').forEach(field => { field.disabled = !active; });
  const streamers = streamerData(form), total = streamers.reduce((sum, item) => sum + item.capacity, 0);
  section.querySelector('[data-grindfest-total]').textContent = `${streamers.length} streamers · ${total} places au total`;
  section.querySelector('[data-add-streamer]').hidden = streamers.length >= 12;
  section.querySelectorAll('[data-remove-streamer]').forEach(button => { button.disabled = streamers.length <= 2; });
  const addRound = form.querySelector('[data-add-round]');
  if (addRound) addRound.hidden = active || form.querySelectorAll('.solo-round').length >= 4;
  form.querySelectorAll('[name="roundCapacity"]').forEach(field => { field.disabled = active; if (active) field.value = ''; });
}
export function streamerColumns(event, departure) {
  const streamers = streamersOf(event);
  return `<div class="grindfest-grid" style="--streamer-columns:${Math.min(4, streamers.length)}">${streamers.map(streamer => {
    const entries = (departure.availability || []).filter(reg => reg.streamerId === streamer.id && reg.status !== 'unavailable');
    const confirmed = entries.filter(reg => !reg.waitlistPosition).length;
    return `<section class="grindfest-column"><a class="grindfest-streamer-head" href="${esc(streamer.twitchUrl)}" target="_blank" rel="noopener noreferrer">${streamer.logoUrl ? `<img class="grindfest-logo" src="${esc(streamer.logoUrl)}" alt="">` : ''}<strong>${esc(streamer.name)}</strong><small>Twitch ↗</small><span>${confirmed} / ${streamer.capacity} places prises</span></a>${soloEntryList(event, departure, entries, {title:'Inscrits', capacity:streamer.capacity})}</section>`;
  }).join('')}</div>`;
}
export function streamerChoice(event, departure, draft) {
  if (!isGrindfest(event)) return '';
  const streamers = streamersOf(event);
  return `<div class="grindfest-choice"><label class="form-label">Je roule pour…<select name="registrationStreamer" required><option value="">Choisir un streamer</option>${streamers.map(streamer => {
    const entries = (departure.availability || []).filter(reg => reg.streamerId === streamer.id && reg.status !== 'unavailable'), confirmed = entries.filter(reg => !reg.waitlistPosition).length;
    const label = confirmed >= streamer.capacity ? `Complet · liste d’attente` : `${streamer.capacity - confirmed} place(s) libre(s)`;
    return `<option value="${esc(streamer.id)}" ${draft.streamerId === streamer.id ? 'selected' : ''}>${esc(streamer.name)} · ${label}</option>`;
  }).join('')}</select></label><p data-streamer-wait-notice aria-live="polite">${streamerWaitNotice(event, departure, draft.streamerId, draft.id)}</p></div>`;
}
function streamerWaitNotice(event, departure, streamerId, registrationId) {
  const streamer = streamersOf(event).find(item => item.id === streamerId);
  if (!streamer) return '';
  const own = (departure.availability || []).find(reg => reg.id === registrationId);
  if (own?.streamerId === streamerId) return own.waitlistPosition ? `Liste d’attente — n° ${own.waitlistPosition}` : 'Place confirmée';
  const count = (departure.availability || []).filter(reg => reg.streamerId === streamerId && reg.status !== 'unavailable').length;
  return count >= streamer.capacity ? `Liste d’attente — n° ${count - streamer.capacity + 1}. La place revient au premier en attente lors d’un désistement.` : 'Une place est disponible.';
}

if (typeof document !== 'undefined') {
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
