import {app,state,esc,button,carPreferenceChoices,registrationCarLabel,renderAvailabilityTimeline,notifyRender,logo,categories} from './core.mjs';

export function ownRegistrations(departure) { return departure.availability.filter(reg => reg.mine); }
export function ownRegistration(departure) { return ownRegistrations(departure)[0]; }
export function registrationDraft(reg) {
  return {name:reg.name,category:reg.category,cars:reg.cars||[],carAny:!!reg.carAny,status:reg.status,preferredPilot:reg.preferredPilot||'',id:reg.id,version:reg.version,participantId:reg.participantId,participantUserId:reg.participantUserId||null,discordLinked:!!reg.discordLinked,mine:reg.mine,forOther:!reg.mine};
}
export function draftFor(departure) {
  if (!state.drafts[departure.id]) {
    const mine=ownRegistration(departure);
    state.drafts[departure.id]=mine ? registrationDraft(mine) : {name:state.user?.name?.slice(0,30)||state.pilotName,category:'',cars:[],carAny:false,status:'',preferredPilot:'',id:null,version:null,forOther:false};
  }
  return state.drafts[departure.id];
}
export function statusLabel(status) {
  if(status==='whole')return 'Toute la course'; if(status==='unavailable')return 'Indisponible';
  return String(status||'').split(',').map(part=>/^h\d+$/.test(part)?`Heure ${part.slice(1)}`:({beginning:'Début',middle:'Milieu',end:'Fin'}[part]||'')).filter(Boolean).join(' · ');
}
function slotLabel(status) { return status==='whole'?'Toute la course':status==='unavailable'?'Indisponible':String(status||'').split(',').filter(part=>/^h\d+$/.test(part)).map(part=>`Heure ${part.slice(1)}`).join(' · ')||statusLabel(status); }

export function renderRegistration(reg,departure,duration,showCarPreference=true) {
  const locked=departure.startsAt<=Date.now();
  const origin=reg.addedByName?` <span class="registration-origin-info" title="Inscription ajoutée par ${esc(reg.addedByName)}" aria-label="Inscription ajoutée par ${esc(reg.addedByName)}">ⓘ</span>`:'';
  const timeline=renderAvailabilityTimeline({departure,duration,status:reg.status,label:slotLabel(reg.status)});
  return `<div class="pilot-row${reg.mine?' ux-current-pilot':''}"><div class="pilot-main"><span class="pilot-name">${esc(reg.name)}${origin}</span><span class="pilot-category-logo">${reg.category?`<span class="pilot-category-value">${esc(reg.category)}</span>`:'—'}</span>${showCarPreference?`<span class="pilot-car">${esc(registrationCarLabel(reg))}</span>`:''}${reg.status==='unavailable'?'<span class="registration-status">Indisponible</span>':''}${reg.preferredPilot?`<span class="pilot-preference">Souhaite rouler avec : <strong>${esc(reg.preferredPilot)}</strong></span>`:''}</div>${timeline}${reg.canEdit&&!locked?button('edit-registration','Modifier',`data-id="${reg.id}" data-departure="${departure.id}"`,'edit-button ux-pilot-edit'):''}</div>`;
}

function identityFields(stateDraft,departure,categoryMode,manualOther,linkedOther,guestSelf) {
  if(categoryMode)return '';
  const fields=[];
  if(!stateDraft.id&&stateDraft.forOther&&state.user){
    const options=state.participants.filter(participant=>participant.id!==state.user?.id);
    fields.push(`<label class="registration-identity-field"><span class="form-label">Pilote</span><select name="participant" data-departure="${departure.id}"><option value="">Autre pilote · pseudo manuel</option>${options.map(participant=>`<option value="${esc(participant.id)}" ${stateDraft.participantUserId===participant.id?'selected':''}>${esc(participant.name)}</option>`).join('')}</select></label>`);
  } else if(stateDraft.forOther&&linkedOther) fields.push(`<div class="registration-identity-field registration-identity-readonly"><span class="form-label">Pilote</span><strong>${esc(stateDraft.name||'Pilote Discord')}</strong></div>`);
  if(manualOther||guestSelf) fields.push(`<label class="registration-identity-field"><span class="form-label">${manualOther?'Pseudo de l’autre pilote':'Pseudo pilote'}</span><input name="pilotName" data-departure="${departure.id}" value="${esc(stateDraft.name)}" maxlength="30" required autocomplete="nickname"></label>`);
  fields.push(`<label class="registration-identity-field"><span class="form-label">Pilote souhaité <span class="muted">(facultatif)</span></span><input name="preferredPilot" data-departure="${departure.id}" value="${esc(stateDraft.preferredPilot||'')}" maxlength="30" placeholder="Pseudo du pilote souhaité"></label>`);
  return `<div class="registration-identity-grid ${stateDraft.forOther?'is-other':'is-self'}">${fields.join('')}</div>`;
}

export function renderRegistrationForm(event,departure,stateDraft=draftFor(departure)) {
  const duration=event.durationHours||6;
  const selected=departure.availability.find(reg=>reg.id===stateDraft.id);
  const same=departure.availability.filter(reg=>stateDraft.participantId&&reg.participantId===stateDraft.participantId);
  const assigned=(departure.crews||[]).some(crew=>crew.registrationIds.some(id=>same.some(reg=>reg.id===id)));
  const source=selected||same[0]||(!stateDraft.forOther?ownRegistrations(departure)[0]:null);
  const canAdd=source&&!assigned&&event.categories.some(category=>!same.some(reg=>reg.category===category));
  const contextName=stateDraft.name||source?.name||(!stateDraft.forOther?state.user?.name:'')||'';
  const categoryMode=stateDraft.mode==='category'; const otherMode=stateDraft.forOther&&!categoryMode;
  const linkedOther=stateDraft.forOther&&!!(stateDraft.participantUserId||stateDraft.discordLinked);
  const manualOther=stateDraft.forOther&&!linkedOther&&!categoryMode; const guestSelf=!stateDraft.forOther&&!state.user;
  const addCategory=canAdd?button('new-registration','Ajouter une catégorie',`data-departure="${departure.id}" data-mode="category" data-registration="${source.id}"`, 'secondary-button registration-nav-button category-add-button'):'';
  const title=categoryMode?`Ajouter une catégorie · ${esc(contextName||'Pilote')}`:otherMode?(stateDraft.id?`Modifier l’inscription · ${esc(contextName||'Pilote')}`:'Inscrire un autre pilote'):'Mon inscription';
  const banner=categoryMode?`<div class="registration-context-banner category"><span>AJOUT D’UNE CATÉGORIE</span><strong>${esc(contextName||'Pilote')}</strong></div>`:otherMode?`<div class="registration-context-banner other"><span>${stateDraft.id?'INSCRIPTION GÉRÉE':'AUTRE PILOTE'}</span>${contextName?`<strong>${esc(contextName)}</strong>`:''}</div>`:`<div class="registration-context-banner self"><span>TON INSCRIPTION</span><strong>${esc(contextName||state.user?.name||'Mon inscription')}</strong></div>`;
  return `<form class="form-section registration-form" data-kind="registration" data-departure="${departure.id}"><h3 class="form-title">${title}${addCategory?`<span class="registration-form-actions">${addCategory}</span>`:''}</h3>${banner}${identityFields(stateDraft,departure,categoryMode,manualOther,linkedOther,guestSelf)}<div class="registration-choices"><span class="form-label">Heures de présence (${duration} h)</span><p class="availability-hint">Clique sur les créneaux où tu es disponible.</p>${renderAvailabilityTimeline({departure,duration,status:stateDraft.status,interactive:true,label:'Heures de présence'})}<div class="special-availability">${button('availability','TOUTE LA COURSE',`data-departure="${departure.id}" data-value="whole" aria-pressed="${stateDraft.status==='whole'}"`,`special-button whole ${stateDraft.status==='whole'?'active':''}`)}</div></div>${stateDraft.status==='unavailable'?'':`<div class="category-area"><span class="form-label">Catégorie</span><div class="categories">${event.categories.map(category=>button('category',`${logo(category)}<span>${esc(category)}</span>`,`data-departure="${departure.id}" data-value="${esc(category)}" ${((assigned&&stateDraft.id&&!categoryMode&&category!==stateDraft.category)||same.some(reg=>reg.id!==stateDraft.id&&reg.category===category))?'disabled':''} aria-pressed="${stateDraft.category===category}"`,`category-button ${categories[category]?.css||''} ${stateDraft.category===category?'active':''}`)).join('')}</div>${stateDraft.category?carPreferenceChoices(stateDraft.category,stateDraft.cars,stateDraft.carAny):''}</div>`}<div class="save-row"><button type="submit" class="save-button">${stateDraft.id?'ENREGISTRER':stateDraft.forOther?'INSCRIRE LE PILOTE':'S’INSCRIRE'}</button>${stateDraft.id?button('delete-registration',stateDraft.forOther?'Supprimer l’inscription':'Se désinscrire',`data-id="${stateDraft.id}" data-departure="${departure.id}"`,'danger-button'):''}</div></form>`;
}

export function renderRegistrationWorkspace(event,departure) { return `<div class="registration-workspace-head"><h2>Inscriptions</h2>${button('close-registration','Fermer',`data-departure="${departure.id}"`,'secondary-button registration-close-button')}</div>${renderRegistrationForm(event,departure)}`; }

export function rerenderRegistrationSection(event,departure,focusSelector='',fallback=()=>{}) {
  const section=document.getElementById('departure-'+departure.id)?.querySelector('.fold-registration');
  if(!section){fallback();return;}
  const x=window.scrollX,y=window.scrollY; section.innerHTML=renderRegistrationWorkspace(event,departure); if(focusSelector)section.querySelector(focusSelector)?.focus({preventScroll:true}); window.scrollTo(x,y); notifyRender();
}

export async function submitRegistration(form,api) {
  const departureId=form.dataset.departure; const event=state.events.find(item=>item.id===state.currentEventId); const departure=event.departures.find(item=>item.id===departureId); const draft=draftFor(departure);
  draft.name=form.elements.pilotName?.value.trim()||draft.name||(!draft.forOther?state.user?.name?.slice(0,30):'');
  if(!draft.name)throw Error(draft.forOther?'Indique le pseudo du pilote.':'Ton compte Discord ne contient pas de nom utilisable.');
  if(!draft.status)throw Error('Choisis ta disponibilité.'); if(draft.status!=='unavailable'&&!draft.category)throw Error('Choisis ta catégorie.');
  draft.cars=[...form.querySelectorAll('[name="carPreference"]:checked')].map(input=>input.value); draft.carAny=!!form.elements.carAny?.checked;
  if(draft.status!=='unavailable'&&!draft.carAny&&!draft.cars.length)throw Error('Choisis au moins une voiture, ou coche « Peu importe la voiture ».');
  const payload={name:draft.name,status:draft.status,category:draft.category,cars:draft.cars,carAny:draft.carAny,preferredPilot:draft.preferredPilot||'',version:draft.version,participantId:draft.participantId,participantUserId:draft.participantUserId,forOther:!!draft.forOther};
  const result=await api(draft.id?`/api/registrations/${draft.id}`:`/api/events/${event.id}/departures/${departure.id}/registrations`,draft.id?'PATCH':'POST',payload);
  if(!draft.forOther){state.pilotName=draft.name;try{localStorage.setItem('fmt_pilot_name',state.pilotName);}catch{}}
  if(result.recoveryLink)state.recoveryLink=result.recoveryLink; delete state.drafts[departureId]; state.registrationOpen.delete(departureId); return result;
}
