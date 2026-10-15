import {contextHelpButton as helpButton} from './core.mjs';
import {simForEvent} from '../../shared/catalog.mjs';
import {renderHome} from './home-view.mjs';
import {isSolo,eventAccessLogo,accessBadge,soloCardMeta,renderSoloEntries,ANY_CATEGORY} from './solo.mjs';
import {dateBlock,timeLabel} from '../dates.mjs';
import {durationLabel,eventMinutes} from '../../shared/duration.mjs';
import {eventSchedule} from '../schedule.mjs';
import {
  app,
  state,
  esc,
  eventTypeBadge,
  badge,
  circuitLabel,
  notifyRender,
  logo,
  categories,
  circuitVisual
} from './core.mjs';
import {crewAvailability,pilotLines,groupByPilot} from './crews.mjs';
import {getLocale,localeTag} from '../i18n.mjs';


// Same date block as the race cards, for this entry's own start.
const departureDateBlock = departure => dateBlock(departure.startsAt);

function categoryIndex(event, category) {
  const index = event.categories.indexOf(category);
  return index === -1 ? 99 : index;
}

function pilotSort(event) {
  const locale=getLocale()==='en'?'en':'fr';
  return (a,b) => categoryIndex(event,a.category) - categoryIndex(event,b.category)
    || String(a.name || '').localeCompare(String(b.name || ''),locale,{sensitivity:'base'});
}

function crewSort(event) {
  const locale=getLocale()==='en'?'en':'fr';
  return (a,b) => categoryIndex(event,a.category) - categoryIndex(event,b.category)
    || String(a.name || '').localeCompare(String(b.name || ''),locale,{sensitivity:'base',numeric:true});
}

// The entry body: three side-by-side columns (own crew, other crews, pilots without a crew), no nested frames.
function column(title,count,body) {
  return `<section class="my-entry-column"><h3 class="my-entry-column-title">${esc(title)} <span>${count}</span></h3>${body}</section>`;
}

function compactCrew(departure,crew) {
  const names = (crew.registrationIds || [])
    .map(id => departure.availability.find(reg => String(reg.id) === String(id))?.name)
    .filter(Boolean);
  return `<article class="ux-my-other-crew ${categories[crew.category]?.css||''}">
    <div class="ux-my-other-crew-main">${logo(crew.category)}<div><strong>${esc(crew.name)}</strong><span>${esc(crew.car||'Voiture à définir')}</span></div></div>
    <small>${names.length?esc(names.join(' · ')):'Aucun pilote affecté'}</small>
  </article>`;
}

// Solo race entry: same header as an endurance entry, then the participants and the waiting list.
function soloCard({event,departure,reg}, grouped=false) {
  const category = reg.category === ANY_CATEGORY ? '<span class="event-category-badge">Peu importe</span>' : reg.category ? badge(reg.category) : '';
  const situation = reg.waitlistPosition
    ? `<span class="departure-mine-badge is-waiting">Liste d’attente · ${reg.waitlistPosition}${reg.waitlistPosition === 1 ? 'er' : 'e'}</span>`
    : '<span class="departure-mine-badge is-crew">✓ Inscrit</span>';
  if(grouped)return slotCard(departure,reg,`${category}${situation}`,renderSoloEntries(event,departure));
  return `<details class="native-my-entry-card race-card my-entry-race is-solo is-solo-${event.access||'open'} sim-${simForEvent(event)}" id="entry-${reg.id}">
    <summary class="native-my-entry-header">
      <span class="native-my-entry-toggle" aria-hidden="true">+</span>
      <span class="race-card-top">${departureDateBlock(departure)}<span class="race-head">
        ${reg.managed?`<strong class="ux-managed-entry-name">${esc(reg.name)}</strong>`:''}
        <h2 class="event-name">${esc(event.name)}</h2>
        <span class="race-meta">${soloCardMeta(event)}</span>
        <span class="race-badges">${accessBadge(event)}${category}<span class="race-start">Départ ${esc(timeLabel(departure.time))}</span>${situation}</span>
      </span>${eventAccessLogo(event)||circuitVisual(event.circuit,true)}</span>
      <button type="button" class="primary-button native-my-entry-open-event" data-action="open" data-id="${event.id}" data-departure="${departure.id}">Voir l’événement</button>
    </summary>
    <div class="native-my-entry-body">${renderSoloEntries(event,departure)}</div>
  </details>`;
}

function card({event,departure,reg}, grouped=false) {
  if (isSolo(event)) return soloCard({event,departure,reg},grouped);
  const crew = (departure.crews||[]).find(item => (item.registrationIds||[]).some(id => String(id) === String(reg.id)));
  const assigned = new Set((departure.crews||[]).flatMap(item => (item.registrationIds||[]).map(String)));
  const pilotKey = pilot => pilot.participantId || `name:${String(pilot.name).toLowerCase()}`;
  const unassigned = (departure.availability||[])
    .filter(pilot => pilot.status !== 'unavailable' && !assigned.has(String(pilot.id)) && pilotKey(pilot) !== pilotKey(reg))
    .sort(pilotSort(event));
  const freePilots = groupByPilot(unassigned, event);
  const members = crew
    ? (crew.registrationIds||[]).map(id => departure.availability.find(pilot => String(pilot.id) === String(id))).filter(Boolean)
    : [];
  const otherCrews = (departure.crews||[]).filter(item => item.id !== crew?.id).sort(crewSort(event));

  const ownCrewBody = crew?`<article class="ux-my-own-crew ${categories[crew.category]?.css||''}">
    <div class="ux-my-own-crew-head">
      <div class="ux-my-own-crew-identity">${logo(crew.category)}<div><strong>${esc(crew.name)}</strong><span>${esc(crew.car||'Voiture à définir')}</span></div></div>
      <span class="ux-my-crew-state">${crew.locked?'Équipage complet':'Équipage ouvert'}</span>
    </div>
    ${crewAvailability(event,departure,members,{editable:false})}
  </article>`:`<article class="ux-my-awaiting-crew">
    <div class="ux-my-awaiting-copy"><strong>En attente d’affectation</strong><span>Cette inscription n’est pas encore rattachée à un équipage.</span></div>
    <section class="crew-pilot-lines">${pilotLines(departure,event.durationHours||6,[reg],{editable:false})}</section>
  </article>`;

  const otherCrewsBody = otherCrews.length
    ? `<div class="ux-my-other-crews-grid">${otherCrews.map(item=>compactCrew(departure,item)).join('')}</div>`
    : '<p class="muted">Aucun autre équipage sur ce départ.</p>';

  const unassignedBody = unassigned.length
    ? `<section class="crew-pilot-lines">${pilotLines(departure,event.durationHours||6,freePilots,{editable:false})}</section>`
    : '<p class="empty">Aucun autre pilote sans équipage sur ce départ.</p>';

  const situation = crew
    ? `<span class="departure-mine-badge is-crew">✓ Équipage ${esc(crew.name)}</span>`
    : '<span class="departure-mine-badge is-waiting">En attente d’équipage</span>';
  if(grouped)return slotCard(departure,reg,`${(reg.groupCategories||[reg.category]).map(badge).join('')}${situation}`,
    `${column('Mon équipage',members.length,ownCrewBody)}${column('Autres équipages',otherCrews.length,otherCrewsBody)}${column('Pilotes sans équipage',freePilots.length,unassignedBody)}`,true);
  return `<details class="native-my-entry-card race-card my-entry-race event-type-${event.eventType||'private'}" id="entry-${reg.id}">
    <summary class="native-my-entry-header">
      <span class="native-my-entry-toggle" aria-hidden="true">+</span>
      <span class="race-card-top">${departureDateBlock(departure)}<span class="race-head">
        ${reg.managed?`<strong class="ux-managed-entry-name">${esc(reg.name)}</strong>`:''}
        <h2 class="event-name">${esc(event.name)}</h2>
        <span class="race-meta">${esc(circuitLabel(event.circuit))} · <span class="nowrap">${durationLabel(eventMinutes(event))}</span></span>
        <span class="race-badges">${eventTypeBadge(event.eventType)}${(reg.groupCategories||[reg.category]).map(badge).join('')}<span class="race-start">Départ ${esc(timeLabel(departure.time))}</span>${situation}</span>
      </span>${circuitVisual(event.circuit,true)}</span>
      <button type="button" class="primary-button native-my-entry-open-event" data-action="open" data-id="${event.id}" data-departure="${departure.id}">Voir la course</button>
    </summary>
    <div class="native-my-entry-body my-entry-columns">
      ${column('Mon équipage',members.length,ownCrewBody)}
      ${column('Autres équipages',otherCrews.length,otherCrewsBody)}
      ${column('Pilotes sans équipage',freePilots.length,unassignedBody)}
    </div>
  </details>`;
}

// Keep each start's crew and entry status together inside a single race card.
function slotCard(departure,reg,badges,body,columns=false){
  return `<section class="my-entry-slot" id="entry-${reg.id}" data-entry-departure="${departure.id}">
    <h3 class="my-entry-slot-heading"><span>${esc(new Date(departure.startsAt).toLocaleDateString(localeTag(),{timeZone:'Europe/Paris',weekday:'short',day:'numeric',month:'short'}))} · Départ ${esc(timeLabel(departure.time))}</span><span class="race-badges">${badges}</span></h3>
    <div class="native-my-entry-body${columns?' my-entry-columns':''}">${body}</div>
  </section>`;
}

function raceCards(list){
  const groups=new Map();
  for(const item of list){
    const pilot=item.reg.mine?'mine':item.reg.participantId||item.reg.participantUserId||String(item.reg.name).toLowerCase();
    const key=`${item.event.id}|${pilot}`;
    if(!groups.has(key))groups.set(key,[]);
    groups.get(key).push(item);
  }
  return [...groups.values()].map(items=>{
    if(items.length===1)return card(items[0]);
    const {event,departure,reg}=items[0],solo=isSolo(event);
    const starts=[...new Map(items.map(item=>[item.departure.id,item.departure])).values()];
    return `<details class="native-my-entry-card race-card my-entry-race my-entry-grouped ${solo?`is-solo is-solo-${event.access||'open'} sim-${simForEvent(event)}`:`event-type-${event.eventType||'private'}`}" data-entry-event="${event.id}">
      <summary class="native-my-entry-header"><span class="native-my-entry-toggle" aria-hidden="true">+</span>
        <span class="race-card-top">${departureDateBlock(departure)}<span class="race-head">
          ${reg.managed?`<strong class="ux-managed-entry-name">${esc(reg.name)}</strong>`:''}
          <h2 class="event-name">${esc(event.name)}</h2>
          <span class="race-meta">${solo?soloCardMeta(event):`${esc(circuitLabel(event.circuit))} · ${durationLabel(eventMinutes(event))}`}</span>
          <span class="race-badges">${solo?accessBadge(event):eventTypeBadge(event.eventType)}${[...new Set(items.flatMap(item=>item.reg.groupCategories||[item.reg.category]))].filter(Boolean).map(badge).join('')}<span class="race-start">${starts.length} créneau${starts.length>1?'x':''}</span>${starts.map(start=>`<span class="race-start">${esc(new Date(start.startsAt).toLocaleDateString(localeTag(),{timeZone:'Europe/Paris',day:'numeric',month:'short'}))} · ${esc(timeLabel(start.time))}</span>`).join('')}</span>
        </span>${solo?eventAccessLogo(event)||circuitVisual(event.circuit,true):circuitVisual(event.circuit,true)}</span>
        <button type="button" class="primary-button native-my-entry-open-event" data-action="open" data-id="${event.id}">Voir ${solo?'l’événement':'la course'}</button>
      </summary>
      <div class="my-entry-slots">${items.map(item=>card(item,true)).join('')}</div>
    </details>`;
  }).join('');
}

export function renderMyEntries() {
  if(state.access!=='member'){renderHome();return;}
  state.page='my-entries';
  // Past races live in the Archivés list; this page is about what is coming up.
  const now=Date.now();
  const entries=state.events.filter(event=>!eventSchedule(event,now).archived).flatMap(event=>event.departures.flatMap(departure=>departure.availability
    .filter(reg=>reg.mine||reg.managed)
    .map(reg=>({event,departure,reg}))))
    .sort((a,b)=>Number(a.departure.startsAt)-Number(b.departure.startsAt));
  // A pilot entered in several categories on a start, still without a crew: one card with all of them.
  const inCrew=({departure,reg})=>(departure.crews||[]).some(crew=>(crew.registrationIds||[]).some(id=>String(id)===String(reg.id)));
  const groups=new Map();
  for(const item of entries){
    const key=isSolo(item.event)||inCrew(item)?item.reg.id:`${item.departure.id}|${item.reg.participantId||String(item.reg.name).toLowerCase()}`;
    if(!groups.has(key))groups.set(key,[]);
    groups.get(key).push(item);
  }
  const cards=[...groups.values()].map(list=>list.length===1?list[0]:{...list[0],reg:groupByPilot(list.map(item=>item.reg),list[0].event)[0]});
  const section=(title,list)=>`<section class="native-my-entries-group">
    <div class="native-my-entries-group-heading"><h2>${title}</h2><span>${list.length} inscription${list.length>1?'s':''}</span></div>
    ${list.length?`<div class="native-my-entry-list">${raceCards(list)}</div>`:'<p class="empty">Aucune inscription.</p>'}
  </section>`;
  app.innerHTML=`<div class="native-my-entries-heading"><span class="creation-kicker">ESPACE PILOTE</span><div class="context-help-heading"><h1 class="page-title">MES INSCRIPTIONS</h1>${helpButton('entries')}</div><p>Tes événements et tes endurances, avec ton équipage.</p></div>
    ${section('Mes inscriptions personnelles',cards.filter(item=>item.reg.mine))}
    ${cards.some(item=>item.reg.managed)?section('Inscriptions que je gère',cards.filter(item=>item.reg.managed)):''}`;
  notifyRender();
}
