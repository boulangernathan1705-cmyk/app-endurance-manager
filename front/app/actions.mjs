import {app,state,api,load,showError,countdown,CARS} from './core.mjs';
import {renderNav,renderHome} from './home-view.mjs?v=2-home-crew-summary';
import {renderEvent} from './event-view.mjs';
import {renderEventForm,departureFields,updateRemoveButtons} from './event-form.mjs';
import {renderMyEntries} from './entries-view.mjs?v=2-three-accordions';
import {refresh,refreshAfterSave} from './refresh.mjs';
import {draftFor,registrationDraft,ownRegistrations,rerenderRegistrationSection,submitRegistration} from './registration.mjs';
import {updateCrewState} from './crews.mjs';

function eventById(id){return state.events.find(event=>event.id===id);}
function departureById(event,id){return event?.departures.find(departure=>departure.id===id);}
function actionTarget(event){return event.target.closest('[data-action]');}

function updateCountdowns(){
  document.querySelectorAll('[data-countdown]').forEach(node=>{const timestamp=Number(node.dataset.countdown);if(Number.isFinite(timestamp))node.textContent=countdown(timestamp);});
}
setInterval(updateCountdowns,1000);

async function navigate(action,id=''){
  if(action==='home'){renderHome();return;}
  if(action==='my-entries'){renderMyEntries();return;}
  if(action==='open'){const event=eventById(id);if(event)renderEvent(event);return;}
  if(action==='create'){state.editingEvent={name:'',categories:[],eventType:'private',durationHours:6,circuit:'',departures:[]};renderEventForm();return;}
}

async function handleClick(event){
  const target=actionTarget(event);if(!target)return;const action=target.dataset.action;const id=target.dataset.id||'';
  if(['home','my-entries','open','create'].includes(action)){event.preventDefault();await navigate(action,id);return;}
  if(action==='event-filter'){state.eventFilter=target.dataset.filter==='archived'?'archived':'upcoming';renderHome();return;}
  if(action==='dismiss-error'){document.querySelector('[data-ux-error-modal]')?.remove();return;}
  if(action==='guest-link'){try{const result=await api('/api/recovery-link','POST',{});state.recoveryLink=result.url||'';renderHome();}catch(error){showError(error);}return;}
  if(action==='copy-link'){const input=document.getElementById('personalLink');if(input){await navigator.clipboard.writeText(input.value);target.textContent='Copié';}return;}
  if(action==='hide-link'){state.recoveryLink='';renderHome();return;}
  if(action==='edit-event'){const current=eventById(state.currentEventId);if(current){state.editingEvent=structuredClone(current);renderEventForm();}return;}
  if(action==='cancel-event-edit'){const current=eventById(state.currentEventId);current?renderEvent(current):renderHome();return;}
  if(action==='add-departure'){state.editingEvent.departures.push({id:`draft-${crypto.randomUUID()}`,date:'',time:'',startsAt:null,availability:[],crews:[]});renderEventForm();return;}
  if(action==='remove-departure'){const index=Number(target.dataset.index);state.editingEvent.departures.splice(index,1);renderEventForm();return;}
  if(action==='event-section'){state.eventSection=target.dataset.section||'race';const current=eventById(state.currentEventId);if(current)renderEvent(current);return;}
  if(action==='select-departure'){state.selectedDepartureId=id;const current=eventById(state.currentEventId);if(current)renderEvent(current);return;}
  if(action==='toggle-registration'){const key=id;if(state.registrationOpen.has(key))state.registrationOpen.delete(key);else state.registrationOpen.add(key);const current=eventById(state.currentEventId);if(current)renderEvent(current);return;}
  if(action==='edit-registration'){const current=eventById(state.currentEventId);const departure=departureById(current,target.dataset.departure);if(current&&departure){state.registrationOpen.add(departure.id);renderEvent(current);}return;}
  if(action==='delete-registration'){if(!confirm('Supprimer cette inscription ?'))return;try{await api(`/api/registrations/${id}`,'DELETE');await refreshAfterSave();}catch(error){showError(error);}return;}
  if(action==='create-crew'){const current=eventById(state.currentEventId);const departure=departureById(current,target.dataset.departure);if(!current||!departure)return;const category=target.dataset.category||current.categories[0]||'';const name=prompt('Nom de l’équipage','FMT');if(!name)return;const car=prompt('Voiture (facultatif)','')||'';try{await api('/api/crews','POST',{eventId:current.id,departureId:departure.id,category,name,car});await refreshAfterSave();}catch(error){showError(error);}return;}
  if(action==='edit-crew'){const current=eventById(state.currentEventId);const departure=departureById(current,target.dataset.departure);const crew=departure?.crews.find(item=>item.id===id);if(!crew)return;const name=prompt('Nom de l’équipage',crew.name);if(!name)return;const car=prompt('Voiture',crew.car||'')??crew.car||'';try{await api(`/api/crews/${id}`,'PATCH',{name,car,version:crew.version});await refreshAfterSave();}catch(error){showError(error);}return;}
  if(action==='delete-crew'){if(!confirm('Supprimer cet équipage ?'))return;try{await api(`/api/crews/${id}`,'DELETE');await refreshAfterSave();}catch(error){showError(error);}return;}
  if(action==='add-crew-pilot'){try{await api(`/api/crews/${id}/members`,'POST',{registrationId:target.dataset.registration,departureId:target.dataset.departure});state.crewManagementOpen.add(id);await refreshAfterSave();}catch(error){showError(error);}return;}
  if(action==='remove-crew-pilot'){try{await api(`/api/crews/${id}/members/${target.dataset.registration}`,'DELETE');state.crewManagementOpen.add(id);await refreshAfterSave();}catch(error){showError(error);}return;}
}

async function handleSubmit(event){
  const form=event.target;if(!(form instanceof HTMLFormElement))return;
  if(form.matches('[data-event-form]')){
    event.preventDefault();const data=new FormData(form);const categories=[...form.querySelectorAll('[name="categories"]:checked')].map(input=>input.value);const departures=departureFields(form);
    const payload={name:String(data.get('name')||'').trim(),circuit:String(data.get('circuit')||''),eventType:String(data.get('eventType')||'private'),durationHours:Number(data.get('durationHours')||6),categories,departures};
    try{let result;if(state.editingEvent?.id)result=await api(`/api/events/${state.editingEvent.id}`,'PATCH',{...payload,version:state.editingEvent.version});else result=await api('/api/events','POST',payload);await refresh();const saved=eventById(result.event?.id||state.editingEvent?.id);saved?renderEvent(saved):renderHome('Évènement enregistré.');}catch(error){showError(error);}return;
  }
  if(form.matches('[data-registration-form]')){event.preventDefault();try{await submitRegistration(form);await refreshAfterSave();}catch(error){showError(error);}return;}
}

function handleChange(event){
  const target=event.target;
  if(target.matches('[data-crew-state-select]')){updateCrewState(target).then(refreshAfterSave).catch(showError);return;}
  if(target.matches('[name="carAny"]')){const form=target.closest('form');form?.querySelectorAll('[name="carPreference"]').forEach(input=>{input.disabled=target.checked;if(target.checked)input.checked=false;});return;}
  if(target.matches('[data-event-category]'))updateRemoveButtons(target.closest('form'));
}

addEventListener('click',event=>handleClick(event).catch(showError));
addEventListener('submit',event=>handleSubmit(event).catch(showError));
addEventListener('change',handleChange);
addEventListener('toggle',event=>{const details=event.target;if(details.matches?.('[data-crew]')){const id=details.dataset.crew;if(details.open)state.crewManagementOpen.add(id);else state.crewManagementOpen.delete(id);}},true);

(async()=>{try{await load();renderNav();renderHome();}catch(error){showError(error);}})();
