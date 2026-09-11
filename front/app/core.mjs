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
  drafts:{}, recoveryLink:'', busy:false, participants:[], flash:'', eventFilter:'upcoming',
  selectedDepartureId:null, eventSection:'race', pilotName:'', registrationOpen:new Set(), crewManagementOpen:new Set()
};
try { state.pilotName = localStorage.getItem('fmt_pilot_name') || ''; } catch {}

export const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const canManage = () => ['admin','organizer'].includes(state.user?.role);
export const isAdmin = () => state.user?.role === 'admin';

export function notifyRender() {
  queueMicrotask(() => document.dispatchEvent(new CustomEvent('endurance:render',{detail:{page:state.page,eventId:state.currentEventId}})));
}
export function notifyNav() { queueMicrotask(() => document.dispatchEvent(new CustomEvent('endurance:nav'))); }

export function logo(category) {
  const config = categories[category];
  return config?.image ? `<img class="category-logo" src="/images/${esc(config.image)}" alt="">` : `<span class="category-text-logo" aria-hidden="true">${esc(category)}</span>`;
}
export function badge(category) { return `<span class="event-category-badge ${categories[category]?.css || ''}">${logo(category)}<span>${esc(category)}</span></span>`; }
export function eventTypeBadge(type) { const item = EVENT_TYPES[type] || EVENT_TYPES.private; return `<span class="event-type-badge ${item.css}">${esc(item.label)}</span>`; }
export function eventCategoryCount(event, category) { return event.departures.reduce((sum,departure) => sum + departure.availability.filter(reg => reg.category === category && reg.status !== 'unavailable').length,0); }
export function eventBadge(category,count) { return `<span class="event-category-badge ${categories[category]?.css || ''}">${logo(category)}<span class="event-category-copy"><strong>${esc(category)}</strong><small>${count} inscrit${count > 1 ? 's' : ''}</small></span></span>`; }
export function pilotCount(registrations) { return new Set(registrations.filter(reg => reg.status !== 'unavailable').map(reg => reg.participantId || reg.id)).size; }
export function circuitInfo(id) { return CIRCUITS.find(circuit => circuit.id === id) || null; }
export function circuitLabel(id) { return circuitInfo(id)?.name || 'Circuit à préciser'; }
export function circuitVisual(id, compact = false) {
  const circuit = circuitInfo(id); if (!circuit) return '';
  const map = circuitMapConfig(id);
  const src = map ? circuitMapSource(map.file) : `/images/circuits/${circuit.file}`;
  const attrs = map ? ` data-circuit-source="commons" data-circuit-map="${esc(map.key)}" style="--circuit-scale:${map.scale};--circuit-x:${map.x}%;--circuit-y:${map.y}%;--circuit-mobile-scale:${map.mobileScale};--circuit-mobile-x:${map.mobileX}%;--circuit-mobile-y:${map.mobileY}%"` : '';
  return `<span class="circuit-visual ${compact ? 'compact' : ''}"><img data-circuit="${esc(circuit.id)}" src="${esc(src)}" alt="Plan du ${esc(circuit.name)}" loading="lazy"${attrs}></span>`;
}
export function button(action,label,extra='',css='secondary-button') { return `<button type="button" class="${css}" data-action="${action}" ${extra}>${label}</button>`; }

export function carPreferenceChoices(category, selected=[], any=false) {
  const values = Array.isArray(selected) ? selected : selected ? [selected] : [];
  return `<fieldset class="car-preference-panel"><legend class="form-label">Voiture(s) souhaitée(s)</legend><label class="car-any-option"><input type="checkbox" name="carAny" ${any?'checked':''}><span>Peu importe la voiture</span></label><div class="car-preference-grid">${(CARS[category]||[]).map(car => `<label class="car-preference-option"><input type="checkbox" name="carPreference" value="${esc(car)}" ${values.includes(car)&&!any?'checked':''} ${any?'disabled':''}><span>${esc(car)}</span></label>`).join('')}</div><p class="car-preference-help">Choisis un ou plusieurs modèles, ou coche « Peu importe la voiture ». Ces souhaits aident les organisateurs à former les équipages.</p></fieldset>`;
}
export function registrationCarLabel(reg) { return reg.carAny ? 'N’importe quelle voiture' : ((reg.cars?.length ? reg.cars.join(' · ') : reg.car) || 'Pas de préférence'); }
export function pilotAvailability(reg,departure,duration) { return departure ? `<div class="crew-pilot-availability"><span class="crew-pilot-availability-label">Disponibilité</span>${renderAvailabilityTimeline({departure,duration,status:reg.status,label:`Disponibilités de ${reg.name || 'ce pilote'}`})}</div>` : ''; }
export function pilotWishes(reg,departure=null,duration=0) { return `<dl class="pilot-wishes"><div><dt>Voiture(s) souhaitée(s)</dt><dd>${esc(registrationCarLabel(reg))}</dd></div><div><dt>Coéquipier souhaité</dt><dd>${esc(reg.preferredPilot || 'Aucune préférence renseignée')}</dd></div></dl>${departure&&duration?pilotAvailability(reg,departure,duration):''}`; }
export function crewColorClass(crewId,index=null) { if (index != null) return `crew-palette-${index%10}`; let hash=0; for (const char of String(crewId||'')) hash=(hash*31+char.charCodeAt(0))>>>0; return `crew-palette-${hash%10}`; }
export function coversHour(reg,index) { return reg.status === 'whole' || String(reg.status||'').split(',').includes(`h${index+1}`); }

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
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
    if (navigator.sendBeacon) {
      const blob=new Blob([payload],{type:'text/plain;charset=UTF-8'});
      if (navigator.sendBeacon('/telemetry/client-error',blob)) return;
    }
    fetch('/telemetry/client-error',{method:'POST',credentials:'same-origin',cache:'no-store',keepalive:true,headers:{'Content-Type':'text/plain;charset=UTF-8'},body:payload}).catch(()=>{});
  } catch {}
}
function xhrApi(path,method,data) {
  return new Promise((resolve,reject) => {
    const request = new XMLHttpRequest();
    request.open(method,path,true);
    request.withCredentials=true;
    request.setRequestHeader('Accept','application/json');
    if (method !== 'GET') request.setRequestHeader('Content-Type','application/json');
    request.onload=()=>{
      let result;
      try { result=JSON.parse(request.responseText || '{}'); }
      catch { const error=Error(diagnosticMessage(path,method,'réponse XHR illisible',`statut ${request.status}`)); reportClientError({path,method,message:error.message,detail:`xhr status ${request.status}`}); reject(error); return; }
      if (request.status < 200 || request.status >= 300) { reject(Error(result.error || `Cette action a échoué (${request.status}).`)); return; }
      resolve(result);
    };
    request.onerror=()=>{const error=Error(diagnosticMessage(path,method,'fetch ×2 + secours XHR en échec','statut XHR 0'));reportClientError({path,method,message:error.message,detail:'fetch x2 + xhr error status 0'});reject(error);};
    request.ontimeout=()=>{const error=Error(diagnosticMessage(path,method,'fetch ×2 + secours XHR expiré','délai 12 s'));reportClientError({path,method,message:error.message,detail:'xhr timeout 12s'});reject(error);};
    request.timeout=12000;
    request.send(method==='GET'?null:JSON.stringify(data||{}));
  });
}
export async function api(path,method='GET',data) {
  let lastNetworkError='';
  for (let attempt=0;attempt<2;attempt++) {
    try {
      const response = await fetch(path,{method,credentials:'same-origin',cache:'no-store',headers:method==='GET'?{'Accept':'application/json'}:{'Accept':'application/json','Content-Type':'application/json'},body:method==='GET'?undefined:JSON.stringify(data||{})});
      let result; try { result=await response.json(); } catch { throw Error(`Le service partagé ne répond pas correctement (${method} ${path}, statut ${response.status}).`); }
      if (!response.ok) throw Error(result.error || `Cette action a échoué (${response.status}).`);
      return result;
    } catch (error) {
      if (!networkFailure(error)) throw error;
      lastNetworkError=String(error?.message || error || 'erreur réseau').slice(0,120);
      if (attempt===0) await wait(250);
    }
  }
  try { return await xhrApi(path,method,data); }
  catch (error) {
    if (/Diagnostic :/.test(String(error?.message || ''))) throw error;
    const wrapped=Error(diagnosticMessage(path,method,'secours XHR en échec',lastNetworkError ? `fetch : ${lastNetworkError}` : ''));
    reportClientError({path,method,message:wrapped.message,detail:lastNetworkError});
    throw wrapped;
  }
}
export async function load() {
  const session = await api('/api/session');
  const result = await api('/api/events');
  state.user=session.user;
  state.discordReady=session.discordReady;
  state.events=(Array.isArray(result.events)?result.events:[]).filter(event => gameForEvent(event) === activeGame);
  state.participants=state.user ? (await api('/api/participants')).participants : [];
  if (state.user && !state.pilotName) state.pilotName=state.user.name.slice(0,30);
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
