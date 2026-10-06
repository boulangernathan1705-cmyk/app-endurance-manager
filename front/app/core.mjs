import {CATEGORIES, EVENT_TYPES, CIRCUITS, categories, CARS, gameForEvent} from '../../shared/catalog.mjs';
import {countdown, dateLabel, groupEvents} from '../schedule.mjs';
import {renderAvailabilityTimeline} from '../timeline.mjs';
import {circuitMapConfig, circuitMapSource} from '../../shared/circuit-maps.mjs';

export {CATEGORIES, EVENT_TYPES, CIRCUITS, categories, CARS, countdown, dateLabel, groupEvents, renderAvailabilityTimeline};

export const app = document.getElementById('app');
export const nav = document.getElementById('navigation');
export const activeGame = globalThis.__ENDURANCE_GAME__ === 'iracing' ? 'iracing' : 'lmu';

export const state = {
  events:[], user:null, discordReady:false, currentEventId:null, page:'home', editingEvent:null,
  access:'anonymous', permissions:[], community:null, platformDiscordUrl:null,
  drafts:{}, busy:false, participants:[], flash:'', eventFilter:'upcoming', listFormat:'endurance', soloLabel:'EVENT TDZ', eventTypes:[], soloRaces:false, training:false, trainingRace:false,
  selectedDepartureId:null, eventSection:'race', pilotName:'', registrationOpen:new Set(), crewManagementOpen:new Set(),
  pendingCrewJoin:null, archiveLoaded:false, participantsLoaded:false
};
try { state.pilotName = localStorage.getItem('em_pilot_name') || ''; } catch {}

export const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
// Permissions of the player in this community (their Discord roles, server/access.mjs).
export const can = permission => Boolean(state.permissions?.includes(permission));
export const canManage = () => can('create_race') || can('manage_races');
export const isAdmin = () => can('admin');
// Important actions name the community they apply to (a player may belong to several).
export const inCommunity = () => state.community?.name && !state.openSite ? `\n\nCommunauté : ${state.community.name}` : '';
// An official race (common to every community) is changed by the platform managers only.
export const canEditRace = event => event?.official ? state.manager === true : can('manage_races') || (can('create_race') && Boolean(event?.createdByMe));
// Community of an entry or a crew on an official race (common to every community): its Discord logo, or its short
// name (FMT, TDZ…) in its colour.
export const communityTag = item => {
  const community = item?.community;
  if (!community) return '';
  const tip = `data-tip="Communauté ${esc(community.name)}" aria-label="Communauté ${esc(community.name)}"`;
  return community.logoUrl
    ? `<span class="community-tag has-logo" ${tip}><img src="${esc(community.logoUrl)}" alt=""></span>`
    : `<span class="community-tag" style="--tag:${esc(community.accent || '#8e9996')}" ${tip}>${esc(String(community.shortName || community.name).slice(0, 4))}</span>`;
};
// Short label of a community in a text (tooltip): « [FMT] Leo ».
export const communityPrefix = item => item?.community ? `[${String(item.community.shortName || item.community.name).slice(0, 4)}] ` : '';
// Communities the player may enter an official race with (the site's first).
export const entryCommunities = () => {
  const list = (state.communities || []).filter(item => item.id);
  const here = list.find(item => item.id === state.community?.id);
  return here ? [here, ...list.filter(item => item !== here)] : list;
};
// Choice of the community, first step of an entry or a crew on an official race: one button per community.
export function communityChoice(options, {action, attrs = '', selected = '', title = 'Avec quelle communauté ?', help = ''}) {
  return `<div class="community-choice"><span class="form-label">${esc(title)}</span>${help ? `<p class="registration-step-help">${esc(help)}</p>` : ''}<div class="community-choice-list">${options.map(item => `<button type="button" class="community-choice-button${item.id === selected ? ' active' : ''}" data-action="${action}" data-community="${esc(item.id)}" ${attrs} aria-pressed="${item.id === selected}">${item.logoUrl ? `<img src="${esc(item.logoUrl)}" alt="">` : `<span class="community-choice-short" style="--tag:${esc(item.accent || '#8e9996')}">${esc(String(item.shortName || item.name).slice(0, 4))}</span>`}<strong>${esc(item.name)}</strong></button>`).join('')}</div></div>`;
}
export const officialBadge = event => event?.official ? '<span class="official-badge" data-tip="Course officielle : commune à toutes les communautés. Tu y vois les inscrits de toutes tes communautés.">Officielle</span>' : '';

export function notifyRender() {
  // The page shown (home, event, my-entries) on <html>: the race page has a thin banner.
  document.documentElement.dataset.view = state.page;
  queueMicrotask(() => document.dispatchEvent(new CustomEvent('endurance:render',{detail:{page:state.page,eventId:state.currentEventId,list:state.listFormat}})));
}
export function notifyNav() { queueMicrotask(() => document.dispatchEvent(new CustomEvent('endurance:nav'))); }

export function logo(category) {
  const config = categories[category];
  return config?.image ? `<img class="category-logo" src="/images/${esc(config.image)}" alt="">` : `<span class="category-text-logo" aria-hidden="true">${esc(category)}</span>`;
}
export function badge(category) { return `<span class="event-category-badge ${categories[category]?.css || ''}">${logo(category)}<span>${esc(category)}</span></span>`; }
// Info bubbles (data-tip, see front/tooltip.mjs) of the race badges.
const EVENT_TYPE_TIPS = {special:'Course officielle ponctuelle, souvent sur un week-end, avec ses propres créneaux de départ.', lmu:'Manche du championnat officiel de Le Mans Ultimate.', private:'Course organisée par ta communauté.'};
export function eventTypeBadge(type) { const key = EVENT_TYPES[type] ? type : 'private', item = EVENT_TYPES[key]; return `<span class="event-type-badge ${item.css}" data-tip="${esc(EVENT_TYPE_TIPS[key] || '')}">${esc(item.label)}</span>`; }
export function schedulePendingBadge(event) { return event?.schedulePending ? '<span class="event-schedule-badge" data-tip="Les horaires officiels ne sont pas encore connus : inscris-toi et forme ton équipage, chacun choisira son départ quand ils seront publiés.">Horaires à confirmer</span>' : ''; }
// Pilots of a category on the whole race: a pilot entered on several starts counts once.
export function eventCategoryCount(event, category) { return pilotCount(event.departures.flatMap(departure => departure.availability.filter(reg => reg.category === category))); }
export function eventBadge(category,count) { return `<span class="event-category-badge ${categories[category]?.css || ''}" data-tip="${count} pilote${count > 1 ? 's' : ''} inscrit${count > 1 ? 's' : ''} en ${esc(category)}, tous départs confondus.">${logo(category)}<span class="event-category-copy"><strong>${esc(category)}</strong><small>${count} inscrit${count > 1 ? 's' : ''}</small></span></span>`; }
export function pilotCount(registrations) { return new Set(registrations.filter(reg => reg.status !== 'unavailable').map(reg => reg.participantId || reg.id)).size; }
export function circuitInfo(id) { return CIRCUITS.find(circuit => circuit.id === id) || null; }
export function circuitLabel(id) { return circuitInfo(id)?.name || 'Circuit à préciser'; }
export function circuitVisual(id, compact = false) {
  const circuit = circuitInfo(id); if (!circuit) return '';
  const map = circuitMapConfig(id);
  const src = map ? circuitMapSource(map.file) : `/images/circuits/${circuit.file}`;
  const attrs = map ? ` data-circuit-source="commons" data-circuit-map="${esc(map.key)}" style="--circuit-scale:${map.scale};--circuit-x:${map.x}%;--circuit-y:${map.y}%;--circuit-mobile-scale:${map.mobileScale};--circuit-mobile-x:${map.mobileX}%;--circuit-mobile-y:${map.mobileY}%"` : '';
  return `<span class="circuit-visual ${compact ? 'compact' : ''}" data-tip="${esc(circuit.name)}"><img data-circuit="${esc(circuit.id)}" src="${esc(src)}" alt="Plan du ${esc(circuit.name)}" loading="lazy"${attrs}></span>`;
}
export function button(action,label,extra='',css='secondary-button') { return `<button type="button" class="${css}" data-action="${action}" ${extra}>${label}</button>`; }

export function carPreferenceChoices(category, selected=[], any=false) {
  const values = Array.isArray(selected) ? selected : selected ? [selected] : [];
  return `<fieldset class="car-preference-panel"><legend class="form-label">Voiture(s) souhaitée(s)</legend><label class="car-any-option" data-tip="Tu t’adaptes à la voiture que choisira ton équipage."><input type="checkbox" name="carAny" ${any?'checked':''}><span>Peu importe la voiture</span></label><div class="car-preference-grid">${(CARS[category]||[]).map(car => `<label class="car-preference-option"><input type="checkbox" name="carPreference" value="${esc(car)}" ${values.includes(car)&&!any?'checked':''} ${any?'disabled':''}><span>${esc(car)}</span></label>`).join('')}</div><p class="car-preference-help">Choisis un ou plusieurs modèles, ou coche « Peu importe la voiture ». Ces souhaits aident à former les équipages.</p></fieldset>`;
}
export function registrationCarLabel(reg) { return reg.carAny ? 'N’importe quelle voiture' : ((reg.cars?.length ? reg.cars.join(' · ') : reg.car) || 'Pas de préférence'); }
export function pilotAvailability(reg,departure,duration) { return departure ? `<div class="crew-pilot-availability"><span class="crew-pilot-availability-label">Disponibilité</span>${renderAvailabilityTimeline({departure,duration,status:reg.status,label:`Disponibilités de ${reg.name || 'ce pilote'}`})}</div>` : ''; }
export function pilotWishes(reg,departure=null,duration=0) { return `<dl class="pilot-wishes"><div><dt>Voiture(s) souhaitée(s)</dt><dd>${esc(registrationCarLabel(reg))}</dd></div><div><dt>Coéquipier souhaité</dt><dd>${esc(reg.preferredPilot || 'Aucune préférence renseignée')}</dd></div></dl>${departure&&duration?pilotAvailability(reg,departure,duration):''}`; }
// Crews of a departure in display order (category order of the event, then name); the position gives the crew its color.
export function sortedCrews(event,departure){return [...(departure.crews||[])].sort((a,b)=>event.categories.indexOf(a.category)-event.categories.indexOf(b.category)||String(a.name).localeCompare(String(b.name),'fr',{sensitivity:'base',numeric:true}));}
export function crewColorClass(crewId,index=null) { if (index != null) return `crew-palette-${index%10}`; let hash=0; for (const char of String(crewId||'')) hash=(hash*31+char.charCodeAt(0))>>>0; return `crew-palette-${hash%10}`; }
export function coversHour(reg,index) { return reg.status === 'whole' || String(reg.status||'').split(',').includes(`h${index+1}`); }

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const tick = () => typeof performance !== 'undefined' ? performance.now() : Date.now();
function networkFailure(error) {
  return error instanceof TypeError || /networkerror|failed to fetch|load failed/i.test(String(error?.message || error || ''));
}
function onlineLabel() {
  return typeof navigator === 'undefined' ? 'inconnu' : (navigator.onLine ? 'oui' : 'non');
}
function diagnosticMessage(path,method,stage,extra='') {
  return `Connexion au service impossible. Diagnostic : ${method} ${path} · ${stage} · navigateur en ligne : ${onlineLabel()}${extra ? ` · ${extra}` : ''}`;
}
function reportClientError({kind='network',path='',method='',message='',detail=''}) {
  try {
    const payload=JSON.stringify({kind,page:location.pathname.slice(0,160),apiPath:String(path).slice(0,160),method:String(method).slice(0,12),message:String(message).slice(0,500),detail:String(detail).slice(0,1000),userAgent:navigator.userAgent.slice(0,500),viewport:`${innerWidth}x${innerHeight}`,online:navigator.onLine!==false});
    // One report per error: the beacon when the browser accepts it, a keepalive fetch otherwise.
    try { if (navigator.sendBeacon?.('/telemetry/client-error',new Blob([payload],{type:'text/plain;charset=UTF-8'}))) return; } catch {}
    fetch('/telemetry/client-error',{method:'POST',credentials:'same-origin',cache:'no-store',keepalive:true,headers:{'Content-Type':'text/plain;charset=UTF-8'},body:payload}).catch(()=>{});
  } catch {}
}
function xhrApi(path,method,data,priorDetail='') {
  return new Promise((resolve,reject) => {
    const started=tick();
    const request = new XMLHttpRequest();
    request.open(method,path,true);
    request.withCredentials=true;
    request.setRequestHeader('Accept','application/json');
    if (method !== 'GET') request.setRequestHeader('Content-Type','application/json');
    request.onload=()=>{
      const elapsed=Math.round(tick()-started);
      let result;
      try { result=JSON.parse(request.responseText || '{}'); }
      catch { const error=Error(diagnosticMessage(path,method,'réponse XHR illisible',`statut ${request.status} · ${elapsed} ms · ${request.responseText?.length||0} caractères`)); reportClientError({path,method,message:error.message,detail:`${priorDetail}; xhr status ${request.status}; ${elapsed}ms; chars ${request.responseText?.length||0}`}); reject(error); return; }
      if (request.status < 200 || request.status >= 300) { reject(Error(result.error || `Cette action a échoué (${request.status}).`)); return; }
      resolve(result);
    };
    request.onerror=()=>{const elapsed=Math.round(tick()-started);const error=Error(diagnosticMessage(path,method,'fetch ×2 + secours XHR en échec',`statut XHR 0 · ${elapsed} ms`));reportClientError({path,method,message:error.message,detail:`${priorDetail}; xhr error status 0; ${elapsed}ms`});reject(error);};
    request.ontimeout=()=>{const elapsed=Math.round(tick()-started);const error=Error(diagnosticMessage(path,method,'fetch ×2 + secours XHR expiré',`délai 12 s · ${elapsed} ms`));reportClientError({path,method,message:error.message,detail:`${priorDetail}; xhr timeout; ${elapsed}ms`});reject(error);};
    request.timeout=12000;
    request.send(method==='GET'?null:JSON.stringify(data||{}));
  });
}
export async function api(path,method='GET',data) {
  const attempts=[];
  // Only reads are tried again: a creation whose answer was lost may already be saved (no duplicate race).
  const tries=method==='GET'?2:1;
  for (let attempt=0;attempt<tries;attempt++) {
    const started=tick();
    try {
      const response = await fetch(path,{method,credentials:'same-origin',cache:'no-store',headers:method==='GET'?{'Accept':'application/json'}:{'Accept':'application/json','Content-Type':'application/json'},body:method==='GET'?undefined:JSON.stringify(data||{})});
      const elapsed=Math.round(tick()-started);
      const text=await response.text();
      const bytes=new TextEncoder().encode(text).length;
      let result;
      try { result=JSON.parse(text); }
      catch { const error=Error(`Le service partagé ne répond pas correctement (${method} ${path}, statut ${response.status}, ${bytes} octets).`);reportClientError({path,method,message:error.message,detail:`fetch ${attempt+1}; ${elapsed}ms; status ${response.status}; ${bytes} bytes; server ${response.headers.get('X-Endurance-Approx-Bytes')||'n/a'}`});throw error; }
      if (!response.ok) throw Error(result.error || `Cette action a échoué (${response.status}).`);
      return result;
    } catch (error) {
      const elapsed=Math.round(tick()-started);
      if (!networkFailure(error)) throw error;
      attempts.push(`fetch ${attempt+1}: ${elapsed}ms ${String(error?.message || error || 'erreur réseau').slice(0,90)}`);
      if (attempt+1<tries) await wait(250);
    }
  }
  const priorDetail=attempts.join(' | ');
  if (method!=='GET') {
    const error=Error('Connexion au service impossible : ta demande n’a peut-être pas été enregistrée. Actualise la page pour vérifier avant de réessayer.');
    reportClientError({path,method,message:diagnosticMessage(path,method,'envoi en échec, non renvoyé'),detail:priorDetail});
    throw error;
  }
  try { return await xhrApi(path,method,data,priorDetail); }
  catch (error) {
    if (/Diagnostic :/.test(String(error?.message || ''))) throw error;
    const wrapped=Error(diagnosticMessage(path,method,'secours XHR en échec',priorDetail));
    reportClientError({path,method,message:wrapped.message,detail:priorDetail});
    throw wrapped;
  }
}
async function fetchEvents(scope) {
  const result = await api(`/api/races?game=${encodeURIComponent(activeGame)}&scope=${scope}`);
  return (Array.isArray(result.events)?result.events:[]).filter(event => event.format === 'solo' || gameForEvent(event) === activeGame);
}
// Common start of a race whose time is not known yet ("Horaire à définir"): its time reads "à définir"
// everywhere; the stored time stays in departure.clock (event form).
function markUndefinedStarts(events) {
  for (const event of events) for (const departure of event.departures || []) {
    // Also every start of a race marked "Horaires à confirmer": its time is only a placeholder.
    if ((departure.tbd || event.schedulePending) && !departure.clock) { departure.clock = departure.time; departure.time = 'à définir'; departure.hideClock = true; }
  }
  return events;
}
// Official slots a crew or a pilot of the common start can pick.
export function pickableSlots(event, departure) {
  if (!departure?.tbd) return [];
  return (event.departures || []).filter(item => !item.tbd && item.startsAt > Date.now());
}
function mergeEvents(...lists) {
  const byId=new Map();
  for (const event of lists.flat()) byId.set(event.id,event);
  return [...byId.values()];
}
// Only upcoming races are loaded at start and on every refresh; the archive is fetched
// the first time it is needed (Archivés filter, link to a past race) and then kept fresh.
export async function load() {
  // The community is only open to the members of its Discord server: nothing else is loaded otherwise.
  const session = await api('/api/session');
  state.access=session.access; state.permissions=session.permissions||[]; state.manager=session.manager===true; state.community=session.community||null; state.communities=Array.isArray(session.communities)?session.communities:[]; state.openSite=session.openSite===true; state.platformDiscordUrl=session.platformDiscordUrl||null;
  const member = session.access === 'member';
  const [upcoming,archived] = member ? await Promise.all([fetchEvents('upcoming'), state.archiveLoaded ? fetchEvents('archived') : []]) : [[],[]];
  const userChanged=(session.user?.id||null)!==(state.user?.id||null);
  state.user=session.user;
  state.discordReady=session.discordReady;
  // Solo races and SAFE drivers only where the site enables them (dev for now).
  state.soloRaces=session.soloRaces===true;
  if (typeof session.soloLabel==='string' && session.soloLabel) state.soloLabel=session.soloLabel;
  state.eventTypes=Array.isArray(session.eventTypes)?session.eventTypes:[];
  state.training=session.training===true; state.trainingRace=session.trainingRace===true;
  state.safeGuideUrl=typeof session.safeGuideUrl==='string'?session.safeGuideUrl:'';
  if (!state.soloRaces) state.listFormat='endurance';
  state.events=markUndefinedStarts(mergeEvents(upcoming,archived));
  // The members list rarely changes: fetch it once per session instead of on every refresh.
  if (userChanged || !state.participantsLoaded) {
    state.participants=state.user && member ? (await api('/api/participants')).participants : [];
    state.participantsLoaded=true;
  }
  if (state.user && !state.pilotName) state.pilotName=state.user.name.slice(0,32);
}
export async function loadArchive() {
  if (state.archiveLoaded) return;
  const archived = await fetchEvents('archived');
  state.events=markUndefinedStarts(mergeEvents(state.events,archived));
  state.archiveLoaded=true;
}

export function showError(error) {
  const message = error?.message || String(error || 'Action impossible.');
  document.querySelector('[data-ux-error-modal]')?.remove();
  const overlay=document.createElement('div');
  overlay.className='ux-error-overlay'; overlay.dataset.uxErrorModal='true';
  overlay.innerHTML=`<section class="ux-error-dialog" role="alertdialog" aria-modal="true" aria-labelledby="ux-error-title" aria-describedby="ux-error-message"><span class="ux-error-icon" aria-hidden="true">!</span><h2 id="ux-error-title">Action impossible</h2><p id="ux-error-message">${esc(message)}</p><button type="button" class="primary-button" data-action="dismiss-error">OK, j’ai compris</button></section>`;
  document.body.append(overlay); overlay.querySelector('button')?.focus();
}

addEventListener('error',event=>{if(event.error||event.message)reportClientError({kind:'javascript',message:event.message||event.error?.message||'Erreur JavaScript',detail:event.error?.stack||`${event.filename||''}:${event.lineno||0}:${event.colno||0}`});});
addEventListener('unhandledrejection',event=>{const reason=event.reason;reportClientError({kind:'promise',message:reason?.message||String(reason||'Promise rejetée'),detail:reason?.stack||''});});