// « Inscription par catégorie » (community module): on a race with several starts, the pilot first only says
// M'inscrire or Absent. Entering is one registration for the race: his categories, then "every start suits me" or
// his constraints per day; he is entered on every start they allow (whole race, or the hours he can do). The TM
// then makes the crews on a start.
import {weekdayLong,dayMonthShort,timeLabel} from '../dates.mjs';
import {eventMinutes} from '../../shared/duration.mjs';
import {state,esc,button,logo,categories,api,can,CARS,communityTag,registrationCarLabel} from './core.mjs';
import {groupByPilot} from './crews.mjs';

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

// Availability is answered day by day: "all day", "from … to …" or "not free".
// A start is whole when the rule covers all its race hours, partial when it covers some of them.
const raceHours=event=>Math.ceil(eventMinutes(event)/60);
const dayKey=at=>new Date(at).toDateString();
const midnight=at=>{const date=new Date(at);date.setHours(0,0,0,0);return date.getTime();};
function days(event){
  const list=new Map(),length=eventMinutes(event)*60000;
  for(const departure of future(event)){
    const key=dayKey(departure.startsAt);
    if(!list.has(key))list.set(key,{key,at:departure.startsAt,first:Infinity,last:0,items:[]});
    const day=list.get(key);day.items.push(departure);day.first=Math.min(day.first,departure.startsAt);day.last=Math.max(day.last,departure.startsAt+length);
  }
  return [...list.values()].map(day=>({...day,from:new Date(day.first).getHours(),to:Math.min(24,Math.ceil((day.last-midnight(day.at))/HOUR))}));
}
function freeOn(event,departure){
  const rule=draft.days[dayKey(departure.startsAt)]||{},base=midnight(departure.startsAt);
  if(rule.kind!=='all'&&rule.kind!=='range')return ()=>false;
  if(rule.kind==='all')return ()=>true;
  return (from,to)=>from>=base+rule.from*HOUR&&to<=base+rule.to*HOUR;
}
function statusFor(event,departure){
  const start=Number(departure.startsAt),end=start+eventMinutes(event)*60000,free=freeOn(event,departure),list=[];
  for(let k=1;k<=raceHours(event);k++)if(free(start+(k-1)*HOUR,Math.min(end,start+k*HOUR)))list.push(k);
  return !list.length?'':list.length===raceHours(event)?'whole':list.map(k=>`h${k}`).join(',');
}
const covered=(event,status)=>status==='whole'?raceHours(event):status?status.split(',').length:0;
function matches(event){return future(event).map(departure=>({departure,status:statusFor(event,departure)})).filter(item=>item.status);}
// Reopening: each day's answer is rebuilt from the entries (a first entry: every day still to answer).
function ruleFrom(event,own){
  const list=days(event),length=eventMinutes(event)*60000;
  return Object.fromEntries(list.map(day=>{
    if(!own.length)return [day.key,{kind:'',from:day.from,to:day.to}];
    const spans=own.filter(item=>dayKey(item.departure.startsAt)===day.key).flatMap(({departure,reg})=>{
      const ks=reg.status==='whole'?Array.from({length:raceHours(event)},(_,i)=>i+1):String(reg.status).split(',').map(part=>Number(part.slice(1))).filter(Boolean);
      return ks.map(k=>[departure.startsAt+(k-1)*HOUR,Math.min(departure.startsAt+length,departure.startsAt+k*HOUR)]);
    });
    if(!spans.length)return [day.key,{kind:'none',from:day.from,to:day.to}];
    const base=midnight(day.at),from=Math.floor((Math.min(...spans.map(span=>span[0]))-base)/HOUR),to=Math.ceil((Math.max(...spans.map(span=>span[1]))-base)/HOUR);
    return [day.key,from<=day.from&&to>=day.to?{kind:'all',from:day.from,to:day.to}:{kind:'range',from,to:Math.min(24,to)}];
  }));
}

let draft=null;
export function openCategoryEntry(event){
  const own=mine(event);
  draft={eventId:event.id,step:1,categories:[...new Set(own.map(item=>item.reg.category))],cars:Object.fromEntries(event.categories.map(category=>{const reg=own.find(item=>item.reg.category===category)?.reg;return [category,reg&&!reg.carAny?[...(reg.cars||[])]:[]];})),days:ruleFrom(event,own)};
  renderCategoryEntry(event);
}
export function closeCategoryEntry(){draft=null;document.querySelector('[data-category-entry]')?.remove();}
const startName=departure=>`${weekdayLong(departure.startsAt).slice(0,3)}. ${timeLabel(departure.time)}`;
const hourOptions=(from,to,chosen)=>Array.from({length:to-from+1},(_,i)=>from+i).map(hour=>`<option value="${hour}" ${hour===chosen?'selected':''}>${hour===24?'minuit':`${hour} h`}</option>`).join('');
function startChip(event,departure){
  const status=statusFor(event,departure),n=covered(event,status),total=raceHours(event);
  return `<span class="ce-chip ${status==='whole'?'is-whole':status?'is-part':'is-off'}"><strong>${esc(timeLabel(departure.time))}</strong><em>${status==='whole'?'✓ toute la course':status?`${n} h sur ${total}`:'pas dispo'}</em></span>`;
}
const KINDS=[['all','Toute la journée','Libre sur tous les départs du jour'],['range','Une plage horaire','Libre seulement à certaines heures'],['none','Pas dispo','Aucun départ ce jour-là']];
function dayPane(event,day,index,count){
  const rule=draft.days[day.key];
  const kinds=KINDS.map(([kind,label,text])=>`<button type="button" class="ce-choice${rule.kind===kind?' active':''}" data-action="category-entry-kind" data-day="${esc(day.key)}" data-value="${kind}" aria-pressed="${rule.kind===kind}"><i aria-hidden="true"></i><span><strong>${label}</strong><em>${text}</em></span></button>`).join('');
  const range=rule.kind==='range'?`<div class="ce-range"><label>De<select data-ce-range="from" data-day="${esc(day.key)}">${hourOptions(0,23,rule.from)}</select></label><label>À<select data-ce-range="to" data-day="${esc(day.key)}">${hourOptions(1,24,rule.to)}</select></label></div>`:'';
  return `<div class="ce-intro"><p class="ce-day-step">Jour ${index+1} sur ${count}</p><h3 class="ce-day-title">${esc(weekdayLong(day.at))} <span>${esc(dayMonthShort(day.at))}</span></h3><p>${day.items.length} départ${day.items.length>1?'s':''} ce jour-là. Es-tu disponible ?</p></div><div class="ce-choices">${kinds}</div>${range}<div class="ce-chips">${day.items.map(departure=>startChip(event,departure)).join('')}</div>`;
}
const answer=rule=>rule.kind==='all'?'Toute la journée':rule.kind==='range'?`De ${rule.from} h à ${rule.to===24?'minuit':`${rule.to} h`}`:rule.kind==='none'?'Pas dispo':'—';
export function renderCategoryEntry(event){
  const previous=document.querySelector('[data-category-entry] .registration-sheet');
  const keep=previous&&previous.dataset.step===String(draft?.step)?previous.scrollTop:0;
  document.querySelector('[data-category-entry]')?.remove();
  if(!draft)return;
  const list=days(event),last=list.length+2,step=draft.step,total=future(event).length;
  const section=step===1?1:step<last?2:3;
  const cats=event.categories.map(category=>button('category-entry-category',`${logo(category)}<span class="registration-category-copy"><strong>${esc(category)}</strong><em>${draft.categories.includes(category)?'✓ Choisie':'Choisir'}</em></span>`,`data-value="${esc(category)}" aria-pressed="${draft.categories.includes(category)}"`,`category-button ${categories[category]?.css||''} ${draft.categories.includes(category)?'active':''}`)).join('');
  const found=matches(event),partial=found.filter(item=>item.status!=='whole').length;
  const concerned=found.length?`<ul class="ce-concerned-list">${found.map(({departure,status})=>`<li><strong>${esc(weekdayLong(departure.startsAt))} ${esc(dayMonthShort(departure.startsAt))} · ${esc(timeLabel(departure.time))}</strong><span class="${status==='whole'?'is-whole':'is-part'}">${status==='whole'?'toute la course':`${covered(event,status)} h sur ${raceHours(event)}`}</span></li>`).join('')}</ul>`:'<p class="ce-empty">Aucun départ ne correspond à tes réponses.</p>';
  const summary=`<div class="ce-intro"><h3>Ton inscription</h3><p>Vérifie avant de confirmer.</p></div><div class="registration-summary"><div class="registration-summary-row is-static"><span>Pilote</span><strong>${esc(state.user?.name||'')}</strong></div><button type="button" class="registration-summary-row" data-action="category-entry-step" data-step="1"><span>Catégories</span><strong>${draft.categories.map(category=>`${esc(category)}${draft.cars[category].length?` (${draft.cars[category].map(esc).join(', ')})`:''}`).join(' ou ')}</strong><em>Modifier</em></button>${list.map((day,index)=>`<button type="button" class="registration-summary-row" data-action="category-entry-step" data-step="${index+2}"><span>${esc(weekdayLong(day.at))}</span><strong>${esc(answer(draft.days[day.key]))}</strong><em>Modifier</em></button>`).join('')}</div><h4 class="ce-subtitle">Tes départs possibles</h4>${concerned}`;
  const tally=`<div class="ce-tally${found.length?'':' is-empty'}"><b>${found.length}</b><span><strong>départ${found.length>1?'s':''} possible${found.length>1?'s':''}</strong><em>${partial?`dont ${partial} en partie · `:''}${draft.categories.map(esc).join(' ou ')}</em></span></div>`;
  const day=section===2?list[step-2]:null;
  const ready=step===1?draft.categories.length>0:day?Boolean(draft.days[day.key].kind):found.length>0;
  const label=step===1?'Continuer':day?(step===last-1?'Voir le récapitulatif':'Jour suivant'):'';
  const next=step<last?button('category-entry-step',label,`data-step="${step+1}" ${ready?'':'disabled'}`,'primary-button registration-next'):`<button type="button" class="primary-button registration-next" data-action="category-entry-save" ${ready?'':'disabled'}>Confirmer mon inscription</button>`;
  const dots=section===2?`<div class="ce-dots">${list.map((item,index)=>`<span class="${index+2===step?'active':draft.days[item.key].kind?'done':''}">${esc(weekdayLong(item.at).slice(0,3))}.</span>`).join('')}</div>`:'';
  const carChoice=draft.categories.filter(category=>(CARS[category]||[]).length).map(category=>`<div class="ce-cars"><p class="ce-cars-title">${logo(category)}<strong>Voiture souhaitée en ${esc(category)}</strong><span>${draft.cars[category].length?`${draft.cars[category].length} choisie${draft.cars[category].length>1?'s':''}`:'Peu importe'}</span></p><div class="ce-car-list">${button('category-entry-car','Peu importe',`data-category="${esc(category)}" data-value="" aria-pressed="${!draft.cars[category].length}"`,`race-filter-chip${draft.cars[category].length?'':' active'}`)}${CARS[category].map(car=>button('category-entry-car',esc(car),`data-category="${esc(category)}" data-value="${esc(car)}" aria-pressed="${draft.cars[category].includes(car)}"`,`race-filter-chip${draft.cars[category].includes(car)?' active':''}`)).join('')}</div></div>`).join('');
  const body=step===1?`<div class="ce-intro"><h3>Dans quelles catégories veux-tu rouler ?</h3><p>Une ou plusieurs. Ce choix vaut pour tous tes départs.</p></div><div class="categories category-entry-categories">${cats}</div>${carChoice}`:day?dayPane(event,day,step-2,list.length):summary;
  const overlay=document.createElement('div');
  overlay.className='crew-builder-overlay';overlay.dataset.categoryEntry='true';
  overlay.innerHTML=`<section class="crew-builder-panel registration-sheet category-entry-sheet" data-step="${step}" role="dialog" aria-modal="true" aria-labelledby="category-entry-title">
    <div class="registration-workspace-head"><div class="registration-workspace-title"><h2 id="category-entry-title">Ton inscription</h2><p>${esc(event.name)} · ${total} départs sur ${list.length} jour${list.length>1?'s':''}</p></div><span class="registration-workspace-actions">${button('category-entry-close','Fermer','','secondary-button registration-close-button')}</span></div>
    <div class="registration-stepper"><div class="ce-tabs">${['Catégories','Disponibilités','Récapitulatif'].map((name,index)=>`<span class="${index+1===section?'active':index+1<section?'done':''}">${index+1}. ${name}</span>`).join('')}</div>${dots}
      <section class="registration-step">${body}</section>
      <div class="ce-footer">${section>1?tally:''}<div class="registration-step-nav">${step>1?button('category-entry-step','Retour',`data-step="${step-1}"`,'secondary-button registration-back'):''}${next}</div>${step===last?'<p class="ce-footnote">Une seule inscription, quel que soit le nombre de départs.</p>':''}</div>
    </div></section>`;
  document.getElementById('app')?.appendChild(overlay);
  overlay.querySelector('.registration-sheet').scrollTop=keep;
  overlay.addEventListener('change',ev=>{const select=ev.target.closest('[data-ce-range]');if(!select)return;const rule=draft.days[select.dataset.day];rule[select.dataset.ceRange]=Number(select.value);if(rule.to<=rule.from){if(select.dataset.ceRange==='from')rule.to=Math.min(24,rule.from+1);else rule.from=Math.max(0,rule.to-1);}renderCategoryEntry(event);});
}
export function categoryEntryAction(event,action,target){
  if(action==='category-entry-peek'){state.categoryEntryPeek=event.id;return true;}
  if(!draft)return false;
  if(action==='category-entry-close'){closeCategoryEntry();return true;}
  if(action==='category-entry-step'){draft.step=Number(target.dataset.step)||1;renderCategoryEntry(event);return true;}
  const toggle=(list,value)=>list.includes(value)?list.filter(item=>item!==value):[...list,value];
  if(action==='category-entry-category')draft.categories=toggle(draft.categories,target.dataset.value);
  if(action==='category-entry-kind')draft.days[target.dataset.day].kind=target.dataset.value;
  if(action==='category-entry-car'){const list=draft.cars[target.dataset.category]||[],car=target.dataset.value;draft.cars[target.dataset.category]=!car?[]:toggle(list,car);}
  renderCategoryEntry(event);
  return true;
}
// The entries follow the choice: added where missing, hours updated, withdrawn where no longer wanted.
export async function saveCategoryEntry(event){
  const own=mine(event),name=(state.user?.name||'').slice(0,32);
  if((event.absences||[]).some(item=>item.mine))await api(`/api/events/${event.id}/absence`,'DELETE');
  for(const departure of future(event))for(const category of event.categories){
    const status=draft.categories.includes(category)?statusFor(event,departure):'';
    const found=own.find(item=>item.departure.id===departure.id&&item.reg.category===category);
    const cars=draft.cars[category]||[],entry={name,category,status,cars,carAny:!cars.length,forOther:false};
    if(status&&!found)await api(`/api/races/${event.id}/departures/${departure.id}/registrations`,'POST',entry);
    else if(status&&found&&(found.reg.status!==status||String(found.reg.cars||[])!==String(cars)||Boolean(found.reg.carAny)!==!cars.length))await api(`/api/registrations/${found.reg.id}`,'PATCH',{...entry,version:found.reg.version});
    else if(!status&&found&&!placed(event,found.reg))await api(`/api/registrations/${found.reg.id}`,'DELETE',{version:found.reg.version});
  }
  closeCategoryEntry();
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
    return `<tr class="${placedIn?'is-placed':''}"><th><span class="ce-board-name">${communityTag(reg)}${esc(reg.name)}</span><span class="ce-board-cats">${[...pilot.cats].map(category=>logo(category)).join('')}</span><span class="ce-board-car">${esc(registrationCarLabel(reg))}</span>${reg.preferredPilot?`<span class="ce-board-wish">Avec ${esc(reg.preferredPilot)}</span>`:''}</th>${cells}</tr>`;
  }).join('');
  const chips=[['','Toutes'],...event.categories.map(category=>[category,category])].map(([value,label])=>button('category-entry-board',value?`${logo(value)}${esc(label)}`:esc(label),`data-value="${esc(value)}" aria-pressed="${filter===value}"`,`race-filter-chip${filter===value?' active':''}`)).join('');
  return `<details class="ce-board" open><summary><span class="ce-board-title">Tableau des disponibilités</span><span class="ce-board-stat">${rows.length} pilote${rows.length>1?'s':''}</span>${waiting?`<span class="ce-board-stat is-waiting">${waiting} sans équipage</span>`:'<span class="ce-board-stat is-done">Tout le monde est placé</span>'}</summary>
    <div class="ce-board-filters">${chips}</div>
    ${rows.length?`<div class="ce-board-scroll"><table><thead><tr><th class="ce-board-corner">Pilote</th>${head}</tr></thead><tbody>${body}</tbody></table></div>`:'<p class="empty">Aucun pilote inscrit pour l’instant.</p>'}
    <p class="ce-board-legend"><span class="is-whole">✓ Toute la course</span><span class="is-part">Une partie</span><span class="is-crew">Dans un équipage</span></p></details>`;
}
export function categoryEntryBoardFilter(event,target){state.categoryEntryBoard={...(state.categoryEntryBoard||{}),[event.id]:target.dataset.value||''};}
