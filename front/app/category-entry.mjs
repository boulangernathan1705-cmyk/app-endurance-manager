// « Inscription par catégorie » (community module): on a race with several starts, the pilot first only says
// M'inscrire or Absent. Entering: his categories, then the hours he is free on a time line; he is entered on every
// start those hours cover (whole race, or the hours he can do). The TM then makes the crews on a start.
import {weekdayLong,dayMonthShort,timeLabel,timeAt} from '../dates.mjs';
import {eventMinutes} from '../../shared/duration.mjs';
import {state,esc,button,logo,categories,api,can} from './core.mjs';

const HOUR=3600000;
const future=event=>(event.departures||[]).filter(departure=>!departure.tbd&&Number(departure.startsAt)>Date.now());
export function categoryEntryOn(event){return state.categoryEntry===true&&event?.format!=='solo'&&future(event).length>1;}
// The pilot's own entries on the race's starts still to come.
function mine(event){return future(event).flatMap(departure=>(departure.availability||[]).filter(reg=>reg.mine&&reg.status!=='unavailable').map(reg=>({departure,reg})));}
const placed=(event,reg)=>(event.departures||[]).some(departure=>(departure.crews||[]).some(crew=>(crew.registrationIds||[]).includes(reg.id)));

// Not entered and not absent: nothing but the two buttons (a TM can still look at the entries).
export function categoryEntryGate(event){
  if(!categoryEntryOn(event)||!state.user||!can('endurance')||state.categoryEntryPeek===event.id)return '';
  if(mine(event).length||(event.absences||[]).some(item=>item.mine))return '';
  return `<section class="category-entry-gate"><div>${button('category-entry-open','M’inscrire','','primary-button')}${button('event-absence','Absent',`data-id="${event.id}"`,'secondary-button absence-button')}</div>${can('crews')?button('category-entry-peek','Voir les inscriptions',`data-id="${event.id}"`,'link-button'):''}</section>`;
}

// Above the starts: where the pilot stands, and the one button to change it.
export function categoryEntryBar(event){
  if(!categoryEntryOn(event)||!state.user||!can('endurance'))return '';
  const own=mine(event);
  if(!own.length)return (event.absences||[]).some(item=>item.mine)?`<section class="category-entry-bar"><div><span class="category-entry-mine"><strong>Tu es noté absent</strong></span></div>${button('category-entry-open','M’inscrire','','primary-button')}</section>`:'';
  const cats=[...new Set(own.map(item=>item.reg.category))],starts=new Set(own.map(item=>item.departure.id)).size;
  const crew=(event.departures||[]).flatMap(departure=>departure.crews||[]).find(crew=>own.some(item=>(crew.registrationIds||[]).includes(item.reg.id)));
  const status=crew?`<span class="category-entry-mine">${logo(crew.category)}<strong>${esc(crew.name)}</strong><em>Ton équipage</em></span>`
    :`<span class="category-entry-mine">${cats.map(category=>`${logo(category)}<strong>${esc(category)}</strong>`).join('')}<em>${starts} départ${starts>1?'s':''} possible${starts>1?'s':''}</em><em class="is-waiting">En attente d’équipage</em></span>`;
  return `<section class="category-entry-bar is-entered"><div>${status}</div>${crew?'':button('category-entry-open','Modifier','','primary-button')}</section>`;
}

// Hour k of a start (1-based) is covered when every clock hour it overlaps is ticked.
const raceHours=event=>Math.ceil(eventMinutes(event)/60);
function hourCells(from,to){const cells=[];for(let at=Math.floor(from/HOUR)*HOUR;at<to;at+=HOUR)cells.push(at);return cells;}
function coveredHours(event,departure,hours){
  const start=Number(departure.startsAt),end=start+eventMinutes(event)*60000,list=[];
  for(let k=1;k<=raceHours(event);k++)if(hourCells(start+(k-1)*HOUR,Math.min(end,start+k*HOUR)).every(at=>hours.includes(at)))list.push(k);
  return list;
}
function statusFor(event,departure,hours){const list=coveredHours(event,departure,hours);return !list.length?'':list.length===raceHours(event)?'whole':list.map(k=>`h${k}`).join(',');}
function hoursOfEntry(event,departure,status){
  const start=Number(departure.startsAt),end=start+eventMinutes(event)*60000;
  const ks=status==='whole'?Array.from({length:raceHours(event)},(_,i)=>i+1):String(status||'').split(',').filter(part=>/^h\d+$/.test(part)).map(part=>Number(part.slice(1)));
  return ks.flatMap(k=>hourCells(start+(k-1)*HOUR,Math.min(end,start+k*HOUR)));
}
// One time line per day: from the first start to the last finish of that day.
function days(event){
  const list=new Map(),length=eventMinutes(event)*60000;
  for(const departure of future(event)){
    const key=new Date(departure.startsAt).toDateString();
    if(!list.has(key))list.set(key,{at:departure.startsAt,from:Infinity,to:0,items:[]});
    const day=list.get(key);day.items.push(departure);day.from=Math.min(day.from,departure.startsAt);day.to=Math.max(day.to,departure.startsAt+length);
  }
  return [...list.values()].map(day=>({...day,cells:hourCells(day.from,day.to)}));
}

let draft=null;
export function openCategoryEntry(event){
  const own=mine(event);
  draft={eventId:event.id,step:1,categories:[...new Set(own.map(item=>item.reg.category))],hours:[...new Set(own.flatMap(item=>hoursOfEntry(event,item.departure,item.reg.status)))]};
  renderCategoryEntry(event);
}
export function closeCategoryEntry(){draft=null;document.querySelector('[data-category-entry]')?.remove();}
// Big, visual time line: one card per day, hours to tap or slide over, each start under it with what it gives.
function timeline(event,day){
  const n=day.cells.length,first=day.cells[0],length=eventMinutes(event)*60000,raceH=raceHours(event);
  const all=day.cells.every(at=>draft.hours.includes(at)),on=at=>draft.hours.includes(at);
  const cells=day.cells.map((at,i)=>`<span class="ce-hour${on(at)?' is-on':''}${on(at)&&!on(day.cells[i-1])?' run-start':''}${on(at)&&!on(day.cells[i+1])?' run-end':''}" data-hour="${at}" role="checkbox" aria-checked="${on(at)}" aria-label="${esc(timeAt(at))}"><b>${esc(timeAt(at))}</b></span>`).join('');
  // Starts that overlap go on separate lanes.
  const lanes=[];
  const bars=day.items.map(departure=>{
    const from=Math.floor((departure.startsAt-first)/HOUR)+1,to=Math.ceil((departure.startsAt+length-first)/HOUR)+1;
    let lane=lanes.findIndex(end=>end<=from);if(lane<0){lane=lanes.length;lanes.push(0);}lanes[lane]=to;
    const status=statusFor(event,departure,draft.hours),covered=status==='whole'?raceH:status?status.split(',').length:0;
    const state=status==='whole'?'is-whole':status?'is-part':'is-off';
    const label=status==='whole'?'✓ Toute la course':status?`${covered} h sur ${raceH}`:'Pas dispo';
    return `<div class="ce-start ${state}" style="grid-column:${from} / ${to};grid-row:${lane+2}"><strong>Départ ${esc(timeLabel(departure.time))}</strong><span class="ce-start-range">${esc(timeAt(departure.startsAt))} → ${esc(timeAt(departure.startsAt+length))}</span><em>${label}</em></div>`;
  }).join('');
  return `<article class="ce-day"><div class="ce-day-head"><h3>${esc(weekdayLong(day.at))} <span>${esc(dayMonthShort(day.at))}</span></h3>${button('category-entry-day',all?'Effacer':'Toute la journée',`data-value="${day.cells.join(',')}"`,`ce-day-all${all?' is-all':''}`)}</div><div class="ce-line" style="--hours:${n}">${cells}${bars}</div></article>`;
}
function matches(event){return future(event).map(departure=>({departure,status:statusFor(event,departure,draft.hours)})).filter(item=>item.status);}
const startName=departure=>`${weekdayLong(departure.startsAt).slice(0,3)}. ${timeLabel(departure.time)}`;
export function renderCategoryEntry(event){
  const previous=document.querySelector('[data-category-entry] .registration-sheet');
  const keep=previous&&previous.dataset.step===String(draft?.step)?previous.scrollTop:0;
  document.querySelector('[data-category-entry]')?.remove();
  if(!draft)return;
  const step=draft.step,steps=['Catégories','Disponibilités','Récapitulatif'];
  const pane=(n,content)=>`<section class="registration-step" ${n===step?'':'hidden'}>${content}</section>`;
  const cats=event.categories.map(category=>button('category-entry-category',`${logo(category)}<span class="registration-category-copy"><strong>${esc(category)}</strong></span>`,`data-value="${esc(category)}" aria-pressed="${draft.categories.includes(category)}"`,`category-button ${categories[category]?.css||''} ${draft.categories.includes(category)?'active':''}`)).join('');
  const found=matches(event);
  const count=found.length?`<div class="ce-result"><strong>${found.length} départ${found.length>1?'s':''} pour toi</strong>${found.map(({departure,status})=>`<span class="${status==='whole'?'is-whole':'is-part'}">${esc(startName(departure))}</span>`).join('')}</div>`:'<div class="ce-result is-empty">Aucun départ pour l’instant : choisis tes heures.</div>';
  const row=(n,label,value)=>`<button type="button" class="registration-summary-row" data-action="category-entry-step" data-step="${n}"><span>${label}</span><strong>${value}</strong><em>Modifier</em></button>`;
  const startsList=found.map(({departure,status})=>`${esc(startName(departure))} · ${status==='whole'?'toute la course':`${status.split(',').length} h sur ${raceHours(event)}`}`).join('<br>');
  const summary=`<div class="registration-summary"><div class="registration-summary-row is-static"><span>Pilote</span><strong>${esc(state.user?.name||'')}</strong></div>${row(1,'Catégories',draft.categories.map(esc).join(' · ')||'—')}${row(2,'Départs',startsList||'—')}</div>`;
  const ready=step===1?draft.categories.length>0:step===2?found.length>0:true;
  const next=step<3?button('category-entry-step','Continuer',`data-step="${step+1}" ${ready?'':'disabled'}`,'primary-button registration-next'):'<button type="button" class="save-button registration-next" data-action="category-entry-save">VALIDER MON INSCRIPTION</button>';
  const overlay=document.createElement('div');
  overlay.className='crew-builder-overlay';overlay.dataset.categoryEntry='true';
  overlay.innerHTML=`<section class="crew-builder-panel registration-sheet category-entry-sheet${step===2?' is-wide':''}" data-step="${step}" role="dialog" aria-modal="true" aria-labelledby="category-entry-title">
    <div class="registration-workspace-head"><div class="registration-workspace-title"><h2 id="category-entry-title">Ton inscription</h2><p>${esc(event.name)}</p></div><span class="registration-workspace-actions">${button('category-entry-close','Fermer','','secondary-button registration-close-button')}</span></div>
    <div class="registration-stepper"><div class="registration-progress" aria-hidden="true">${steps.map((_,index)=>`<span class="${index<step?'done':''}"></span>`).join('')}</div>
      <p class="registration-step-label">Étape ${step} sur 3 · ${steps[step-1]}</p>
      ${pane(1,`<span class="form-label">Dans quelles catégories veux-tu rouler ?</span><div class="categories category-entry-categories">${cats}</div>`)}
      ${pane(2,`<div class="ce-intro"><h3>Quand es-tu disponible ?</h3><p>Touche ou glisse sur tes heures libres. Tu seras inscrit sur les départs qu’elles couvrent.</p><span class="ce-legend"><i class="is-on"></i>Libre<i class="is-whole"></i>Toute la course<i class="is-part"></i>Une partie</span></div><div class="category-entry-days">${days(event).map(day=>timeline(event,day)).join('')}</div>${count}`)}
      ${pane(3,summary)}
      <div class="registration-step-nav">${step>1?button('category-entry-step','Retour',`data-step="${step-1}"`,'secondary-button registration-back'):''}${next}</div>
    </div></section>`;
  document.getElementById('app')?.appendChild(overlay);
  overlay.querySelector('.registration-sheet').scrollTop=keep;
  paintHours(event,overlay);
}
// Press on an hour and slide: every hour crossed takes the state of the first one.
function paintHours(event,overlay){
  let mode=null;
  const at=(x,y)=>document.elementFromPoint(x,y)?.closest?.('[data-hour]');
  const paint=cell=>{
    if(!cell||mode===null)return;
    const hour=Number(cell.dataset.hour),has=draft.hours.includes(hour);
    if(mode&&!has)draft.hours.push(hour);
    if(!mode&&has)draft.hours=draft.hours.filter(item=>item!==hour);
    cell.classList.toggle('is-on',mode);
  };
  overlay.addEventListener('pointerdown',ev=>{const cell=ev.target.closest('[data-hour]');if(!cell)return;ev.preventDefault();mode=!draft.hours.includes(Number(cell.dataset.hour));paint(cell);});
  overlay.addEventListener('pointermove',ev=>{if(mode!==null)paint(at(ev.clientX,ev.clientY));});
  const end=()=>{if(mode===null)return;mode=null;renderCategoryEntry(event);};
  overlay.addEventListener('pointerup',end);overlay.addEventListener('pointercancel',end);overlay.addEventListener('pointerleave',end);
}
export function categoryEntryAction(event,action,target){
  if(action==='category-entry-peek'){state.categoryEntryPeek=event.id;return true;}
  if(!draft)return false;
  if(action==='category-entry-close'){closeCategoryEntry();return true;}
  if(action==='category-entry-step'){draft.step=Number(target.dataset.step)||1;renderCategoryEntry(event);return true;}
  const toggle=(list,value)=>list.includes(value)?list.filter(item=>item!==value):[...list,value];
  if(action==='category-entry-category')draft.categories=toggle(draft.categories,target.dataset.value);
  if(action==='category-entry-day'){const cells=target.dataset.value.split(',').map(Number),all=cells.every(at=>draft.hours.includes(at));draft.hours=all?draft.hours.filter(at=>!cells.includes(at)):[...new Set([...draft.hours,...cells])];}
  renderCategoryEntry(event);
  return true;
}
// The entries follow the choice: added where missing, hours updated, withdrawn where no longer wanted.
export async function saveCategoryEntry(event){
  const own=mine(event),name=(state.user?.name||'').slice(0,32);
  if((event.absences||[]).some(item=>item.mine))await api(`/api/events/${event.id}/absence`,'DELETE');
  for(const departure of future(event))for(const category of event.categories){
    const status=draft.categories.includes(category)?statusFor(event,departure,draft.hours):'';
    const found=own.find(item=>item.departure.id===departure.id&&item.reg.category===category);
    const entry={name,category,status,cars:[],carAny:true,forOther:false};
    if(status&&!found)await api(`/api/races/${event.id}/departures/${departure.id}/registrations`,'POST',entry);
    else if(status&&found&&found.reg.status!==status)await api(`/api/registrations/${found.reg.id}`,'PATCH',{...entry,cars:found.reg.cars||[],carAny:found.reg.carAny!==false,version:found.reg.version});
    else if(!status&&found&&!placed(event,found.reg))await api(`/api/registrations/${found.reg.id}`,'DELETE',{version:found.reg.version});
  }
  closeCategoryEntry();
}
