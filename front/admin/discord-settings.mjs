import {helpContext} from '../context-help.mjs';
import {DIAGNOSTIC_PANEL} from './discord-diagnostics.mjs';
import {esc, row, tip} from './markup.mjs';

export const MODE_NAMES = {events:'Catégorie du bot', general:'Dans tes salons'};

// « Discord »: the setting asked question by question (server/discord-layout.mjs): each answer shows the questions it
// needs; on a phone, one question per screen, the server's sketch last.
const DISCORD_MODES = {
  events:[MODE_NAMES.events, 'Le bot crée sa propre catégorie et y range tout : les courses de la semaine (un fil par course), puis les vocaux d’équipage juste en dessous.'],
  general:[MODE_NAMES.general, 'Tu choisis le salon où le bot écrit les courses de la semaine (un fil par course) et la catégorie où vont les vocaux d’équipage.']};
// The answers as saved, or those of a setting made before.
function discordAnswers(setup, settings) {
  const config = setup.botRecap, crews = settings.crews || {};
  if (config?.layout) return config.layout;
  const general = config?.mode === 'general';
  return {mode:config?.mode || 'events', sims:'all', split:false, showWeek:true, showEvents:settings.modules.soloRaces === true, under:'top',
    week:{all:general ? config.lmuId || config.iracingId || '' : ''}, events:general && config.calendarId ? config.calendarId : 'same',
    voices:settings.modules.crewChannels === true, pit:crews.voiceCategoryId ? 'existing' : 'bot', pitAt:crews.voiceCategoryId || 'top', reminders:settings.modules.raceReminders === true};
}
// The server as on Discord: the channels without category, then each category followed by its text channels.
// types: the channels shown (text ones; with 5, the announcement ones too).
function discordPlaces(list, types = [0]) {
  const byPosition = (a, b) => (a.position || 0) - (b.position || 0);
  const texts = list.filter(item => types.includes(item.type)).sort(byPosition);
  return [...texts.filter(item => !item.parentId), ...list.filter(item => item.type === 4).sort(byPosition)
    .flatMap(category => [category, ...texts.filter(item => item.parentId === category.id)])];
}
function discordForm(setup, settings) {
  const config = setup.botRecap, crews = settings.crews || {}, invite = crews.botInviteUrl || setup.recapBotInviteUrl;
  const leaving = config && !config.enabled && config.leftovers;
  const state = !config ? '' : `<p class="discord-state"><strong>${config.lastError ? 'Publication en erreur' : config.enabled ? 'Actif' : leaving ? 'Retrait en cours' : 'Éteint'}</strong>${config.enabled ? ` · ${DISCORD_MODES[config.mode]?.[0] || ''}` : ''}</p>
    ${config.lastError ? `<p class="settings-status" role="alert">${esc(config.lastError)}</p>` : ''}`;
  return `<form class="setup-form discord-form" data-discord-form data-solo="${settings.modules.soloRaces === true}" data-tdz="${settings.modules.eventTdzAvailable === true}" data-answers="${esc(JSON.stringify(discordAnswers(setup, settings)))}" data-start="${config?.enabled || config?.lastError || leaving ? 'end' : ''}">
    ${helpContext('recap')}${state}
    <div class="registration-progress" aria-hidden="true" data-discord-progress></div><p class="registration-step-label" data-discord-label></p>
    <div data-discord-questions></div>
    <div class="discord-end">
      <div class="discord-sketch" data-discord-sketch></div>
      <p class="members-help">Le bot crée lui-même ses catégories, salons et vocaux. Deux façons de l’inviter :</p>
      <ul class="members-help">
        <li>${invite ? `<a href="${esc(invite)}" target="_blank" rel="noopener">Lien normal</a>` : 'Lien normal'} : il a tout ce qu’il faut, sans être administrateur. Dans une catégorie privée, ajoute une exception pour lui (le rôle « Endurance Manager ») sur la catégorie elle-même, pas sur un salon : les autres accès restent privés.</li>
        <li>${setup.recapBotAdminInviteUrl ? `<a href="${esc(setup.recapBotAdminInviteUrl)}" target="_blank" rel="noopener">Lien administrateur</a>` : 'Lien administrateur'} : il voit et gère aussi les catégories privées, sans exception à ajouter.</li>
      </ul>
      <div class="setup-actions"><button type="submit" class="primary-button">${config?.enabled ? 'Enregistrer' : 'Activer'}</button><button type="button" class="secondary-button" data-discord-preview>Voir les messages</button><button type="button" class="secondary-button" data-discord-destinations>Actualiser les salons</button>${config?.lastError ? '<button type="button" class="secondary-button" data-discord-repair>Réparer</button>' : ''}${config?.enabled || leaving ? '<button type="button" class="danger-button" data-discord-remove>Tout retirer</button>' : ''}<span class="settings-status" role="status" aria-live="polite"></span></div>
      <p class="members-help">${config?.enabled ? 'Si tu changes d’avis, le bot retire ce qu’il avait créé et refait selon tes nouveaux choix. Les messages sont modifiés sans notification.' : 'Rien n’est publié avant « Activer ».'}</p>
      <details><summary>Tester une annonce dans Discord</summary><p>Envoie l’affiche d’un jour de stream avec des données d’exemple, sans mention ni inscription.</p><label>Nom ou identifiant du salon texte <input name="announcementTestChannel" placeholder="discussion"></label><button type="button" class="secondary-button" data-discord-announcement-test>Envoyer l’aperçu</button></details>
      <div data-recap-preview class="recap-live-preview"></div>
    </div>
    <div class="discord-steps"><button type="button" class="secondary-button" data-discord-step="-1">Retour</button><span data-discord-count></span><button type="button" class="primary-button" data-discord-step="1">Suivant</button></div>
  </form>`;
}
// The answers as the questions show them now (a question not shown keeps its last answer).
function discordRead(form) {
  const answers = form._answers ||= JSON.parse(form.dataset.answers || '{}'), field = name => form.elements[name];
  const radio = name => field(name) && field(name).value ? field(name).value : null;
  if (radio('mode')) answers.mode = radio('mode');
  if (radio('sims')) answers.sims = radio('sims');
  if (radio('split')) answers.split = radio('split') === 'apart';
  if (radio('voices')) answers.voices = radio('voices') === 'yes';
  if (radio('pit')) answers.pit = radio('pit');
  if (radio('copy')) answers.copy = radio('copy') === 'private';
  if (radio('pitCopy')) answers.pitCopy = radio('pitCopy') === 'private';
  for (const name of ['showWeek','showEvents','reminders']) if (field(name)) answers[name] = field(name).checked;
  for (const name of ['under','events','pitAt','announce','stream','streamName','requests','calendarPingDay','calendarPingTime']) if (field(name)) answers[name] = field(name).value.trim();
  // The saved ping (layout.calendarPing) until the question is shown.
  answers.calendarPingDay ??= answers.calendarPing ? String(answers.calendarPing.day) : '';
  answers.calendarPingTime ??= answers.calendarPing?.time || '08:00';
  answers.week ||= {};
  for (const key of ['all','lmu','iracing']) if (field(`week-${key}`)) answers.week[key] = field(`week-${key}`).value;
  return answers;
}
// The week's calendar of events is on the server (the events module, shown somewhere).
const discordCalendar = (form, answers) => form.dataset.solo === 'true' && (answers.mode === 'events' ? answers.showEvents : discordEvents(answers) !== '');
const PING_DAYS = ['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi','Dimanche'];
const discordSims = answers => answers.sims === 'all' ? ['lmu','iracing'] : [answers.sims];
const discordApart = answers => answers.sims === 'all' && answers.split;
const SIM_NAMES = {lmu:'LMU', iracing:'iRacing'};
// The bot's own names on Discord (as server/discord-layout.mjs): an emoji in front makes them stand out.
const BOT_NAMES = {main:'🏆 Endurance Manager', lmu:'🔴 LMU', iracing:'🔵 iRacing'};
// Where the events go: apart, the bot's category is the one of a sim (« LMU » or « iRacing »).
const discordEvents = answers => discordApart(answers) && answers.events === 'bot' ? `bot-${discordSims(answers).find(sim => answers.week?.[sim] === 'bot') || 'lmu'}`
  : !discordApart(answers) && answers.events?.startsWith('bot-') ? 'bot' : answers.events || '';
// The categories the bot makes for the races and the week's channels (as server/discord-layout.mjs).
function discordBotCategories(answers) {
  if (answers.mode === 'events') return discordApart(answers) ? [BOT_NAMES.lmu,BOT_NAMES.iracing] : [BOT_NAMES.main];
  if (discordApart(answers)) return discordSims(answers).filter(sim => answers.week?.[sim] === 'bot' || discordEvents(answers) === `bot-${sim}`).map(sim => BOT_NAMES[sim]);
  return [answers.week?.all, discordEvents(answers)].includes('bot') ? [BOT_NAMES.main] : [];
}
const discordUsesBot = answers => discordBotCategories(answers).length > 0;
// Apart, each sim's channel is « endurances-de-la-semaine »; both just below the same place, they need their own names.
const discordWeekChannel = (answers, sim) => {
  const here = answers.week?.[sim], other = answers.week?.[sim === 'lmu' ? 'iracing' : 'lmu'];
  return `📅・${here && here !== 'bot' && here === other ? `endurances-${sim}-de-la-semaine` : 'endurances-de-la-semaine'}`;
};
const quoted = names => names.map(name => `« ${name} »`).join(' et ');
// The questions these answers need, in order.
function discordQuestions(form, answers) {
  const list = form._destinations, solo = form.dataset.solo === 'true', race = answers.mode === 'events', apart = discordApart(answers);
  const places = list ? discordPlaces(list) : [];
  const radio = (name, value, label, checked) => `<label class="discord-pill"><input type="radio" name="${name}" value="${value}" ${checked ? 'checked' : ''}> ${label}</label>`;
  const known = (value, label) => value && !['top','bot','same','bot-lmu','bot-iracing'].includes(value) && !places.some(item => item.id === value || `in:${item.id}` === value) ? `<option value="${esc(value)}" selected>${esc(label || 'Choix enregistré')}</option>` : '';
  // Written in a channel of the server: its own rights count.
  const inside = (item, value) => `<option value="in:${esc(item.id)}" ${`in:${item.id}` === value ? 'selected' : ''}>Dans # ${esc(item.name)}${item.insideReady === false ? ' · le bot n’a pas ses droits' : ''}</option>`;
  const option = (item, value, inside = false, rights = true) => `<option value="${esc(item.id)}" ${item.id === value ? 'selected' : ''}>${inside ? 'Juste sous ' : ''}${item.type === 0 ? `# ` : '📁 '}${esc(item.name)}${item.type === 4 && item.private ? ' · privée' : ''}${rights && item.ready === false ? ' · le bot n’a pas ses droits' : ''}</option>`;
  // A place for a recap: not shown, a category the bot makes, or just below a channel or category of the server.
  const place = (name, value, extra = '', bots = [['bot', apart && name.startsWith('week-') ? SIM_NAMES[name.slice(5)] : 'Endurance Manager']]) => `<select name="${name}"><option value="" ${!value ? 'selected' : ''}>Ne pas afficher</option>${extra}
    ${bots.map(([key, label]) => `<option value="${key}" ${value === key ? 'selected' : ''}>Dans « ${label} », créée par le bot</option>`).join('')}<optgroup label="Ou juste sous…">${places.map(item => option(item, value, true)).join('')}${known(value)}</optgroup><optgroup label="Ou dans ce salon…">${places.filter(item => item.type === 0).map(item => inside(item, value)).join('')}</optgroup></select>`;
  // rights: only where the bot writes inside; placing its own category just below needs no rights there.
  const category = (name, value, rights = false) => `<select name="${name}"><option value="top" ${value === 'top' ? 'selected' : ''}>Le haut du serveur</option>${places.filter(item => item.type === 4).map(item => option(item, value, false, rights)).join('')}${known(value)}</select>`;
  const help = value => {
    if (value?.startsWith('in:')) { const chosen = places.find(item => `in:${item.id}` === value); return chosen?.insideReady === false ? discordInsideHelp(chosen) : ''; }
    const chosen = places.find(item => item.id === value); return chosen?.ready === false ? discordRightsHelp(chosen) : '';
  };
  // Below a private category, the bot's own one is private like it (its rights copied) or open to all: the admins choose.
  const privacy = (name, at, label, value) => {
    const chosen = places.find(item => item.id === at && item.type === 4);
    if (!chosen?.private) return '';
    return `<div class="discord-pills">${radio(name,'private',`Privée comme « ${esc(chosen.name)} »`,value !== false)}${radio(name,'public','Publique',value === false)}</div>
      <p class="members-help">${value !== false ? `Seuls ceux qui voient « ${esc(chosen.name)} » verront ${label}.` : `Tout le serveur verra ${label}.`}</p>`;
  };
  const row = (title, sub, control, after = '') => `<label class="discord-row"><span><strong>${title}</strong>${sub ? `<small>${sub}</small>` : ''}</span>${control}</label>${after}`;
  const questions = [
    ['Comment ranger les courses ?', `<div class="recap-cards">${Object.entries(DISCORD_MODES).map(([value, [title, text]]) => `<label class="recap-card"><input type="radio" name="mode" value="${value}" ${answers.mode === value ? 'checked' : ''}><span><strong>${title}</strong><small>${text}</small></span></label>`).join('')}</div>`],
    ['Quelles simus ?', `<div class="discord-pills">${radio('sims','lmu','LMU',answers.sims === 'lmu')}${radio('sims','iracing','iRacing',answers.sims === 'iracing')}${radio('sims','all','Les deux',answers.sims === 'all')}</div>`]];
  if (answers.sims === 'all') questions.push([race ? 'LMU et iRacing dans la même catégorie ?' : 'LMU et iRacing dans le même salon ?',
    `<div class="discord-pills">${radio('split','together','Ensemble',!answers.split)}${radio('split','apart','Séparés',answers.split)}</div>
    <p class="members-help">${race ? (answers.split ? 'Le bot crée « LMU » et « iRacing », chacune suivie de ses courses.' : 'Le bot crée « Endurance Manager », suivie des courses : LMU d’abord, puis iRacing, chacune par date.') : (answers.split ? 'Chaque simu a son salon.' : 'Un message par simu dans le même salon.')}</p>`]);
  // « Un fil par course »: # endurances-de-la-semaine is always there (the races' threads are in it).
  if (race) { if (solo) questions.push([apart ? 'Afficher aussi les events dans « LMU » et « iRacing » ?' : 'Afficher aussi les events dans « Endurance Manager » ?',
    `<label class="discord-check"><input type="checkbox" name="showEvents" ${answers.showEvents ? 'checked' : ''}><span><strong># ${discordEventChannel(form)}</strong><small>Les events de la semaine.</small></span></label>`]); }
  else {
    questions.push(['Où mettre les endurances de la semaine ?', (apart ? discordSims(answers).map(sim => row(SIM_NAMES[sim], `# ${discordWeekChannel(answers, sim)}`, place(`week-${sim}`, answers.week?.[sim] || ''), help(answers.week?.[sim])))
      : [row('# endurances-de-la-semaine', discordSims(answers).length > 1 ? 'LMU puis iRacing, un message chacun.' : '', place('week-all', answers.week?.all || ''), help(answers.week?.all))]).join('')
      + `<p class="members-help">${apart ? 'Dans « LMU » ou « iRacing » : le bot crée cette catégorie pour la simu, tu choisis ensuite où la placer.' : 'Dans « Endurance Manager » : le bot crée sa catégorie, tu choisis ensuite où la placer.'} Juste sous un salon : le bot crée le sien juste après, dans la même catégorie. Sous une catégorie : en tête de celle-ci, avec ses droits. Dans un salon : le bot écrit après les messages déjà là et y ouvre les fils des courses ; ses messages restent ensuite à leur place.</p>`]);
    const events = discordEvents(answers);
    if (solo) questions.push(['Où mettre les events de la semaine ?', row(`# ${discordEventChannel(form)}`, '', place('events', events, `<option value="same" ${events === 'same' ? 'selected' : ''}>Avec les endurances</option>`, apart ? discordSims(answers).map(sim => [`bot-${sim}`, SIM_NAMES[sim]]) : undefined), help(events))]);
  }
  // « Prévenir @everyone du calendrier ? » (TDZ, 2026-11-23): once a week, at the day and hour chosen.
  if (discordCalendar(form, answers)) questions.push(['Prévenir @everyone du calendrier ?', row('📅 Ping du calendrier', 'Une fois par semaine, un message @everyone sous le calendrier. Le calendrier passe à la semaine suivante le lundi à 7h30.',
    `<select name="calendarPingDay"><option value="" ${!answers.calendarPingDay ? 'selected' : ''}>Ne pas prévenir</option>${PING_DAYS.map((day, index) => `<option value="${index + 1}" ${answers.calendarPingDay === String(index + 1) ? 'selected' : ''}>${day}</option>`).join('')}</select>`)
    + (answers.calendarPingDay ? row('Heure', '', `<input type="time" name="calendarPingTime" required value="${esc(answers.calendarPingTime || '08:00')}">`) : '')]);
  const made = quoted(discordBotCategories(answers)), several = discordBotCategories(answers).length > 1;
  if (discordUsesBot(answers)) questions.push([several ? 'Où placer les catégories du bot ?' : 'Où placer la catégorie du bot ?', row(made, race ? 'Juste sous cette catégorie, puis les catégories des courses.' : 'Juste sous cette catégorie.', category('under', answers.under || 'top'))
    + privacy('copy', answers.under, made, answers.copy)
    + `<p class="members-help">Le bot n’a pas besoin de droits sur la catégorie choisie : il se place juste en dessous. Une catégorie privée est signalée « privée » : tu choisis alors si ${several ? 'les siennes restent publiques ou deviennent privées' : 'la sienne reste publique ou devient privée'} comme elle.</p>`]);
  questions.push(['Des vocaux d’équipage ?', `<div class="discord-pills">${radio('voices','yes','Oui',answers.voices)}${radio('voices','no','Non',!answers.voices)}</div>
    ${answers.voices && !race ? `<div class="discord-pills">${radio('pit','bot','Le bot crée « 🎙️ Pit talk »',answers.pit !== 'existing')}${radio('pit','existing','Dans une catégorie existante',answers.pit === 'existing')}</div>
      ${row(answers.pit === 'existing' ? 'Vocaux d’équipage' : '🎙️ Pit talk', answers.pit === 'existing' ? 'Le bot les crée dans' : 'Le bot la crée juste sous', category('pitAt', answers.pitAt || 'top', answers.pit === 'existing'), answers.pit === 'existing' ? help(answers.pitAt) : privacy('pitCopy', answers.pitAt, '« 🎙️ Pit talk »', answers.pitCopy))}` : ''}
    ${answers.voices && !race && answers.pit === 'existing' ? '<p class="members-help">Si cette catégorie est privée, ajoute sur Discord une exception pour le bot (le rôle « Endurance Manager ») : les vocaux qu’il y crée restent privés comme elle.</p>' : ''}
    <p class="members-help">${!answers.voices ? 'Pas de vocal : les équipages s’organisent ailleurs.' : race ? 'Juste sous les fils, nommés « 🏎️ LMU · 6h de Spa · Équipage A », LMU puis iRacing, par date. Supprimés 2 h après la course.' : 'Nommés « 🏎️ LMU · 6h de Spa · Équipage A », LMU puis iRacing, par date. Supprimés 2 h après la course.'}</p>
    <label class="discord-check"><input type="checkbox" name="reminders" ${answers.reminders ? 'checked' : ''}><span><strong>Rappels avant le départ</strong><small>${answers.voices ? '24 h avant dans la cloche du site, puis 24 h et 1 h avant dans le chat du vocal.' : '24 h avant dans la cloche du site.'}</small></span></label>`]);
  // The morning announcement: written in a text or announcement channel of the server, with @everyone.
  const channels = discordPlaces(list || [], [0,5]).filter(item => item.type !== 4), announce = answers.announce || '';
  const chosen = channels.find(item => item.id === announce);
  questions.push(['Annoncer les courses du jour ?', row('📣 Annonce du jour', 'Chaque matin à 7h30 : l’affiche des courses du jour, avec le bouton S’inscrire. @everyone seulement les jours de stream.',
    `<select name="announce"><option value="" ${!announce ? 'selected' : ''}>Ne pas annoncer</option>${channels.map(item => `<option value="${esc(item.id)}" ${item.id === announce ? 'selected' : ''}>${item.parentId ? '   ' : ''}# ${esc(item.name)}${item.announceReady === false ? ' · le bot n’a pas ses droits' : ''}</option>`).join('')}${announce && !chosen ? `<option value="${esc(announce)}" selected>Choix enregistré</option>` : ''}</select>`,
    chosen?.announceReady === false ? `<p class="setup-note setup-error discord-rights">Sur Discord : clic droit sur « ${esc(chosen.name)} » › Modifier le salon › Permissions › « + » › Endurance Manager, puis coche ${esc((chosen.announceMissing || []).join(', '))}. Reviens ensuite sur « Actualiser les salons ».</p>` : '')
    + (announce ? row('📺 Lien du stream', 'Facultatif : « 📺 Lancement du stream sur Twitch à 19h45 » dans l’annonce, avec l’heure de début du stream de l’event.',
      `<input type="url" name="stream" inputmode="url" maxlength="300" placeholder="https://twitch.tv/…" value="${esc(answers.stream || '')}">`)+row('Nom du streamer','Nom affiché dans « En direct avec… ». Sans nom renseigné, le nom de la chaîne est utilisé.',`<input name="streamName" maxlength="80" placeholder="La Praline" value="${esc(answers.streamName||'')}">`) : '')]);
  // « Demander un équipage » (Nathan 2026-11-09): each request made on the site posted in a channel, without a ping.
  const requests = answers.requests || '', asked = channels.find(item => item.id === requests);
  const askedMissing = (asked?.announceMissing || []).filter(right => !['Mentionner @everyone','Voir les anciens messages'].includes(right));
  questions.push(['Poster les demandes d’équipage ?', row('🙋 Demandes d’équipage', 'Chaque demande faite sur le site, sans ping. Les responsables la traitent sur le site.',
    `<select name="requests"><option value="" ${!requests ? 'selected' : ''}>Ne pas poster</option>${channels.filter(item => item.type === 0).map(item => `<option value="${esc(item.id)}" ${item.id === requests ? 'selected' : ''}>${item.parentId ? '   ' : ''}# ${esc(item.name)}</option>`).join('')}${requests && !asked ? `<option value="${esc(requests)}" selected>Choix enregistré</option>` : ''}</select>`,
    askedMissing.length ? `<p class="setup-note setup-error discord-rights">Sur Discord : clic droit sur « ${esc(asked.name)} » › Modifier le salon › Permissions › « + » › Endurance Manager, puis coche ${esc(askedMissing.join(', '))}. Reviens ensuite sur « Actualiser les salons ».</p>` : '')]);
  return questions;
}
const discordEventChannel = form => form.dataset.tdz === 'true' ? '🗓️・calendrier' : 'event-solo-de-la-semaine';
// The questions follow the answers; on a phone, one per screen (the sketch and the buttons last).
export function discordRefresh(form) {
  const answers = discordRead(form), questions = discordQuestions(form, answers);
  form.querySelector('[data-discord-questions]').innerHTML = questions.map(([title, body], index) => `<fieldset class="discord-q" data-q="${index}"><legend>${title}</legend>${body}</fieldset>`).join('');
  // On a phone, a setting already in place opens on its summary (the sketch and its buttons); « Retour » goes to the questions.
  form._step = Math.min(form._step ?? (form.dataset.start === 'end' ? questions.length : 0), questions.length);
  discordPage(form);
  discordSketch(form, answers);
}
export function discordPage(form) {
  const questions = [...form.querySelectorAll('.discord-q')], step = form._step || 0, last = questions.length;
  questions.forEach((item, index) => item.classList.toggle('is-current', index === step));
  form.querySelector('.discord-end').classList.toggle('is-current', step === last);
  form.querySelector('[data-discord-count]').textContent = step === last ? 'Aperçu' : `${step + 1} / ${last}`;
  // In the window: the bar and « Étape 2 sur 7 · … », as the creation of a race.
  form.querySelector('[data-discord-progress]').innerHTML = [...questions, null].map((_, index) => `<span class="${index <= step ? 'done' : ''}"></span>`).join('');
  form.querySelector('[data-discord-label]').textContent = step === last ? 'Dernière étape · Aperçu sur ton serveur' : `Question ${step + 1} sur ${last} · ${questions[step].querySelector('legend')?.textContent || ''}`;
  const [back, next] = form.querySelectorAll('[data-discord-step]');
  back.disabled = step === 0; next.hidden = step === last;
  next.textContent = step === last - 1 ? 'Voir le résultat' : 'Suivant';
}
// Written in a channel: what to tick on that channel.
function discordInsideHelp(destination) {
  return `<p class="setup-note setup-error discord-rights">Le bot n’a pas ses droits dans ce salon. Sur Discord : clic droit sur « ${esc(destination.name)} » › Modifier le salon › Permissions › « + » › Endurance Manager, puis coche ${esc((destination.insideMissing || []).join(', '))}. Reviens ensuite sur « Actualiser les salons ».</p>`;
}
// What to tick on Discord when the bot cannot work in the chosen place (the invitation only gives server-wide rights).
function discordRightsHelp(destination) {
  // Below a channel, the bot makes its own in that channel's category: the rights count there.
  const category = destination.type === 4 ? destination.name : destination.parentName;
  const where = category ? `clic droit sur la catégorie « ${esc(category)} » › Modifier la catégorie › Permissions › « + » › Endurance Manager` : 'Paramètres du serveur › Rôles › Endurance Manager';
  const why = category && destination.private ? `« ${esc(category)} » est privée : ajoute une exception pour le bot, les autres accès restent privés.` : 'Le bot n’a pas ses droits ici.';
  return `<p class="setup-note setup-error discord-rights">${why} Sur Discord : ${where}, puis coche ${esc((destination.missing || []).join(', '))}. Reviens ensuite sur « Actualiser les salons ».</p>`;
}
// A sketch of the server with these answers (example races and crews); what the bot makes is highlighted.
function discordSketch(form, answers = discordRead(form)) {
  const list = form._destinations || [], solo = form.dataset.solo === 'true', race = answers.mode === 'events', apart = discordApart(answers), sims = discordSims(answers);
  const texts = list.filter(item => item.type === 0).sort((a, b) => (a.position || 0) - (b.position || 0));
  const groups = [{id:'top', items:texts.filter(item => !item.parentId).map(item => ({name:`# ${item.name}`, id:item.id}))},
    ...list.filter(item => item.type === 4).sort((a, b) => (a.position || 0) - (b.position || 0)).map(item => ({id:item.id, name:item.name, items:texts.filter(text => text.parentId === item.id).map(text => ({name:`# ${text.name}`, id:text.id}))}))];
  const at = id => groups.findIndex(group => group.id === (id === 'top' ? 'top' : id));
  const after = (id, ...added) => { const index = id === 'top' ? 0 : at(id); groups.splice(index < 0 ? groups.length : index + 1, 0, ...added); };
  const RACES = {lmu:['🏎️ LMU · 6h de Spa', ['Équipage A','Équipage B']], iracing:['🏁 iRacing · 8h de Watkins Glen', ['Équipage A']]};
  const bot = name => ({name, bot:true});
  // Each race: its thread in # endurances-de-la-semaine, its crews' voices just below (Discord lists them after the texts).
  const voices = list => answers.voices ? list.flatMap(sim => RACES[sim][1].map(crew => bot(`🔊 ${RACES[sim][0]} · ${crew}`))) : [];
  const week = list => [bot('# 📅・endurances-de-la-semaine'), ...list.map(sim => bot(`　🧵 ${RACES[sim][0]}`))];
  const eventName = `# ${discordEventChannel(form)}`;
  const isPrivate = id => list.some(item => item.id === id && item.type === 4 && item.private);
  const lock = (copy, at) => copy !== false && isPrivate(at) ? ' 🔒' : '';
  const botCat = {name:`${BOT_NAMES.main}${lock(answers.copy, answers.under)}`, bot:true, items:[]};
  const simCats = Object.fromEntries(sims.map(sim => [sim, {name:`${BOT_NAMES[sim]}${lock(answers.copy, answers.under)}`, bot:true, items:[]}]));
  if (race) {
    const blocks = apart ? sims.map((sim, index) => ({name:`${BOT_NAMES[sim]}${lock(answers.copy, answers.under)}`, bot:true, items:[...week([sim]), ...(solo && answers.showEvents ? [bot(eventName)] : []), ...voices([sim])]}))
      : [{...botCat, items:[...week(sims), ...(solo && answers.showEvents ? [bot(eventName)] : []), ...voices(sims)]}];
    after(answers.under || 'top', ...blocks);
  } else {
    // A week's channel with its races' threads.
    const placeIn = (value, name, sim = null, threads = [], label = '') => {
      if (!value) return;
      if (value.startsWith('in:')) {
        // In a channel of the server: its messages after those already there, then the races' threads.
        const items = [bot(`　💬 ${label}`), ...threads.map(item => bot(`　🧵 ${RACES[item][0]}`))];
        for (const item of groups) { const index = item.items.findIndex(text => `in:${text.id}` === value); if (index >= 0) { item.items.splice(index + 1 + item.items.slice(index + 1).filter(text => text.bot && text.name.startsWith('　')).length, 0, ...items); return; } }
        return;
      }
      const items = [bot(name), ...threads.map(item => bot(`　🧵 ${RACES[item][0]}`))];
      if (value === 'bot') { (apart && sim ? simCats[sim] : botCat).items.push(...items); return; }
      if (value.startsWith('bot-')) { simCats[value.slice(4)]?.items.push(...items); return; }
      const group = groups[at(value)];
      if (group) { group.items.unshift(...items); return; }
      for (const item of groups) { const index = item.items.findIndex(text => text.id === value); if (index >= 0) { item.items.splice(index + 1, 0, ...items); return; } }
    };
    const channels = apart ? sims.map(sim => [answers.week?.[sim], `# ${discordWeekChannel(answers, sim)}`, sim, [sim]]) : [[answers.week?.all, '# 📅・endurances-de-la-semaine', null, sims]];
    for (const [value, name, sim, threads] of channels) placeIn(value, name, sim, threads, sim ? `Endurances ${SIM_NAMES[sim]}` : 'Endurances de la semaine');
    const events = discordEvents(answers);
    if (solo && events && events !== 'same') placeIn(events, eventName, null, [], 'Events de la semaine');
    const made = [botCat, ...Object.values(simCats)].filter(group => group.items.length);
    if (made.length) after(answers.under || 'top', ...made);
    if (answers.voices) {
      const voices = sims.flatMap(sim => RACES[sim][1].map(crew => bot(`🔊 ${RACES[sim][0]} · ${crew}`)));
      if (answers.pit === 'existing') (groups[at(answers.pitAt || 'top')] || groups[0]).items.push(...voices);
      else after(answers.pitAt || 'top', {name:`🎙️ Pit talk${lock(answers.pitCopy, answers.pitAt)}`, bot:true, items:voices});
    }
  }
  const lines = groups.flatMap(group => [...(group.name ? [`<li class="is-category${group.bot ? ' is-bot' : ''}">${esc(group.name)}</li>`] : []), ...group.items.map(item => `<li class="${item.name.startsWith('🔊') ? 'is-voice' : 'is-text'}${item.bot ? ' is-bot' : ''}">${esc(item.name)}</li>`)]);
  const server = form._server && !form._server.ready && discordUsesBot(answers) ? `<p class="setup-note setup-error discord-rights">Pour créer ses catégories, le bot a besoin sur ton serveur de : ${esc(form._server.missing.join(', '))}.</p>` : '';
  form.querySelector('[data-discord-sketch]').innerHTML = `<strong>Sur ton serveur</strong>${list.length ? '' : ' <small>(touche « Actualiser les salons » pour voir les tiens)</small>'}${form._destinationsError ? `<p class="setup-note setup-error">Tes salons n’ont pas pu être lus sur Discord (${esc(form._destinationsError)}). Tes choix sont gardés : réessaie dans un moment avec « Actualiser les salons ».</p>` : ''}<ul>${lines.join('')}</ul><small>En surligné : ce que crée le bot.</small>${server}`;
}
export async function loadDiscordDestinations(form, api) {
  // Just after a change the bot is busy on Discord: one more try before saying so.
  const read = () => api('/api/community/recap/destinations');
  let result;
  try { result = await read().catch(async () => { await new Promise(resolve => setTimeout(resolve, 3000)); return read(); }); }
  catch (error) { form._destinationsError = error.message; discordRefresh(form); throw error; }
  form._destinationsError = null;
  form._destinations = result.destinations || [];
  form._server = result.server || null;
  discordRefresh(form);
}
// Copying the rights only means something below a private category.
export function discordInput(form) {
  const answers = discordRead(form), list = form._destinations || [];
  const isPrivate = id => list.some(item => item.id === id && item.type === 4 && item.private);
  return {layout:{...answers, calendarPingDay:discordCalendar(form, answers) ? answers.calendarPingDay : '', events:discordEvents(answers), copy:answers.copy !== false && isPrivate(answers.under), pitCopy:answers.pitCopy !== false && isPrivate(answers.pitAt)}};
}
const recapPreviewText = value => esc(String(value || '').replace(/<t:(\d+):[A-Za-z]>/g,(_,unix) => new Date(Number(unix)*1000).toLocaleString('fr-FR',{timeZone:'Europe/Paris',dateStyle:'medium',timeStyle:'short'})).replace(/\*\*/g,''))
  .replace(/&lt;:em_([a-z0-9_]+):\d+&gt;/g,'<img src="/images/discord-emojis/$1.png" width="18" height="18" alt="">');
export function recapPreviewMarkup(previews) {
  return previews.length ? previews.map(item => `<figure class="recap-preview"><figcaption># ${esc(item.name)}</figcaption>${item.payload.embeds.map(embed => `<div class="recap-preview-embed"><strong>${esc(embed.title || '')}</strong><span>${recapPreviewText(embed.description)}</span>${(embed.fields || []).map(field => `<b>${esc(field.name)}</b><span>${recapPreviewText(field.value)}</span>`).join('')}${embed.url ? `<a href="${esc(embed.url)}">Voir sur le site</a>` : ''}</div>`).join('')}</figure>`).join('') : '<p>Rien à publier pour le moment. Les prochaines courses apparaîtront toutes seules.</p>';
}
// Why the crews' channels cannot be turned on yet (the bot's state on the server, checked by the site).
const BOT_PROBLEMS = {
  channel:'Un administrateur Discord doit autoriser le bot dans le salon ou sa catégorie. Les autres accès restent privés.',
  rights:'Touche « Donner les droits au bot », valide sur Discord, puis « C’est fait ».',
  absent:'Le bot n’est pas sur ton serveur : touche « Donner les droits au bot » pour l’ajouter avec ses droits, puis « C’est fait ».',
  config:'Le bot du site n’est pas configuré : préviens le gérant de la plateforme.',
  discord:'Discord ne répond pas pour l’instant : réessaie avec « C’est fait » dans un moment.'};

// A right the bot lacks on the server (invited before it was in the link…): inviting it again with the site's link gives it.
export function rightsRow(setup) {
  return row('warn', 'Il manque un droit au bot', `${esc(setup.botRecap.missingRights.map(right => `« ${right} »`).join(', '))}. Réinvite-le, rien n’est retiré.`,
    setup.recapBotInviteUrl ? `<span class="adm-actions"><a class="primary-button" href="${esc(setup.recapBotInviteUrl)}" target="_blank" rel="noopener">Réinviter le bot</a><button type="button" class="secondary-button" data-setup-refresh>Vérifier</button></span>` : '');
}

// « Discord »: where it stands, what the bot does (a summary), « Modifier » opens the questions step by step in a window.
export function discordTabMarkup(setup, settings, look) {
  const config = setup.botRecap, crews = settings.crews || {}, guild = setup.guild || {};
  const answers = discordAnswers(setup, settings), voices = settings.modules.crewChannels === true;
  const leaving = config && !config.enabled && config.leftovers;
  const [tone, title] = config?.lastError ? ['bad', 'Publication en erreur'] : config?.enabled ? ['ok', `Actif · ${MODE_NAMES[config.mode] || ''}`]
    : leaving ? ['warn', 'Retrait en cours'] : ['off', 'Éteint'];
  const sub = config?.lastError ? esc(config.lastError) : config?.enabled ? 'Le bot met ton serveur à jour tout seul, toutes les 2 minutes.' : leaving ? 'Le bot finit de retirer ce qu’il avait créé.' : 'Rien n’est publié sur ton serveur. Touche « Régler Discord » pour commencer.';
  const state = `<ul class="adm-rows"><li class="adm-row is-${tone}" data-discord-state><span><strong>${title}</strong><small>${sub}</small></span>
    <span class="adm-actions"><span class="settings-status" data-discord-saved aria-live="polite"></span><button type="button" class="primary-button" data-discord-open>${config?.enabled ? 'Modifier' : 'Régler Discord'}</button></span></li>${config?.missingRights?.length ? rightsRow(setup) : ''}</ul>`;
  const crewWarn = voices && (crews.botReady !== true || crews.lastError);
  const crewRights = !crewWarn ? '' : crews.botReady === true ? row('warn', 'Vocaux d’équipage en échec', esc(crews.lastError),
      crews.botInviteUrl ? `<span class="adm-actions"><a class="primary-button" href="${esc(crews.botInviteUrl)}" target="_blank" rel="noopener">Réinviter le bot</a></span>` : '')
    : row('warn', 'Vocaux d’équipage : le bot n’a pas ses droits', esc(crews.botProblem === 'channel' ? `Dans « ${crews.botChannelName || 'le salon'} », un administrateur Discord doit autoriser Endurance Manager : ${(crews.botMissing || []).join(', ')}. Les autres accès restent privés.` : crews.botProblem === 'rights' && crews.botMissing?.length ? `Droits manquants : ${crews.botMissing.join(', ')}.` : BOT_PROBLEMS[crews.botProblem] || BOT_PROBLEMS.rights),
      `<span class="adm-actions">${crews.botInviteUrl && crews.botProblem !== 'channel' ? `<a class="primary-button" href="${esc(crews.botInviteUrl)}" target="_blank" rel="noopener">Donner les droits au bot</a>` : ''}<button type="button" class="secondary-button" data-modules-refresh="discord">C’est fait</button></span>`);
  const sims = {lmu:'LMU', iracing:'iRacing', all:'LMU et iRacing'}[answers.sims] || 'LMU et iRacing';
  const fact = (label, value, help) => `<div><dt>${label} ${tip(help)}</dt><dd>${value}</dd></div>`;
  const facts = config?.enabled ? `<section class="adm-block"><h2 class="adm-label">Ce que fait le bot</h2><dl class="adm-facts">
      ${fact('Courses de la semaine', `${esc(MODE_NAMES[answers.mode] || '')} · ${sims}${answers.split && answers.sims === 'all' ? ' séparés' : ''}`, answers.mode === 'events' ? 'Le lundi à 7h30, le bot publie les courses de la semaine dans # endurances-de-la-semaine et ouvre un fil par course. Les pilotes inscrits y sont ajoutés sans notification.' : 'Le lundi à 7h30, le bot publie le récap de la semaine dans le salon choisi, avec un fil par course.')}
      ${fact('Vocaux d’équipage', answers.voices ? (answers.reminders ? 'Oui, avec rappels' : 'Oui') : 'Non', 'Un salon vocal par équipage, ouvert le lundi de la semaine de la course et supprimé 2 h après la fin. Avec les rappels : 24 h et 1 h avant le départ dans son chat.')}
      ${fact('Annonce du jour', answers.announce ? 'Oui, à 7h30' : 'Non', 'Chaque matin à 7h30, une affiche des courses du jour dans le salon choisi. @everyone seulement les jours de stream.')}
      ${answers.calendarPing ? fact('Ping du calendrier', `${PING_DAYS[answers.calendarPing.day - 1]} à ${esc(answers.calendarPing.time.replace(':', 'h'))}`, 'Une fois par semaine, un message @everyone sous le calendrier des events.') : ''}
      ${fact('Demandes d’équipage', answers.requests ? 'Postées sur Discord' : 'Sur le site seulement', 'Chaque demande d’équipage faite sur le site, postée sans ping dans le salon choisi. La carte devient verte quand l’équipage est créé.')}
      ${answers.announce ? fact('Stream', answers.stream ? esc(answers.stream.replace(/^https?:\/\//, '')) : 'Aucun', 'Facultatif : le lien et le nom du streamer s’affichent sur l’affiche des jours de stream.') : ''}
    </dl></section>` : '';
  const bot = look.discordServer ? `<section class="adm-block"><h2 class="adm-label">Logo du bot ${tip('L’image du bot, seulement sur ton serveur Discord. Le nom du bot se change directement sur Discord.')}</h2>
      <div class="settings-banner settings-bot adm-card" data-image-kind="bot">
        <div class="settings-bot-current"><img class="settings-banner-preview" src="${esc(look.botAvatarUrl || '/images/app-icon-192.png')}" alt="Logo actuel du bot"><span><b>${look.botAvatarUrl ? 'Ton logo' : 'Logo d’Endurance Manager'}</b><small>${look.botAvatarUrl ? 'Seulement sur ton serveur' : 'Le même sur tous les serveurs'}</small></span></div>
        <div class="settings-actions"><label class="secondary-button settings-banner-pick">Changer<input type="file" accept="image/png,image/jpeg,image/webp" data-banner-file hidden></label>
          ${look.botAvatarUrl ? '<button type="button" class="secondary-button" data-bot-avatar-remove>Remettre le logo du site</button>' : ''}<span class="settings-status" aria-live="polite"></span></div></div></section>` : '';
  const presence = guild.id && !guild.botPresent ? row('bad', 'Le bot n’est pas sur ton serveur', 'Invite-le d’abord : sans lui, rien ne peut être publié.', setup.botInviteUrl ? `<a class="primary-button" href="${esc(setup.botInviteUrl)}" target="_blank" rel="noopener">Inviter le bot</a>` : '') : '';
  return `<p class="adm-intro">Ce que le bot Endurance Manager fait sur ton serveur Discord : les courses de la semaine, les vocaux d’équipage et l’annonce du jour.</p>
    ${state}${presence || crewRights ? `<ul class="adm-rows">${presence}${crewRights}</ul>` : ''}
    ${facts}${config?.enabled || voices ? `<section class="adm-block">${DIAGNOSTIC_PANEL}</section>` : ''}${bot}
    <div class="adm-sheet-home" data-discord-home hidden>${discordForm(setup, settings)}</div>`;
}

// The Discord questions in a window, step by step (as the creation of a race). The form itself only moves:
// what was answered stays, and closing puts it back.
export function openDiscordSheet(app, api, atEnd = false) {
  const form = app.querySelector('[data-discord-form]');
  if (!form || form.closest('.form-sheet-overlay')) return;
  const overlay = document.createElement('section');
  overlay.className = 'form-sheet-overlay adm-sheet';
  overlay.innerHTML = `<div class="registration-sheet form-sheet" role="dialog" aria-modal="true" aria-labelledby="discord-sheet-title"><div class="registration-workspace-head"><div class="registration-workspace-title"><h2 id="discord-sheet-title" tabindex="-1">Régler Discord</h2></div><span class="registration-workspace-actions"><button type="button" class="secondary-button registration-close-button" data-discord-close>Fermer</button></span></div><div class="form-sheet-body"></div></div>`;
  overlay.querySelector('.form-sheet-body').append(form);
  app.append(overlay);
  form._step = atEnd ? form.querySelectorAll('.discord-q').length : 0;
  discordPage(form);
  if (!form._destinations) loadDiscordDestinations(form, api).catch(error => { form.querySelector('.setup-actions .settings-status').textContent = error.message; });
  requestAnimationFrame(() => overlay.querySelector('h2')?.focus({preventScroll:true}));
}
export function closeDiscordSheet(app) {
  const overlay = app.querySelector('.adm-sheet'), form = overlay?.querySelector('[data-discord-form]');
  if (form) app.querySelector('[data-discord-home]')?.append(form);
  overlay?.remove();
  app.querySelector('[data-discord-open]')?.focus();
}
