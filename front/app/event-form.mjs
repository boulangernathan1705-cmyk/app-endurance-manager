import {timeLabel} from '../dates.mjs';
import {durationLabel,eventMinutes,driverChangeRequired,SOLO_DRIVER_LIMIT_MINUTES} from '../../shared/duration.mjs';
import {app,state,activeGame,esc,button,canManage,can,canEditRace,CATEGORIES,EVENT_TYPES,CIRCUITS,categories,logo,notifyRender} from './core.mjs';
import {gridSizeFor} from '../../shared/catalog.mjs';
import {weekDates,addDays,bulkStarts} from '../../shared/start-times.mjs';

// A start = a date (native calendar, opened on click) and a time chosen from hour / minute lists
// (5-minute steps, 00 by default). The hidden "time" input keeps the HH:MM value submitEvent reads.
const MINUTES=Array.from({length:12},(_,index)=>String(index*5).padStart(2,'0'));
// Endurance duration: hours and minutes (5-minute steps), like the start time picker.
function durationField(event){
  const total=eventMinutes(event||{durationHours:6}),hours=Math.min(24,Math.floor(total/60)),minutes=String(total%60).padStart(2,'0');
  const hourOptions=Array.from({length:24},(_,index)=>index+1).map(value=>`<option value="${value}" ${value===hours?'selected':''}>${value} h</option>`).join('');
  return `<div class="form-label time-picker duration-picker"><span id="duration-label">Durée de la course</span><span class="time-picker-row" role="group" aria-labelledby="duration-label"><select name="eventDurationHours" aria-label="Heures">${hourOptions}</select><select name="eventDurationMinutes" aria-label="Minutes">${MINUTES.map(value=>`<option value="${value}" ${value===minutes?'selected':''}>${value} min</option>`).join('')}</select></span></div>`;
}
// iRacing: the organizer says whether a driver change is required (a driver alone does not count in the
// classification). Until they touch it, it follows the duration (over 4 h). Always required on LMU.
function driverChangeField(event){
  if(activeGame!=='iracing')return '';
  const checked=driverChangeRequired(event||{circuit:'iracing-tbd',durationMinutes:360});
  return `<label class="event-schedule-option" data-format-section="endurance"><input type="checkbox" name="eventDriverChange" ${checked?'checked':''} ${typeof event?.driverChangeRequired==='boolean'?'data-touched="true"':''}><span><strong>Changement de pilote obligatoire</strong><small>Un pilote qui fait la course seul ne comptera pas au classement. Par défaut, pour les courses de plus de 4 h.</small></span></label>`;
}
export function formDurationMinutes(form){
  return Number(form.elements.eventDurationHours?.value||6)*60+Number(form.elements.eventDurationMinutes?.value||0);
}
function parisToday(){return new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());}
// Common start whose time is not known yet: only its day. Everyone enters there; the real starts are
// added later by editing the race, and each crew then picks its start.
function commonStartField(departure){
  const id=crypto.randomUUID();
  return `<div class="departure-field is-tbd" data-id="${esc(departure.id||'')}" data-tbd="true"><div><label class="form-label" for="date-${id}">Jour de la course</label><input id="date-${id}" name="date" type="date" value="${esc(departure.date||'')}" ${departure.id?'':`min="${parisToday()}"`} required data-date-picker></div><div class="departure-tbd-note"><span class="form-label">Heure</span><strong>À définir</strong><small>Les pilotes s’inscrivent et forment leurs équipages sur ce départ. Ajoute les vrais horaires plus tard en modifiant la course.</small></div><input type="hidden" name="time" value="${esc(departure.clock||(departure.time&&/^\d{2}:\d{2}$/.test(departure.time)?departure.time:'20:00'))}">${button('remove-departure','×','aria-label="Supprimer ce départ"','remove-departure')}</div>`;
}
// Several starts at once (special events: often 3 days with 5 or 6 starts each): first day, number of days,
// and the times of each day typed in one go (« 10h 14h 18h », « 10:00, 13:30 »).
const dayChip=new Intl.DateTimeFormat('fr-FR',{timeZone:'UTC',weekday:'short',day:'numeric',month:'short'});
// The days of one week, as ticks (days before today cannot be chosen); the ticked days are kept when the week changes.
function bulkDayChips(panel){
  const today=parisToday(),chosen=new Set(JSON.parse(panel.dataset.days||'[]'));
  return weekDates(panel.dataset.week||today).map(date=>{const [weekday,day,month]=dayChip.format(new Date(`${date}T12:00:00Z`)).replace('.','').split(' ');
    return `<label class="bulk-chip bulk-day"><input type="checkbox" name="bulkDay" value="${date}" ${chosen.has(date)?'checked':''} ${date<today?'disabled':''}><span><small>${weekday}</small><strong>${day}</strong><small>${month||''}</small></span></label>`;}).join('');
}
function bulkDeparturesPanel(){
  const today=parisToday();
  const hours=Array.from({length:24},(_,hour)=>`<label class="bulk-chip bulk-hour"><input type="checkbox" name="bulkHour" value="${hour}"><span>${String(hour).padStart(2,'0')}h</span></label>`).join('');
  const minutes=['00','15','30','45'].map(minute=>`<option value="${minute}">:${minute}</option>`).join('');
  return `<details class="bulk-departures" data-bulk-departures data-week="${today}" data-days="[]"><summary>Ajouter plusieurs départs d’un coup</summary>
    <div class="bulk-departures-body"><p class="creation-help">Coche les jours de course, puis les heures de départ : chaque jour coché reçoit toutes les heures cochées. Tu pourras ensuite retoucher ou supprimer chaque départ.</p>
      <div class="bulk-step"><div class="bulk-step-head"><span class="form-label">1. Jours de course</span><span class="bulk-week-nav">${button('bulk-week','←','data-shift="-7" aria-label="Semaine précédente"','secondary-button')}${button('bulk-week','→','data-shift="7" aria-label="Semaine suivante"','secondary-button')}</span></div>
        <div class="bulk-days" data-bulk-days></div></div>
      <div class="bulk-step"><div class="bulk-step-head"><span class="form-label">2. Heures de départ (Paris)</span><label class="bulk-minute">minutes <select name="bulkMinute">${minutes}</select></label></div>
        <div class="bulk-hours">${hours}</div></div>
      <div class="bulk-departures-actions"><strong data-bulk-preview aria-live="polite">Coche au moins un jour et une heure.</strong>${button('bulk-departures','Ajouter ces départs','','primary-button')}</div></div></details>`;
}
// Draws the days of the panel's week (after the form is shown, and when the week changes).
export function renderBulkDays(panel){const box=panel?.querySelector('[data-bulk-days]');if(box)box.innerHTML=bulkDayChips(panel);}
export function shiftBulkWeek(panel,days){panel.dataset.week=addDays(panel.dataset.week||parisToday(),days);renderBulkDays(panel);}
export function bulkPreview(form){
  const panel=form.querySelector('[data-bulk-departures]');
  const days=JSON.parse(panel.dataset.days||'[]'),hours=[...form.querySelectorAll('[name="bulkHour"]:checked')].map(box=>box.value);
  const starts=bulkStarts(days,hours,form.elements.bulkMinute?.value);
  const preview=form.querySelector('[data-bulk-preview]');
  if(preview)preview.textContent=starts.length?`${starts.length} départ${starts.length>1?'s':''} : ${days.length} jour${days.length>1?'s':''} × ${hours.length} heure${hours.length>1?'s':''}`:'Coche au moins un jour et une heure.';
  return starts;
}
export function departureFields(departure={}){
  if(departure.tbd)return commonStartField(departure);
  const id=crypto.randomUUID();
  const [hour='00',minute='00']=String(departure.clock||departure.time||'00:00').split(':');
  const minutes=MINUTES.includes(minute)?MINUTES:[...MINUTES,minute].sort();
  const hours=Array.from({length:24},(_,value)=>String(value).padStart(2,'0'));
  return `<div class="departure-field" data-id="${esc(departure.id||'')}"><div><label class="form-label" for="date-${id}">Date</label><input id="date-${id}" name="date" type="date" value="${esc(departure.date||'')}" ${departure.id?'':`min="${parisToday()}"`} required data-date-picker></div><div class="time-picker"><span class="form-label" id="time-label-${id}">Heure (Paris)</span><span class="time-picker-row" role="group" aria-labelledby="time-label-${id}"><select name="timeHour" aria-label="Heure">${hours.map(value=>`<option value="${value}" ${value===hour?'selected':''}>${value} h</option>`).join('')}</select><span aria-hidden="true">:</span><select name="timeMinute" aria-label="Minutes">${minutes.map(value=>`<option value="${value}" ${value===minute?'selected':''}>${value}</option>`).join('')}</select></span><input type="hidden" name="time" value="${esc(`${hour}:${minute}`)}"></div>${button('remove-departure','×','aria-label="Supprimer ce départ"','remove-departure')}</div>`;
}
if(typeof document!=='undefined'){
  document.addEventListener('change',event=>{
    const field=event.target;
    if(field.matches?.('[name="eventDriverChange"]')){field.dataset.touched='true';return;}
    if(field.matches?.('[name="eventSchedulePending"]')){toggleCommonStart(field);return;}
    // 24 h is the longest race: no minutes beyond it.
    if(field.matches?.('[name="eventDurationHours"],[name="eventDurationMinutes"]')){
      const form=field.form;if(form.elements.eventDurationHours.value==='24')form.elements.eventDurationMinutes.value='00';
      const change=form.elements.eventDriverChange;if(change&&!change.dataset.touched)change.checked=formDurationMinutes(form)>SOLO_DRIVER_LIMIT_MINUTES;
      return;
    }
    if(field.matches?.('[name="bulkDay"]')){const panel=field.closest('[data-bulk-departures]'),days=new Set(JSON.parse(panel.dataset.days||'[]'));field.checked?days.add(field.value):days.delete(field.value);panel.dataset.days=JSON.stringify([...days]);bulkPreview(field.form);return;}
    if(field.matches?.('[name="bulkHour"],[name="bulkMinute"]')){bulkPreview(field.form);return;}
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
  // Solo races not enabled on this site: endurance only, nothing to choose.
  if(!state.soloRaces&&event?.format!=='solo')return '<input type="hidden" data-format-value value="endurance">';
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
  const bulk=form.querySelector('[data-bulk-departures]');if(bulk)bulk.hidden=format==='solo';
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
// "Horaires à confirmer" ticked: a common start "à définir" (day only); unticked: a start with a time.
// New race: the single start switches between both. Edited race with a single start: it switches too (same
// start, its entries stay on it); with several starts, ticking adds a common start next to them.
// Next to real starts it stays (it may hold entries; the server drops it when nobody is on it).
function toggleCommonStart(field){
  const list=document.getElementById('departureFields');
  if(!list)return;
  const rows=[...list.querySelectorAll('.departure-field')],common=rows.find(row=>row.dataset.tbd==='true');
  const values=row=>({id:row.dataset.id||undefined,date:row.querySelector('[name="date"]')?.value||'',time:row.querySelector('[name="time"]')?.value||'20:00'});
  if(!state.editingEvent){
    const first=rows[0]?values(rows[0]):{};
    list.innerHTML=departureFields(field.checked?{tbd:true,date:first.date}:{date:first.date});
  }else if(field.checked&&!common&&rows.length===1){
    rows[0].outerHTML=departureFields({...values(rows[0]),tbd:true});
  }else if(field.checked&&!common){
    list.insertAdjacentHTML('afterbegin',departureFields({tbd:true,date:rows[0]?values(rows[0]).date:''}));
  }else if(!field.checked&&common&&rows.length===1){
    common.outerHTML=departureFields(values(common));
  }
  syncDepartureStep(field.form);updateRemoveButtons();
}
// Creating a race with "Horaires à confirmer": a single common start, no other start to add until the
// race is edited with its real times.
export function syncDepartureStep(form){
  const creatingPending=!state.editingEvent&&form?.elements.eventSchedulePending?.checked;
  const add=form?.querySelector('.add-departure-button');if(add)add.hidden=Boolean(creatingPending);
  const bulk=form?.querySelector('[data-bulk-departures]');if(bulk)bulk.hidden=Boolean(creatingPending)||form.querySelector('[name="eventFormat"]:checked')?.value==='solo';
  const help=form?.querySelector('[data-departure-help]');if(help)help.textContent=creatingPending?'Horaires à confirmer : indique seulement le jour. Tu ajouteras les horaires en modifiant la course.':'Les dates et heures sont saisies à l’heure de Paris.';
}
export function updateRemoveButtons(){const buttons=app.querySelectorAll('[data-action="remove-departure"]');buttons.forEach(button=>{button.disabled=buttons.length===1;});}
export function renderEventForm(event=null){
  if(event?!canEditRace(event):!can('create_race'))throw Error('Tu n’as pas l’autorisation de créer ou modifier cette course.');state.page='form';state.editingEvent=event?structuredClone(event):null;
  app.innerHTML=`${button('home','← Retour','','secondary-button back-button')}<h1 class="page-title">${event?'MODIFIER L’ÉVÉNEMENT':'NOUVEL ÉVÉNEMENT'}</h1><form class="form-panel event-creation event-stepper" data-kind="event" data-step="${event?4:1}"><div class="registration-progress" aria-hidden="true" data-event-progress>${EVENT_STEPS.map((_,index)=>`<span class="${index<(event?4:1)?'done':''}"></span>`).join('')}</div><p class="registration-step-label" data-event-step-label>Étape ${event?4:1} sur 4 · ${EVENT_STEPS[event?3:0]}</p><div class="creation-intro"><span class="creation-kicker">${event?'ÉDITION':'CONFIGURATION'} DE LA COURSE</span><h2>${event?'Mettre à jour la course':'Préparer une nouvelle course'}</h2><p>Renseigne les informations essentielles, puis ajoute les départs et les catégories ouvertes aux pilotes.</p></div><section class="creation-card creation-basics event-step" data-event-step="1" ${event?'hidden':''}><div class="creation-card-heading"><span class="creation-step">01</span><div><h2>Informations générales</h2><p>Le nom, le format et le circuit apparaîtront dans le récapitulatif.</p></div></div>${formatChoice(event)}<div class="creation-field-grid"><label class="form-label">Nom de l’événement<input name="eventName" maxlength="100" value="${esc(event?.name||'')}" required></label><div class="format-contents" data-format-section="endurance">${durationField(event)}<label class="form-label">Type d’événement<select name="eventType">${Object.entries(EVENT_TYPES).map(([key,item])=>`<option value="${key}" ${(event?.eventType||'private')===key?'selected':''}>${esc(item.label)}</option>`).join('')}</select></label><label class="form-label">Circuit<select name="eventCircuit" required><option value="">Sélectionner un circuit</option>${CIRCUITS.map(c=>`<option value="${c.id}" ${(event?.circuit||'')===c.id?'selected':''}>${esc(c.random?'Circuit à confirmer':c.name)}</option>`).join('')}</select></label></div><label class="event-schedule-option"><input type="checkbox" name="eventSchedulePending" ${event?.schedulePending?'checked':''}><span><strong>Horaires à confirmer</strong><small>Tu indiques seulement le jour : les pilotes s’inscrivent et forment leurs équipages, et tu ajoutes les horaires plus tard en modifiant la course.</small></span></label>${driverChangeField(event)}</div>${soloFields(event)}</section><fieldset class="creation-card creation-fieldset event-step" data-event-step="2" hidden><legend>02 · Catégories autorisées</legend><div class="format-contents" data-format-section="endurance"><p class="creation-help">Choisis une ou plusieurs catégories disponibles pour cette course.</p><div class="event-category-options">${CATEGORIES.map(category=>`<label class="event-category-option ${categories[category].css}"><input type="checkbox" name="eventCategory" value="${esc(category)}" ${event?.categories.includes(category)?'checked':''}>${logo(category)}<span>${esc(category)}</span></label>`).join('')}</div></div><div class="solo-round-categories" data-format-section="solo" data-solo-categories>${soloCategoryGroups(event?.rounds?.length?event.rounds:[{}])}</div></fieldset><fieldset class="creation-card creation-fieldset event-step" data-event-step="3" hidden><legend>03 · Départs possibles</legend><p class="creation-help" data-departure-help>Les dates et heures sont saisies à l’heure de Paris.</p>${bulkDeparturesPanel()}<div id="departureFields" class="departure-fields">${(event?.departures||[{}]).map(departureFields).join('')}</div>${button('add-departure','+ Ajouter un départ','','secondary-button add-departure-button')}</fieldset><section class="creation-card event-step event-recap" data-event-step="4" ${event?'':'hidden'}><div class="creation-card-heading"><span class="creation-step">04</span><div><h2>Récapitulatif</h2><p>Vérifie la course avant de ${event?'l’enregistrer':'la créer'}. Touche une ligne pour la modifier.</p></div></div><div class="registration-summary" data-event-recap></div>${event?'<p class="creation-help">Un départ avec des inscrits ne peut pas être supprimé, ni une catégorie encore utilisée.</p>':''}</section><div class="creation-actions registration-step-nav event-step-nav">${button('event-step','Retour','data-step="back" '+(event?'':'hidden'),'secondary-button registration-back')}${button('event-step','Continuer','data-step="next" '+(event?'hidden':''),'primary-button registration-next')}<button type="submit" class="primary-button registration-next" data-event-submit ${event?'':'hidden'}>${event?'ENREGISTRER LES MODIFICATIONS':'CRÉER L’ÉVÉNEMENT'}</button></div></form>`;
  applyEventFormat(app.querySelector('form[data-kind="event"]'));
  // Several starts at once: the week of the race's first start (or of today).
  const bulk=app.querySelector('[data-bulk-departures]');
  if(bulk){const first=(event?.departures||[]).map(departure=>departure.date).filter(Boolean).sort()[0];if(first&&first>bulk.dataset.week)bulk.dataset.week=first;renderBulkDays(bulk);}
  syncDepartureStep(app.querySelector('form[data-kind="event"]'));updateRemoveButtons();if(event)fillEventRecap(app.querySelector('form[data-kind="event"]'));notifyRender();
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
  const deps=[...form.querySelectorAll('.departure-field')].map(row=>{const date=row.querySelector('[name="date"]').value,time=row.querySelector('[name="time"]').value;return date?`${parisDate.format(new Date(`${date}T00:00:00Z`))} · ${row.dataset.tbd==='true'?'à définir':timeLabel(time)}`:'';}).filter(Boolean);
  const row=(step,label,content)=>`<button type="button" class="registration-summary-row" data-action="event-step" data-step="${step}"><span>${label}</span><strong>${content}</strong><em>Modifier</em></button>`;
  if(form.dataset.format==='solo'){
    const rounds=[...form.querySelectorAll('.solo-round')].map(round=>{const select=round.querySelector('[name="roundCircuit"]');return `${esc(select.value?select.selectedOptions[0].textContent.replace(' (annoncé au dernier moment)',''):'—')} · ${esc(round.querySelector('[name="roundMinutes"]').value)} min`;});
    const access=form.querySelector('[name="eventAccess"]:checked')?.value==='safe'?'SAFE':'OPEN';
    recap.innerHTML=row(1,'Course',`${esc(value('eventName')||'—')} · Course solo`)+row(1,'Accès',access+(form.elements.eventSchedulePending?.checked?' · Horaires à confirmer':''))+row(1,rounds.length>1?'Manches':'Manche',rounds.join(' + '))+row(1,'Places',`${esc(value('eventCapacity'))} (puis liste d’attente)`)+[...form.querySelectorAll('[data-round-categories]')].map((group,index,all)=>{const list=[...group.querySelectorAll('input:checked')].map(input=>input.value);return row(2,all.length>1?`Catégories manche ${index+1}`:'Catégories',list.length?list.map(category=>`${logo(category)} ${esc(category)}`).join(' '):'—');}).join('')+row(3,'Départ',deps.length?esc(deps.join(' · ')):'—');
    return;
  }
  recap.innerHTML=row(1,'Course',`${esc(value('eventName')||'—')} · ${esc(durationLabel(formDurationMinutes(form)))}`)+row(1,'Type',esc(selectedText('eventType'))+(form.elements.eventSchedulePending?.checked?' · Horaires à confirmer':''))+row(1,'Circuit',esc(value('eventCircuit')?selectedText('eventCircuit'):'—'))+row(2,'Catégories',cats.length?cats.map(category=>`${logo(category)} ${esc(category)}`).join(' '):'—')+row(3,'Départs',deps.length?esc(deps.join(' · ')):'—');
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
