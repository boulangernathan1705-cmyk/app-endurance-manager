import {state,api,CARS} from './app/core.mjs';
import {renderRegistrationForm,submitRegistration} from './app/registration.mjs';

let activeBuilder={mode:'',departureId:''};
let modalState={departureId:'',category:''};
let modalSubmitting=false;
let decorationTimer=0;

function currentEvent(){return state.events.find(item=>item.id===state.currentEventId)||null;}
function currentDeparture(){const event=currentEvent();return event?.departures.find(item=>item.id===modalState.departureId)||null;}
function modalRoot(){return document.querySelector('[data-registration-modal]');}
function builderAllowsPilotRegistration(){return activeBuilder.mode==='create'||activeBuilder.mode==='edit';}

function decorateCrewBuilder(){
  const panel=document.querySelector('[data-crew-builder-panel]');
  if(!panel||!builderAllowsPilotRegistration()||!activeBuilder.departureId)return false;
  if(panel.querySelector('[data-crew-builder-register-pilot]'))return true;
  // Pilots step of the crew window.
  const anchor=panel.querySelector('[data-builder-step="2"] .crew-builder-pilots');
  if(!anchor)return false;

  const actions=document.createElement('div');
  actions.className='crew-builder-composition-actions';
  const button=document.createElement('button');
  button.type='button';
  button.className='secondary-button crew-builder-register-pilot';
  button.dataset.crewBuilderRegisterPilot='true';
  button.dataset.departure=activeBuilder.departureId;
  button.dataset.category=panel.querySelector('[name="builderCategory"]')?.value||'';
  button.textContent='Inscrire un autre pilote';
  actions.append(button);
  anchor.before(actions);
  return true;
}

function decorateWhenReady(attempt=0){
  clearTimeout(decorationTimer);
  if(decorateCrewBuilder()||!builderAllowsPilotRegistration()||attempt>=40)return;
  decorationTimer=window.setTimeout(()=>decorateWhenReady(attempt+1),50);
}

function setModalError(message=''){
  const box=modalRoot()?.querySelector('[data-registration-modal-error]');
  if(!box)return;
  box.textContent=message;
  box.hidden=!message;
}

function renderModalForm({focusSelector='',preserveScroll=true}={}){
  const root=modalRoot(),event=currentEvent(),departure=currentDeparture();
  const content=root?.querySelector('[data-registration-modal-content]');
  const draft=departure?state.drafts[departure.id]:null;
  if(!root||!content||!event||!departure||!draft)return;
  const scrollTop=preserveScroll?content.scrollTop:0;
  const timelineOffsets=[...content.querySelectorAll('.presence-timeline')].map(timeline=>timeline.scrollLeft);
  content.innerHTML=renderRegistrationForm(event,departure,draft);
  content.scrollTop=scrollTop;
  content.querySelectorAll('.presence-timeline').forEach((timeline,index)=>{if(Number.isFinite(timelineOffsets[index]))timeline.scrollLeft=timelineOffsets[index];});
  if(focusSelector)content.querySelector(focusSelector)?.focus({preventScroll:true});
}

function closeModal({discardDraft=true}={}){
  const departureId=modalState.departureId;
  modalRoot()?.remove();
  document.body.classList.remove('registration-modal-open');
  if(discardDraft&&departureId)delete state.drafts[departureId];
  modalState={departureId:'',category:''};
  modalSubmitting=false;
}

function openModal(trigger){
  const event=currentEvent();
  const departure=event?.departures.find(item=>item.id===trigger.dataset.departure);
  if(!event||!departure||departure.startsAt<=Date.now())return;
  closeModal();
  const category=trigger.dataset.category||'';
  state.pendingCrewJoin=null;
  state.drafts[departure.id]={
    name:'',status:'',preferredPilot:'',forOther:!!state.user,
    participantUserId:null,participantId:null,category,cars:[],carAny:false,
    id:null,version:null,mode:'pilot'
  };
  modalState={departureId:departure.id,category};

  const root=document.createElement('div');
  root.className='registration-modal-backdrop';
  root.dataset.registrationModal='true';
  const contextHelp=activeBuilder.mode==='create'?'<p>Ajoute le pilote à ce départ sans quitter la création de l’équipage.</p>':'';
  root.innerHTML=`<section class="registration-modal-panel" role="dialog" aria-modal="true" aria-labelledby="registration-modal-title">
    <div class="registration-modal-header"><div><span class="creation-kicker">INSCRIPTION PILOTE</span><h2 id="registration-modal-title">Inscrire un autre pilote</h2>${contextHelp}</div><button type="button" class="secondary-button registration-modal-close" data-registration-modal-close aria-label="Fermer l’inscription">Fermer</button></div>
    <div class="registration-modal-content" data-registration-modal-content></div>
    <p class="creation-error registration-modal-error" data-registration-modal-error hidden></p>
  </section>`;
  document.body.append(root);
  document.body.classList.add('registration-modal-open');
  renderModalForm({preserveScroll:false});
}

function toggleAvailability(action){
  const event=currentEvent(),departure=currentDeparture(),draft=departure?state.drafts[departure.id]:null;
  if(!event||!departure||!draft)return;
  const value=action.dataset.value;
  if(value==='whole')draft.status='whole';
  else{
    const duration=event.durationHours||6;
    const parts=new Set(draft.status==='whole'?Array.from({length:duration},(_,i)=>`h${i+1}`):String(draft.status||'').split(',').filter(part=>/^h\d+$/.test(part)));
    parts.has(value)?parts.delete(value):parts.add(value);
    draft.status=parts.size===duration?'whole':[...parts].sort((a,b)=>Number(a.slice(1))-Number(b.slice(1))).join(',');
  }
  renderModalForm({focusSelector:`[data-action="availability"][data-value="${value}"]`});
}

function selectCategory(action){
  const departure=currentDeparture(),draft=departure?state.drafts[departure.id]:null;
  if(!draft)return;
  draft.category=action.dataset.value;
  draft.cars=(draft.cars||[]).filter(car=>CARS[draft.category]?.includes(car));
  draft.carAny=false;
  renderModalForm();
}

async function saveModal(form){
  if(modalSubmitting)return;
  modalSubmitting=true;
  const submit=form.querySelector('[type="submit"]');
  if(submit)submit.disabled=true;
  setModalError('');
  try{
    const departureId=form.dataset.departure;
    const result=await submitRegistration(form,api);
    closeModal({discardDraft:false});
    document.dispatchEvent(new CustomEvent('crew-builder:pilot-registered',{detail:{departureId,registrationId:result.id}}));
    document.dispatchEvent(new CustomEvent('endurance:refresh'));
  }catch(error){
    setModalError(error?.message||'Impossible d’inscrire ce pilote.');
  }finally{
    modalSubmitting=false;
    if(submit?.isConnected)submit.disabled=false;
  }
}

document.addEventListener('click',event=>{
  const trigger=event.target.closest?.('[data-crew-builder-register-pilot]');
  if(trigger){
    event.preventDefault();
    event.stopPropagation();
    openModal(trigger);
    return;
  }

  const modal=event.target.closest?.('[data-registration-modal]');
  if(modal){
    event.stopPropagation();
    if(event.target===modal||event.target.closest?.('[data-registration-modal-close]')){
      event.preventDefault();
      closeModal();
      return;
    }
    const action=event.target.closest?.('[data-action]');
    if(!action)return;
    event.preventDefault();
    if(action.dataset.action==='availability')toggleAvailability(action);
    else if(action.dataset.action==='category')selectCategory(action);
    return;
  }

  const create=event.target.closest?.('[data-crew-builder-open]');
  if(create){
    activeBuilder={mode:'create',departureId:create.dataset.departure||''};
    decorateWhenReady();
    return;
  }
  const edit=event.target.closest?.('[data-action="edit-crew"]');
  if(edit){
    activeBuilder={mode:'edit',departureId:edit.dataset.departure||''};
    decorateWhenReady();
    return;
  }
  if(event.target.closest?.('[data-crew-builder-cancel]')){
    activeBuilder={mode:'',departureId:''};
    closeModal();
  }
},true);

document.addEventListener('input',event=>{
  const field=event.target;
  if(!field.closest?.('[data-registration-modal]'))return;
  event.stopPropagation();
  const draft=state.drafts[field.dataset.departure];
  if(!draft)return;
  if(field.name==='pilotName')draft.name=field.value;
  if(field.name==='preferredPilot')draft.preferredPilot=field.value;
},true);

document.addEventListener('change',event=>{
  const field=event.target;
  if(field.closest?.('[data-registration-modal]')){
    event.stopPropagation();
    const departure=currentDeparture(),draft=departure?state.drafts[departure.id]:null;
    if(!draft)return;
    if(field.name==='participant'){
      const participant=state.participants.find(item=>item.id===field.value);
      draft.participantUserId=participant?.id||null;
      draft.participantId=participant?.participantId||null;
      draft.name=participant?.name||'';
      renderModalForm();
      return;
    }
    if(field.name==='carPreference'||field.name==='carAny'){
      const form=field.form;
      draft.cars=[...form.querySelectorAll('[name="carPreference"]:checked')].map(input=>input.value);
      draft.carAny=!!form.elements.carAny?.checked;
      if(draft.carAny)draft.cars=[];
      for(const input of form.querySelectorAll('[name="carPreference"]')){input.disabled=draft.carAny;if(draft.carAny)input.checked=false;}
    }
    return;
  }

  if(field.matches?.('[data-crew-builder-form] [name="builderCategory"]'))decorateWhenReady();
},true);

document.addEventListener('submit',event=>{
  const form=event.target.closest?.('[data-registration-modal] form[data-kind="registration"]');
  if(!form)return;
  event.preventDefault();
  event.stopPropagation();
  void saveModal(form);
},true);

document.addEventListener('keydown',event=>{
  if(event.key==='Escape'&&modalRoot()){
    event.preventDefault();
    closeModal();
  }
},true);

document.addEventListener('endurance:render',()=>decorateWhenReady());
document.addEventListener('crew-builder:rendered',()=>decorateWhenReady());