import {
  app,
  state,
  esc,
  eventTypeBadge,
  badge,
  circuitLabel,
  registrationCarLabel,
  renderAvailabilityTimeline,
  notifyRender,
  logo,
  categories
} from './core.mjs?v=8-explicit-general';
import {getLocale,localeTag} from '../i18n.mjs';
import {scopeDeparture,registrationAudienceIds,organizationAudienceLabels,communityById} from './organization-context.mjs?v=6-community-context';

const dateFormat = new Intl.DateTimeFormat(localeTag(), {
  timeZone:'Europe/Paris',
  weekday:'long',
  day:'numeric',
  month:'long',
  year:'numeric'
});

function entryDate(departure) {
  try { return dateFormat.format(new Date(departure.startsAt)); }
  catch { return departure.date || ''; }
}

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

function pilotGridClass(count) {
  return `ux-my-pilot-grid ux-my-pilot-grid-${Math.max(1,Math.min(3,count || 1))}`;
}

function eventCommunity(event){
  return event?.organizationId?communityById(state.organizations,event.organizationId):null;
}
function communityPilotMark(event){
  const community=eventCommunity(event),logoUrl=community?.branding?.logoUrl;
  return logoUrl?`<span class="pilot-community-logo" title="${esc(community.name)}"><img src="${esc(logoUrl)}" alt="" loading="lazy" referrerpolicy="no-referrer"></span>`:'';
}

function pilotCard(event,departure,reg,highlighted=false) {
  return `<article class="pilot-row ux-my-entry-pilot-card${highlighted?' is-own-pilot':''}">
    <div class="pilot-main">
      <span class="pilot-name">${communityPilotMark(event)}${esc(reg.name)}</span>
      <span class="pilot-category-logo">${logo(reg.category)}</span>
      <span class="pilot-car">${esc(registrationCarLabel(reg))}</span>
      ${reg.preferredPilot?`<span class="pilot-preference">Souhaite rouler avec : <strong>${esc(reg.preferredPilot)}</strong></span>`:''}
    </div>
    ${renderAvailabilityTimeline({departure,duration:event.durationHours||6,status:reg.status,label:`Disponibilités de ${reg.name}`})}
  </article>`;
}

function summary(title,count) {
  return `<summary class="ux-my-entry-accordion-summary"><span>${esc(title)}</span><strong>${count}</strong><span class="ux-my-entry-chevron" aria-hidden="true">›</span></summary>`;
}

function contentAccordion(title,count,body,compact=false) {
  return `<details class="ux-my-entry-content-accordion${compact?' is-compact':''}">
    ${summary(title,count)}
    <div class="ux-my-entry-content-body">${body}</div>
  </details>`;
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

function audienceMeta(event,reg){
  const ids=event.organizationId?[event.organizationId]:registrationAudienceIds(reg);
  const labels=event.organizationId?[]:organizationAudienceLabels(state.organizations,ids);
  return {ids,labels};
}

function card({event,departure:rawDeparture,reg}) {
  const audiences=audienceMeta(event,reg);
  const departure=scopeDeparture(rawDeparture,new Set(audiences.ids));
  const crew = (departure.crews||[]).find(item => (item.registrationIds||[]).some(id => String(id) === String(reg.id)));
  const assigned = new Set((departure.crews||[]).flatMap(item => (item.registrationIds||[]).map(String)));
  const unassigned = (departure.availability||[])
    .filter(pilot => pilot.status !== 'unavailable' && !assigned.has(String(pilot.id)) && !pilot.engaged)
    .sort(pilotSort(event));
  const members = crew
    ? (crew.registrationIds||[]).map(id => departure.availability.find(pilot => String(pilot.id) === String(id))).filter(Boolean)
    : [];
  const otherCrews = (departure.crews||[]).filter(item => item.id !== crew?.id).sort(crewSort(event));
  const audienceBadges=audiences.labels.map(label=>`<span class="organization-entry-badge">${esc(label)}</span>`).join('');

  const ownCrewBody = crew?`<article class="ux-my-own-crew ${categories[crew.category]?.css||''}">
    <div class="ux-my-own-crew-head">
      <div class="ux-my-own-crew-identity">${logo(crew.category)}<div><strong>${esc(crew.name)}</strong><span>${esc(crew.car||'Voiture à définir')}</span></div></div>
      <span class="ux-my-crew-state">${crew.locked?'Équipage complet':'Équipage ouvert'}</span>
    </div>
    <div class="${pilotGridClass(members.length)}">${members.map(pilot=>pilotCard(event,departure,pilot,String(pilot.id)===String(reg.id))).join('')}</div>
  </article>`:`<article class="ux-my-awaiting-crew">
    <div class="ux-my-awaiting-copy"><strong>${reg.engaged?'Déjà engagé sur ce départ':'En attente d’affectation'}</strong><span>${reg.engaged?'Ton équipage appartient à un autre espace que ceux affichés ici.':'Cette inscription n’est pas encore rattachée à un équipage.'}</span></div>
    <div class="${pilotGridClass(1)}">${pilotCard(event,departure,reg,true)}</div>
  </article>`;

  const otherCrewsBody = otherCrews.length
    ? `<div class="ux-my-other-crews-grid">${otherCrews.map(item=>compactCrew(departure,item)).join('')}</div>`
    : '<p class="muted">Aucun autre équipage dans les espaces de cette inscription.</p>';

  const unassignedBody = unassigned.length
    ? `<div class="${pilotGridClass(unassigned.length)}">${unassigned.map(pilot=>pilotCard(event,departure,pilot,String(pilot.id)===String(reg.id))).join('')}</div>`
    : '<p class="empty">Aucun autre pilote disponible sans équipage.</p>';

  return `<details class="native-my-entry-card event-type-${event.eventType||'private'}">
    <summary class="native-my-entry-header">
      <span class="native-my-entry-toggle" aria-hidden="true">+</span>
      <div class="native-my-entry-title">
        ${reg.managed?`<strong class="ux-managed-entry-name">${esc(reg.name)}</strong>`:''}
        <span class="ux-my-entry-departure">Départ ${esc(departure.time||'')}</span>
        <h2>${esc(event.name)}</h2>
        <span class="ux-my-entry-date">${esc(entryDate(departure))}</span>
        <div class="native-my-entry-meta">${audienceBadges}${eventTypeBadge(event.eventType)}${badge(reg.category)}<span>${esc(circuitLabel(event.circuit))}</span><span>${event.durationHours||6} h</span></div>
      </div>
      <button type="button" class="primary-button native-my-entry-open-event" data-organization-entry-open data-id="${event.id}" data-departure="${departure.id}" data-audiences="${esc(audiences.ids.join(','))}">Voir l’événement complet</button>
    </summary>
    <div class="native-my-entry-body">
      ${contentAccordion('Mon équipage',members.length,ownCrewBody)}
      ${contentAccordion('Autres équipages',otherCrews.length,otherCrewsBody,true)}
      ${contentAccordion('Pilotes sans équipage',unassigned.length,unassignedBody,true)}
    </div>
  </details>`;
}

export function renderMyEntries() {
  state.page='my-entries';
  const community=communityById(state.organizations,state.activeCommunityId);
  const events=(state.events||[]).filter(event=>state.activeCommunityId?event.organizationId===state.activeCommunityId:!event.organizationId);
  const entries=events.flatMap(event=>event.departures.flatMap(departure=>departure.availability
    .filter(reg=>reg.mine||reg.managed)
    .map(reg=>({event,departure,reg}))));
  const section=(title,list)=>`<section class="native-my-entries-group">
    <div class="native-my-entries-group-heading"><h2>${title}</h2><span>${list.length} inscription${list.length>1?'s':''}</span></div>
    ${list.length?`<div class="native-my-entry-list">${list.map(card).join('')}</div>`:'<p class="empty">Aucune inscription.</p>'}
  </section>`;
  const context=community
    ? `Tes inscriptions dans <strong>${esc(community.name)}</strong> sur ce simulateur.`
    : 'Tes inscriptions aux endurances indépendantes Endurance Manager.';
  app.innerHTML=`<div class="native-my-entries-heading"><span class="creation-kicker">ESPACE PILOTE</span><h1 class="page-title">MES INSCRIPTIONS</h1><p>${context}</p></div>
    ${section('Mes inscriptions personnelles',entries.filter(item=>item.reg.mine))}
    ${entries.some(item=>item.reg.managed)?section('Inscriptions que je gère',entries.filter(item=>item.reg.managed)):''}`;
  notifyRender();
}
