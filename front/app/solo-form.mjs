// Creating or editing an event of the community calendar (solo format), in four steps, for every simulator.
// LMU and iRacing take their circuit from the catalog and may offer categories; on AMS2 and ACE the
// circuit is typed and the entry is a single click.
import {app,state,esc,button,api,notifyRender} from './core.mjs';
import {SIMS,simCatalog,simForEvent} from '../../shared/catalog.mjs';
import {departureFields} from './event-form.mjs';
import {refreshAfterSave} from './refresh.mjs';

const simChoice=(sim,selected)=>`<label class="sim-option sim-${sim.id}"><input type="radio" name="eventSim" value="${sim.id}" ${sim.id===selected?'checked':''} required><span>${esc(sim.short)}</span></label>`;
const categoryLogo=config=>config?.image?`<img class="category-logo" src="/images/${esc(config.image)}" alt="">`:'';

// The circuit (catalog list or typed name) and the categories follow the simulator.
function circuitField(sim,round={}){
  const catalog=simCatalog(sim);
  return catalog
    ?`<label class="form-label">Circuit<select name="roundCircuit" required><option value="">Choisir</option>${catalog.circuits.map(item=>`<option value="${esc(item.id)}" ${round.circuit===item.id?'selected':''}>${esc(item.random?'Circuit aléatoire':item.name)}</option>`).join('')}</select></label>`
    :`<label class="form-label">Circuit<input name="roundCircuit" maxlength="60" value="${esc(round.circuit||'')}" required></label>`;
}
// Rounds (up to 4): a circuit and a duration each.
const MAX_ROUNDS=4;
function roundField(sim,round={}){
  return `<div class="solo-round"><span class="solo-round-title"></span>${circuitField(sim,round)}<label class="form-label">Durée (min)<input name="roundMinutes" type="number" min="5" max="600" step="5" value="${esc(round.durationMinutes||30)}" required></label><button type="button" class="remove-departure" data-remove-round aria-label="Retirer cette manche">×</button></div>`;
}
// Numbers the rounds (« Manche 2 »), and shows the add / remove buttons that apply.
function syncRounds(form){
  const rounds=[...form.querySelectorAll('.solo-round')];
  rounds.forEach((row,index)=>{row.querySelector('.solo-round-title').textContent=rounds.length>1?`Manche ${index+1}`:'';row.querySelector('[data-remove-round]').hidden=rounds.length<2;});
  form.querySelector('[data-add-round]').hidden=rounds.length>=MAX_ROUNDS;
}
function categoryField(sim,round={}){
  const catalog=simCatalog(sim),chosen=round.categories||[];
  if(!catalog)return '<p class="creation-help">Les pilotes s’inscrivent en un clic.</p>';
  return `<fieldset class="solo-form-categories"><legend class="form-label">Catégories <small>(facultatif)</small></legend><div class="event-category-options">${Object.entries(catalog.categories).map(([name,config])=>`<label class="event-category-option ${esc(config.css||'')}"><input type="checkbox" name="eventCategory" value="${esc(name)}" ${chosen.includes(name)?'checked':''}>${categoryLogo(config)}<span>${esc(name)}</span></label>`).join('')}</div><p class="creation-help">Sans catégorie, les pilotes s’inscrivent en un clic.</p></fieldset>`;
}

// Four steps, like the endurance form: simulator and name, the race, the entries, then the summary.
const STEPS=['Nom et simulateur','Course','Inscriptions','Récapitulatif'];
export function renderSoloEventForm(event=null){
  const sim=event?simForEvent(event):'lmu',rounds=event?.rounds?.length?event.rounds:[{circuit:event?.circuit,durationMinutes:event?.durationMinutes}];
  const access=event?.access||'open',departure=event?.departures?.[0]||{time:'21:00'},first=event?4:1;
  const start=departureFields(departure).replace(/<button[^>]*data-action="remove-departure"[^>]*>.*?<\/button>/,'');
  const step=(n,content)=>`<section class="creation-card solo-form-step" data-solo-step-pane="${n}" ${n===first?'':'hidden'}>${content}</section>`;
  app.innerHTML=`${button('home','← Retour','','secondary-button back-button')}<h1 class="page-title">${event?'MODIFIER L’ÉVÉNEMENT':'NOUVEL ÉVÉNEMENT'}</h1>
<form class="form-panel event-creation solo-event-form" data-kind="solo-event" data-step="${first}">
  <div class="registration-progress" aria-hidden="true" data-solo-progress>${STEPS.map((_,index)=>`<span class="${index<first?'done':''}"></span>`).join('')}</div>
  <p class="registration-step-label" data-solo-step-label>Étape ${first} sur 4 · ${STEPS[first-1]}</p>
  ${step(1,`<label class="form-label">Nom de l’événement<input name="eventName" maxlength="100" value="${esc(event?.name||'')}" required></label>
    <fieldset class="sim-options"><legend class="form-label">Simulateur</legend><div class="sim-option-row">${SIMS.map(item=>simChoice(item,sim)).join('')}</div></fieldset>`)}
  ${step(2,`<div class="solo-form-start">${start}</div><div class="solo-rounds" data-rounds>${rounds.map(round=>roundField(sim,round)).join('')}</div><button type="button" class="secondary-button" data-add-round>+ Ajouter une manche</button>`)}
  ${step(3,`<div data-sim-categories>${categoryField(sim,{categories:event?.categories})}</div>
    <div class="solo-form-row"><label class="form-label">Places <small>(vide = illimité)</small><input name="eventCapacity" type="number" min="2" max="120" step="1" value="${esc(event?.capacity||'')}"></label>
    <fieldset class="solo-access"><legend class="form-label">Accès</legend><div class="sim-option-row">${['open','safe'].map(value=>`<label class="sim-option access-${value}"><input type="radio" name="eventAccess" value="${value}" ${access===value?'checked':''}><span>${value.toUpperCase()}</span></label>`).join('')}</div></fieldset></div>`)}
  ${step(4,'<div class="registration-summary" data-solo-recap></div>')}
  <div class="creation-actions registration-step-nav"><button type="button" class="secondary-button registration-back" data-solo-step="back" ${first>1?'':'hidden'}>Retour</button><button type="button" class="primary-button registration-next" data-solo-step="next" ${first<4?'':'hidden'}>Continuer</button><button type="submit" class="primary-button registration-next" data-solo-submit ${first===4?'':'hidden'}>${event?'ENREGISTRER':'CRÉER L’ÉVÉNEMENT'}</button></div>
</form>`;
  const form=app.querySelector('form[data-kind="solo-event"]');
  syncRounds(form);if(first===4)fillRecap(form);
  notifyRender();
}

function fillRecap(form){
  const sim=SIMS.find(item=>item.id===form.elements.eventSim.value);
  const rounds=[...form.querySelectorAll('.solo-round')].map(row=>{const circuit=row.querySelector('[name="roundCircuit"]');return `${(circuit.tagName==='SELECT'?circuit.value&&circuit.selectedOptions[0]?.textContent:circuit.value.trim())||'—'} · ${row.querySelector('[name="roundMinutes"]').value} min`;});
  const row=form.querySelector('.departure-field'),date=row.querySelector('[name="date"]').value;
  const day=date?new Intl.DateTimeFormat('fr-FR',{weekday:'short',day:'numeric',month:'short',timeZone:'UTC'}).format(new Date(`${date}T00:00:00Z`)):'—';
  const cats=[...form.querySelectorAll('[name="eventCategory"]:checked')].map(input=>input.value);
  const places=form.elements.eventCapacity.value.trim();
  const line=(n,label,value)=>`<button type="button" class="registration-summary-row" data-solo-step="${n}"><span>${label}</span><strong>${esc(value)}</strong><em>Modifier</em></button>`;
  form.querySelector('[data-solo-recap]').innerHTML=line(1,'Événement',`${form.elements.eventName.value.trim()||'—'} · ${sim.short}`)
    +line(2,'Départ',`${day} à ${row.querySelector('[name="time"]').value}`)
    +line(2,rounds.length>1?'Manches':'Course',rounds.join(' + '))
    +line(3,'Inscriptions',`${form.querySelector('[name="eventAccess"]:checked')?.value==='safe'?'SAFE':'OPEN'} · ${places?`${places} places`:'places illimitées'}${cats.length?` · ${cats.join(', ')}`:''}`);
}
function goToStep(form,target){
  const current=Number(form.dataset.step)||1;
  const wanted=target==='next'?current+1:target==='back'?current-1:Number(target);
  if(!(wanted>=1&&wanted<=4))return;
  // Moving forward checks the steps in between.
  for(let n=current;n<wanted;n++)for(const field of form.querySelectorAll(`[data-solo-step-pane="${n}"] input,[data-solo-step-pane="${n}"] select`))if(!field.checkValidity()){
    form.dataset.step=String(n);showStep(form,n);field.reportValidity();return;
  }
  form.dataset.step=String(wanted);showStep(form,wanted);
}
function showStep(form,n){
  form.querySelectorAll('[data-solo-step-pane]').forEach(pane=>{pane.hidden=Number(pane.dataset.soloStepPane)!==n;});
  form.querySelectorAll('[data-solo-progress] span').forEach((bar,index)=>bar.classList.toggle('done',index<n));
  form.querySelector('[data-solo-step-label]').textContent=`Étape ${n} sur 4 · ${STEPS[n-1]}`;
  form.querySelector('[data-solo-step="back"]').hidden=n===1;
  form.querySelector('[data-solo-step="next"]').hidden=n===4;
  form.querySelector('[data-solo-submit]').hidden=n!==4;
  if(n===4)fillRecap(form);
  form.scrollIntoView({block:'start',behavior:'auto'});
}

if(typeof document!=='undefined'){
  document.addEventListener('change',event=>{
    const field=event.target,form=field.closest?.('form[data-kind="solo-event"]');
    if(!form||field.name!=='eventSim')return;
    form.querySelectorAll('.solo-round').forEach(row=>{row.querySelector('label').outerHTML=circuitField(field.value);});
    form.querySelector('[data-sim-categories]').innerHTML=categoryField(field.value);
  });
  document.addEventListener('click',event=>{
    const form=event.target.closest?.('form[data-kind="solo-event"]');if(!form)return;
    const target=event.target.closest('[data-solo-step]');
    if(target){goToStep(form,target.dataset.soloStep);return;}
    if(event.target.closest('[data-add-round]')){const last=[...form.querySelectorAll('[name="roundMinutes"]')].pop();form.querySelector('[data-rounds]').insertAdjacentHTML('beforeend',roundField(form.elements.eventSim.value,{durationMinutes:last?.value}));syncRounds(form);return;}
    const remove=event.target.closest('[data-remove-round]');
    if(remove){remove.closest('.solo-round').remove();syncRounds(form);}
  });
}

export async function submitSoloEvent(form){
  const editing=state.editingEvent,sim=form.elements.eventSim.value;
  const row=form.querySelector('.departure-field');
  const categories=[...form.querySelectorAll('[name="eventCategory"]:checked')].map(input=>input.value);
  // The categories ticked apply to every round.
  const rounds=[...form.querySelectorAll('.solo-round')].map(row=>({circuit:row.querySelector('[name="roundCircuit"]').value.trim(),durationMinutes:Number(row.querySelector('[name="roundMinutes"]').value),categories}));
  const capacity=form.elements.eventCapacity.value.trim();
  const data={name:form.elements.eventName.value.trim(),format:'solo',sim,access:form.querySelector('[name="eventAccess"]:checked')?.value||'open',
    capacity:capacity?Number(capacity):null,rounds,categories,
    departures:[{id:row.dataset.id||undefined,date:row.querySelector('[name="date"]').value,time:row.querySelector('[name="time"]').value,tbd:false}],version:editing?.version};
  const result=await api(editing?`/api/races/${editing.id}`:'/api/races',editing?'PATCH':'POST',data);
  if(editing){state.currentEventId=editing.id;state.page='event';}else{state.page='home';state.currentEventId=null;}
  await refreshAfterSave(editing?'Événement modifié.':'Événement créé.',result.id);
}
