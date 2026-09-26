import {timeLabel} from '../dates.mjs';
import {app,state,esc,button,canManage,CATEGORIES,EVENT_TYPES,CIRCUITS,categories,logo,notifyRender} from './core.mjs';
import {gridSizeFor} from '../../shared/catalog.mjs';

// A start = a date (native calendar, opened on click) and a time chosen from hour / minute lists
// (5-minute steps, 00 by default). The hidden "time" input keeps the HH:MM value submitEvent reads.
const MINUTES=Array.from({length:12},(_,index)=>String(index*5).padStart(2,'0'));
function parisToday(){return new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());}
export function departureFields(departure={}){
  const id=crypto.randomUUID();
  const [hour='00',minute='00']=String(departure.time||'00:00').split(':');
  const minutes=MINUTES.includes(minute)?MINUTES:[...MINUTES,minute].sort();
  const hours=Array.from({length:24},(_,value)=>String(value).padStart(2,'0'));
  return `<div class="departure-field" data-id="${esc(departure.id||'')}"><div><label class="form-label" for="date-${id}">Date</label><input id="date-${id}" name="date" type="date" value="${esc(departure.date||'')}" ${departure.id?'':`min="${parisToday()}"`} required data-date-picker></div><div class="time-picker"><span class="form-label" id="time-label-${id}">Heure (Paris)</span><span class="time-picker-row" role="group" aria-labelledby="time-label-${id}"><select name="timeHour" aria-label="Heure">${hours.map(value=>`<option value="${value}" ${value===hour?'selected':''}>${value} h</option>`).join('')}</select><span aria-hidden="true">:</span><select name="timeMinute" aria-label="Minutes">${minutes.map(value=>`<option value="${value}" ${value===minute?'selected':''}>${value}</option>`).join('')}</select></span><input type="hidden" name="time" value="${esc(`${hour}:${minute}`)}"></div>${button('remove-departure','×','aria-label="Supprimer ce départ"','remove-departure')}</div>`;
}
if(typeof document!=='undefined'){
  document.addEventListener('change',event=>{
    const field=event.target;
    if(!field.matches?.('[name="timeHour"],[name="timeMinute"]'))return;
    const row=field.closest('.departure-field');
    row.querySelector('[name="time"]').value=`${row.querySelector('[name="timeHour"]').value}:${row.querySelector('[name="timeMinute"]').value}`;
  });
  document.addEventListener('click',event=>{
    const input=event.target.closest?.('input[data-date-picker]');
    try{input?.showPicker?.();}catch{}
  });
}
// Solo race fields: access, one or two rounds (circuit, possibly random, and duration in minutes)
// and the number of places, suggested from the game server size of the first circuit.
// Format of the event: chosen at creation, fixed afterwards.
function formatChoice(event){
  if(event)return `<p class="event-format-fixed">Format : <strong>${event.format==='solo'?'Course solo':'Endurance'}</strong></p><input type="hidden" data-format-value value="${event.format||'endurance'}">`;
  const option=(value,label,help,checked)=>`<label class="solo-access-option event-format-option"><input type="radio" name="eventFormat" value="${value}" ${checked?'checked':''}><span><strong>${label}</strong><small>${help}</small></span></label>`;
  return `<div class="event-format-choice" role="radiogroup" aria-label="Format">${option('endurance','Endurance','Équipages, relais et heures de présence.',state.listFormat!=='solo')}${option('solo','Course solo','Une inscription par pilote, places limitées, une ou deux manches.',state.listFormat==='solo')}</div>`;
}
const circuitOptions=selected=>`<option value="">Sélectionner un circuit</option>${CIRCUITS.map(c=>`<option value="${c.id}" ${selected===c.id?'selected':''}>${esc(c.random?'Circuit aléatoire (annoncé au dernier moment)':c.name)}</option>`).join('')}`;
function roundFields(index,round={}){
  return `<div class="solo-round" data-round="${index}"><span class="form-label solo-round-title">Manche ${index+1}</span><label class="form-label">Circuit<select name="roundCircuit" required>${circuitOptions(round.circuit||'')}</select></label><label class="form-label">Durée (minutes)<input name="roundMinutes" type="number" min="5" max="600" step="5" value="${esc(round.durationMinutes||20)}" required></label></div>`;
}
function soloFields(event){
  const rounds=event?.rounds?.length?event.rounds:[{}];
  const access=event?.access||'open';
  const choice=(value,label,help)=>`<label class="solo-access-option"><input type="radio" name="eventAccess" value="${value}" ${access===value?'checked':''}><span><strong>${label}</strong><small>${help}</small></span></label>`;
  return `<div class="solo-fields" data-format-section="solo"><div class="solo-access" role="radiogroup" aria-label="Accès">${choice('open','OPEN','Ouverte à tous les pilotes connectés.')}${choice('safe','SAFE','Réservée aux pilotes SAFE.')}</div>
    <div class="solo-rounds">${roundFields(0,rounds[0])}${rounds[1]?roundFields(1,rounds[1]):''}</div>
    <label class="event-schedule-option"><input type="checkbox" name="eventTwoRounds" ${rounds[1]?'checked':''}><span><strong>Deux manches</strong><small>Deux courses courtes le même soir, avec une seule inscription.</small></span></label>
    <label class="form-label">Nombre de places<input name="eventCapacity" type="number" min="2" max="120" step="1" value="${esc(event?.capacity||gridSizeFor(rounds[0].circuit))}" required ${event?'data-edited="true"':''}></label>
    <p class="creation-help">Au-delà, les pilotes peuvent s’inscrire en liste d’attente. Proposé d’après la taille du serveur de jeu (62 au Mans, 38 ailleurs sur LMU).</p></div>`;
}
// Solo race: each round has its own categories (e.g. round 1 in GT3, round 2 in Hypercar).
function soloCategoryGroups(rounds){
  return rounds.map((round,index)=>`<fieldset class="solo-category-group" data-round-categories="${index}"><legend>${rounds.length>1?`Manche ${index+1}`:'Catégories de la course'}</legend><div class="event-category-options">${CATEGORIES.map(category=>`<label class="event-category-option ${categories[category].css}"><input type="checkbox" name="roundCategory${index}" value="${esc(category)}" ${(round.categories||[]).includes(category)?'checked':''}>${logo(category)}<span>${esc(category)}</span></label>`).join('')}</div></fieldset>`).join('');
}
// Keeps one category group per round, and the categories already ticked.
function syncSoloCategoryGroups(form){
  const container=form.querySelector('[data-solo-categories]');if(!container)return;
  const count=form.querySelectorAll('.solo-round').length||1;
  const current=[...container.querySelectorAll('[data-round-categories]')].map(group=>({categories:[...group.querySelectorAll('input:checked')].map(input=>input.value)}));
  const rounds=Array.from({length:count},(_,index)=>current[index]||{categories:[...(current[0]?.categories||[])]});
  container.innerHTML=soloCategoryGroups(rounds);
  container.querySelectorAll('input').forEach(field=>{field.disabled=form.dataset.format!=='solo';});
}
// Shows the fields of the chosen format; the hidden ones are disabled so they are not validated.
export function applyEventFormat(form){
  const format=form.querySelector('[name="eventFormat"]:checked')?.value||form.querySelector('[data-format-value]')?.value||'endurance';
  form.dataset.format=format;
  form.querySelectorAll('[data-format-section]').forEach(section=>{
    const active=section.dataset.formatSection===format;
    section.hidden=!active;
    section.querySelectorAll('input,select').forEach(field=>{field.disabled=!active;});
  });
  const addDeparture=form.querySelector('.add-departure-button');
  if(addDeparture)addDeparture.hidden=format==='solo';
  if(format==='solo')form.querySelectorAll('.departure-field').forEach((row,index)=>{if(index>0)row.remove();});
}
if(typeof document!=='undefined'){
  document.addEventListener('change',event=>{
    const field=event.target,form=field.closest?.('form[data-kind="event"]');
    if(!form)return;
    if(field.name==='eventFormat'){applyEventFormat(form);return;}
    if(field.name==='eventTwoRounds'){
      const rounds=form.querySelector('.solo-rounds');
      if(field.checked&&!rounds.querySelector('[data-round="1"]'))rounds.insertAdjacentHTML('beforeend',roundFields(1,{circuit:'random',durationMinutes:rounds.querySelector('[name="roundMinutes"]')?.value||20}));
      if(!field.checked)rounds.querySelector('[data-round="1"]')?.remove();
      syncSoloCategoryGroups(form);
      return;
    }
    if(field.name==='eventCapacity'){field.dataset.edited='true';return;}
    if(field.name==='roundCircuit'&&field.closest('[data-round="0"]')){
      const capacity=form.querySelector('[name="eventCapacity"]');
      if(capacity&&!capacity.dataset.edited)capacity.value=gridSizeFor(field.value);
    }
  });
}
export function updateRemoveButtons(){const buttons=app.querySelectorAll('[data-action="remove-departure"]');buttons.forEach(button=>{button.disabled=buttons.length===1;});}
export function renderEventForm(event=null){
  if(!canManage())throw Error('Connecte-toi avec un compte autorisé.');state.page='form';state.editingEvent=event?structuredClone(event):null;
  app.innerHTML=`${button('home','← Retour','','secondary-button back-button')}<h1 class="page-title">${event?'MODIFIER L’ÉVÉNEMENT':'NOUVEL ÉVÉNEMENT'}</h1><form class="form-panel event-creation event-stepper" data-kind="event" data-step="${event?4:1}"><div class="registration-progress" aria-hidden="true" data-event-progress>${EVENT_STEPS.map((_,index)=>`<span class="${index<(event?4:1)?'done':''}"></span>`).join('')}</div><p class="registration-step-label" data-event-step-label>Étape ${event?4:1} sur 4 · ${EVENT_STEPS[event?3:0]}</p><div class="creation-intro"><span class="creation-kicker">${event?'ÉDITION':'CONFIGURATION'} DE LA COURSE</span><h2>${event?'Mettre à jour la course':'Préparer une nouvelle course'}</h2><p>Renseigne les informations essentielles, puis ajoute les départs et les catégories ouvertes aux pilotes.</p></div><section class="creation-card creation-basics event-step" data-event-step="1" ${event?'hidden':''}><div class="creation-card-heading"><span class="creation-step">01</span><div><h2>Informations générales</h2><p>Le nom, le format et le circuit apparaîtront dans le récapitulatif.</p></div></div>${formatChoice(event)}<div class="creation-field-grid"><label class="form-label">Nom de l’événement<input name="eventName" maxlength="100" value="${esc(event?.name||'')}" required></label><div class="format-contents" data-format-section="endurance"><label class="form-label">Durée de la course<input name="eventDuration" type="number" min="1" max="24" step="1" value="${esc(event?.durationHours||6)}" required></label><label class="form-label">Type d’événement<select name="eventType">${Object.entries(EVENT_TYPES).map(([key,item])=>`<option value="${key}" ${(event?.eventType||'private')===key?'selected':''}>${esc(item.label)}</option>`).join('')}</select></label><label class="form-label">Circuit<select name="eventCircuit" required><option value="">Sélectionner un circuit</option>${CIRCUITS.map(c=>`<option value="${c.id}" ${(event?.circuit||'')===c.id?'selected':''}>${esc(c.random?'Circuit à confirmer':c.name)}</option>`).join('')}</select></label></div><label class="event-schedule-option"><input type="checkbox" name="eventSchedulePending" ${event?.schedulePending?'checked':''}><span><strong>Horaires à confirmer</strong><small>Affiche l’étiquette « Horaires à confirmer » tant que les dates et heures peuvent encore changer.</small></span></label></div>${soloFields(event)}</section><fieldset class="creation-card creation-fieldset event-step" data-event-step="2" hidden><legend>02 · Catégories autorisées</legend><div class="format-contents" data-format-section="endurance"><p class="creation-help">Choisis une ou plusieurs catégories disponibles pour cette course.</p><div class="event-category-options">${CATEGORIES.map(category=>`<label class="event-category-option ${categories[category].css}"><input type="checkbox" name="eventCategory" value="${esc(category)}" ${event?.categories.includes(category)?'checked':''}>${logo(category)}<span>${esc(category)}</span></label>`).join('')}</div></div><div class="solo-round-categories" data-format-section="solo" data-solo-categories>${soloCategoryGroups(event?.rounds?.length?event.rounds:[{}])}</div></fieldset><fieldset class="creation-card creation-fieldset event-step" data-event-step="3" hidden><legend>03 · Départs possibles</legend><p class="creation-help">Les dates et heures sont saisies à l’heure de Paris.</p><div id="departureFields" class="departure-fields">${(event?.departures||[{}]).map(departureFields).join('')}</div>${button('add-departure','+ Ajouter un départ','','secondary-button add-departure-button')}</fieldset><section class="creation-card event-step event-recap" data-event-step="4" ${event?'':'hidden'}><div class="creation-card-heading"><span class="creation-step">04</span><div><h2>Récapitulatif</h2><p>Vérifie la course avant de ${event?'l’enregistrer':'la créer'}. Touche une ligne pour la modifier.</p></div></div><div class="registration-summary" data-event-recap></div>${event?'<p class="creation-help">Un départ avec des inscrits ne peut pas être supprimé, ni une catégorie encore utilisée.</p>':''}</section><div class="creation-actions registration-step-nav event-step-nav">${button('event-step','Retour','data-step="back" '+(event?'':'hidden'),'secondary-button registration-back')}${button('event-step','Continuer','data-step="next" '+(event?'hidden':''),'primary-button registration-next')}<button type="submit" class="primary-button registration-next" data-event-submit ${event?'':'hidden'}>${event?'ENREGISTRER LES MODIFICATIONS':'CRÉER L’ÉVÉNEMENT'}</button></div></form>`;
  applyEventFormat(app.querySelector('form[data-kind="event"]'));
  updateRemoveButtons();if(event)fillEventRecap(app.querySelector('form[data-kind="event"]'));notifyRender();
}

// Step-by-step event form: 1 general information, 2 categories, 3 starts, 4 summary.
// Every field stays in the form; steps are only shown or hidden, so submitEvent reads it as before.
export const EVENT_STEPS=['Informations générales','Catégories','Départs','Récapitulatif'];
const parisDate=new Intl.DateTimeFormat('fr-FR',{weekday:'short',day:'numeric',month:'short',timeZone:'UTC'});
export function fillEventRecap(form){
  const recap=form?.querySelector('[data-event-recap]');if(!recap)return;
  const value=name=>form.elements[name]?.value||'';
  const selectedText=name=>form.elements[name]?.selectedOptions?.[0]?.textContent||'—';
  const cats=[...form.querySelectorAll('[name="eventCategory"]:checked')].map(input=>input.value);
  const deps=[...form.querySelectorAll('.departure-field')].map(row=>{const date=row.querySelector('[name="date"]').value,time=row.querySelector('[name="time"]').value;return date?`${parisDate.format(new Date(`${date}T00:00:00Z`))} · ${timeLabel(time)}`:'';}).filter(Boolean);
  const row=(step,label,content)=>`<button type="button" class="registration-summary-row" data-action="event-step" data-step="${step}"><span>${label}</span><strong>${content}</strong><em>Modifier</em></button>`;
  if(form.dataset.format==='solo'){
    const rounds=[...form.querySelectorAll('.solo-round')].map(round=>{const select=round.querySelector('[name="roundCircuit"]');return `${esc(select.value?select.selectedOptions[0].textContent.replace(' (annoncé au dernier moment)',''):'—')} · ${esc(round.querySelector('[name="roundMinutes"]').value)} min`;});
    const access=form.querySelector('[name="eventAccess"]:checked')?.value==='safe'?'SAFE':'OPEN';
    recap.innerHTML=row(1,'Course',`${esc(value('eventName')||'—')} · Course solo`)+row(1,'Accès',access+(form.elements.eventSchedulePending?.checked?' · Horaires à confirmer':''))+row(1,rounds.length>1?'Manches':'Manche',rounds.join(' + '))+row(1,'Places',`${esc(value('eventCapacity'))} (puis liste d’attente)`)+[...form.querySelectorAll('[data-round-categories]')].map((group,index,all)=>{const list=[...group.querySelectorAll('input:checked')].map(input=>input.value);return row(2,all.length>1?`Catégories manche ${index+1}`:'Catégories',list.length?list.map(category=>`${logo(category)} ${esc(category)}`).join(' '):'—');}).join('')+row(3,'Départ',deps.length?esc(deps.join(' · ')):'—');
    return;
  }
  recap.innerHTML=row(1,'Course',`${esc(value('eventName')||'—')} · ${esc(value('eventDuration'))} h`)+row(1,'Type',esc(selectedText('eventType'))+(form.elements.eventSchedulePending?.checked?' · Horaires à confirmer':''))+row(1,'Circuit',esc(value('eventCircuit')?selectedText('eventCircuit'):'—'))+row(2,'Catégories',cats.length?cats.map(category=>`${logo(category)} ${esc(category)}`).join(' '):'—')+row(3,'Départs',deps.length?esc(deps.join(' · ')):'—');
}
function validateEventStep(form,step){
  const section=form.querySelector(`[data-event-step="${step}"]`);
  for(const field of section?.querySelectorAll('input,select')||[]){if(!field.checkValidity()){field.reportValidity();throw Error('Complète les champs de cette étape.');}}
  if(step===2&&form.dataset.format==='solo'){
    for(const group of form.querySelectorAll('[data-round-categories]'))if(!group.querySelector('input:checked'))throw Error(form.querySelectorAll('[data-round-categories]').length>1?`Choisis au moins une catégorie pour la manche ${Number(group.dataset.roundCategories)+1}.`:'Sélectionne au moins une catégorie.');
  } else if(step===2&&!form.querySelector('[name="eventCategory"]:checked'))throw Error('Sélectionne au moins une catégorie.');
}
export function goToEventStep(form,target){
  const current=Number(form.dataset.step)||1;
  const wanted=target==='next'?current+1:target==='back'?current-1:Number(target);
  if(!(wanted>=1&&wanted<=4))return;
  if(wanted>current)for(let step=current;step<wanted;step++)validateEventStep(form,step);
  form.dataset.step=String(wanted);
  form.querySelectorAll('[data-event-step]').forEach(section=>{section.hidden=Number(section.dataset.eventStep)!==wanted;});
  form.querySelectorAll('[data-event-progress] span').forEach((bar,index)=>bar.classList.toggle('done',index<wanted));
  form.querySelector('[data-event-step-label]').textContent=`Étape ${wanted} sur 4 · ${EVENT_STEPS[wanted-1]}`;
  form.querySelector('[data-step="back"]').hidden=wanted===1;
  form.querySelector('[data-step="next"]').hidden=wanted===4;
  form.querySelector('[data-event-submit]').hidden=wanted!==4;
  if(wanted===4)fillEventRecap(form);
  form.scrollIntoView({block:'start',behavior:'auto'});
}
