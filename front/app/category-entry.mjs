// « Inscription par catégorie » (community module): on a race with several starts, the pilot first only says
// M'inscrire or Absent. Entering is one registration for the race: his categories, then the starts he can do, each
// for the whole race or some hours; he is entered on each of them. The TM
// then makes the crews on a start.
import {weekdayLong,weekdayLabel,dayMonthShort,timeLabel,timeAt} from '../dates.mjs';
import {eventMinutes} from '../../shared/duration.mjs';
import {state,esc,pilotNameTip,button,logo,categories,api,can,CARS,communityTag,registrationCarLabel,renderAvailabilityTimeline} from './core.mjs';
import {groupByPilot} from './crews.mjs';

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
  return `<section class="category-entry-bar is-entered"><div>${status}</div>${crew?'':`<span class="category-entry-bar-actions">${button('category-entry-open','Modifier','','primary-button')}${button('category-entry-withdraw','Me désinscrire de tous les créneaux','','danger-button')}</span>`}</section>`;
}

// Availability, as on a usual entry: the pilot ticks the starts he can do, then on each one says "whole race"
// or unticks the hours he is not there.
const raceHours=event=>Math.ceil(eventMinutes(event)/60);
const covered=(event,status)=>status==='whole'?raceHours(event):status?status.split(',').length:0;
// 'no': the pilot said « Absent » on this start (shown, never saved).
const statusOf=departure=>{const value=draft.starts[departure.id]||'';return value==='no'?'':value;};
function matches(event){return future(event).map(departure=>({departure,status:statusOf(departure)})).filter(item=>item.status);}
const dayKey=at=>new Date(at).toDateString();
function days(event){
  const list=new Map();
  for(const departure of future(event)){const key=dayKey(departure.startsAt);if(!list.has(key))list.set(key,{key,at:departure.startsAt,items:[]});list.get(key).items.push(departure);}
  return [...list.values()];
}

let draft=null;
export function openCategoryEntry(event){
  const own=mine(event);
  draft={eventId:event.id,step:1,categories:[...new Set(own.map(item=>item.reg.category))],cars:Object.fromEntries(event.categories.map(category=>{const reg=own.find(item=>item.reg.category===category)?.reg;return [category,reg&&!reg.carAny?[...(reg.cars||[])]:[]];})),starts:Object.fromEntries(own.map(({departure,reg})=>[departure.id,reg.status]))};
  renderCategoryEntry(event);
}
export function closeCategoryEntry(){draft=null;document.querySelector('[data-category-entry]')?.remove();}
const hoursText=(event,status)=>status==='whole'?'toute la course':`${covered(event,status)} h sur ${raceHours(event)}`;
// One start, as on the race page: its end, who is already there (pilots without a crew by category, crews), and
// « M'inscrire » / « Absent ». Once entered, « Toute la course » and the hour line (a click removes an hour).
const ICON=path=>`<span class="planning-quick-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="${path}"/></svg></span>`;
const ICON_REGISTER=ICON('M8 7a4 4 0 1 0 8 0a4 4 0 0 0-8 0M6 21v-2a4 4 0 0 1 4-4h4M16 19h6M19 16v6');
const ICON_ABSENT=ICON('M8 7a4 4 0 1 0 8 0a4 4 0 0 0-8 0M6 21v-2a4 4 0 0 1 4-4h3M17 16l4 4M21 16l-4 4');
function startCard(event,departure){
  const status=statusOf(departure),on=Boolean(status),absent=draft.starts[departure.id]==='no';
  const start=Number(departure.startsAt),end=start+eventMinutes(event)*60000;
  const endDay=dayKey(end)!==dayKey(start)?` le ${weekdayLabel(end)}`:'';
  const crews=departure.crews||[],assigned=new Set(crews.flatMap(crew=>crew.registrationIds||[]));
  const others=(departure.availability||[]).filter(reg=>!reg.mine&&reg.status!=='unavailable');
  const free=event.categories.map(category=>[category,others.filter(reg=>reg.category===category&&!assigned.has(reg.id)).length]).filter(([,count])=>count);
  const info=[...free.map(([category,count])=>`<span class="planning-free-pill ${categories[category]?.css||''}">${count} ${esc(category)}</span>`),crews.length?`<span class="ce-start-crews">${crews.length} équipage${crews.length>1?'s':''}</span>`:''].join('');
  const choice=`<button type="button" class="planning-quick-button is-labelled${on?' is-active':''}" data-action="category-entry-start" data-value="yes" data-departure="${departure.id}" aria-pressed="${on}">${ICON_REGISTER}<span class="planning-quick-label">${on?'Inscrit':'M’inscrire'}</span></button><button type="button" class="planning-quick-button is-labelled is-absence${absent?' is-active':''}" data-action="category-entry-start" data-value="no" data-departure="${departure.id}" aria-pressed="${absent}">${ICON_ABSENT}<span class="planning-quick-label">Absent</span></button>`;
  const line=on?renderAvailabilityTimeline({departure,duration:raceHours(event),status,interactive:true,label:'Heures de présence'}).replaceAll('data-action="availability"','data-action="category-entry-hour"'):'';
  const hours=on?`<div class="ce-start-hours"><div class="ce-start-hours-head"><span>Heures de présence${status==='whole'?'':` · <b class="is-part">${hoursText(event,status)}</b>`}</span>${button('category-entry-whole','Toute la course',`data-departure="${departure.id}" aria-pressed="${status==='whole'}"`,`ce-whole${status==='whole'?' active':''}`)}</div>${line}</div>`:'';
  return `<div class="ce-start${on?' is-on':''}${absent?' is-absent':''}"><div class="ce-start-top"><strong>${esc(timeLabel(departure.time))}</strong><span class="planning-start-end">→ ${esc(timeAt(end))}${esc(endDay)}</span>${info?`<span class="ce-start-info">${info}</span>`:''}</div><div class="ce-start-choice">${choice}</div>${hours}</div>`;
}
function startsPane(event){
  return `<div class="ce-intro"><h3>Quels départs peux-tu faire ?</h3></div><div class="ce-start-days">${days(event).map(day=>`<section class="ce-start-day"><h4>${esc(weekdayLong(day.at))} <span>${esc(dayMonthShort(day.at))}</span></h4><div class="ce-start-list">${day.items.map(departure=>startCard(event,departure)).join('')}</div></section>`).join('')}</div>`;
}
export function renderCategoryEntry(event){
  const previous=document.querySelector('[data-category-entry] .registration-sheet');
  const keep=previous&&previous.dataset.step===String(draft?.step)?previous.scrollTop:0;
  document.querySelector('[data-category-entry]')?.remove();
  if(!draft)return;
  const list=days(event),step=draft.step,total=future(event).length;
  const cats=event.categories.map(category=>button('category-entry-category',`${logo(category)}<span class="registration-category-copy"><strong>${esc(category)}</strong><em>${draft.categories.includes(category)?'✓ Choisie':'Choisir'}</em></span>`,`data-value="${esc(category)}" aria-pressed="${draft.categories.includes(category)}"`,`category-button ${categories[category]?.css||''} ${draft.categories.includes(category)?'active':''}`)).join('');
  const found=matches(event),partial=found.filter(item=>item.status!=='whole').length;
  const concerned=found.length?`<ul class="ce-concerned-list">${found.map(({departure,status})=>`<li><div class="ce-concerned-heading"><strong>${esc(weekdayLabel(departure.startsAt))} ${esc(dayMonthShort(departure.startsAt))} · ${esc(timeLabel(departure.time))}</strong><span class="${status==='whole'?'is-whole':'is-part'}">${status==='whole'?'Toute la course':esc(hoursText(event,status))}</span></div>${renderAvailabilityTimeline({departure,duration:raceHours(event),status,label:status==='whole'?'Toute la course':'Heures de présence'})}</li>`).join('')}</ul>`:'<p class="ce-empty">Aucun départ choisi.</p>';
  const summary=`<div class="registration-summary"><div class="registration-summary-row is-static"><span>Pilote</span><strong>${esc(state.user?.name||'')}</strong></div><button type="button" class="registration-summary-row" data-action="category-entry-step" data-step="1"><span>Catégories</span><strong>${draft.categories.map(category=>`${esc(category)}${draft.cars[category].length?` (${draft.cars[category].map(esc).join(', ')})`:''}`).join(' ou ')}</strong><em>Modifier</em></button><button type="button" class="registration-summary-row" data-action="category-entry-step" data-step="2"><span>Départs</span><strong>${found.length} départ${found.length>1?'s':''}</strong><em>Modifier</em></button></div><h4 class="ce-subtitle">Tes départs possibles</h4>${concerned}`;
  const tally=`<div class="ce-tally${found.length?'':' is-empty'}"><b>${found.length}</b><span><strong>départ${found.length>1?'s':''} possible${found.length>1?'s':''}</strong><em>${partial?`dont ${partial} en partie · `:''}${draft.categories.map(esc).join(' ou ')}</em></span></div>`;
  const ready=step===1?draft.categories.length>0:found.length>0;
  const next=step<3?button('category-entry-step',step===1?'Continuer':'Voir le récapitulatif',`data-step="${step+1}" ${ready?'':'disabled'}`,'primary-button registration-next'):`<button type="button" class="primary-button registration-next" data-action="category-entry-save" ${ready?'':'disabled'}>Confirmer mon inscription</button>`;
  const carChoice=draft.categories.filter(category=>(CARS[category]||[]).length).map(category=>`<div class="ce-cars"><p class="ce-cars-title">${logo(category)}<strong>Voiture souhaitée en ${esc(category)}</strong><span>${draft.cars[category].length?`${draft.cars[category].length} choisie${draft.cars[category].length>1?'s':''}`:'Peu importe'}</span></p><div class="ce-car-list">${button('category-entry-car','Peu importe',`data-category="${esc(category)}" data-value="" aria-pressed="${!draft.cars[category].length}"`,`race-filter-chip${draft.cars[category].length?'':' active'}`)}${CARS[category].map(car=>button('category-entry-car',esc(car),`data-category="${esc(category)}" data-value="${esc(car)}" aria-pressed="${draft.cars[category].includes(car)}"`,`race-filter-chip${draft.cars[category].includes(car)?' active':''}`)).join('')}</div></div>`).join('');
  const body=step===1?`<div class="ce-intro"><h3>Dans quelles catégories veux-tu rouler ?</h3><p>Une ou plusieurs. Ce choix vaut pour tous tes départs.</p></div><div class="categories category-entry-categories">${cats}</div>${carChoice}`:step===2?startsPane(event):summary;
  const overlay=document.createElement('div');
  overlay.className='crew-builder-overlay';overlay.dataset.categoryEntry='true';
  overlay.innerHTML=`<section class="crew-builder-panel registration-sheet category-entry-sheet" data-step="${step}" role="dialog" aria-modal="true" aria-labelledby="category-entry-title">
    <div class="registration-workspace-head"><div class="registration-workspace-title"><h2 id="category-entry-title">Ton inscription</h2><p>${esc(event.name)} · ${total} départs sur ${list.length} jour${list.length>1?'s':''}</p></div><span class="registration-workspace-actions">${button('category-entry-close','Fermer','','secondary-button registration-close-button')}</span></div>
    <div class="registration-stepper"><div class="ce-tabs">${['Catégories','Départs','Récapitulatif'].map((name,index)=>`<span class="${index+1===step?'active':index+1<step?'done':''}">${index+1}. ${name}</span>`).join('')}</div>
      <section class="registration-step">${body}</section>
      <div class="ce-footer">${step>1?tally:''}<div class="registration-step-nav">${step>1?button('category-entry-step','Retour',`data-step="${step-1}"`,'secondary-button registration-back'):''}${next}</div>${step===3?'<p class="ce-footnote">Une seule inscription, quel que soit le nombre de départs.</p>':''}</div>
    </div></section>`;
  document.getElementById('app')?.appendChild(overlay);
  overlay.querySelector('.registration-sheet').scrollTop=keep;
}
export function categoryEntryAction(event,action,target){
  if(action==='category-entry-peek'){state.categoryEntryPeek=event.id;return true;}
  if(!draft)return false;
  if(action==='category-entry-close'){closeCategoryEntry();return true;}
  if(action==='category-entry-step'){draft.step=Number(target.dataset.step)||1;renderCategoryEntry(event);return true;}
  const toggle=(list,value)=>list.includes(value)?list.filter(item=>item!==value):[...list,value];
  if(action==='category-entry-category')draft.categories=toggle(draft.categories,target.dataset.value);
  if(action==='category-entry-start'){const id=target.dataset.departure,yes=target.dataset.value==='yes',on=statusOf({id});draft.starts[id]=yes?(on||'whole'):(draft.starts[id]==='no'?'':'no');}
  if(action==='category-entry-whole')draft.starts[target.dataset.departure]='whole';
  if(action==='category-entry-hour'){
    const id=target.dataset.departure,total=raceHours(event),status=statusOf({id});
    const parts=new Set(status==='whole'?Array.from({length:total},(_,i)=>`h${i+1}`):status.split(',').filter(Boolean));
    parts.has(target.dataset.value)?parts.delete(target.dataset.value):parts.add(target.dataset.value);
    draft.starts[id]=parts.size===total?'whole':[...parts].sort((a,b)=>Number(a.slice(1))-Number(b.slice(1))).join(',');
  }
  if(action==='category-entry-car'){const list=draft.cars[target.dataset.category]||[],car=target.dataset.value;draft.cars[target.dataset.category]=!car?[]:toggle(list,car);}
  renderCategoryEntry(event);
  return true;
}
// The entries follow the choice: added where missing, hours updated, withdrawn where no longer wanted.
export async function saveCategoryEntry(event){
  const own=mine(event),name=(state.user?.name||'').slice(0,32);
  if((event.absences||[]).some(item=>item.mine))await api(`/api/events/${event.id}/absence`,'DELETE');
  for(const departure of future(event))for(const category of event.categories){
    const status=draft.categories.includes(category)?statusOf(departure):'';
    const found=own.find(item=>item.departure.id===departure.id&&item.reg.category===category);
    const cars=draft.cars[category]||[],entry={name,category,status,cars,carAny:!cars.length,forOther:false};
    if(status&&!found)await api(`/api/races/${event.id}/departures/${departure.id}/registrations`,'POST',entry);
    else if(status&&found&&(found.reg.status!==status||String(found.reg.cars||[])!==String(cars)||Boolean(found.reg.carAny)!==!cars.length))await api(`/api/registrations/${found.reg.id}`,'PATCH',{...entry,version:found.reg.version});
    else if(!status&&found&&!placed(event,found.reg))await api(`/api/registrations/${found.reg.id}`,'DELETE',{version:found.reg.version});
  }
  closeCategoryEntry();
}

// « Me désinscrire de tous les créneaux »: every entry of the pilot on the race goes at once (an entry already in a crew stays).
export async function withdrawCategoryEntry(event){
  const own=mine(event).filter(item=>!placed(event,item.reg));
  if(!own.length||!confirm(`Retirer ton inscription sur les ${new Set(own.map(item=>item.departure.id)).size} départ(s) de ${event.name} ?`))return false;
  for(const {reg} of own)await api(`/api/registrations/${reg.id}`,'DELETE',{version:reg.version});
  closeCategoryEntry();
  return true;
}

// For the TM: every pilot of the race against every start, with his categories, cars and hours; the best start of
// each category stands out, and a start opens the crew builder there.
export function categoryEntryBoard(event){
  if(!categoryEntryOn(event)||!can('crews'))return '';
  const starts=future(event),filter=state.categoryEntryBoard?.[event.id]||'';
  const crewOf=(departure,reg)=>(departure.crews||[]).find(crew=>(crew.registrationIds||[]).includes(reg.id));
  const pilots=new Map();
  for(const departure of starts)for(const reg of groupByPilot((departure.availability||[]).filter(reg=>reg.status!=='unavailable'&&(!filter||reg.category===filter)),event)){
    const key=reg.participantId||`name:${String(reg.name).toLowerCase()}`;
    if(!pilots.has(key))pilots.set(key,{reg,cats:new Set(),cells:new Map()});
    const pilot=pilots.get(key);(reg.groupCategories||[reg.category]).forEach(category=>pilot.cats.add(category));
    pilot.cells.set(departure.id,{reg,crew:crewOf(departure,reg)});
  }
  const rows=[...pilots.values()].sort((a,b)=>String(a.reg.name).localeCompare(String(b.reg.name),'fr',{sensitivity:'base'}));
  const placedAll=rows.filter(pilot=>[...pilot.cells.values()].some(cell=>cell.crew)).length,waiting=rows.length-placedAll;
  const total=raceHours(event),hoursOf=status=>status==='whole'?total:String(status).split(',').filter(Boolean).length;
  // Best start per category: most pilots free for the whole race, still without a crew.
  const best=new Map();
  for(const category of event.categories){
    let top=null;
    for(const departure of starts){const n=(departure.availability||[]).filter(reg=>reg.category===category&&reg.status==='whole'&&!crewOf(departure,reg)).length;if(n>1&&(!top||n>top.n))top={departure,n};}
    if(top)best.set(category,top);
  }
  const bestIds=new Set((filter?[best.get(filter)].filter(Boolean):[...best.values()]).map(item=>item.departure.id));
  const dayOf=departure=>`${weekdayLong(departure.startsAt).slice(0,3)}. ${dayMonthShort(departure.startsAt)}`;
  const head=starts.map(departure=>{
    const counts=event.categories.filter(category=>!filter||category===filter).map(category=>[category,(departure.availability||[]).filter(reg=>reg.category===category&&reg.status!=='unavailable'&&!crewOf(departure,reg)).length]).filter(([,n])=>n);
    return `<th class="${bestIds.has(departure.id)?'is-best':''}"><span class="ce-board-day">${esc(dayOf(departure))}</span><strong>${esc(timeLabel(departure.time))}</strong><span class="ce-board-counts">${counts.map(([category,n])=>`${logo(category)}<b>${n}</b>`).join('')||'<em>—</em>'}</span>${bestIds.has(departure.id)?'<span class="ce-board-best">Meilleur départ</span>':''}<button type="button" class="ce-board-create" data-crew-builder-open data-departure="${departure.id}">Former un équipage</button></th>`;
  }).join('');
  const body=rows.map(pilot=>{
    const reg=pilot.reg,placedIn=[...pilot.cells.values()].find(cell=>cell.crew);
    const cells=starts.map(departure=>{
      const cell=pilot.cells.get(departure.id);
      if(!cell)return '<td class="is-off"></td>';
      if(cell.crew)return `<td class="is-crew"><span>${logo(cell.crew.category)}${esc(cell.crew.name)}</span></td>`;
      const n=hoursOf(cell.reg.status);
      return `<td class="${n>=total?'is-whole':'is-part'}${placedIn?' is-muted':''}"><span>${n>=total?'✓ Toute':`${n} h / ${total}`}</span></td>`;
    }).join('');
    return `<tr class="${placedIn?'is-placed':''}"><th><span class="ce-board-name" ${pilotNameTip(reg)}>${communityTag(reg)}${esc(reg.name)}</span><span class="ce-board-cats">${[...pilot.cats].map(category=>logo(category)).join('')}</span><span class="ce-board-car">${esc(registrationCarLabel(reg))}</span>${reg.preferredPilot?`<span class="ce-board-wish">Avec ${esc(reg.preferredPilot)}</span>`:''}</th>${cells}</tr>`;
  }).join('');
  const chips=[['','Toutes'],...event.categories.map(category=>[category,category])].map(([value,label])=>button('category-entry-board',value?`${logo(value)}${esc(label)}`:esc(label),`data-value="${esc(value)}" aria-pressed="${filter===value}"`,`race-filter-chip${filter===value?' active':''}`)).join('');
  return `<details class="ce-board" open><summary><span class="ce-board-title">Tableau des disponibilités</span><span class="ce-board-stat">${rows.length} pilote${rows.length>1?'s':''}</span>${waiting?`<span class="ce-board-stat is-waiting">${waiting} sans équipage</span>`:'<span class="ce-board-stat is-done">Tout le monde est placé</span>'}</summary>
    <div class="ce-board-filters">${chips}</div>
    ${rows.length?`<div class="ce-board-scroll"><table><thead><tr><th class="ce-board-corner">Pilote</th>${head}</tr></thead><tbody>${body}</tbody></table></div>`:'<p class="empty">Aucun pilote inscrit pour l’instant.</p>'}
    <p class="ce-board-legend"><span class="is-whole">✓ Toute la course</span><span class="is-part">Une partie</span><span class="is-crew">Dans un équipage</span></p></details>`;
}
export function categoryEntryBoardFilter(event,target){state.categoryEntryBoard={...(state.categoryEntryBoard||{}),[event.id]:target.dataset.value||''};}
