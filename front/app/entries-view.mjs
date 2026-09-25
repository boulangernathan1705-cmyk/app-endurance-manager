import {dateBlock,timeLabel} from '../dates.mjs';
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
import {crewAvailability,pilotLines} from './crews.mjs';
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

function card({event,departure,reg}) {
  const crew = (departure.crews||[]).find(item => (item.registrationIds||[]).some(id => String(id) === String(reg.id)));
  const assigned = new Set((departure.crews||[]).flatMap(item => (item.registrationIds||[]).map(String)));
  const unassigned = (departure.availability||[])
    .filter(pilot => pilot.status !== 'unavailable' && !assigned.has(String(pilot.id)))
    .sort(pilotSort(event));
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
    ? `<section class="crew-pilot-lines">${pilotLines(departure,event.durationHours||6,unassigned,{editable:false})}</section>`
    : '<p class="empty">Tous les pilotes disponibles sont déjà affectés.</p>';

  const situation = crew
    ? `<span class="departure-mine-badge is-crew">✓ Équipage ${esc(crew.name)}</span>`
    : '<span class="departure-mine-badge is-waiting">En attente d’équipage</span>';
  return `<details class="native-my-entry-card race-card my-entry-race event-type-${event.eventType||'private'}" id="entry-${reg.id}">
    <summary class="native-my-entry-header">
      <span class="native-my-entry-toggle" aria-hidden="true">+</span>
      <span class="race-card-top">${departureDateBlock(departure)}<span class="race-head">
        ${reg.managed?`<strong class="ux-managed-entry-name">${esc(reg.name)}</strong>`:''}
        <h2 class="event-name">${esc(event.name)}</h2>
        <span class="race-meta">${esc(circuitLabel(event.circuit))} · ${event.durationHours||6} h</span>
        <span class="race-badges">${eventTypeBadge(event.eventType)}${badge(reg.category)}<span class="race-start">Départ ${esc(timeLabel(departure.time))}</span>${situation}</span>
      </span>${circuitVisual(event.circuit,true)}</span>
      <button type="button" class="primary-button native-my-entry-open-event" data-action="open" data-id="${event.id}" data-departure="${departure.id}">Voir la course</button>
    </summary>
    <div class="native-my-entry-body my-entry-columns">
      ${column('Mon équipage',members.length,ownCrewBody)}
      ${column('Autres équipages',otherCrews.length,otherCrewsBody)}
      ${column('Pilotes sans équipage',unassigned.length,unassignedBody)}
    </div>
  </details>`;
}

export function renderMyEntries() {
  state.page='my-entries';
  // Past races live in the Archivés list; this page is about what is coming up.
  const now=Date.now();
  const entries=state.events.filter(event=>!eventSchedule(event,now).archived).flatMap(event=>event.departures.flatMap(departure=>departure.availability
    .filter(reg=>reg.mine||reg.managed)
    .map(reg=>({event,departure,reg}))))
    .sort((a,b)=>Number(a.departure.startsAt)-Number(b.departure.startsAt));
  const section=(title,list)=>`<section class="native-my-entries-group">
    <div class="native-my-entries-group-heading"><h2>${title}</h2><span>${list.length} inscription${list.length>1?'s':''}</span></div>
    ${list.length?`<div class="native-my-entry-list">${list.map(card).join('')}</div>`:'<p class="empty">Aucune inscription.</p>'}
  </section>`;
  app.innerHTML=`<div class="native-my-entries-heading"><span class="creation-kicker">ESPACE PILOTE</span><h1 class="page-title">MES INSCRIPTIONS</h1><p>Retrouve ici tes courses, ton équipage et les pilotes inscrits sur le même départ.</p></div>
    ${section('Mes inscriptions personnelles',entries.filter(item=>item.reg.mine))}
    ${entries.some(item=>item.reg.managed)?section('Inscriptions que je gère',entries.filter(item=>item.reg.managed)):''}`;
  notifyRender();
}
