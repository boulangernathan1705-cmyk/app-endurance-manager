// Creating or editing an event of the community calendar (solo format), step by step, for every simulator.
// The fields follow the community’s calendar: start time, server password, and per round the
// circuit, categories, practice / qualifying / race minutes, weather, fuel and tyre multipliers.
// LMU takes its circuits and categories from the catalog; on AMS2, iRacing and ACE they are typed, with the car.
import {formSheet} from './event-form.mjs';
import {app,state,esc,button,api,notifyRender} from './core.mjs';
import {SIMS,simCatalog,eventCatalog,simForEvent,isRandomCircuit} from '../../shared/catalog.mjs';
import {departureFields} from './event-form.mjs';
import {refreshAfterSave} from './refresh.mjs';
import {WEATHERS,roundFormat,roundExtras} from './solo.mjs';

const MAX_ROUNDS=4;
const simChoice=(sim,selected)=>`<label class="sim-option sim-${sim.id}"><input type="radio" name="eventSim" value="${sim.id}" ${sim.id===selected?'checked':''} required><span>${esc(sim.short)}</span></label>`;
// The community's event types; an event keeps its type even once removed from the list.
function typeField(chosen){
  const types=[...state.eventTypes];if(chosen&&!types.includes(chosen))types.push(chosen);
  if(!types.length)return '';
  return `<fieldset class="sim-options"><legend class="form-label">Type d’événement</legend><div class="sim-option-row">${types.map(type=>`<label class="sim-option event-type-option"><input type="radio" name="eventType" value="${esc(type)}" ${type===chosen?'checked':''} required><span>${esc(type)}</span></label>`).join('')}</div></fieldset>`;
}
// A type named OPEN or SAFE already says the access: the access choice is then hidden.
const accessType=type=>['open','safe'].includes(String(type||'').toLowerCase());
const categoryLogo=config=>config?.image?`<img class="category-logo" src="/images/${esc(config.image)}" alt="">`:'';
const numberField=(name,label,value,max,extra='')=>`<label class="form-label">${label}<input name="${name}" type="number" min="0" max="${max}" step="1" value="${esc(value??'')}" ${extra}></label>`;
const hours=Array.from({length:24},(_,hour)=>String(hour).padStart(2,'0'));

function circuitField(sim,round={}){
  const catalog=eventCatalog(sim);
  // An older iRacing event keeps the name of its catalog circuit.
  const typed=simCatalog(sim)?.circuits.find(item=>item.id===round.circuit)?.name||round.circuit||'';
  return catalog
    ?`<label class="form-label solo-round-circuit">Circuit<select name="roundCircuit" required><option value="">Choisir</option>${catalog.circuits.map(item=>`<option value="${esc(item.id)}" ${round.circuit===item.id?'selected':''}>${esc(item.random?'Circuit aléatoire':item.name)}</option>`).join('')}</select></label>`
    :`<label class="form-label solo-round-circuit">Circuit<input name="roundCircuit" maxlength="60" value="${esc(typed)}" required></label>`;
}
// Categories of a round (LMU and iRacing): optional; none means a one-click entry.
function categoryField(sim,round={}){
  const catalog=eventCatalog(sim),chosen=round.categories||[];
  // No catalog (AMS2, iRacing, ACE): the category and the car are typed.
  if(!catalog)return `<div class="solo-form-row"><label class="form-label">Catégorie <small>(facultatif)</small><input name="roundCategoryText" maxlength="40" value="${esc(round.category||'')}"></label><label class="form-label">Voiture <small>(facultatif)</small><input name="roundCar" maxlength="60" value="${esc(round.car||'')}"></label></div>`;
  if(isRandomCircuit(round.circuit))return '<p class="solo-random-category"><span aria-hidden="true">❓</span> Circuit aléatoire : la catégorie sera aléatoire aussi.</p>';
  return `<span class="form-label">Catégories <small>(facultatif)</small></span><div class="solo-round-categories" role="group" aria-label="Catégories">${Object.entries(catalog.categories).map(([name,config])=>`<label class="solo-category-chip ${esc(config.css||'')}" title="${esc(name)}"><input type="checkbox" name="roundCategory" value="${esc(name)}" ${chosen.includes(name)?'checked':''}>${categoryLogo(config)}<span>${esc(name)}</span></label>`).join('')}</div>`;
}
function roundField(sim,round={}){
  return `<div class="solo-round"><div class="solo-round-head"><span class="solo-round-title"></span><button type="button" class="link-button" data-remove-round>Retirer</button></div>
    ${circuitField(sim,round)}<div data-round-categories>${categoryField(sim,round)}</div>
    <div class="solo-round-format">${numberField('roundPractice','Essais (min)',round.practice,600)}${numberField('roundQualifying','Qualifs (min)',round.qualifying,600)}${numberField('roundMinutes','Course (min)',round.durationMinutes||30,600,'min="5" required')}</div>
    ${weatherField(round)}<div class="solo-round-format">${numberField('roundFuel','Conso carburant ×',round.fuel,10)}${numberField('roundTyres','Usure pneus ×',round.tyres,10)}</div></div>`;
}
// Weather as icons; touching the chosen one again clears it.
function weatherField(round){
  const group=`weather-${Math.random().toString(36).slice(2)}`;
  return `<fieldset class="solo-weather"><legend class="form-label">Météo</legend><div class="solo-weather-row">${WEATHERS.map(([value,icon,label])=>`<label class="solo-weather-chip" title="${label}"><input type="radio" name="${group}" value="${value}" data-weather ${round.weather===value?'checked':''}><span aria-hidden="true">${icon}</span><span class="sr-only">${label}</span></label>`).join('')}</div></fieldset>`;
}
// Numbers the rounds (« Manche 2 ») and shows the add / remove buttons that apply.
function syncRounds(form){
  const rounds=[...form.querySelectorAll('.solo-round')];
  rounds.forEach((row,index)=>{row.querySelector('.solo-round-title').textContent=`Manche ${index+1}`;row.querySelector('[data-remove-round]').hidden=rounds.length<2;});
  form.querySelector('[data-add-round]').hidden=rounds.length>=MAX_ROUNDS;
}
const STEPS=['Événement','Horaire','Manches','Inscriptions','Récapitulatif'],LAST=STEPS.length;

export function renderSoloEventForm(event=null){
  const sim=event?simForEvent(event):'lmu',rounds=event?.rounds?.length?event.rounds:[{circuit:event?.circuit,durationMinutes:event?.durationMinutes}];
  const details=event?.details||{},access=event?.access||'open',departure=event?.departures?.[0]||{time:'21:00'},first=event?LAST:1;
  const start=departureFields(departure).replace(/<button[^>]*data-action="remove-departure"[^>]*>.*?<\/button>/,'');
  const step=(n,content)=>`<section class="creation-card solo-form-step" data-solo-step-pane="${n}" ${n===first?'':'hidden'}>${content}</section>`;
  formSheet(event,event?'Modifier l’événement':'Nouvel événement').innerHTML=`<form class="form-panel event-creation solo-event-form" data-kind="solo-event" data-step="${first}">
  <div class="registration-progress" aria-hidden="true" data-solo-progress>${STEPS.map((_,index)=>`<span class="${index<first?'done':''}"></span>`).join('')}</div>
  <p class="registration-step-label" data-solo-step-label>Étape ${first} sur ${LAST} · ${STEPS[first-1]}</p>
  ${step(1,`<label class="form-label">Nom de l’événement<input name="eventName" maxlength="100" value="${esc(event?.name||'')}" required></label>
    <fieldset class="sim-options"><legend class="form-label">Simulateur</legend><div class="sim-option-row">${SIMS.map(item=>simChoice(item,sim)).join('')}</div></fieldset>${typeField(details.type)}`)}
  ${step(2,`<div class="solo-form-start">${start}</div>
    <div class="solo-form-row"><label class="form-label">Mot de passe du serveur <small>(facultatif)</small><input name="eventPassword" maxlength="30" value="${esc(details.password||'')}" autocomplete="off"></label></div>`)}
  ${step(3,`<div class="solo-rounds" data-rounds>${rounds.map(round=>roundField(sim,round)).join('')}</div><button type="button" class="secondary-button" data-add-round>+ Ajouter une manche</button>`)}
  ${step(4,`<div class="solo-form-row"><label class="form-label">Places <small>(vide = illimité)</small><input name="eventCapacity" type="number" min="2" max="120" step="1" value="${esc(event?.capacity||'')}"></label>
    <fieldset class="solo-access" ${accessType(details.type)?'hidden':''}><legend class="form-label">Accès</legend><div class="sim-option-row">${['open','safe'].map(value=>`<label class="sim-option access-${value}"><input type="radio" name="eventAccess" value="${value}" ${access===value?'checked':''}><span>${value.toUpperCase()}</span></label>`).join('')}</div></fieldset></div>
    <label class="form-label">Info <small>(facultatif)</small><input name="eventNote" maxlength="120" value="${esc(details.note||'')}" placeholder="Special event, BoP…"></label>`)}
  ${step(LAST,'<div class="registration-summary" data-solo-recap></div>')}
  <div class="creation-actions registration-step-nav"><button type="button" class="secondary-button registration-back" data-solo-step="back" ${first>1?'':'hidden'}>Retour</button><button type="button" class="primary-button registration-next" data-solo-step="next" ${first<LAST?'':'hidden'}>Continuer</button><button type="submit" class="primary-button registration-next" data-solo-submit ${first===LAST?'':'hidden'}>${event?'ENREGISTRER':'CRÉER L’ÉVÉNEMENT'}</button></div>
</form>`;
  const form=app.querySelector('form[data-kind="solo-event"]');
  syncRounds(form);if(first===LAST)fillRecap(form);
  notifyRender();
}

// The form as the API wants it.
function formData(form){
  const value=(row,name)=>row.querySelector(`[name="${name}"]`)?.value.trim()??'';
  const optional=(row,name)=>value(row,name)===''?null:Number(value(row,name));
  const rounds=[...form.querySelectorAll('.solo-round')].map(row=>({circuit:value(row,'roundCircuit'),durationMinutes:Number(value(row,'roundMinutes')),
    categories:[...row.querySelectorAll('[name="roundCategory"]:checked')].map(input=>input.value),
    category:value(row,'roundCategoryText'),car:value(row,'roundCar'),practice:optional(row,'roundPractice'),qualifying:optional(row,'roundQualifying'),weather:row.querySelector('[data-weather]:checked')?.value||'',fuel:optional(row,'roundFuel'),tyres:optional(row,'roundTyres')}));
  const start=form.querySelector('.departure-field'),capacity=form.elements.eventCapacity.value.trim();
  const details={type:form.querySelector('[name="eventType"]:checked')?.value||'',password:form.elements.eventPassword.value.trim(),note:form.elements.eventNote.value.trim()};
  return {name:form.elements.eventName.value.trim(),format:'solo',sim:form.elements.eventSim.value,access:form.querySelector('[name="eventAccess"]:checked')?.value||'open',
    capacity:capacity?Number(capacity):null,rounds,categories:[],details,
    departures:[{id:start.dataset.id||undefined,date:start.querySelector('[name="date"]').value,time:start.querySelector('[name="time"]').value,tbd:false}]};
}
function fillRecap(form){
  const data=formData(form),sim=SIMS.find(item=>item.id===data.sim),catalog=eventCatalog(data.sim);
  const circuitName=id=>catalog?(catalog.circuits.find(item=>item.id===id)?.name||'—'):id||'—';
  const date=data.departures[0].date,day=date?new Intl.DateTimeFormat('fr-FR',{weekday:'short',day:'numeric',month:'short',timeZone:'UTC'}).format(new Date(`${date}T00:00:00Z`)):'—';
  const line=(n,label,value)=>`<button type="button" class="registration-summary-row" data-solo-step="${n}"><span>${label}</span><strong>${esc(value)}</strong><em>Modifier</em></button>`;
  const time=data.departures[0].time;
  form.querySelector('[data-solo-recap]').innerHTML=line(1,'Événement',[data.name||'—',sim.short,data.details.type].filter(Boolean).join(' · '))
    +line(2,'Horaire',`${day} · ${time}${data.details.password?` · mdp : ${data.details.password}`:''}`)
    +data.rounds.map((round,index)=>line(3,data.rounds.length>1?`Manche ${index+1}`:'Manche',[circuitName(round.circuit),isRandomCircuit(round.circuit)&&eventCatalog(data.sim)?'catégorie aléatoire':round.categories.join(' ')||round.category,round.car,roundFormat(round),roundExtras(round)].filter(Boolean).join(' · '))).join('')
    +line(4,'Inscriptions',[accessType(data.details.type)?'':data.access==='safe'?'SAFE':'OPEN',data.capacity?`${data.capacity} places`:'places illimitées',data.details.note].filter(Boolean).join(' · '));
}
function goToStep(form,target){
  const current=Number(form.dataset.step)||1;
  const wanted=target==='next'?current+1:target==='back'?current-1:Number(target);
  if(!(wanted>=1&&wanted<=LAST))return;
  // Moving forward checks the steps in between.
  for(let n=current;n<wanted;n++)for(const field of form.querySelectorAll(`[data-solo-step-pane="${n}"] input,[data-solo-step-pane="${n}"] select`))if(!field.checkValidity()){
    form.dataset.step=String(n);showStep(form,n);field.reportValidity();return;
  }
  form.dataset.step=String(wanted);showStep(form,wanted);
}
function showStep(form,n){
  form.querySelectorAll('[data-solo-step-pane]').forEach(pane=>{pane.hidden=Number(pane.dataset.soloStepPane)!==n;});
  form.querySelectorAll('[data-solo-progress] span').forEach((bar,index)=>bar.classList.toggle('done',index<n));
  form.querySelector('[data-solo-step-label]').textContent=`Étape ${n} sur ${LAST} · ${STEPS[n-1]}`;
  form.querySelector('[data-solo-step="back"]').hidden=n===1;
  form.querySelector('[data-solo-step="next"]').hidden=n===LAST;
  form.querySelector('[data-solo-submit]').hidden=n!==LAST;
  if(n===LAST)fillRecap(form);
  form.scrollIntoView({block:'start',behavior:'auto'});
}

if(typeof document!=='undefined'){
  document.addEventListener('change',event=>{
    const field=event.target,form=field.closest?.('form[data-kind="solo-event"]');
    if(form&&field.name==='eventType'){
      // A type named OPEN or SAFE sets the access.
      const access=form.querySelector(`[name="eventAccess"][value="${field.value.toLowerCase()}"]`);if(access)access.checked=true;const fieldset=form.querySelector('.solo-access');if(fieldset)fieldset.hidden=accessType(field.value);return;
    }
    if(form&&field.name==='roundCircuit'&&field.tagName==='SELECT'){
      // Random circuit: the category is random too (and back to the chips otherwise).
      const row=field.closest('.solo-round'),box=row.querySelector('[data-round-categories]'),random=isRandomCircuit(field.value);
      if(random||box.querySelector('.solo-random-category'))box.innerHTML=categoryField(form.elements.eventSim.value,{circuit:field.value});
      return;
    }
    if(!form||field.name!=='eventSim')return;
    // Another simulator: its circuits and categories.
    form.querySelectorAll('.solo-round').forEach(row=>{row.querySelector('.solo-round-circuit').outerHTML=circuitField(field.value);row.querySelector('[data-round-categories]').innerHTML=categoryField(field.value);});
  });
  // A weather icon touched again is unselected (the weather is optional).
  document.addEventListener('pointerdown',event=>{const input=event.target.closest?.('.solo-weather-chip')?.querySelector('input');if(input)input.dataset.was=String(input.checked);});
  document.addEventListener('click',event=>{
    const form=event.target.closest?.('form[data-kind="solo-event"]');if(!form)return;
    const weather=event.target.closest('.solo-weather-chip input');
    if(weather&&weather.dataset.was==='true'){weather.checked=false;weather.dataset.was='false';return;}
    const target=event.target.closest('[data-solo-step]');
    if(target){goToStep(form,target.dataset.soloStep);return;}
    if(event.target.closest('[data-add-round]')){
      // A new round keeps the lengths and multipliers of the previous one; circuit and categories are chosen again.
      const previous=formData(form).rounds.pop()||{};
      form.querySelector('[data-rounds]').insertAdjacentHTML('beforeend',roundField(form.elements.eventSim.value,{...previous,circuit:'',categories:[],category:'',car:''}));syncRounds(form);return;
    }
    const remove=event.target.closest('[data-remove-round]');
    if(remove){remove.closest('.solo-round').remove();syncRounds(form);}
  });
}

export async function submitSoloEvent(form){
  const editing=state.editingEvent,data={...formData(form),version:editing?.version};
  const result=await api(editing?`/api/races/${editing.id}`:'/api/races',editing?'PATCH':'POST',data);
  if(editing){state.currentEventId=editing.id;state.page='event';}else{state.page='home';state.currentEventId=null;}
  await refreshAfterSave(editing?'Événement modifié.':'Événement créé.',result.id);
}
