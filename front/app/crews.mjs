import {state,esc,button,logo,registrationCarLabel,renderAvailabilityTimeline,crewColorClass,coversHour,pilotCount,api} from './core.mjs';
import {renderRegistration} from './registration.mjs';

function contentSummary(title,count){return `<summary class="ux-content-accordion-summary"><span class="ux-content-accordion-title">${esc(title)}</span><span class="ux-content-accordion-count">${count}</span><span class="ux-content-accordion-chevron" aria-hidden="true">›</span></summary>`;}
function statusPill(crew){return `<span class="crew-compact-status ${crew.locked?'is-complete':'is-open'}">${crew.locked?'ÉQUIPAGE COMPLET':'ÉQUIPAGE OUVERT'}</span>`;}
function coverage(event,departure,regs){const duration=event.durationHours||6;const counts=Array.from({length:duration},(_,i)=>regs.filter(reg=>coversHour(reg,i)).length);const covered=counts.filter(Boolean).length;return{duration,counts,covered,missing:Math.max(0,duration-covered)};}

function stateControl(crew,departure){return `<div class="crew-state-control"><span class="crew-state-label"><span class="crew-state-lock" aria-hidden="true">${crew.locked?'🔒':'🔓'}</span><span>Équipage</span></span><label class="crew-state-select-wrap"><span class="sr-only">État de l’équipage</span><select class="crew-state-select" data-crew-state-select data-crew-id="${crew.id}" data-departure="${departure.id}" data-version="${crew.version}"><option value="open" ${crew.locked?'':'selected'}>Ouvert</option><option value="locked" ${crew.locked?'selected':''}>Équipage complet</option></select><span class="crew-state-chevron" aria-hidden="true">▾</span></label></div>`;}

function crewActions(crew,departure,ownMember,joinRegistration){
  const actions=[];
  if(joinRegistration&&!crew.locked)actions.push(button('join-crew','Rejoindre cet équipage',`data-id="${crew.id}" data-departure="${departure.id}" data-registration="${joinRegistration.id}" data-version="${crew.version}"`,'primary-button crew-join-button'));
  if(ownMember)actions.push(button('leave-crew','Quitter l’équipage',`data-id="${crew.id}" data-departure="${departure.id}" data-registration="${ownMember.id}" data-version="${crew.version}"`,'secondary-button crew-leave-button'));
  if(crew.canManage)actions.push(button('edit-crew',crew.ownedByMe?'Gérer mon équipage':'Gérer l’équipage',`data-id="${crew.id}" data-departure="${departure.id}"`,'secondary-button crew-manage-button'));
  return actions.length?`<div class="crew-self-actions">${actions.join('')}</div>`:'';
}

function crewCard(event,departure,crew,index,unassigned){
  const regs=(crew.registrationIds||[]).map(id=>departure.availability.find(reg=>reg.id===id)).filter(Boolean);
  const cov=coverage(event,departure,regs);
  const names=regs.map(reg=>reg.name).join(' · ')||'Aucun pilote affecté';
  const ownMember=regs.find(reg=>reg.mine)||null;
  const joinRegistration=ownMember?null:unassigned.find(reg=>reg.mine&&reg.category===crew.category)||null;
  const open=Boolean(ownMember||crew.ownedByMe||state.crewManagementOpen.has(crew.id));
  const capacity=crew.locked
    ? '<p class="crew-capacity-message is-complete">Composition verrouillée : l’équipage est marqué complet.</p>'
    : cov.missing
      ? `<p class="crew-capacity-message is-open needs-pilots">${cov.missing} h de course ${cov.missing>1?'ne sont':'n’est'} pas encore couverte${cov.missing>1?'s':''}.</p>`
      : '<p class="crew-capacity-message is-open">Toutes les heures de course sont couvertes.</p>';
  const ownerBadge=crew.ownedByMe?'<span class="crew-owner-badge">RESPONSABLE</span>':'';
  const management=crew.canManage?`<div class="crew-inline-management">${stateControl(crew,departure)}<span class="coverage-summary">${regs.length} pilote${regs.length>1?'s':''} · ${cov.covered}/${cov.duration} h</span></div>`:`<div class="crew-inline-management is-readonly"><span class="coverage-summary">${regs.length} pilote${regs.length>1?'s':''} · ${cov.covered}/${cov.duration} h</span></div>`;
  const memberCards=regs.length?`<div class="crew-member-grid" data-pilot-columns="${Math.max(1,Math.min(3,regs.length))}">${regs.map(reg=>renderRegistration(reg,departure,event.durationHours||6,false)).join('')}</div>`:'<p class="empty crew-empty-roster">Aucun pilote n’a encore rejoint cet équipage.</p>';
  return `<details class="crew-pilot-group crew-pilot-accordion crew-unified-card ${crewColorClass(crew.id,index)} ${crew.locked?'is-complete':'is-open'}" data-crew="${crew.id}" data-crew-id="${crew.id}" data-crew-locked="${Boolean(crew.locked)}" data-crew-mine="${Boolean(ownMember)}" data-crew-team="${esc(crew.name)}" ${open?'open':''}>
    <summary class="crew-pilot-accordion-summary" aria-label="${esc(crew.name)} · ${esc(names)} · ${esc(crew.car||'Voiture à choisir')}">
      <span class="crew-compact-category" aria-hidden="true">${logo(crew.category)}</span>
      <span class="crew-compact-team"><strong>${esc(crew.name)}</strong>${ownerBadge}</span>
      <span class="crew-compact-pilots">${esc(names)}</span>
      <span class="crew-compact-car">${esc(crew.car||'Voiture à choisir')}</span>
      ${statusPill(crew)}
      <span class="crew-compact-chevron" aria-hidden="true">›</span>
    </summary>
    <div class="crew-pilot-accordion-body crew-unified-body">
      ${management}
      ${capacity}
      ${memberCards}
      ${renderAvailabilityTimeline({departure,duration:cov.duration,counts:cov.counts,label:'Disponibilité de l’équipage'})}
      ${crewActions(crew,departure,ownMember,joinRegistration)}
      ${!state.user&&joinRegistration===null?'<p class="crew-action-hint">Connecte-toi avec Discord et inscris-toi pour rejoindre un équipage.</p>':''}
    </div>
  </details>`;
}

export function renderPilots(event,departure){
  const crews=[...(departure.crews||[])].sort((a,b)=>event.categories.indexOf(a.category)-event.categories.indexOf(b.category)||String(a.name).localeCompare(String(b.name),'fr',{sensitivity:'base',numeric:true}));
  const assigned=new Set(crews.flatMap(crew=>crew.registrationIds||[]));
  const unassigned=(departure.availability||[]).filter(reg=>reg.status!=='unavailable'&&!assigned.has(reg.id)).sort((a,b)=>event.categories.indexOf(a.category)-event.categories.indexOf(b.category)||String(a.name).localeCompare(String(b.name),'fr',{sensitivity:'base'}));
  const unavailable=(departure.availability||[]).filter(reg=>reg.status==='unavailable');
  const crewCards=crews.length?crews.map((crew,index)=>crewCard(event,departure,crew,index,unassigned)).join(''):'<p class="empty">Aucun équipage pour ce départ. Un pilote inscrit peut créer le premier.</p>';
  const pilots=unassigned.length?`<section class="ux-unassigned-section"><div class="ux-unassigned-grid">${unassigned.map(reg=>renderRegistration(reg,departure,event.durationHours||6)).join('')}</div></section>`:`<section class="ux-unassigned-section"><p class="empty">${departure.availability.length?'Tous les pilotes disponibles ont déjà un équipage.':'Aucun pilote inscrit sur ce départ.'}</p></section>`;
  const unavailableHtml=unavailable.length?`<details class="ux-crew-bucket ux-unavailable-bucket"><summary><span>Pilotes indisponibles</span><strong>${unavailable.length}</strong></summary><div class="ux-crew-bucket-body">${unavailable.map(reg=>renderRegistration(reg,departure,event.durationHours||6)).join('')}</div></details>`:'';
  return `<div class="pilot-section"><div class="ux-course-overview ux-course-split-overview">
    <details class="ux-course-crews-accordion" open>${contentSummary('Équipages',crews.length)}<div class="ux-course-crews-body">${crewCards}</div></details>
    <details class="ux-course-pilots-accordion">${contentSummary('Pilotes sans équipage',pilotCount(unassigned))}<div class="ux-course-pilots-body">${pilots}${unavailableHtml}</div></details>
  </div></div>`;
}

export function renderCrews(event,departure){return renderPilots(event,departure);}

export async function updateCrewState(select){
  const event=state.events.find(item=>item.id===state.currentEventId);const departure=event?.departures.find(item=>item.id===select.dataset.departure);const crew=departure?.crews.find(item=>item.id===select.dataset.crewId);if(!crew)throw Error('Équipage introuvable. Actualise la page.');if(!crew.canManage)throw Error('Tu n’as pas l’autorisation de modifier cet équipage.');const locked=select.value==='locked';if(locked===!!crew.locked)return;if(locked&&!confirm(`Marquer « ${crew.name} » comme équipage complet et verrouiller sa composition ?`)){select.value=crew.locked?'locked':'open';return;}select.disabled=true;try{await api(`/api/crews/${crew.id}`,'PATCH',{locked,version:crew.version});state.crewManagementOpen.add(crew.id);}finally{if(select.isConnected)select.disabled=false;}
}
