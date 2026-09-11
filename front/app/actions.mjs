import {app,state,api,load,showError,countdown,CARS} from './core.mjs';
import {renderNav,renderHome} from './home-view.mjs';
import {renderEvent} from './event-view.mjs';
import {renderEventForm,departureFields,updateRemoveButtons} from './event-form.mjs';
import {renderMyEntries} from './entries-view.mjs?v=2-three-accordions';
import {refresh,refreshAfterSave} from './refresh.mjs';
import {draftFor,registrationDraft,ownRegistrations,rerenderRegistrationSection,submitRegistration} from './registration.mjs';
import {updateCrewState} from './crews.mjs';

async function submitEvent(form){
  const data={name:form.elements.eventName.value.trim(),durationHours:Number(form.elements.eventDuration.value),eventType:form.elements.eventType.value,circuit:form.elements.eventCircuit.value,categories:[...form.querySelectorAll('[name="eventCategory"]:checked')].map(input=>input.value),departures:[...form.querySelectorAll('.departure-field')].map(row=>({id:row.dataset.id||undefined,date:row.querySelector('[name="date"]').value,time:row.querySelector('[name="time"]').value})),version:state.editingEvent?.version};
  if(!data.categories.length)throw Error('Sélectionne au moins une catégorie.'); if(!data.circuit)throw Error('Sélectionne le circuit de la course.');
  const editing=!!state.editingEvent; const result=await api(editing?`/api/events/${state.editingEvent.id}`:'/api/events',editing?'PATCH':'POST',data);
  if(editing){state.currentEventId=state.editingEvent.id;state.page='event';}else{state.page='home';state.currentEventId=null;}
  await refreshAfterSave(editing?'Événement modifié.':'Événement créé.',result.id);
}

async function perform(action,target){
  const event=state.events.find(item=>item.id===state.currentEventId);
  switch(action){
    case 'dismiss-error': document.querySelector('[data-ux-error-modal]')?.remove(); break;
    case 'home': renderHome(); break;
    case 'event-filter': state.eventFilter=target.dataset.filter||'upcoming'; renderHome(); break;
    case 'refresh': await refresh(); break;
    case 'open': state.currentEventId=target.dataset.id; state.selectedDepartureId=target.dataset.departure||null; state.eventSection='race'; state.drafts={}; state.registrationOpen.clear(); renderEvent(); break;
    case 'event-section': state.eventSection=target.dataset.section; renderEvent(); break;
    case 'my-registration': { state.selectedDepartureId=target.dataset.departure; delete state.drafts[state.selectedDepartureId]; state.registrationOpen.add(state.selectedDepartureId); renderEvent(); break; }
    case 'close-registration': state.registrationOpen.delete(target.dataset.departure); renderEvent(); break;
    case 'new-registration': {
      state.selectedDepartureId=target.dataset.departure; const departure=event.departures.find(item=>item.id===target.dataset.departure); const categoryMode=target.dataset.mode==='category'; const existing=departure.availability.find(reg=>reg.id===target.dataset.registration)||ownRegistrations(departure)[0];
      state.drafts[departure.id]={...(categoryMode&&existing?registrationDraft(existing):{name:'',status:'',preferredPilot:'',forOther:!!state.user,participantUserId:null}),category:'',cars:[],carAny:false,id:null,version:null,mode:categoryMode?'category':'pilot'}; state.registrationOpen.add(departure.id); renderEvent(); (document.querySelector(`[name="participant"][data-departure="${departure.id}"]`)||document.querySelector(`[name="pilotName"][data-departure="${departure.id}"]`))?.focus(); break;
    }
    case 'edit-registration': { const departure=event.departures.find(item=>item.id===target.dataset.departure),reg=departure.availability.find(item=>item.id===target.dataset.id); if(!reg?.canEdit)throw Error('Tu n’as pas l’autorisation de modifier cette inscription.'); state.selectedDepartureId=departure.id; state.drafts[departure.id]=registrationDraft(reg); state.registrationOpen.add(departure.id); state.eventSection='race'; renderEvent(); break; }
    case 'availability': {
      const departure=event.departures.find(item=>item.id===target.dataset.departure),draft=draftFor(departure),value=target.dataset.value; state.registrationOpen.add(departure.id);
      if(value==='whole')draft.status='whole'; else {const duration=event.durationHours||6,parts=new Set(draft.status==='whole'?Array.from({length:duration},(_,i)=>`h${i+1}`):String(draft.status||'').split(',').filter(part=>/^h\d+$/.test(part)));parts.has(value)?parts.delete(value):parts.add(value);draft.status=parts.size===duration?'whole':[...parts].sort((a,b)=>Number(a.slice(1))-Number(b.slice(1))).join(',');}
      rerenderRegistrationSection(event,departure,`[data-action="availability"][data-value="${value}"]`,renderEvent); break;
    }
    case 'category': { const departure=event.departures.find(item=>item.id===target.dataset.departure),draft=draftFor(departure); draft.category=target.dataset.value; draft.cars=(draft.cars||[]).filter(car=>CARS[draft.category]?.includes(car)); draft.carAny=false; rerenderRegistrationSection(event,departure,'',renderEvent); break; }
    case 'delete-registration': { const departure=event.departures.find(item=>item.id===target.dataset.departure),reg=departure.availability.find(item=>item.id===target.dataset.id); if(!reg)throw Error('Inscription introuvable.'); if(!confirm(`Supprimer l’inscription de ${reg.name} pour ce départ ?`))return; await api(`/api/registrations/${reg.id}`,'DELETE',{version:reg.version}); delete state.drafts[departure.id]; state.registrationOpen.delete(departure.id); await refreshAfterSave('Inscription supprimée.'); break; }
    case 'add-crew-pilot': case 'remove-crew-pilot': case 'delete-crew': {
      const departure=event.departures.find(item=>item.id===target.dataset.departure); const crew=departure.crews.find(item=>item.id===target.dataset.id); if(!crew)throw Error('Équipage introuvable.');
      if(action==='delete-crew'){if(!confirm(`Supprimer « ${crew.name} » ? Les inscriptions des pilotes seront conservées.`))return; await api(`/api/crews/${crew.id}`,'DELETE',{version:crew.version});}
      else if(action==='add-crew-pilot'){const registrationId=target.dataset.registration;if(!registrationId)throw Error('Choisis un pilote.');const result=await api(`/api/crews/${crew.id}/members`,'POST',{registrationId,version:crew.version});state.crewManagementOpen.add(crew.id);await refreshAfterSave(`Pilote affecté. ${result.removedRegistrations||0} autre(s) inscription(s) retirée(s) pour ce départ.`);return;}
      else {if(!confirm('Retirer ce pilote de l’équipage ? Son inscription sera conservée.'))return;await api(`/api/crews/${crew.id}/members/${target.dataset.registration}`,'DELETE',{version:crew.version});state.crewManagementOpen.add(crew.id);}
      await refreshAfterSave('Équipages mis à jour.'); break;
    }
    case 'create': renderEventForm(); break;
    case 'edit-event': renderEventForm(event); break;
    case 'add-departure': if(app.querySelectorAll('.departure-field').length>=30)throw Error('Maximum 30 départs par événement.');document.getElementById('departureFields').insertAdjacentHTML('beforeend',departureFields());updateRemoveButtons();break;
    case 'remove-departure': if(app.querySelectorAll('.departure-field').length>1)target.closest('.departure-field').remove();updateRemoveButtons();break;
    case 'delete-event': if(!confirm(`Supprimer « ${event.name} » et toutes ses inscriptions ? Cette suppression est définitive.`))return;await api(`/api/events/${event.id}`,'DELETE',{version:event.version});state.page='home';await refreshAfterSave('Événement supprimé.');break;
    case 'my-entries': await load();renderNav();renderMyEntries();break;
    case 'guest-link': state.recoveryLink=(await api('/api/guest/link','POST')).link;state.page==='event'?renderEvent():renderHome();break;
    case 'copy-link': try{await navigator.clipboard.writeText(state.recoveryLink);target.textContent='Lien copié';}catch{document.getElementById('personalLink')?.select();throw Error('Copie le lien sélectionné avec Ctrl+C.');}break;
    case 'hide-link': state.recoveryLink='';target.closest('.recovery-panel')?.remove();break;
  }
}

document.addEventListener('input',event=>{const field=event.target;if(field.dataset.departure&&state.drafts[field.dataset.departure]){if(field.name==='pilotName')state.drafts[field.dataset.departure].name=field.value;if(field.name==='preferredPilot')state.drafts[field.dataset.departure].preferredPilot=field.value;}});
document.addEventListener('change',async event=>{
  const field=event.target;
  if(field.matches?.('[data-crew-state-select]')){try{await updateCrewState(field);await refreshAfterSave('Équipage mis à jour.');}catch(error){showError(error);}return;}
  if(field.name==='participant'){const draft=state.drafts[field.dataset.departure],participant=state.participants.find(item=>item.id===field.value);if(draft){draft.participantUserId=participant?.id||null;draft.participantId=participant?.participantId||null;draft.name=participant?.name||'';draft.category='';draft.cars=[];draft.carAny=false;state.registrationOpen.add(field.dataset.departure);renderEvent();}return;}
  const departureId=field.form?.dataset.departure;if(departureId&&state.drafts[departureId]&&(field.name==='carPreference'||field.name==='carAny')){const draft=state.drafts[departureId];draft.cars=[...field.form.querySelectorAll('[name="carPreference"]:checked')].map(input=>input.value);draft.carAny=!!field.form.elements.carAny?.checked;if(draft.carAny)draft.cars=[];for(const input of field.form.querySelectorAll('[name="carPreference"]')){input.disabled=draft.carAny;if(draft.carAny)input.checked=false;}}
});
document.addEventListener('toggle',event=>{const details=event.target;if(details instanceof HTMLDetailsElement&&details.matches('.crew-management-accordion[data-crew]'))details.open?state.crewManagementOpen.add(details.dataset.crew):state.crewManagementOpen.delete(details.dataset.crew);},true);
document.addEventListener('click',async event=>{const target=event.target.closest?.('[data-action]');if(!target||target.disabled)return;if(target.dataset.action==='edit-crew')return;event.preventDefault();if(state.busy&&target.dataset.action!=='dismiss-error')return;state.busy=true;target.disabled=true;try{await perform(target.dataset.action,target);}catch(error){showError(error);}finally{state.busy=false;if(target.isConnected)target.disabled=false;updateRemoveButtons();}});
document.addEventListener('submit',async event=>{const form=event.target;if(!form.dataset.kind)return;event.preventDefault();if(state.busy)return;state.busy=true;const submit=form.querySelector('[type="submit"]');if(submit)submit.disabled=true;try{if(form.dataset.kind==='event')await submitEvent(form);else if(form.dataset.kind==='registration'){await submitRegistration(form,api);await refreshAfterSave('Inscription enregistrée.');}}catch(error){showError(error);}finally{state.busy=false;if(submit?.isConnected)submit.disabled=false;}});
document.addEventListener('error',event=>{const image=event.target;if(image instanceof HTMLImageElement&&image.matches('.circuit-visual img'))image.remove();},true);
setInterval(()=>document.querySelectorAll('[data-countdown]').forEach(element=>{element.textContent=countdown(Number(element.dataset.countdown));}),1000);

async function start(){
  try{const token=new URLSearchParams(location.hash.slice(1)).get('access');if(token){history.replaceState(null,'',location.pathname+location.search);await api('/api/guest/recover','POST',{token});state.flash='Tes inscriptions invitées sont accessibles sur cet appareil.';}const authError=new URLSearchParams(location.search).get('auth');if(authError){history.replaceState(null,'',location.pathname);state.flash='La connexion Discord n’a pas abouti. Tu peux réessayer.';}await load();renderNav();renderHome(state.flash);}catch(error){app.innerHTML='<h1 class="page-title">ENDURANCE MANAGER</h1>';showError(error);}
}
start();
