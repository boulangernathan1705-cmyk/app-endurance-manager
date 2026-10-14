import {typeField} from './solo-form.mjs';
import {app,state,esc,api,notifyRender} from './core.mjs';
import {formSheet,departureFields} from './event-form.mjs';
import {refreshAfterSave} from './refresh.mjs';
import {WEATHERS} from './solo.mjs';

const STEPS=['Rendez-vous','Lobby et voitures','Programme','Récapitulatif'];
const card=(name,value,title,help,selected)=>`<label class="sim-option rally-choice"><input type="radio" name="${name}" value="${value}" ${selected===value?'checked':''} required><span><strong>${title}</strong><small>${help}</small></span></label>`;
const stageField=(stage='')=>`<div class="solo-form-row rally-stage"><label class="form-label">Spéciale et variante <small>(facultatif)</small><input name="rallyStage" maxlength="60" value="${esc(stage)}" placeholder="Lieu, spéciale, variante et sens"></label><button type="button" class="secondary-button" data-rally-remove>Retirer</button></div>`;
export function renderRallyEventForm(event=null,draft={}){
  const details=event?.details||{},round=event?.rounds?.[0]||{},access=({OPEN:'open',SAFE:'safe'}[draft.type??details.type])||event?.access||draft.access||'open';
  const mode=details.rallyCarMode||(round.car?'car':round.category?'category':'all');
  const stages=details.rallyStages||event?.rounds?.map(item=>item.circuit).filter(Boolean)||[];
  const start=departureFields(event?.departures?.[0]||draft.departure||{time:'21:00'}).replace(/<button[^>]*data-action="remove-departure"[^>]*>.*?<\/button>/,'');
  const first=event?4:1;
  formSheet(event,event?'Modifier la soirée rallye':'Nouvelle soirée rallye').innerHTML=`<form class="form-panel event-creation solo-event-form rally-event-form" data-kind="rally-event" data-step="${first}">
    <div class="registration-progress" aria-hidden="true">${STEPS.map(()=>'<span></span>').join('')}</div><p class="registration-step-label" data-rally-label></p>
    <section class="creation-card solo-form-step" data-rally-pane="1"><p class="creation-kicker">ASSETTO CORSA RALLY</p><h2>Le rendez-vous</h2><label class="form-label">Nom de l’événement<input name="eventName" maxlength="100" value="${esc(draft.name??event?.name??'')}" required></label>${draft.type!==undefined?`<input type="hidden" name="eventType" value="${esc(draft.type)}">`:typeField(details.type)}<div class="solo-form-start">${start}</div><p class="creation-help">L’heure du rendez-vous est indiquée à l’heure de Paris. Les pilotes participent ensemble à la soirée.</p></section>
    <section class="creation-card solo-form-step" data-rally-pane="2"><h2>Lobby et voitures</h2><p class="registration-community-line" data-rally-access-summary hidden></p><fieldset class="sim-options" data-rally-access-choice><legend class="form-label">Accès au lobby</legend><div class="sim-option-row">${card('rallyAccess','open','OPEN · Public','Lobby ouvert',access)}${card('rallyAccess','safe','SAFE · Privé','Lobby protégé par mot de passe',access)}</div></fieldset>
    <label class="form-label" data-rally-password>Mot de passe <small>(facultatif, à ajouter plus tard)</small><input name="eventPassword" maxlength="30" value="${esc(details.password||'')}" autocomplete="off"></label>
    <div class="solo-form-row"><label class="form-label">Hôte · pseudo en jeu <small>(facultatif)</small><input name="rallyHost" maxlength="60" value="${esc(details.rallyHost||'')}" placeholder="Pour retrouver le lobby"></label><label class="form-label">Places dans le lobby<input name="rallyCapacity" type="number" min="2" max="16" step="1" value="${round.capacity||event?.capacity||16}" required></label></div>
    <fieldset class="sim-options"><legend class="form-label">Voitures autorisées</legend><div class="sim-option-row">${card('rallyCarMode','all','Choix libre','Toutes les voitures',mode)}${card('rallyCarMode','category','Catégorie imposée','Une catégorie autorisée',mode)}${card('rallyCarMode','car','Voiture imposée','Le même modèle pour tous',mode)}</div></fieldset>
    <label class="form-label" data-rally-category>Catégorie<input name="rallyCategory" maxlength="40" value="${esc(round.category||'')}" placeholder="Nom de la catégorie dans le jeu"></label><label class="form-label" data-rally-car>Voiture<input name="rallyCar" maxlength="60" value="${esc(round.car||'')}" placeholder="Modèle exact dans le jeu"></label></section>
    <section class="creation-card solo-form-step" data-rally-pane="3"><h2>Programme facultatif</h2><p class="creation-help">Tu peux annoncer les spéciales ou les choisir pendant la soirée. Une seule inscription couvre tout le programme.</p><div data-rally-stages>${stages.map(stageField).join('')}</div><button type="button" class="secondary-button" data-rally-add>+ Ajouter une spéciale</button>
    <div class="solo-form-row"><label class="form-label">Météo prévue <small>(facultatif)</small><select name="rallyWeather"><option value="">À définir</option>${WEATHERS.map(([value,icon,label])=>`<option value="${value}" ${round.weather===value?'selected':''}>${icon} ${label}</option>`).join('')}</select></label><label class="form-label">Durée estimée de la soirée <small>(min, facultatif)</small><input name="rallyMinutes" type="number" min="5" max="600" step="1" value="${details.rallyEstimatedMinutes||''}" placeholder="Ex. 60"></label></div><label class="form-label">Consignes <small>(facultatif)</small><input name="eventNote" maxlength="120" value="${esc(details.note||'')}" placeholder="Discord, accueil des débutants, déroulement…"></label></section>
    <section class="creation-card solo-form-step" data-rally-pane="4"><h2>Vérifier la soirée</h2><div class="registration-summary" data-rally-recap></div></section>
    <div class="creation-actions registration-step-nav"><button type="button" class="secondary-button" data-rally-step="back">Retour</button><button type="button" class="primary-button" data-rally-step="next">Continuer</button><button type="submit" class="primary-button" data-rally-submit>${event?'ENREGISTRER':'CRÉER L’ÉVÉNEMENT'}</button></div></form>`;
  const form=app.querySelector('[data-kind="rally-event"]');syncChoices(form);showStep(form,first);notifyRender();
}
function syncChoices(form){
  for(const [selector,active] of [['[data-rally-password]',form.elements.rallyAccess.value==='safe'],['[data-rally-category]',form.elements.rallyCarMode.value==='category'],['[data-rally-car]',form.elements.rallyCarMode.value==='car']]){
    const label=form.querySelector(selector),input=label.querySelector('input');label.hidden=!active;input.disabled=!active;input.required=active&&input.name!=='eventPassword';
  }
  const type=(form.querySelector('[name="eventType"]:checked')||form.querySelector('input[type="hidden"][name="eventType"]'))?.value;
  const linked={OPEN:'open',SAFE:'safe'}[type];
  form.querySelectorAll('[name="rallyAccess"]').forEach(input=>input.disabled=Boolean(linked));
  form.querySelector('[data-rally-access-choice]').hidden=Boolean(linked);
  const summary=form.querySelector('[data-rally-access-summary]');summary.hidden=!linked;summary.innerHTML=linked?`<span>Accès au lobby</span><strong>${linked==='safe'?'SAFE · Privé':'OPEN · Public'}</strong>`:'';
  form.querySelector('[data-rally-add]').hidden=form.querySelectorAll('[name="rallyStage"]').length>=20;
}
export function rallyFormData(form){
  const value=name=>form.elements[name].value.trim(),access=value('rallyAccess'),mode=value('rallyCarMode');
  const stages=[...form.querySelectorAll('[name="rallyStage"]')].map(input=>input.value.trim()).filter(Boolean),minutes=value('rallyMinutes');
  const start=form.querySelector('.departure-field');
  return {name:value('eventName'),format:'solo',sim:'acrally',access,categories:[],rounds:[{circuit:stages[0]||'',durationMinutes:minutes?Number(minutes):60,capacity:Number(value('rallyCapacity')),categories:[],category:mode==='category'?value('rallyCategory'):'',car:mode==='car'?value('rallyCar'):'',weather:value('rallyWeather')}],details:{type:(form.querySelector('[name="eventType"]:checked')||form.querySelector('input[type="hidden"][name="eventType"]'))?.value||access.toUpperCase(),password:access==='safe'?value('eventPassword'):'',note:value('eventNote'),rallyHost:value('rallyHost'),rallyCarMode:mode,rallyStages:stages,rallyEstimatedMinutes:minutes?Number(minutes):null},departures:[{id:start.dataset.id||undefined,date:start.querySelector('[name="date"]').value,time:start.querySelector('[name="time"]').value,tbd:false}]};
}
function showStep(form,step){
  form.dataset.step=step;form.querySelectorAll('[data-rally-pane]').forEach(pane=>pane.hidden=Number(pane.dataset.rallyPane)!==step);
  form.querySelectorAll('.registration-progress span').forEach((bar,index)=>bar.classList.toggle('done',index<step));
  form.querySelector('[data-rally-label]').textContent=`Étape ${step} sur 4 · ${STEPS[step-1]}`;
  form.querySelector('[data-rally-step="back"]').hidden=step===1;form.querySelector('[data-rally-step="next"]').hidden=step===4;form.querySelector('[data-rally-submit]').hidden=step!==4;
  if(step===4){const data=rallyFormData(form),round=data.rounds[0];const row=(n,label,value)=>`<button type="button" class="registration-summary-row" data-rally-step="${n}"><span>${label}</span><strong>${esc(value)}</strong><em>Modifier</em></button>`;
    form.querySelector('[data-rally-recap]').innerHTML=row(1,'Rendez-vous',`${data.name}${data.details.type?' · '+data.details.type:''} · ${data.departures[0].date} · ${data.departures[0].time} (Paris)`)+row(2,'Lobby',`${data.access==='safe'?'SAFE · Privé':'OPEN · Public'} · ${round.capacity} places${data.details.rallyHost?' · '+data.details.rallyHost:''}${data.access==='safe'?' · '+(data.details.password?'Mot de passe renseigné':'Mot de passe à définir'):''}`)+row(2,'Voitures',round.car||round.category||'Choix libre')+row(3,'Spéciales',data.details.rallyStages.join(' → ')||'À choisir pendant la soirée')+row(3,'Conditions',[WEATHERS.find(([v])=>v===round.weather)?.[2]||'Météo à définir',data.details.rallyEstimatedMinutes?`Environ ${data.details.rallyEstimatedMinutes} min`:'',data.details.note].filter(Boolean).join(' · '));}
}
if(typeof document!=='undefined'){
  document.addEventListener('change',event=>{const form=event.target.closest?.('[data-kind="rally-event"]');if(form){if(event.target.name==='eventType'){const access={OPEN:'open',SAFE:'safe'}[event.target.value];if(access)form.querySelector(`[name="rallyAccess"][value="${access}"]`).checked=true;}syncChoices(form);}});
  document.addEventListener('click',event=>{const form=event.target.closest?.('[data-kind="rally-event"]');if(!form)return;
    if(event.target.closest('[data-rally-add]')){if(form.querySelectorAll('[name="rallyStage"]').length<20)form.querySelector('[data-rally-stages]').insertAdjacentHTML('beforeend',stageField());syncChoices(form);return;}
    if(event.target.closest('[data-rally-remove]')){event.target.closest('.rally-stage').remove();syncChoices(form);return;}
    const button=event.target.closest('[data-rally-step]');if(!button)return;const current=Number(form.dataset.step),target=button.dataset.rallyStep,wanted=target==='next'?current+1:target==='back'?current-1:Number(target);
    if(wanted<1||wanted>4)return;for(let step=1;step<wanted;step++)for(const field of form.querySelectorAll(`[data-rally-pane="${step}"] input,[data-rally-pane="${step}"] select`))if(!field.checkValidity()){showStep(form,step);field.reportValidity();return;}
    showStep(form,wanted);form.scrollIntoView({block:'start'});
  });
}

export async function submitRallyEvent(form){
  const editing=state.editingEvent,result=await api(editing?`/api/races/${editing.id}`:'/api/races',editing?'PATCH':'POST',{...rallyFormData(form),version:editing?.version});
  state.currentEventId=editing?.id||null;state.page=editing?'event':'home';
  await refreshAfterSave(editing?'Soirée rallye modifiée.':'Soirée rallye créée.',result.id);
}
