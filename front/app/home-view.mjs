import {app,nav,state,esc,button,canManage,eventTypeBadge,eventBadge,eventCategoryCount,pilotCount,circuitVisual,dateLabel,countdown,groupEvents,notifyRender,notifyNav} from './core.mjs?v=13-tondeuz-tool';
import {getLocale,localeTag} from '../i18n.mjs';
import {communityById} from './organization-context.mjs?v=13-tondeuz-tool';

const compactDateFormatter=new Intl.DateTimeFormat(localeTag(),{timeZone:'Europe/Paris',day:'2-digit',month:'2-digit'});
const CREW_COLORS=['#52d3d8','#f3b33d','#ec5b67','#75d66b','#8b7cf6','#e47adf','#58a6ff','#f28f45'];

function compactDateRange(departures=[]){
  const dated=departures.filter(d=>Number.isFinite(Number(d.startsAt))).sort((a,b)=>Number(a.startsAt)-Number(b.startsAt));
  if(!dated.length)return'Date à confirmer';
  const labels=[...new Set(dated.map(d=>compactDateFormatter.format(new Date(Number(d.startsAt)))))];
  return labels.length===1?labels[0]:`${labels[0]}–${labels.at(-1)}`;
}
function displayTime(value){const match=String(value||'').match(/^(\d{1,2}):(\d{2})$/);if(!match)return String(value||'').trim();if(getLocale()==='en')return`${String(Number(match[1])).padStart(2,'0')}:${match[2]}`;return match[2]==='00'?`${Number(match[1])}h`:`${Number(match[1])}h${match[2]}`;}
function hasRegisteredPilot(departure){return (departure?.availability||[]).some(reg=>reg.status!=='unavailable');}
function registeredRaceStatus(event,now=Date.now()){
  const departures=[...(event.departures||[])].filter(d=>Number.isFinite(Number(d.startsAt))&&hasRegisteredPilot(d)).sort((a,b)=>Number(a.startsAt)-Number(b.startsAt));
  return {next:departures.find(d=>Number(d.startsAt)>now)||null};
}
function activeCommunity(){return communityById(state.organizations,state.activeCommunityId);}
function contextEvents(){
  const communityId=state.activeCommunityId;
  return (state.events||[]).filter(event=>!event.organizationId||!communityId||event.organizationId===communityId);
}
function canManageContext(){
  const community=activeCommunity();
  if(community)return state.user?.role==='admin'||['owner','manager'].includes(community.role);
  return canManage();
}
function initials(name){
  return String(name||'EM').split(/\s+/).filter(Boolean).slice(0,2).map(part=>part[0]).join('').toUpperCase();
}
function communityMark(community,css=''){
  const logo=community?.branding?.logoUrl;
  return logo
    ? `<span class="community-context-mark ${css}"><img src="${esc(logo)}" alt="" loading="lazy" referrerpolicy="no-referrer"></span>`
    : `<span class="community-context-mark is-fallback ${css}" aria-hidden="true">${esc(initials(community?.name||'Endurance Manager'))}</span>`;
}


function communityIdentity(){
  const community=activeCommunity();
  if(!community)return'';
  const brand=community.branding||{};
  const style=brand.accentColor?` style="--community-accent:${esc(brand.accentColor)}"`:'';
  return `<section class="community-home-identity"${style}>
    ${brand.bannerUrl?`<img class="community-home-banner" src="${esc(brand.bannerUrl)}" alt="" loading="eager" referrerpolicy="no-referrer">`:''}
    <span class="community-home-shade" aria-hidden="true"></span>
    <div class="community-home-brand">${communityMark(community,'large')}<span><small>LES TONDEUZ À GAZON</small><strong>${esc(community.name)}</strong><em>${Number(community.memberCount)||0} membre${Number(community.memberCount)===1?'':'s'}${community.discord?.linked?` · Discord lié`:''}</em></span></div>
    
  </section>`;
}
function crewRows(event,{includePast=false,now=Date.now()}={}){
  const rows=[];
  const departures=[...(event.departures||[])].filter(d=>Number.isFinite(Number(d.startsAt))&&(includePast||Number(d.startsAt)>now)).sort((a,b)=>Number(a.startsAt)-Number(b.startsAt));
  for(const departure of departures)for(const crew of departure.crews||[]){
    const registrations=(crew.registrationIds||[]).map(id=>(departure.availability||[]).find(reg=>reg.id===id)).filter(reg=>reg&&reg.status!=='unavailable');
    if(!registrations.length)continue;
    rows.push({key:`${departure.id||departure.startsAt}|${crew.id||crew.name}`,startsAt:Number(departure.startsAt),time:departure.time,name:crew.name||'Équipage',category:crew.category||registrations[0]?.category||'',car:crew.car||'',pilots:registrations.map(reg=>reg.name).filter(Boolean),locked:Boolean(crew.locked)});
  }
  const locale=getLocale()==='en'?'en':'fr';
  return rows.sort((a,b)=>a.startsAt-b.startsAt||String(a.category).localeCompare(String(b.category),locale)||String(a.name).localeCompare(String(b.name),locale,{sensitivity:'base',numeric:true}));
}
function crewIcon(color){return `<span class="crew-summary-icon" aria-hidden="true" style="--crew-color:${color}"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="7" r="2.2"/><circle cx="6.8" cy="10" r="1.7"/><circle cx="17.2" cy="10" r="1.7"/><path d="M8.5 17.2c.4-2.7 1.6-4.2 3.5-4.2s3.1 1.5 3.5 4.2"/><path d="M3.8 17c.3-2.2 1.3-3.4 3-3.4.7 0 1.3.2 1.8.6"/><path d="M20.2 17c-.3-2.2-1.3-3.4-3-3.4-.7 0-1.3.2-1.8.6"/></svg></span>`;}
function crewSummary(event,{includePast=false}={}){
  const rows=crewRows(event,{includePast});if(!rows.length)return'';
  return `<span class="event-home-crews"><span class="crew-summary-heading"><strong>${rows.length} équipage${rows.length>1?'s':''}</strong><span>engagé${rows.length>1?'s':''}</span></span><span class="crew-summary-list">${rows.map((row,index)=>{const color=CREW_COLORS[index%CREW_COLORS.length];return `<span class="crew-summary-card ${row.locked?'is-complete':'is-open'}">${crewIcon(color)}<span class="crew-summary-main"><span class="crew-summary-title"><strong style="color:${color}">${esc(row.name)}</strong><b>${esc(displayTime(row.time))}</b></span><small>${esc(row.category)}${row.car?` · ${esc(row.car)}`:''}</small></span><span class="crew-summary-pilots">${row.pilots.length?esc(row.pilots.join(' · ')):'Aucun pilote affecté'}</span></span>`;}).join('')}</span></span>`;
}
export function renderNav(){
  nav.innerHTML=`${button('home','Événements')}${button('my-entries','Mes inscriptions')}<div class="nav-game-switcher" aria-label="Changer de simulateur"><a class="nav-game-switcher-button nav-game-switcher-lmu" href="/lmu/">Le Mans Ultimate</a><a class="nav-game-switcher-button nav-game-switcher-iracing" href="/iracing/">iRacing</a></div>`;
  notifyNav();
}

export function showRecoveryLink(){if(!state.recoveryLink)return;app.insertAdjacentHTML('afterbegin',`<section class="recovery-panel"><label for="personalLink">Ton lien personnel pour retrouver et modifier tes inscriptions sans compte</label><input id="personalLink" readonly value="${esc(state.recoveryLink)}"><p>Conserve ce lien et garde-le privé.</p>${button('copy-link','Copier le lien')}${button('hide-link','Masquer')}</section>`);}
function eventCard({event,next,archived,end}){
  const registered=registeredRaceStatus(event);const displayNext=registered.next;
  const totalPilots=pilotCount((event.departures||[]).flatMap(departure=>departure.availability||[]));
  const untilNext=displayNext?displayNext.startsAt-Date.now():Infinity,statusClass=archived?'finished':displayNext&&untilNext<=3600000?'soon':'upcoming';
  const status=archived?`Tous les départs ont eu lieu · ${esc(dateLabel({startsAt:end}))}`:displayNext?`Prochain départ avec pilotes : ${esc(dateLabel(displayNext))} à ${esc(displayTime(displayNext.time))} · <span data-countdown="${displayNext.startsAt}">${countdown(displayNext.startsAt)}</span>`:next?'Aucun départ à venir avec pilote inscrit':'Dates à confirmer';
  return `<button class="event-card event-card-harmonized event-type-${event.eventType||'private'} ${archived?'archived':''}" data-action="open" data-id="${event.id}"><span class="event-card-body"><span class="event-card-title-row"><span class="event-name">${esc(event.name)}</span><span class="event-compact-date">${esc(compactDateRange(event.departures||[]))}</span></span><span class="event-info">${eventTypeBadge(event.eventType)}<span class="event-pilot-count">${totalPilots} pilote${totalPilots===1?'':'s'} inscrit${totalPilots===1?'':'s'}</span></span>${circuitVisual(event.circuit,true)}<span class="event-category-badges">${event.categories.map(category=>eventBadge(category,eventCategoryCount(event,category))).join('')}</span>${crewSummary(event,{includePast:archived})}<span class="event-card-status"><span class="event-countdown ${statusClass}" ${displayNext&&!archived?`data-status-time="${displayNext.startsAt}"`:''}>${status}</span></span></span></button>`;
}
export function renderHome(message=''){
  state.page='home';state.currentEventId=null;state.editingEvent=null;state.drafts={};state.registrationOpen.clear();
  const events=contextEvents();
  const groups=groupEvents(events,state.eventFilter);
  const community=activeCommunity();
  const createAllowed=canManageContext();
  app.innerHTML=`${communityIdentity()}<h1 class="page-title">ÉVÉNEMENTS</h1>${createAllowed?`<div class="home-create-event">${button('create',community?'Ajouter une endurance':'Ajouter un évènement','','primary-button')}</div>`:''}${message?`<p class="creation-success" role="status">${esc(message)}</p>`:''}<div class="event-filter" role="group" aria-label="Filtrer les événements">${button('event-filter','À venir',`data-filter="upcoming" aria-pressed="${state.eventFilter==='upcoming'}"`,'event-filter-button')}${button('event-filter','Archivés',`data-filter="archived" aria-pressed="${state.eventFilter==='archived'}"`,'event-filter-button')}</div>${groups.length?`<div class="event-agenda">${groups.map(group=>`<section class="event-period" aria-labelledby="period-${group.key}"><h2 class="event-period-heading" id="period-${group.key}"><span>${esc(group.label)}</span><small>${group.items.length} événement${group.items.length>1?'s':''}</small></h2><div class="event-list">${group.items.map(eventCard).join('')}</div></section>`).join('')}</div>`:`<div class="empty">${state.eventFilter==='upcoming'?`Aucune endurance ${globalThis.__ENDURANCE_GAME__==='iracing'?'iRacing':'LMU'} à venir.`:'Aucun événement archivé.'}</div>`}`;
  showRecoveryLink();notifyRender();
}
