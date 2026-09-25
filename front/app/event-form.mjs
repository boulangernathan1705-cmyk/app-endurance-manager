import {timeLabel} from '../dates.mjs';
import {app,state,esc,button,canManage,CATEGORIES,EVENT_TYPES,CIRCUITS,categories,logo,notifyRender} from './core.mjs';

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
export function updateRemoveButtons(){const buttons=app.querySelectorAll('[data-action="remove-departure"]');buttons.forEach(button=>{button.disabled=buttons.length===1;});}
export function renderEventForm(event=null){
  if(!canManage())throw Error('Connecte-toi avec un compte autorisé.');state.page='form';state.editingEvent=event?structuredClone(event):null;
  app.innerHTML=`${button('home','← Retour','','secondary-button back-button')}<h1 class="page-title">${event?'MODIFIER L’ÉVÉNEMENT':'NOUVEL ÉVÉNEMENT'}</h1><form class="form-panel event-creation event-stepper" data-kind="event" data-step="${event?4:1}"><div class="registration-progress" aria-hidden="true" data-event-progress>${EVENT_STEPS.map((_,index)=>`<span class="${index<(event?4:1)?'done':''}"></span>`).join('')}</div><p class="registration-step-label" data-event-step-label>Étape ${event?4:1} sur 4 · ${EVENT_STEPS[event?3:0]}</p><div class="creation-intro"><span class="creation-kicker">${event?'ÉDITION':'CONFIGURATION'} DE LA COURSE</span><h2>${event?'Mettre à jour la course':'Préparer une nouvelle course'}</h2><p>Renseigne les informations essentielles, puis ajoute les départs et les catégories ouvertes aux pilotes.</p></div><section class="creation-card creation-basics event-step" data-event-step="1" ${event?'hidden':''}><div class="creation-card-heading"><span class="creation-step">01</span><div><h2>Informations générales</h2><p>Le nom, le format et le circuit apparaîtront dans le récapitulatif.</p></div></div><div class="creation-field-grid"><label class="form-label">Nom de l’événement<input name="eventName" maxlength="100" value="${esc(event?.name||'')}" required></label><label class="form-label">Durée de la course<input name="eventDuration" type="number" min="1" max="24" step="1" value="${esc(event?.durationHours||6)}" required></label><label class="form-label">Type d’événement<select name="eventType">${Object.entries(EVENT_TYPES).map(([key,item])=>`<option value="${key}" ${(event?.eventType||'private')===key?'selected':''}>${esc(item.label)}</option>`).join('')}</select></label><label class="form-label">Circuit<select name="eventCircuit" required><option value="">Sélectionner un circuit</option>${CIRCUITS.map(c=>`<option value="${c.id}" ${(event?.circuit||'')===c.id?'selected':''}>${esc(c.name)}</option>`).join('')}</select></label><label class="event-schedule-option"><input type="checkbox" name="eventSchedulePending" ${event?.schedulePending?'checked':''}><span><strong>Horaires à confirmer</strong><small>Affiche l’étiquette « Horaires à confirmer » tant que les dates et heures peuvent encore changer.</small></span></label></div></section><fieldset class="creation-card creation-fieldset event-step" data-event-step="2" hidden><legend>02 · Catégories autorisées</legend><p class="creation-help">Choisis une ou plusieurs catégories disponibles pour cette course.</p><div class="event-category-options">${CATEGORIES.map(category=>`<label class="event-category-option ${categories[category].css}"><input type="checkbox" name="eventCategory" value="${esc(category)}" ${event?.categories.includes(category)?'checked':''}>${logo(category)}<span>${esc(category)}</span></label>`).join('')}</div></fieldset><fieldset class="creation-card creation-fieldset event-step" data-event-step="3" hidden><legend>03 · Départs possibles</legend><p class="creation-help">Les dates et heures sont saisies à l’heure de Paris.</p><div id="departureFields" class="departure-fields">${(event?.departures||[{}]).map(departureFields).join('')}</div>${button('add-departure','+ Ajouter un départ','','secondary-button add-departure-button')}</fieldset><section class="creation-card event-step event-recap" data-event-step="4" ${event?'':'hidden'}><div class="creation-card-heading"><span class="creation-step">04</span><div><h2>Récapitulatif</h2><p>Vérifie la course avant de ${event?'l’enregistrer':'la créer'}. Touche une ligne pour la modifier.</p></div></div><div class="registration-summary" data-event-recap></div>${event?'<p class="creation-help">Un départ avec des inscrits ne peut pas être supprimé, ni une catégorie encore utilisée.</p>':''}</section><div class="creation-actions registration-step-nav event-step-nav">${button('event-step','Retour','data-step="back" '+(event?'':'hidden'),'secondary-button registration-back')}${button('event-step','Continuer','data-step="next" '+(event?'hidden':''),'primary-button registration-next')}<button type="submit" class="primary-button registration-next" data-event-submit ${event?'':'hidden'}>${event?'ENREGISTRER LES MODIFICATIONS':'CRÉER L’ÉVÉNEMENT'}</button></div></form>`;
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
  recap.innerHTML=row(1,'Course',`${esc(value('eventName')||'—')} · ${esc(value('eventDuration'))} h`)+row(1,'Type',esc(selectedText('eventType'))+(form.elements.eventSchedulePending?.checked?' · Horaires à confirmer':''))+row(1,'Circuit',esc(value('eventCircuit')?selectedText('eventCircuit'):'—'))+row(2,'Catégories',cats.length?cats.map(category=>`${logo(category)} ${esc(category)}`).join(' '):'—')+row(3,'Départs',deps.length?esc(deps.join(' · ')):'—');
}
function validateEventStep(form,step){
  const section=form.querySelector(`[data-event-step="${step}"]`);
  for(const field of section?.querySelectorAll('input,select')||[]){if(!field.checkValidity()){field.reportValidity();throw Error('Complète les champs de cette étape.');}}
  if(step===2&&!form.querySelector('[name="eventCategory"]:checked'))throw Error('Sélectionne au moins une catégorie.');
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
