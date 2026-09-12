import {state,esc,button,logo,registrationCarLabel,renderAvailabilityTimeline,crewColorClass,coversHour,pilotCount,api} from './core.mjs';
import {renderRegistration} from './registration.mjs';

function contentSummary(title,count){return `<summary class="ux-content-accordion-summary"><span class="ux-content-accordion-title">${esc(title)}</span><span class="ux-content-accordion-count">${count}</span><span class="ux-content-accordion-chevron" aria-hidden="true">›</span></summary>`;}
function statusPill(crew){return `<span class="crew-compact-status ${crew.locked?'is-complete':'is-open'}">${crew.locked?'ÉQUIPAGE COMPLET':'ÉQUIPAGE OUVERT'}</span>`;}
function coverage(event,departure,regs){const duration=event.durationHours||6;const counts=Array.from({length:duration},(_,i)=>regs.filter(reg=>coversHour(reg,i)).length);const covered=counts.filter(Boolean).length;return{duration,counts,covered,missing:Math.max(0,duration-covered)};}

function stateControl(crew,departure){return `<div class="crew-state-control"><span class="crew-state-lock" aria-hidden="true">${crew.locked?'🔒':'🔓'}</span><label class="crew-state-select-wrap"><span class="sr-only">État de l’équipage</span><select class="crew-state-select" data-crew-state-select data-crew-id="${crew.id}" data-departure="${departure.id}" data-version="${crew.version}"><option value="open" ${crew.locked?'':'selected'}>Ouvert</option><option value="locked" ${crew.locked?'selected':''}>Complet</option></select><span class="crew-state-chevron" aria-hidden="true">▾</span></label></div>`;}

function crewActions(crew,departure,ownMember,joinRegistration,memberElsewhere){
  const actions=[];
  if(!ownMember&&!memberElsewhere&&!crew.locked&&state.user){
    const registration=joinRegistration?.id||'';
    actions.push(button('join-crew','Rejoindre',`data-id="${crew.id}" data-departure="${departure.id}" data-registration="${registration}" data-version="${crew.version}" aria-label="Rejoindre l’équipage ${esc(crew.name)}"`,'primary-button crew-join-button'));
  }
  if(ownMember)actions.push(button('leave-crew','Quitter',`data-id="${crew.id}" data-departure="${departure.id}" data-registration="${ownMember.id}" data-version="${crew.version}" aria-label="Quitter l’équipage ${esc(crew.name)}"`,'secondary-button crew-leave-button'));
  if(crew.canManage){
    actions.push(button('edit-crew',crew.ownedByMe?'Gérer':'Modifier',`data-id="${crew.id}" data-departure="${departure.id}" aria-label="Gérer l’équipage ${esc(crew.name)}"`,'secondary-button crew-manage-button'));
    actions.push(button('delete-crew','Supprimer',`data-id="${crew.id}" data-departure="${departure.id}" data-version="${crew.version}" aria-label="Supprimer l’équipage ${esc(crew.name)}"`,'danger-button crew-delete-button'));
  }
  return actions.length?`<div class="crew-self-actions">${actions.join('')}</div>`:'';
}

function crewCard(event,departure,crew,index,unassigned,allCrews){
  const regs=(crew.registrationIds||[]).map(id=>departure.availability.find(reg=>reg.id===id)).filter(Boolean);
  const cov=coverage(event,departure,regs);
  const names=regs.map(reg=>reg.name).join(' · ')||'Aucun pilote affecté';
  const ownMember=regs.find(reg=>reg.mine)||null;
  const ownRegistrationIds=new Set((departure.availability||[]).filter(reg=>reg.mine).map(reg=>reg.id));
  const memberElsewhere=allCrews.some(other=>other.id!==crew.id&&(other.registrationIds||[]).some(id=>ownRegistrationIds.has(id)));
  const joinRegistration=ownMember||memberElsewhere?null:unassigned.find(reg=>reg.mine&&reg.category===crew.category)||null;
  const open=state.crewManagementOpen.has(crew.id);
  const ownerBadge=crew.ownedByMe?'<span class="crew-owner-badge">RESPONSABLE</span>':'';
  const countLabel=`${regs.length} pilote${regs.length>1?'s':''} · ${cov.covered}/${cov.duration} h`;
  const management=crew.canManage
    ? `<div class="crew-inline-management">${stateControl(crew,departure)}<span class="coverage-summary">${countLabel}</span></div>`
    : `<div class="crew-inline-management is-readonly"><span class="crew-state-readonly ${crew.locked?'is-complete':'is-open'}">${crew.locked?'Complet':'Ouvert'}</span><span class="coverage-summary">${countLabel}</span></div>`;
  const memberCards=regs.length?`<div class="crew-member-grid" data-pilot-columns="${Math.max(1,Math.min(3,regs.length))}">${regs.map(reg=>renderRegistration(reg,departure,event.durationHours||6,false)).join('')}</div>`:'<p class="empty crew-empty-roster">Aucun pilote n’a encore rejoint cet équipage.</p>';
  const actions=crewActions(crew,departure,ownMember,joinRegistration,memberElsewhere);
  return `<div class="crew-card-shell ${crewColorClass(crew.id,index)} ${crew.locked?'is-complete':'is-open'}">
    <details class="crew-pilot-group crew-pilot-accordion crew-unified-card ${crew.locked?'is-complete':'is-open'}" data-crew="${crew.id}" data-crew-id="${crew.id}" data-crew-locked="${Boolean(crew.locked)}" data-crew-mine="${Boolean(ownMember)}" data-crew-team="${esc(crew.name)}" ${open?'open':''}>
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
        ${memberCards}
        ${renderAvailabilityTimeline({departure,duration:cov.duration,counts:cov.counts,label:'Disponibilité de l’équipage'})}
      </div>
    </details>
    ${actions}
  </div>`;
}

export function renderPilots(event,departure,options={}){
  const crews=[...(departure.crews||[])].sort((a,b)=>event.categories.indexOf(a.category)-event.categories.indexOf(b.category)||String(a.name).localeCompare(String(b.name),'fr',{sensitivity:'base',numeric:true}));
  const assigned=new Set(crews.flatMap(crew=>crew.registrationIds||[]));
  const unassigned=(departure.availability||[]).filter(reg=>reg.status!=='unavailable'&&!assigned.has(reg.id)).sort((a,b)=>event.categories.indexOf(a.category)-event.categories.indexOf(b.category)||String(a.name).localeCompare(String(b.name),'fr',{sensitivity:'base'}));
  const unavailable=(departure.availability||[]).filter(reg=>reg.status==='unavailable');
  const crewCards=crews.length?crews.map((crew,index)=>crewCard(event,departure,crew,index,unassigned,crews)).join(''):'<p class="empty">Aucun équipage pour ce départ.</p>';
  const pilots=unassigned.length?`<section class="ux-unassigned-section"><div class="ux-unassigned-grid">${unassigned.map(reg=>renderRegistration(reg,departure,event.durationHours||6)).join('')}</div></section>`:`<section class="ux-unassigned-section"><p class="empty">${departure.availability.length?'Tous les pilotes disponibles ont déjà un équipage.':'Aucun pilote inscrit sur ce départ.'}</p></section>`;
  const unavailableHtml=unavailable.length?`<details class="ux-crew-bucket ux-unavailable-bucket"><summary><span>Pilotes indisponibles</span><strong>${unavailable.length}</strong></summary><div class="ux-crew-bucket-body">${unavailable.map(reg=>renderRegistration(reg,departure,event.durationHours||6)).join('')}</div></details>`:'';
  const createCrew=options.canCreateCrew?`<button type="button" class="secondary-button crew-builder-open crew-section-create" data-crew-builder-open data-departure="${departure.id}">${esc(options.createCrewLabel||'Créer un équipage')}</button>`:'';
  return `<div class="pilot-section"><div class="ux-course-overview ux-course-split-overview">
    <section class="ux-course-crews-block"><div class="ux-course-crews-heading"><span class="ux-course-crews-title">Équipages <strong>${crews.length}</strong></span>${createCrew}</div><div class="ux-course-crews-body">${crewCards}</div></section>
    <details class="ux-course-pilots-accordion">${contentSummary('Pilotes sans équipage',pilotCount(unassigned))}<div class="ux-course-pilots-body">${pilots}${unavailableHtml}</div></details>
  </div></div>`;
}

export function renderCrews(event,departure,options={}){return renderPilots(event,departure,options);}

export async function updateCrewState(select){
  const event=state.events.find(item=>item.id===state.currentEventId);const departure=event?.departures.find(item=>item.id===select.dataset.departure);const crew=departure?.crews.find(item=>item.id===select.dataset.crewId);if(!crew)throw Error('Équipage introuvable. Actualise la page.');if(!crew.canManage)throw Error('Tu n’as pas l’autorisation de modifier cet équipage.');const locked=select.value==='locked';if(locked===!!crew.locked)return;if(locked&&!confirm(`Marquer « ${crew.name} » comme équipage complet et verrouiller sa composition ?`)){select.value=crew.locked?'locked':'open';return;}select.disabled=true;try{await api(`/api/crews/${crew.id}`,'PATCH',{locked,version:crew.version});state.crewManagementOpen.add(crew.id);}finally{if(select.isConnected)select.disabled=false;}
}
