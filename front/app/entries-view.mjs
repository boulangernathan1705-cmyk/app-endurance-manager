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
} from './core.mjs';

const dateFormat = new Intl.DateTimeFormat('fr-FR', {
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
  return (a,b) => categoryIndex(event,a.category) - categoryIndex(event,b.category)
    || String(a.name || '').localeCompare(String(b.name || ''),'fr',{sensitivity:'base'});
}

function crewSort(event) {
  return (a,b) => categoryIndex(event,a.category) - categoryIndex(event,b.category)
    || String(a.name || '').localeCompare(String(b.name || ''),'fr',{sensitivity:'base',numeric:true});
}

function pilotGridClass(count) {
  return `ux-my-pilot-grid ux-my-pilot-grid-${Math.max(1,Math.min(3,count || 1))}`;
}

function pilotCard(event,departure,reg,highlighted=false) {
  return `<article class="pilot-row ux-my-entry-pilot-card${highlighted?' is-own-pilot':''}">
    <div class="pilot-main">
      <span class="pilot-name">${esc(reg.name)}</span>
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

  return `<details class="native-my-entry-card event-type-${event.eventType||'private'}">
    <summary class="native-my-entry-header">
      <span class="native-my-entry-toggle" aria-hidden="true">+</span>
      <div class="native-my-entry-title">
        ${reg.managed?`<strong class="ux-managed-entry-name">${esc(reg.name)}</strong>`:''}
        <span class="ux-my-entry-departure">Départ ${esc(departure.time||'')}</span>
        <h2>${esc(event.name)}</h2>
        <span class="ux-my-entry-date">${esc(entryDate(departure))}</span>
        <div class="native-my-entry-meta">${eventTypeBadge(event.eventType)}${badge(reg.category)}<span>${esc(circuitLabel(event.circuit))}</span><span>${event.durationHours||6} h</span></div>
      </div>
      <button type="button" class="primary-button native-my-entry-open-event" data-action="open" data-id="${event.id}" data-departure="${departure.id}">Voir l’événement complet</button>
    </summary>
    <div class="native-my-entry-body">
      <details class="ux-my-entry-content-accordion">
        ${summary('Mon équipage',members.length)}
        <div class="ux-my-entry-content-body">
          ${crew?`<article class="ux-my-own-crew ${categories[crew.category]?.css||''}">
            <div class="ux-my-own-crew-head">
              <div class="ux-my-own-crew-identity">${logo(crew.category)}<div><strong>${esc(crew.name)}</strong><span>${esc(crew.car||'Voiture à définir')}</span></div></div>
              <span class="ux-my-crew-state">${crew.locked?'Équipage complet':'Équipage ouvert'}</span>
            </div>
            <div class="${pilotGridClass(members.length)}">${members.map(pilot=>pilotCard(event,departure,pilot,String(pilot.id)===String(reg.id))).join('')}</div>
          </article>`:`<article class="ux-my-awaiting-crew">
            <div class="ux-my-awaiting-copy"><strong>En attente d’affectation</strong><span>Cette inscription n’est pas encore rattachée à un équipage.</span></div>
            <div class="${pilotGridClass(1)}">${pilotCard(event,departure,reg,true)}</div>
          </article>`}
          <section class="ux-my-other-crews">
            <div class="ux-my-other-crews-heading"><strong>Autres équipages</strong><span>${otherCrews.length}</span></div>
            ${otherCrews.length?`<div class="ux-my-other-crews-grid">${otherCrews.map(item=>compactCrew(departure,item)).join('')}</div>`:'<p class="muted">Aucun autre équipage sur ce départ.</p>'}
          </section>
        </div>
      </details>
      <details class="ux-my-entry-content-accordion">
        ${summary('Pilotes sans équipage',unassigned.length)}
        <div class="ux-my-entry-content-body">
          ${unassigned.length?`<div class="${pilotGridClass(unassigned.length)}">${unassigned.map(pilot=>pilotCard(event,departure,pilot,String(pilot.id)===String(reg.id))).join('')}</div>`:'<p class="empty">Tous les pilotes disponibles sont déjà affectés.</p>'}
        </div>
      </details>
    </div>
  </details>`;
}

export function renderMyEntries() {
  state.page='my-entries';
  const entries=state.events.flatMap(event=>event.departures.flatMap(departure=>departure.availability
    .filter(reg=>reg.mine||reg.managed)
    .map(reg=>({event,departure,reg}))));
  const section=(title,list)=>`<section class="native-my-entries-group">
    <div class="native-my-entries-group-heading"><h2>${title}</h2><span>${list.length} inscription${list.length>1?'s':''}</span></div>
    ${list.length?`<div class="native-my-entry-list">${list.map(card).join('')}</div>`:'<p class="empty">Aucune inscription.</p>'}
  </section>`;
  app.innerHTML=`<div class="native-my-entries-heading"><span class="creation-kicker">ESPACE PILOTE</span><h1 class="page-title">MES INSCRIPTIONS</h1><p>Retrouve ici tes courses, ton équipage et les pilotes inscrits sur le même départ.</p></div>
    ${section('Mes inscriptions personnelles',entries.filter(item=>item.reg.mine))}
    ${entries.some(item=>item.reg.managed)?section('Inscriptions que je gère',entries.filter(item=>item.reg.managed)):''}`;
  notifyRender();
}
