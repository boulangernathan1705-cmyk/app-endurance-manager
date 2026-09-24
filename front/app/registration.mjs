import {app,state,esc,button,carPreferenceChoices,registrationCarLabel,renderAvailabilityTimeline,notifyRender,logo,categories,dateLabel} from './core.mjs';
import {getLocale} from '../i18n.mjs';

export function ownRegistrations(departure) { return departure.availability.filter(reg => reg.mine); }
export function ownRegistration(departure) { return ownRegistrations(departure)[0]; }
export function registrationDraft(reg) {
  return {name:reg.name,category:reg.category,cars:reg.cars||[],carAny:!!reg.carAny,status:reg.status,preferredPilot:reg.preferredPilot||'',id:reg.id,version:reg.version,participantId:reg.participantId,participantUserId:reg.participantUserId||null,discordLinked:!!reg.discordLinked,mine:reg.mine,forOther:!reg.mine,manualOther:!reg.mine&&!reg.participantUserId&&!reg.discordLinked};
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
  return `<div class="pilot-row${reg.mine?' ux-current-pilot':''}"><div class="pilot-main"><span class="pilot-name">${esc(reg.name)}${origin}</span><span class="pilot-category-logo" title="${esc(reg.category||'Catégorie')}" aria-label="${esc(reg.category||'Catégorie')}">${reg.category?logo(reg.category):'—'}</span>${showCarPreference?`<span class="pilot-car">${esc(registrationCarLabel(reg))}</span>`:''}${reg.status==='unavailable'?'<span class="registration-status">Indisponible</span>':''}${reg.preferredPilot?`<span class="pilot-preference">Souhaite rouler avec : <strong>${esc(reg.preferredPilot)}</strong></span>`:''}</div>${timeline}${reg.canEdit&&!locked?button('edit-registration','Modifier',`data-id="${reg.id}" data-departure="${departure.id}"`,'edit-button ux-pilot-edit'):''}</div>`;
}

function identityFields(stateDraft,departure,categoryMode,manualOther,linkedOther,guestSelf,withPreferred=true) {
  if(categoryMode)return '';
  const fields=[];
  if(!stateDraft.id&&stateDraft.forOther&&state.user){
    const options=state.participants.filter(participant=>participant.id!==state.user?.id);
    const english=getLocale()==='en';
    const manualSelected=manualOther&&!linkedOther;
    fields.push(`<label class="registration-identity-field"><span class="form-label">Pilote</span><select name="participant" data-departure="${departure.id}" required><option value="" disabled ${!linkedOther&&!manualSelected?'selected':''}>${english?'Choose a driver':'Choisir un pilote'}</option>${options.map(participant=>`<option value="${esc(participant.id)}" ${stateDraft.participantUserId===participant.id?'selected':''}>${esc(participant.name)}</option>`).join('')}<option value="__manual__" ${manualSelected?'selected':''}>${english?'Other driver':'Autre pilote'}</option></select></label>`);
  } else if(stateDraft.forOther&&linkedOther) fields.push(`<div class="registration-identity-field registration-identity-readonly"><span class="form-label">Pilote</span><strong>${esc(stateDraft.name||'Pilote Discord')}</strong></div>`);
  if(manualOther||guestSelf) fields.push(`<label class="registration-identity-field"><span class="form-label">${manualOther?'Pseudo de l’autre pilote':'Pseudo pilote'}</span><input name="pilotName" data-departure="${departure.id}" value="${esc(stateDraft.name)}" maxlength="30" required autocomplete="nickname"></label>`);
  if(withPreferred)fields.push(preferredPilotField(stateDraft,departure));
  if(!fields.length)return '';
  return `<div class="registration-identity-grid ${stateDraft.forOther?'is-other':'is-self'}">${fields.join('')}</div>`;
}

function preferredPilotField(stateDraft,departure){return `<label class="registration-identity-field"><span class="form-label">Pilote souhaité <span class="muted">(facultatif)</span></span><input name="preferredPilot" data-departure="${departure.id}" value="${esc(stateDraft.preferredPilot||'')}" maxlength="30" placeholder="Pseudo du pilote souhaité"></label>`;}

function registrationContext(event,departure,stateDraft) {
  const selected=departure.availability.find(reg=>reg.id===stateDraft.id);
  const same=departure.availability.filter(reg=>stateDraft.participantId&&reg.participantId===stateDraft.participantId);
  const assigned=(departure.crews||[]).some(crew=>crew.registrationIds.some(id=>same.some(reg=>reg.id===id)));
  const source=selected||same[0]||(!stateDraft.forOther?ownRegistrations(departure)[0]:null);
  const canAdd=!!source&&!assigned&&stateDraft.mode!=='category'&&event.categories.some(category=>!same.some(reg=>reg.category===category));
  return {selected,same,assigned,source,canAdd};
}

function renderAddCategoryAction(event,departure,stateDraft) {
  const {source,canAdd}=registrationContext(event,departure,stateDraft);
  return canAdd?button('new-registration','Ajouter une catégorie',`data-departure="${departure.id}" data-mode="category" data-registration="${source.id}"`,'secondary-button registration-nav-button category-add-button'):'';
}

export function renderRegistrationForm(event,departure,stateDraft=draftFor(departure)) {
  const duration=event.durationHours||6;
  const {selected,same,assigned,source}=registrationContext(event,departure,stateDraft);
  const contextName=stateDraft.name||source?.name||(!stateDraft.forOther?state.user?.name:'')||'';
  const categoryMode=stateDraft.mode==='category'; const otherMode=stateDraft.forOther&&!categoryMode;
  const linkedOther=stateDraft.forOther&&!!(stateDraft.participantUserId||stateDraft.discordLinked);
  const manualOther=stateDraft.forOther&&!linkedOther&&!categoryMode&&!!stateDraft.manualOther; const guestSelf=!stateDraft.forOther&&!state.user;
  const title=registrationTitle(event,departure,stateDraft);
  const banner=categoryMode?`<div class="registration-context-banner category"><span>AJOUT D’UNE CATÉGORIE</span><strong>${esc(contextName||'Pilote')}</strong></div>`:otherMode?`<div class="registration-context-banner other"><span>${stateDraft.id?'INSCRIPTION GÉRÉE':'AUTRE PILOTE'}</span>${contextName?`<strong>${esc(contextName)}</strong>`:''}</div>`:(contextName||state.user?.name?`<div class="registration-context-banner self"><span>PILOTE</span><strong>${esc(contextName||state.user.name)}</strong></div>`:'');
  return `<form class="form-section registration-form" data-kind="registration" data-departure="${departure.id}"><h3 class="form-title">${title}</h3>${banner}${identityFields(stateDraft,departure,categoryMode,manualOther,linkedOther,guestSelf)}<div class="registration-choices"><span class="form-label">Heures de présence (${duration} h)</span><p class="availability-hint">Clique sur les créneaux où tu es disponible.</p>${renderAvailabilityTimeline({departure,duration,status:stateDraft.status,interactive:true,label:'Heures de présence'})}<div class="special-availability">${button('availability','TOUTE LA COURSE',`data-departure="${departure.id}" data-value="whole" aria-pressed="${stateDraft.status==='whole'}"`,`special-button whole ${stateDraft.status==='whole'?'active':''}`)}</div></div>${stateDraft.status==='unavailable'?'':`<div class="category-area"><span class="form-label">Catégorie</span><div class="categories">${event.categories.map(category=>button('category',`${logo(category)}<span>${esc(category)}</span>`,`data-departure="${departure.id}" data-value="${esc(category)}" ${((assigned&&stateDraft.id&&!categoryMode&&category!==stateDraft.category)||same.some(reg=>reg.id!==stateDraft.id&&reg.category===category))?'disabled':''} aria-pressed="${stateDraft.category===category}"`,`category-button ${categories[category]?.css||''} ${stateDraft.category===category?'active':''}`)).join('')}</div>${stateDraft.category?carPreferenceChoices(stateDraft.category,stateDraft.cars,stateDraft.carAny):''}</div>`}<div class="save-row"><button type="submit" class="save-button">${stateDraft.id?'ENREGISTRER':stateDraft.forOther?'INSCRIRE LE PILOTE':'S’INSCRIRE'}</button>${stateDraft.id?button('delete-registration',stateDraft.forOther?'Supprimer l’inscription':'Se désinscrire',`data-id="${stateDraft.id}" data-departure="${departure.id}"`,'danger-button'):''}</div></form>`;
}

// Step-by-step version of the same form, used in the registration panel of a departure:
// 1 identity + category, 2 cars, 3 hours, 4 summary. Every field stays in the form (hidden steps
// are only hidden), so submitRegistration reads it exactly like the one-page form.
export const REGISTRATION_STEPS=['Catégorie','Voiture(s)','Heures de présence','Récapitulatif'];
export function registrationStep(stateDraft){
  const step=Number(stateDraft.step)||(stateDraft.id?4:1);
  return Math.min(4,Math.max(1,step));
}
function hoursSummary(status,departure,duration){
  if(status==='whole')return `Toute la course (${duration} h)`;
  const hours=String(status||'').split(',').filter(part=>/^h\d+$/.test(part)).map(part=>Number(part.slice(1))).sort((a,b)=>a-b);
  if(!hours.length)return 'Aucune heure choisie';
  const startHour=Number(String(departure.time||'0').split(':')[0])||0;
  const clock=offset=>`${String((startHour+offset)%24).padStart(2,'0')}h`;
  const ranges=[];let first=hours[0],previous=first;
  for(const hour of [...hours.slice(1),null]){
    if(hour!==null&&hour===previous+1){previous=hour;continue;}
    ranges.push(`${clock(first-1)}–${clock(previous)}`);first=hour;previous=hour;
  }
  return `${ranges.join(', ')} (${hours.length} h)`;
}
export function renderSteppedRegistration(event,departure,stateDraft=draftFor(departure)) {
  const duration=event.durationHours||6,step=registrationStep(stateDraft);
  const {same,assigned}=registrationContext(event,departure,stateDraft);
  const categoryMode=stateDraft.mode==='category';
  const linkedOther=stateDraft.forOther&&!!(stateDraft.participantUserId||stateDraft.discordLinked);
  const manualOther=stateDraft.forOther&&!linkedOther&&!categoryMode&&!!stateDraft.manualOther; const guestSelf=!stateDraft.forOther&&!state.user;
  const pane=(n,content)=>`<section class="registration-step" data-step="${n}" ${n===step?'':'hidden'}>${content}</section>`;
  const categoryButtons=event.categories.map(category=>{
    const disabled=(assigned&&stateDraft.id&&!categoryMode&&category!==stateDraft.category)||same.some(reg=>reg.id!==stateDraft.id&&reg.category===category);
    const count=departure.availability.filter(reg=>reg.category===category&&reg.status!=='unavailable').length;
    return button('category',`${logo(category)}<span class="registration-category-copy"><strong>${esc(category)}</strong><small>${count} inscrit${count>1?'s':''} sur ce départ</small></span>`,`data-departure="${departure.id}" data-value="${esc(category)}" ${disabled?'disabled':''} aria-pressed="${stateDraft.category===category}"`,`category-button ${categories[category]?.css||''} ${stateDraft.category===category?'active':''}`);
  }).join('');
  const identity=identityFields(stateDraft,departure,categoryMode,manualOther,linkedOther,guestSelf,false);
  const summaryRow=(n,label,value)=>`<button type="button" class="registration-summary-row" data-action="registration-step" data-departure="${departure.id}" data-step="${n}" data-edit="true"><span>${label}</span><strong>${value}</strong><em>Modifier</em></button>`;
  const cars=stateDraft.carAny?'Peu importe':(stateDraft.cars||[]).length?esc(stateDraft.cars.join(', ')):'—';
  const pilot=stateDraft.name||(!stateDraft.forOther?state.user?.name:'')||'';
  const next=step<4?button('registration-step',stateDraft.returnToSummary?'Revenir au récapitulatif':'Continuer',`data-departure="${departure.id}" data-step="${stateDraft.returnToSummary?4:step+1}"`,'primary-button registration-next'):`<button type="submit" class="save-button registration-next">${stateDraft.id?'ENREGISTRER':stateDraft.forOther?'INSCRIRE LE PILOTE':'VALIDER MON INSCRIPTION'}</button>`;
  return `<form class="form-section registration-form registration-stepper" data-kind="registration" data-departure="${departure.id}" data-step="${step}">
<div class="registration-progress" aria-hidden="true">${REGISTRATION_STEPS.map((_,index)=>`<span class="${index<step?'done':''}"></span>`).join('')}</div>
<p class="registration-step-label">Étape ${step} sur 4 · ${REGISTRATION_STEPS[step-1]}</p>
${pane(1,`${identity}<div class="category-area"><span class="form-label">Dans quelle catégorie ${stateDraft.forOther?'ce pilote veut-il':'veux-tu'} rouler ?</span><div class="categories registration-category-list">${categoryButtons}</div>${categoryMode?'':'<p class="registration-step-help">Tu pourras ajouter une autre catégorie ensuite : les organisateurs choisiront au moment de former les équipages.</p>'}</div>`)}
${pane(2,stateDraft.category?carPreferenceChoices(stateDraft.category,stateDraft.cars,stateDraft.carAny):'<p class="registration-step-help">Choisis d’abord une catégorie.</p>')}
${pane(3,`<div class="registration-choices"><span class="form-label">Heures de présence (${duration} h)</span><p class="availability-hint">Touche les heures où tu seras là.</p>${renderAvailabilityTimeline({departure,duration,status:stateDraft.status,interactive:true,label:'Heures de présence'})}<div class="special-availability">${button('availability','TOUTE LA COURSE',`data-departure="${departure.id}" data-value="whole" aria-pressed="${stateDraft.status==='whole'}"`,`special-button whole ${stateDraft.status==='whole'?'active':''}`)}</div><p class="registration-step-help">${esc(hoursSummary(stateDraft.status,departure,duration))}</p></div>`)}
${pane(4,`<div class="registration-summary">${pilot?`<div class="registration-summary-row is-static"><span>Pilote</span><strong>${esc(pilot)}</strong></div>`:''}${summaryRow(1,'Catégorie',stateDraft.category?`${logo(stateDraft.category)} ${esc(stateDraft.category)}`:'—')}${summaryRow(2,'Voiture(s)',cars)}${summaryRow(3,'Présence',esc(hoursSummary(stateDraft.status,departure,duration)))}</div>${preferredPilotField(stateDraft,departure)}${stateDraft.id?`<div class="registration-danger-zone">${button('delete-registration',stateDraft.forOther?'Supprimer l’inscription':'Se désinscrire',`data-id="${stateDraft.id}" data-departure="${departure.id}"`,'danger-button')}</div>`:''}`)}
<div class="registration-step-nav">${step>1?button('registration-step','Retour',`data-departure="${departure.id}" data-step="${step-1}"`,'secondary-button registration-back'):''}${next}</div>
</form>`;
}

function registrationTitle(event,departure,stateDraft){
  const {source}=registrationContext(event,departure,stateDraft);
  const contextName=stateDraft.name||source?.name||(!stateDraft.forOther?state.user?.name:'')||'';
  if(stateDraft.mode==='category')return `Ajouter une catégorie · ${esc(contextName||'Pilote')}`;
  if(stateDraft.forOther)return stateDraft.id?`Modifier l’inscription · ${esc(contextName||'Pilote')}`:'Inscrire un autre pilote';
  return stateDraft.id?'Modifier ton inscription':'Ton inscription';
}

export function renderRegistrationWorkspace(event,departure) {
  const stateDraft=draftFor(departure);
  const addCategory=renderAddCategoryAction(event,departure,stateDraft);
  const when=`${esc(event.name)} · ${esc(dateLabel(departure))} · ${esc(departure.time||'')}`;
  return `<div class="registration-sheet" role="dialog" aria-modal="true" aria-labelledby="registration-title-${departure.id}"><div class="registration-workspace-head"><div class="registration-workspace-title"><h2 id="registration-title-${departure.id}" tabindex="-1">${registrationTitle(event,departure,stateDraft)}</h2><p>${when}</p></div><span class="registration-workspace-actions">${addCategory}${button('close-registration','Fermer',`data-departure="${departure.id}" aria-label="Fermer l’inscription"`,'secondary-button registration-close-button')}</span></div>${renderSteppedRegistration(event,departure,stateDraft)}</div>`;
}

export function rerenderRegistrationSection(event,departure,focusSelector='',fallback=()=>{}) {
  const section=document.getElementById('departure-'+departure.id)?.querySelector('.fold-registration');
  if(!section){fallback();return;}
  const x=window.scrollX,y=window.scrollY;
  const timelineOffsets=[...section.querySelectorAll('.presence-timeline')].map(timeline=>timeline.scrollLeft);
  section.innerHTML=renderRegistrationWorkspace(event,departure);
  const restoreTimelineOffsets=()=>section.querySelectorAll('.presence-timeline').forEach((timeline,index)=>{const offset=timelineOffsets[index];if(Number.isFinite(offset))timeline.scrollLeft=offset;});
  restoreTimelineOffsets();
  if(focusSelector)section.querySelector(focusSelector)?.focus({preventScroll:true});
  restoreTimelineOffsets();
  window.scrollTo(x,y);
  notifyRender();
  requestAnimationFrame(restoreTimelineOffsets);
}

if(typeof document!=='undefined')document.addEventListener('change',event=>{
  const field=event.target;
  if(field?.name!=='participant'||!field.dataset?.departure)return;
  const draft=state.drafts[field.dataset.departure];
  if(draft)draft.manualOther=field.value==='__manual__';
},true);

export async function submitRegistration(form,api) {
  const departureId=form.dataset.departure; const event=state.events.find(item=>item.id===state.currentEventId); const departure=event.departures.find(item=>item.id===departureId); const draft=draftFor(departure);
  if(draft.forOther&&!draft.id&&!draft.participantUserId&&!draft.manualOther)throw Error('Choisis un pilote.');
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
