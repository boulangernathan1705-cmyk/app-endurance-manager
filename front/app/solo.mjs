// Solo races: one entry per driver, limited places with a waiting list, one or two rounds and an
// OPEN / SAFE access. They reuse the race cards, the race page and the registration window; this module
// only holds what differs from endurance events.
import {state,esc,pilotNameTip,button,canManage,can,logo,badge,categories} from './core.mjs';
import {SIMS,simCatalog,simForEvent} from '../../shared/catalog.mjs';
import {isGrindfest} from '../../shared/grindfest.mjs';
import {isStream,streamDetails,hourLabel,streamPlatform} from '../../shared/stream.mjs';

export const ANY_CATEGORY = '*';
export const isSolo = event => event?.format === 'solo';

// Supplied OPEN/SAFE artwork, shared by the calendar, event and personal entries.
export function eventAccessLogo(event,{header=false}={}) {
  if ((!state.eventTdz&&!header) || !isSolo(event) || isGrindfest(event) || isStream(event)) return '';
  const sim = SIMS.find(item => item.id === simForEvent(event));
  const access = event.access === 'safe' ? 'safe' : 'open';
  return `<img class="event-access-logo" src="/images/event-access/${access}-${sim.id}.png" alt="${access.toUpperCase()} · ${esc(sim.name)}" width="300" height="300" loading="lazy" decoding="async">`;
}

export function simBadge(event) {
  const sim = SIMS.find(item => item.id === simForEvent(event));
  return `<span class="event-sim-badge sim-${sim.id}" title="${esc(sim.name)}">${esc(sim.short)}</span>`;
}
// The simulator, the event type, then OPEN or SAFE (unless the type already says it).
export function accessBadge(event) {
  // A stream: its violet badge, then the freely chosen activity.
  if (isStream(event)) { const {activity} = streamDetails(event); return `<span class="event-badge-row">${simBadge(event)}${activity ? `<span class="event-type-badge stream-activity">${esc(activity)}</span>` : ''}</span>`; }
  if (!state.eventTdz) return `<span class="event-badge-row">${simBadge(event)}</span>`;
  const safe = event.access === 'safe', type = event.details?.type || '';
  const typeBadge = type ? `<span class="event-type-badge">${esc(type)}</span>` : '';
  if (type.toLowerCase() === (safe ? 'safe' : 'open')) return `<span class="event-badge-row">${simBadge(event)}<span class="event-access-badge ${safe ? 'is-safe' : 'is-open'}">${esc(type)}</span></span>`;
  return `<span class="event-badge-row">${simBadge(event)}${typeBadge}<span class="event-access-badge ${safe ? 'is-safe' : 'is-open'}" title="${safe ? 'Réservé aux pilotes SAFE' : 'Ouvert à tous les pilotes connectés'}">${safe ? 'SAFE' : 'OPEN'}</span></span>`;
}

// « Annoncer un stream » (shared/stream.mjs): its times (« Stream 19h45 · Départ 20h00 »), the streamer's crew when he
// races it, its uploaded logo (or initials/microphone), and on its page the links to the stream and to the
// endurances.
export function streamTimes(event) {
  const {streamTime, raceTime} = streamDetails(event);
  return [streamTime && `Stream ${hourLabel(streamTime)}`, raceTime && `Départ ${hourLabel(raceTime)}`].filter(Boolean).join(' · ');
}
export function streamCrewLine(event) {
  const crew = event.streamCrew;
  return crew ? `${esc(crew.eventName)} avec l’${esc(crew.crew)}${crew.pilots.length ? ` · ${crew.pilots.map(esc).join(', ')}` : ''}` : '';
}
const streamMicrophone = () => '<span class="stream-panel" aria-hidden="true"><svg viewBox="0 0 24 24"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v4M8 22h8"/></svg></span>';
// A supplied raster logo keeps its aspect ratio; old streams retain the microphone fallback.
export function streamPanel(event) {
  const {logoUrl, streamerName} = streamDetails(event);
  if (logoUrl) return `<span class="stream-panel"><img class="stream-logo" src="${esc(logoUrl)}" alt="Logo de ${esc(streamerName || 'la chaîne')}"></span>`;
  if (streamerName) return `<span class="stream-panel"><span class="stream-initials" aria-hidden="true">${esc(streamerName.trim().split(/\s+/).map(part=>part[0]).join('').slice(0,2).toUpperCase())}</span></span>`;
  return streamMicrophone();
}
export function streamBlock(event) {
  const {raceSim, streamUrl} = streamDetails(event), crew = streamCrewLine(event);
  const watch = streamUrl ? `<a class="primary-button stream-button" href="${esc(streamUrl)}" target="_blank" rel="noopener">Regarder sur ${esc(streamPlatform(streamUrl))}</a>` : '';
  const endurance = raceSim ? `<a class="secondary-button" href="/${raceSim}/">Inscriptions endurance</a>` : '';
  return `<section class="stream-block"><p class="stream-block-copy"><strong>🎙 ${esc(streamTimes(event))}</strong>${crew ? `<small>${crew}</small>` : ''}</p>${watch || endurance ? `<span class="stream-block-actions">${watch}${endurance}</span>` : ''}</section>`;
}

// Circuit of an event: from the catalog (LMU, older iRacing events), or as typed (AMS2, iRacing, ACE).
export function eventCircuitName(event, id) {
  const sim = simForEvent(event), circuit = simCatalog(sim)?.circuits.find(item => item.id === id);
  if(sim==='acrally'&&!id)return 'Spéciales à définir';
  if (circuit) return circuit.random ? 'Circuit aléatoire' : circuit.name;
  return (sim !== 'lmu' && id) || 'Circuit à préciser';
}

// Line icons of the calendar card.
const ICONS = {
  time: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  format: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2M9 2h6M12 2v3"/>',
  fuel: '<path d="M4 21V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16M3 21h12M4 10h10M14 9h2a2 2 0 0 1 2 2v5a1.5 1.5 0 0 0 3 0V8l-3-3"/>',
  tyres: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3.5"/><path d="M12 3v5.5M12 15.5V21M3 12h5.5M15.5 12H21"/>',
  car: '<path d="M3 16v-3l2.5-5h13l2.5 5v3"/><path d="M3 16h18"/><circle cx="7.5" cy="16.5" r="2"/><circle cx="16.5" cy="16.5" r="2"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>',
};
const infoChip = (icon, value, title) => `<span class="solo-info-chip" title="${esc(title)}"><svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[icon]}</svg><span>${esc(value)}</span></span>`;
// The event's details on the calendar card: per round its sessions, weather, multipliers and car, then the
// schedule of an open session, the server password and the note.
export function soloCardInfo(event) {
  if (isStream(event)) { const crew = streamCrewLine(event); return crew ? `<span class="solo-card-info"><span class="solo-info-row"><span class="stream-crew">🏁 ${crew}</span></span></span>` : ''; }
  if(simForEvent(event)==='acrally'){
    const round=event.rounds?.[0]||{},details=event.details||{};
    return `<span class="solo-card-info"><span class="solo-info-row">${infoChip('car',round.car||round.category||'Voitures libres','Voitures autorisées')}${details.rallyEstimatedMinutes?infoChip('time',`Environ ${details.rallyEstimatedMinutes} min`,'Durée estimée de la soirée'):''}${details.note?infoChip('info',details.note,'Consignes'):''}</span></span>`;
  }
  const details = event.details || {}, rounds = event.rounds?.length ? event.rounds : [{circuit: event.circuit, durationMinutes: event.durationMinutes}];
  const roundRow = round => {
    const weather = WEATHERS.find(([value]) => value === round.weather);
    const car = [(round.categories || []).length ? '' : round.category, round.car].filter(Boolean).join(' · ');
    const chips = [
      rounds.length > 1 ? `<span class="solo-info-circuit">${esc(eventCircuitName(event, round.circuit))}</span>` : '',
      round.randomCategory ? '<span class="solo-info-chip" title="Catégorie aléatoire"><span aria-hidden="true">❓</span><span>Catégorie aléatoire</span></span>' : '',
      ...(round.categories || []).map(category => `<span class="solo-info-category" title="${esc(category)}">${logo(category)}</span>`),
      infoChip('format', roundFormat(round).replaceAll('/', ' · '), 'Essais · Qualifs · Course (min)'),
      weather ? `<span class="solo-info-chip solo-info-weather" title="Météo : ${esc(weather[2])}"><span aria-hidden="true">${weather[1]}</span><span class="sr-only">${esc(weather[2])}</span></span>` : '',
      round.fuel != null ? infoChip('fuel', `×${round.fuel}`, 'Consommation de carburant') : '',
      round.tyres != null ? infoChip('tyres', `×${round.tyres}`, 'Usure des pneus') : '',
      car ? infoChip('car', car, 'Catégorie et voiture') : '',
    ].filter(Boolean);
    return `<span class="solo-info-row">${chips.join('')}</span>`;
  };
  // Several rounds: one aligned line each (number, circuit, categories, sessions); the rest is on the event page.
  const roundLine = (round, index) => `<span class="solo-round-line"><span class="solo-round-label">Manche ${index + 1}</span><span class="solo-round-name">${esc(eventCircuitName(event, round.circuit))}</span><span class="solo-round-cats">${round.randomCategory ? '<span class="solo-info-chip" title="Catégorie aléatoire">❓</span>' : (round.categories || []).map(category => `<span class="solo-info-category" title="${esc(category)}">${logo(category)}</span>`).join('')}</span>${infoChip('format', roundFormat(round).replaceAll('/', ' · '), 'Essais · Qualifs · Course (min)')}</span>`;
  // The server password is not on the card: on the event page, for its pilots only.
  const extra = [
    details.note ? infoChip('info', details.note, 'Info') : '',
  ].filter(Boolean);
  if (rounds.length > 1) return `<span class="solo-card-info"><span class="solo-round-lines">${rounds.map(roundLine).join('')}</span>${extra.length ? `<span class="solo-info-row">${extra.join('')}</span>` : ''}</span>`;
  return `<span class="solo-card-info">${rounds.map(roundRow).join('')}${extra.length ? `<span class="solo-info-row">${extra.join('')}</span>` : ''}</span>`;
}
// Pilots doing a round (a pilot may skip one round of a multi-round event).
export function roundPilots(event, index, departure = event.departures?.[0]) {
  return (departure?.availability || []).filter(reg => reg.status !== 'unavailable' && !reg.waitlistPosition && !reg.roundWaitlist?.[index] && !reg.roundChoices?.[index]?.skip).length;
}
// Event page: every detail shown at once, one tile with its icon each (« Essais 5 min », « Usure des pneus ×1 »);
// several rounds side by side, each with its pilots.
const TILE_ICONS = {
  practice: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="2"/><path d="M12 14v7M10.2 11 3.5 9.5M13.8 11l6.7-1.5"/>',
  qualifying: '<circle cx="12" cy="14" r="7"/><path d="M12 10.5V14l2 1.5M10 3h4M12 3v4M18.5 7.5l1.5-1.5"/>',
  race: '<path d="M5 21V3"/><path d="M5 4h14v10H5z" fill="none"/><path d="M5 4h3.5v3.33H5zM12 4h3.5v3.33H12zM8.5 7.33H12v3.33H8.5zM15.5 7.33H19v3.33h-3.5zM5 10.67h3.5V14H5zM12 10.67h3.5V14H12z" fill="currentColor" stroke="none"/>',
};
// The race page shows the password only to its entered pilots.
export function canSeePassword(event) {
  return (!isGrindfest(event) && (event.departures || []).some(departure => (departure.availability || []).some(reg => reg.mine && reg.status !== 'unavailable')));
}
const detailSvg = path => `<svg viewBox="0 0 24 24" aria-hidden="true">${path}</svg>`;
const detailTile = (icon, label, value, extra = '') => value ? `<div class="solo-detail${extra}"><span class="solo-detail-icon">${icon}</span><span class="solo-detail-copy"><span class="solo-detail-label">${esc(label)}</span><strong>${value}</strong></span></div>` : '';
// The format of a round, one small frame per item: practice, qualifying and race, then weather, fuel, tyres and the
// categories; an icon, a small label and the value each.
export function roundTiles(round) {
  const weather = WEATHERS.find(([value]) => value === round.weather);
  const item = (icon, label, value) => `<span class="round-item" data-tip="${esc(label)}"><span class="round-item-icon">${icon}</span><span class="round-item-copy"><small>${esc(label)}</small><strong>${value}</strong></span></span>`;
  const minutes = value => Number(value) > 0 ? `${Number(value)} min` : '';
  const items = [
    minutes(round.practice) && item(detailSvg(TILE_ICONS.practice), 'Essais', minutes(round.practice)),
    minutes(round.qualifying) && item(detailSvg(TILE_ICONS.qualifying), 'Qualifs', minutes(round.qualifying)),
    minutes(round.durationMinutes) && item(detailSvg(TILE_ICONS.race), 'Course', minutes(round.durationMinutes)),
    weather && item(`<span class="round-item-emoji">${weather[1]}</span>`, 'Météo', esc(weather[2])),
    round.fuel != null && item(detailSvg(ICONS.fuel), 'Carburant', `×${esc(round.fuel)}`),
    round.tyres != null && item(detailSvg(ICONS.tyres), 'Pneus', `×${esc(round.tyres)}`),
    round.car && item(detailSvg(ICONS.car), 'Voiture', esc(round.car)),
    round.randomCategory ? item('<span class="round-item-emoji">❓</span>', 'Catégorie', 'Aléatoire')
      : (round.categories || []).length ? `<span class="round-item round-item-categories">${round.categories.map(category => `<span title="${esc(category)}">${logo(category)}</span>`).join('')}</span>`
      : round.category ? item(detailSvg(ICONS.car), 'Catégorie', esc(round.category)) : '',
  ].filter(Boolean);
  return items.length ? `<div class="round-info">${items.join('')}</div>` : '';
}
// Event page header: a single round shows its tiles; several rounds show theirs in their own cards, below.
// Then the note, and the password for the pilots entered.
export function soloEventDetails(event) {
  if (isStream(event)) { const {description} = streamDetails(event); return description ? `<p class="stream-description">${esc(description)}</p>` : ''; }
  if(simForEvent(event)==='acrally'){
    const details=event.details||{},round=event.rounds?.[0]||{},stages=details.rallyStages||event.rounds?.map(r=>r.circuit).filter(Boolean)||[];
    const weather=WEATHERS.find(([value])=>value===round.weather);
    return `<div class="solo-event-details"><div class="solo-detail-grid">${detailTile(detailSvg(ICONS.lock),'Lobby',event.access==='safe'?'SAFE · Privé':'OPEN · Public')}${detailTile(detailSvg(ICONS.car),'Voitures',esc(round.car||round.category||'Choix libre'))}${detailTile(detailSvg(ICONS.info),'Hôte',esc(details.rallyHost||''))}${detailTile(detailSvg(ICONS.time),'Durée estimée',details.rallyEstimatedMinutes?`Environ ${details.rallyEstimatedMinutes} min`:'')}${detailTile('☁️','Météo',esc(weather?.[2]||''))}${detailTile(detailSvg(ICONS.info),'Consignes',esc(details.note||''),' is-wide')}</div><div class="creation-card"><h3>Programme des spéciales</h3>${stages.length?`<ol>${stages.map(stage=>`<li>${esc(stage)}</li>`).join('')}</ol>`:'<p>Les spéciales seront choisies pendant la soirée.</p>'}</div></div>`;
  }
  const details = event.details || {}, rounds = event.rounds?.length ? event.rounds : [{circuit: event.circuit, durationMinutes: event.durationMinutes}];
  // Gridfest: the pilots entered get the password by Discord MP, not on the page.
  const extra=detailTile(detailSvg(ICONS.info),'Info',esc(details.note||''),' is-wide');
  return extra?`<div class="solo-event-details"><div class="solo-detail-grid solo-detail-extra">${extra}</div></div>`:'';
}
export function soloPasswordBlock(event){
  if(!isSolo(event))return '';
  const entered=(event.departures||[]).some(departure=>(departure.availability||[]).some(reg=>reg.mine&&reg.status!=='unavailable'));
  const password=canSeePassword(event)?event.details?.password:isGrindfest(event)&&entered?'Par MP Discord':'';
  return password?`<div class="solo-password-near-entry">${detailTile(detailSvg(ICONS.lock),'Mot de passe',esc(password))}</div>`:'';
}
export function soloHeaderChips(event){
  if(isGrindfest(event)||isStream(event)||simForEvent(event)==='acrally'||event.rounds?.length>1)return '';
  const round=event.rounds?.[0]||{durationMinutes:event.durationMinutes},weather=WEATHERS.find(([value])=>value===round.weather);
  const chip=(label,value)=>value?`<span class="solo-session-pill">${esc(label)} · ${esc(value)}</span>`:'';
  const minutes=value=>Number(value)>0?`${Number(value)} min`:'';
  const session=[chip('Essais',minutes(round.practice)),chip('Qualifs',minutes(round.qualifying)),chip('Course',minutes(round.durationMinutes))].join('');
  const conditions=[chip('Météo',weather?.[2]),chip('Carburant',round.fuel!=null?`×${round.fuel}`:''),chip('Pneus',round.tyres!=null?`×${round.tyres}`:'')].join('');
  const cars=chip('Voiture',round.car)||chip('Catégorie',round.randomCategory?'Aléatoire':(round.categories||[]).join(' / ')||round.category);
  return `<div class="solo-session-chips">${[session,conditions,cars].filter(Boolean).map(row=>`<div class="solo-session-row">${row}</div>`).join('')}</div>`;
}
// Above the card's details: the circuit, or the number of rounds.
export function soloCardMeta(event) {
  const rounds = event.rounds || [];
  if (isStream(event)) { const {streamerName} = streamDetails(event); return esc(streamerName ? `Avec ${streamerName} · ${streamTimes(event)}` : streamTimes(event)); }
  if(simForEvent(event)==='acrally'){const stages=event.details?.rallyStages||rounds.map(r=>r.circuit).filter(Boolean);return stages.length>1?`${stages.length} spéciales prévues`:esc(stages[0]||'Spéciales à définir');}
  return rounds.length > 1 ? `${rounds.length} manches` : esc(eventCircuitName(event, rounds[0]?.circuit ?? event.circuit));
}

export function soloCounts(event, departure) {
  const entries = (departure?.availability || []).filter(reg => reg.status !== 'unavailable');
  const waiting = entries.filter(reg => reg.waitlistPosition);
  return {entries, confirmed:entries.length - waiting.length, waiting:waiting.length, capacity:Number(event.capacity) || null};
}

// Places taken / places available, and the waiting list.
export function soloFill(event, departure = event.departures?.[0]) {
  const {confirmed, waiting, capacity} = soloCounts(event, departure);
  const ratio = capacity ? Math.min(1, confirmed / capacity) : 0;
  const full = capacity && confirmed >= capacity;
  return `<span class="solo-fill${full ? ' is-full' : ''}"><span class="solo-fill-copy"><strong>${confirmed}${capacity ? ` / ${capacity}` : ''}</strong> ${confirmed > 1 ? 'inscrits' : 'inscrit'}${waiting ? ` · <em>${waiting} en attente</em>` : ''}${full && !waiting ? ' · <em>complet</em>' : ''}</span><span class="solo-fill-bar" aria-hidden="true"><span style="width:${Math.round(ratio * 100)}%"></span></span></span>`;
}


// Why the driver cannot enter, or '' when they can.
export function soloEntryBlock(event) {
  if (!state.user) return 'Connecte-toi avec Discord pour participer.';
  if (!state.eventTdz) return can('endurance') ? '' : 'Tu n’as pas accès aux événements de cette communauté.';
  if (event.access === 'safe' && !can('solo_safe')) return 'Événement réservé aux pilotes SAFE.';
  if (!can('solo_safe') && !can('solo_open')) return 'Tu n’as pas accès aux événements de cette communauté.';
  return '';
}

// A SAFE event, the pilot is not SAFE: a button to the Discord channel that explains how to become SAFE.
export function safeGuideLink(event) {
  if (event.access !== 'safe' || can('solo_safe') || !state.safeGuideUrl || !state.user) return '';
  return `<a class="planning-quick-button is-labelled is-safe-guide" href="${esc(state.safeGuideUrl)}" target="_blank" rel="noopener"><span class="planning-quick-label">Comment devenir SAFE</span></a>`;
}

export function myWaitlistPosition(departure) {
  return (departure.availability || []).find(reg => reg.mine && reg.waitlistPosition)?.waitlistPosition || null;
}


// Participants of a solo race: the grid, then the waiting list, in order of arrival.
export function renderSoloEntries(event, departure) {
  const {entries} = soloCounts(event, departure);
  return soloEntryList(event, departure, entries, {title: 'Participants', capacity: event.capacity});
}
// The pilots of a solo event (or of one of its rounds), all together: by category in the order of the round
// (« Peu importe » last), then in the order they entered; small cards with the category logo (no car).
const EDIT_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4ZM14 6l4 4"/></svg>';
export function soloEntryList(event, departure, entries, {round = 0, title = 'Pilotes', capacity = null, waitOf = reg => reg.waitlistPosition} = {}) {
  const current = (event.rounds || [])[round] || {}, order = current.randomCategory ? [] : current.categories?.length ? current.categories : event.categories || [];
  const categoryOf = reg => current.randomCategory ? '' : (reg.roundChoices?.[round]?.category ?? reg.category) || '';
  const edit = reg => reg.canEdit && departure.startsAt > Date.now() && reg.managed ? `<button type="button" class="solo-entry-edit" data-action="edit-registration" data-id="${reg.id}" data-departure="${departure.id}" data-tip="Modifier" aria-label="Modifier l’inscription de ${esc(reg.name)}">${EDIT_ICON}</button>` : '';
  const pill = (reg, rank, withLogo) => `<li class="solo-entry${reg.mine ? ' is-mine' : ''}"><span class="solo-entry-rank">${rank}</span><strong class="solo-entry-name" ${pilotNameTip(reg)}>${esc(reg.name)}${isGrindfest(event)?`<small class="gridfest-game-name">${reg.gameName?esc(reg.gameName):'Nom en jeu manquant'}</small>`:''}</strong>${!withLogo || !categoryOf(reg) ? '' : categoryOf(reg) === ANY_CATEGORY ? '<span class="solo-entry-logo is-any" title="Peu importe">✱</span>' : `<span class="solo-entry-logo" title="${esc(categoryOf(reg))}">${logo(categoryOf(reg))}</span>`}${edit(reg)}</li>`;
  const grid = entries.filter(reg => !waitOf(reg)), waiting = entries.filter(reg => waitOf(reg)).sort((a, b) => waitOf(a) - waitOf(b));
  // One list, sorted by category (each pilot with its logo), then by order of entry.
  const keys = [...order, ANY_CATEGORY, ''], rankOf = reg => { const index = keys.indexOf(categoryOf(reg)); return index < 0 ? keys.length : index; };
  const sorted = grid.map((reg, index) => [reg, index]).sort((a, b) => rankOf(a[0]) - rankOf(b[0]) || a[1] - b[1]).map(([reg]) => reg);
  const gridList = sorted.length ? `<ol class="solo-entries">${sorted.map((reg, index) => pill(reg, index + 1, true)).join('')}</ol>` : '<p class="empty">Aucun inscrit pour l’instant.</p>';
  const waitingList = waiting.length ? `<h3 class="solo-subtitle">Liste d’attente <span class="count-pill">${waiting.length}</span></h3><ol class="solo-entries is-waiting">${waiting.map(reg => pill(reg, waitOf(reg), true)).join('')}</ol>` : '';
  return `<section class="solo-participants"><h3 class="solo-subtitle">${title} <span class="count-pill">${grid.length}${capacity ? ` / ${capacity}` : ''}</span></h3>${gridList}${waitingList}</section>`;
}

export const WEATHERS = [['random','❓','Aléatoire'],['sun','☀️','Soleil'],['cloud','⛅','Nuageux'],['overcast','☁️','Couvert'],['rain','🌧️','Pluie']];
// « P5/Q10/C40 »: the session lengths of a round.
export function roundFormat(round) {
  return [round.practice ? `P${round.practice}` : '', round.qualifying ? `Q${round.qualifying}` : '', `C${round.durationMinutes}`].filter(Boolean).join('/');
}
export function roundExtras(round) {
  const weather = WEATHERS.find(([value]) => value === round.weather)?.[1];
  return [weather, round.fuel != null ? `carburant ×${round.fuel}` : '', round.tyres != null ? `usure pneus ×${round.tyres}` : ''].filter(Boolean).join(' · ');
}

