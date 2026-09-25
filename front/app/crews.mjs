import {state,esc,button,logo,registrationCarLabel,renderAvailabilityTimeline,crewColorClass,sortedCrews,coversHour,pilotCount,api} from './core.mjs';
import {renderRegistration} from './registration.mjs';

function contentSummary(title,count){return `<summary class="ux-content-accordion-summary"><span class="ux-content-accordion-title">${esc(title)}</span><span class="ux-content-accordion-count">${count}</span><span class="ux-content-accordion-chevron" aria-hidden="true">›</span></summary>`;}
function statusPill(crew){return `<span class="crew-compact-status ${crew.locked?'is-complete':'is-open'}">${crew.locked?'Complet':'Places libres'}</span>`;}
function coverage(event,departure,regs){const duration=event.durationHours||6;const counts=Array.from({length:duration},(_,i)=>regs.filter(reg=>coversHour(reg,i)).length);const covered=counts.filter(Boolean).length;return{duration,counts,covered,missing:Math.max(0,duration-covered)};}

// Opened crew: each pilot's timeline with its own hour scale, and a warning listing the hours nobody covers.
function hourLabel(departure,offset){const [hours,minutes]=String(departure.time||'0:00').split(':').map(Number);const hour=((hours||0)+offset)%24;return minutes?`${String(hour).padStart(2,'0')}h${String(minutes).padStart(2,'0')}`:`${String(hour).padStart(2,'0')}h`;}
function uncoveredRanges(counts){
  const ranges=[];
  counts.forEach((count,index)=>{if(count)return;const last=ranges.at(-1);if(last&&last.end===index)last.end=index+1;else ranges.push({start:index,end:index+1});});
  return ranges;
}
// One line per pilot: name (in the pilot's colour) and their timeline with its own hour scale.
export function pilotLines(departure,duration,regs,{editable=true}={}){
  const locked=departure.startsAt<=Date.now();
  return regs.map(reg=>{
    const origin=reg.addedByName?`<span class="registration-origin-info" title="Inscription ajoutée par ${esc(reg.addedByName)}" aria-label="Inscription ajoutée par ${esc(reg.addedByName)}">ⓘ</span>`:'';
    const edit=editable&&reg.canEdit&&!locked?button('edit-registration','Modifier',`data-id="${reg.id}" data-departure="${departure.id}" aria-label="Modifier l’inscription de ${esc(reg.name)}"`,'link-button crew-planning-edit'):'';
    return `<div class="crew-planning-row crew-pilot-line pilot-row${reg.mine?' ux-current-pilot':''}"><span class="crew-planning-label"><span class="pilot-name">${esc(reg.name)}</span>${origin}${edit}</span>${renderAvailabilityTimeline({departure,duration,status:reg.status,label:`Disponibilités de ${reg.name}`})}</div>`;
  }).join('');
}
// A crew's availability: the pilots' timelines, with a warning listing the hours nobody covers.
export function crewAvailability(event,departure,regs,{editable=true}={}){
  if(!regs.length)return '<p class="empty crew-empty-roster">Aucun pilote n’a encore rejoint cet équipage.</p>';
  const cov=coverage(event,departure,regs);
  const gaps=uncoveredRanges(cov.counts);
  const warning=gaps.length?`<p class="crew-gap-warning" role="note"><span aria-hidden="true">⚠</span> Aucun pilote ${gaps.map(gap=>`de ${hourLabel(departure,gap.start)} à ${hourLabel(departure,gap.end)}`).join(', ')}</p>`:'';
  return `${warning}<section class="crew-pilot-lines" aria-label="Heures de chaque pilote">${pilotLines(departure,cov.duration,regs,{editable})}</section>`;
}

function stateControl(crew,departure){return `<div class="crew-state-control"><span class="crew-state-lock" aria-hidden="true">${crew.locked?'🔒':'🔓'}</span><label class="crew-state-select-wrap"><span class="sr-only">État de l’équipage</span><select class="crew-state-select" data-crew-state-select data-crew-id="${crew.id}" data-departure="${departure.id}" data-version="${crew.version}"><option value="open" ${crew.locked?'':'selected'}>Ouvert</option><option value="locked" ${crew.locked?'selected':''}>Complet</option></select><span class="crew-state-chevron" aria-hidden="true">▾</span></label></div>`;}

function crewActions(crew,departure,ownMember,joinRegistration,memberElsewhere){
  const actions=[];
  if(!ownMember&&!memberElsewhere&&!crew.locked&&state.user){
    const registration=joinRegistration?.id||'';
    actions.push(button('join-crew','Rejoindre',`data-id="${crew.id}" data-departure="${departure.id}" data-registration="${registration}" data-version="${crew.version}" aria-label="Rejoindre l’équipage ${esc(crew.name)}"`,'primary-button crew-join-button'));
  }
  if(ownMember)actions.push(button('leave-crew','Quitter',`data-id="${crew.id}" data-departure="${departure.id}" data-registration="${ownMember.id}" data-version="${crew.version}" aria-label="Quitter l’équipage ${esc(crew.name)}"`,'link-button crew-leave-button'));
  if(crew.canManage){
    actions.push(button('edit-crew','Gérer',`data-id="${crew.id}" data-departure="${departure.id}" aria-label="Gérer l’équipage ${esc(crew.name)}"`,'link-button crew-manage-button'));
    actions.push(button('delete-crew','<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/></svg><span>Supprimer</span>',`data-id="${crew.id}" data-departure="${departure.id}" data-version="${crew.version}" aria-label="Supprimer l’équipage ${esc(crew.name)}"`,'danger-link crew-delete-button'));
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
  const ownerBadge=crew.ownedByMe?'<span class="crew-owner-badge">Responsable</span>':'';
  const countLabel=`${regs.length} pilote${regs.length>1?'s':''} · ${cov.covered}/${cov.duration} h`;
  const management=crew.canManage
    ? `<div class="crew-inline-management">${stateControl(crew,departure)}<span class="coverage-summary">${countLabel}</span></div>`
    : `<div class="crew-inline-management is-readonly"><span class="crew-state-readonly ${crew.locked?'is-complete':'is-open'}">${crew.locked?'Complet':'Ouvert'}</span><span class="coverage-summary">${countLabel}</span></div>`;
  const actions=crewActions(crew,departure,ownMember,joinRegistration,memberElsewhere);
  return `<div class="crew-card-shell ${crewColorClass(crew.id,index)} ${crew.locked?'is-complete':'is-open'}${ownMember?' is-mine':''}">
    <details class="crew-pilot-group crew-pilot-accordion crew-unified-card ${crew.locked?'is-complete':'is-open'}" data-crew="${crew.id}" data-crew-id="${crew.id}" data-crew-locked="${Boolean(crew.locked)}" data-crew-mine="${Boolean(ownMember)}" data-crew-team="${esc(crew.name)}" ${open?'open':''}>
      <summary class="crew-pilot-accordion-summary crew-tile-summary" aria-label="${esc(crew.name)} · ${esc(names)} · ${esc(crew.car||'Voiture à choisir')}">
        <span class="crew-tile-head"><span class="crew-compact-category" aria-hidden="true">${logo(crew.category)}</span><span class="crew-compact-team"><strong>${esc(crew.name)}</strong>${ownerBadge}</span><span class="crew-compact-chevron" aria-hidden="true">›</span></span>
        ${ownMember?'<span class="crew-mine-badge">Ton équipage</span>':''}
        <span class="crew-compact-pilots">${regs.length?regs.map(reg=>`<span>${esc(reg.name)}</span>`).join(''):'<span class="is-empty">Aucun pilote</span>'}</span>
        <span class="crew-tile-foot"><span class="crew-compact-car">${esc(crew.car||'Voiture à choisir')}</span>${statusPill(crew)}</span>
      </summary>
      <div class="crew-pilot-accordion-body crew-unified-body">
        ${management}
        ${crewAvailability(event,departure,regs)}
      </div>
    </details>
    ${actions}
  </div>`;
}

export function renderPilots(event,departure,options={}){
  const crews=sortedCrews(event,departure);
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
