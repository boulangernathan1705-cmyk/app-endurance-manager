// Race over several days (special events: Friday to Sunday, sometimes a whole week): the starts as a planning,
// one column per race day; on a phone, one day at a time with a tab per day. The days on screen always fit the
// window (three by default, five or seven by choice, fewer when the window is narrow); the arrows move them by
// one day. A start opens where it is and its day widens so its crews sit side by side.
import {timeLabel,timeAt,weekdayLabel,weekdayLong,dayMonthLong,dayMonthShort,dateRangeBlock} from '../dates.mjs';
import {eventMinutes} from '../../shared/duration.mjs';
import {raceDays,parisDayKey as dayKey} from '../../shared/start-times.mjs';
import {state,esc,categories,logo,sortedCrews,crewColorClass,pilotCount,communityTag,communityPrefix} from './core.mjs';
import {isSolo,soloFill} from './solo.mjs';

const LOCKED_ICON='<span class="planning-crew-lock is-locked" data-tip="Complet : l’équipage est verrouillé" aria-label="Complet"><svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" d="M5 13a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2zM8 11V7a4 4 0 1 1 8 0v4"/></svg></span>';
const OPEN_ICON='<span class="planning-crew-lock is-open" data-tip="Places libres : tu peux le rejoindre" aria-label="Places libres"><svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" d="M5 13a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2zM8 11V7a4 4 0 0 1 8 0"/></svg></span>';
const CHEVRON='<svg class="planning-chevron" viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" d="m6 9 6 6 6-6"/></svg>';

// The race days with their starts: every race and event uses the planning, over one day or several (a start
// still to define keeps the list of starts).
export function planningDays(event){return raceDays(event.departures||[],{minDays:1});}

// Date block of a race: the span of its days when it runs over several days.
export function raceRangeBlock(event){
  const days=planningDays(event);
  if(days.length<2)return '';
  return dateRangeBlock(days[0].items[0].departure.startsAt,days.at(-1).items[0].departure.startsAt);
}

function startCard(event,departure,body,{minutes,now,open,quick=''}){
  const start=Number(departure.startsAt),end=start+minutes*60000,done=end<=now,live=start<=now&&!done;
  const crews=sortedCrews(event,departure),assigned=new Set(crews.flatMap(crew=>crew.registrationIds||[]));
  const present=(departure.availability||[]).filter(reg=>reg.status!=='unavailable');
  const pilots=pilotCount(departure.availability||[]),mine=present.some(reg=>reg.mine);
  const compact=!open&&(done||!pilots);
  const endDay=dayKey(end)!==dayKey(start)?` le ${weekdayLabel(end)}`:'';
  const tags=compact?'':`${mine?'<span class="planning-tag is-mine">Ton départ</span>':''}${live?'<span class="planning-tag is-live">En cours</span>':''}`;
  const head=`<span class="planning-start-head"><strong>Départ ${esc(timeLabel(departure.time))}</strong>${compact?(done?'<span class="planning-start-state">Terminé</span>':''):(isSolo(event)?'':`<span class="planning-start-end">fin ${esc(timeAt(end))}${esc(endDay)}</span>`)}${tags}</span>`;
  // Pilots without a crew, by category (« 2 GT3 » « 1 Hypercar »): where a pilot can find a crew. The crews
  // follow, by name.
  const free=event.categories.map(category=>{const regs=present.filter(reg=>!assigned.has(reg.id)&&reg.category===category);return [category,regs.length,regs.map(reg=>communityPrefix(reg)+reg.name)];}).filter(([,count])=>count);
  // The crews (by name, in their colour), then, under a thin line, the pilots without a crew.
  const row=(content,extra='')=>`<span class="planning-row"${extra}>${content}</span>`;
  // A crew that still takes pilots shows a green open padlock, a full one a red closed padlock.
  const crewLine=crews.length?row(crews.map((crew,index)=>`<span class="planning-crew ${crewColorClass(crew.id,index)}">${logo(crew.category)}${communityTag(crew)}<span>${esc(crew.name)}</span>${crew.locked?LOCKED_ICON:OPEN_ICON}</span>`).join('')):'';
  const freeLine=free.length?row(free.map(([category,count,names])=>`<span class="planning-free-pill ${categories[category]?.css||''}" data-tip="${esc(names.join(', '))}">${count} ${esc(category)}</span>`).join(''),' data-free-pilots data-tip="Pilotes cherchant un équipage"'):'';
  // Solo event: no crews, the number of participants (and places) instead.
  const details=compact?'':isSolo(event)?row(soloFill(event,departure)):`${crewLine}${freeLine}`;
  return `<details class="planning-start${compact?' is-compact':''}${done?' is-done':''}${mine?' is-mine':''}${!pilots?' is-empty':''}${quick?' has-quick':''}" id="departure-${departure.id}" ${open?'open':''}><summary>${head}${details}${quick}${CHEVRON}</summary><div class="departure-fold planning-body">${body}</div></details>`;
}

// `body(departure, index)`: what an opened start shows (buttons, registration, crews and pilots), as in the list.
// `actions`: the race's own buttons (link, edit, delete), on the heading line of the planning.
export function renderPlanning(event,days,body,{actions='',quick=()=>''}={}){
  const minutes=eventMinutes(event),now=Date.now();
  const finished=day=>day.items.every(({departure})=>Number(departure.startsAt)+minutes*60000<=now);
  const openId=state.selectedDepartureId||[...state.registrationOpen].find(id=>days.some(day=>day.items.some(item=>item.departure.id===id)));
  const active=days.find(day=>day.key===state.planningDay)||days.find(day=>day.items.some(item=>item.departure.id===openId))||days.find(day=>!finished(day))||days[0];
  const tabs=days.map(day=>{const first=day.items[0].departure.startsAt,mine=day.items.some(({departure})=>(departure.availability||[]).some(reg=>reg.mine&&reg.status!=='unavailable'));
    return `<button type="button" class="planning-tab${day===active?' is-active':''}" data-action="planning-day" data-day="${day.key}" aria-pressed="${day===active}"><small>${esc(weekdayLabel(first))}</small><strong>${esc(dayMonthShort(first))}</strong><small>${finished(day)?'terminé':`${day.items.length} départ${day.items.length>1?'s':''}`}</small>${mine?'<i class="planning-tab-mine" aria-label="ton départ"></i>':''}</button>`;}).join('');
  const columns=days.map(day=>{const first=day.items[0].departure.startsAt,pilots=pilotCount(day.items.flatMap(({departure})=>departure.availability||[])),today=dayKey(now)===day.key;
    return `<section class="planning-day${finished(day)?' is-past':''}${day===active?' is-active':''}" data-day="${day.key}" aria-label="${esc(weekdayLong(first))} ${esc(dayMonthLong(first))}"><div class="planning-day-head"><span class="planning-day-name"><strong>${esc(weekdayLong(first))}</strong><span>${esc(dayMonthLong(first))}</span></span>${today?'<span class="planning-today">Aujourd’hui</span>':`<small>${finished(day)?'Terminé':`${day.items.length} départ${day.items.length>1?'s':''} · ${pilots} pilote${pilots>1?'s':''}`}</small>`}</div>${day.items.map(({departure,index})=>startCard(event,departure,body(departure,index),{minutes,now,open:departure.id===openId,quick:quick(departure)})).join('')}</section>`;}).join('');
  const total=days.reduce((sum,day)=>sum+day.items.length,0),span=planningSpan(days.length);
  // More than three days: three on screen by default, or five or seven at once (remembered on this browser).
  const spans=days.length>3?[...new Set([...SPANS.filter(count=>count<days.length),days.length])]:[];
  const spanChoice=spans.length?`<span class="planning-span" role="group" aria-label="Jours affichés">${spans.map(count=>`<button type="button" data-action="planning-span" data-span="${count}" aria-pressed="${count===span}">${count} jours</button>`).join('')}</span>`:'';
  const offset=state.planningWindow?.event===event.id?state.planningWindow.offset:days.indexOf(active);
  return `<section class="departure-planning" style="--days:${days.length}" data-span="${span}" data-offset="${offset}" data-event="${event.id}" aria-label="Départs de la course"><div class="planning-heading"><h2>Départs</h2><small>${total} départ${total>1?'s':''}${days.length>1?` sur ${days.length} jours`:''}</small>${spanChoice}${actions?`<span class="planning-race-actions">${actions}</span>`:''}<span class="planning-arrows"><button type="button" data-action="planning-scroll" data-step="-1" aria-label="Jour précédent">‹</button><button type="button" data-action="planning-scroll" data-step="1" aria-label="Jour suivant">›</button></span></div><div class="planning-tabs" role="group" aria-label="Jour de course">${tabs}</div><div class="planning-scroll"><div class="planning-days">${columns}</div></div></section>`;
}

const SPANS=[3,5,7],GAP=16;
function planningSpan(count){
  if(count<=3)return count;
  let chosen=state.planningSpan;
  if(!chosen)try{chosen=Number(globalThis.localStorage?.getItem('em_planning_span'))||3;}catch{chosen=3;}
  return Math.min(chosen,count);
}

// The days on screen: as many as chosen, fewer when the window is too narrow for them (a day stays readable,
// an opened one keeps room for its buttons and crews), always including the opened start.
const DAY_MIN=210,OPEN_MIN=440;
function planningWindow(planning){
  const days=[...planning.querySelectorAll('.planning-day')],width=planning.querySelector('.planning-scroll').clientWidth;
  const open=days.findIndex(day=>day.querySelector('.planning-start[open]'));
  let span=Math.min(Number(planning.dataset.span)||days.length,days.length);
  while(span>1&&(open>=0?OPEN_MIN+(span-1)*DAY_MIN:span*DAY_MIN)+(span-1)*GAP>width)span--;
  let offset=Math.max(0,Math.min(Number(planning.dataset.offset)||0,days.length-span));
  if(open>=0&&(open<offset||open>=offset+span))offset=Math.min(open,days.length-span);
  return {days,span,offset,open};
}
// Shows the days of the window, their widths (the opened day wider, a finished one narrower) and the arrows.
export function syncPlanning(root=globalThis.document){
  for(const planning of root?.querySelectorAll?.('.departure-planning')||[]){
    const {days,span,offset}=planningWindow(planning);
    planning.dataset.offset=offset;
    state.planningWindow={event:planning.dataset.event,offset};
    const shown=days.filter((day,index)=>{const inside=index>=offset&&index<offset+span;day.classList.toggle('is-out',!inside);return inside;});
    planning.querySelector('.planning-days').style.setProperty('--cols',shown.map(day=>day.querySelector('.planning-start[open]')?`minmax(${OPEN_MIN}px,1.8fr)`:day.classList.contains('is-past')?'minmax(170px,.75fr)':`minmax(${DAY_MIN}px,1fr)`).join(' '));
    planning.classList.toggle('has-more',span<days.length);
    const [previous,next]=planning.querySelectorAll('[data-action="planning-scroll"]');
    if(previous)previous.disabled=offset<=0;
    if(next)next.disabled=offset+span>=days.length;
  }
}
export function setPlanningSpan(button){
  const planning=button.closest('.departure-planning');
  state.planningSpan=Number(button.dataset.span);
  try{globalThis.localStorage?.setItem('em_planning_span',button.dataset.span);}catch{}
  planning.dataset.span=button.dataset.span;
  for(const item of planning.querySelectorAll('[data-action="planning-span"]'))item.setAttribute('aria-pressed',String(item===button));
  syncPlanning();
}

// Phone: shows one day (the tab pressed).
export function showPlanningDay(button){
  const planning=button.closest('.departure-planning');
  state.planningDay=button.dataset.day;
  for(const item of planning.querySelectorAll('[data-day]'))item.classList.toggle('is-active',item.dataset.day===button.dataset.day);
  for(const tab of planning.querySelectorAll('.planning-tab'))tab.setAttribute('aria-pressed',String(tab.dataset.day===button.dataset.day));
}
// Arrows: the window moves by one day.
export function scrollPlanning(button){
  const planning=button.closest('.departure-planning');
  planning.dataset.offset=Math.max(0,(Number(planning.dataset.offset)||0)+Number(button.dataset.step));
  syncPlanning();
}
// "Ton départ" of the race header: opens that start (its day on a phone) and brings it on screen.
export function goToDeparture(departureId){
  const start=document.getElementById(`departure-${departureId}`);
  if(!start)return;
  const tab=start.closest('.departure-planning')?.querySelector(`.planning-tab[data-day="${start.closest('.planning-day')?.dataset.day}"]`);
  if(tab)showPlanningDay(tab);
  start.open=true;
  syncPlanning();
  start.scrollIntoView({behavior:'smooth',block:'center'});
}

// « Inscription » menu of a start: opens under its square; a click elsewhere or Escape closes it.
export function toggleQuickMenu(button){
  const menu=button.parentElement.querySelector('.planning-quick-menu'),opening=menu.hidden;
  closeQuickMenus();
  menu.hidden=!opening;
  button.setAttribute('aria-expanded',String(opening));
  if(opening)menu.querySelector('button')?.focus({preventScroll:true});
}
function closeQuickMenus(){
  for(const menu of globalThis.document?.querySelectorAll?.('.planning-quick-menu:not([hidden])')||[]){menu.hidden=true;menu.parentElement.querySelector('[aria-expanded]')?.setAttribute('aria-expanded','false');}
}
// A quick action in a start's title line never opens or closes the start itself.
globalThis.document?.addEventListener('click',event=>{
  if(event.target?.closest?.('.planning-quick'))event.preventDefault();
  if(!event.target?.closest?.('.planning-quick-menu-wrap'))closeQuickMenus();
},true);
globalThis.document?.addEventListener('keydown',event=>{if(event.key==='Escape')closeQuickMenus();});

// One start open at a time in a planning; the widths follow.
globalThis.document?.addEventListener('toggle',event=>{
  const start=event.target;
  if(!start?.classList?.contains('planning-start'))return;
  if(start.open)for(const other of start.closest('.departure-planning')?.querySelectorAll('.planning-start[open]')||[])if(other!==start)other.open=false;
  if(start.open)state.selectedDepartureId=start.id.replace('departure-','');
  else if(state.selectedDepartureId===start.id.replace('departure-',''))state.selectedDepartureId=null;
  syncPlanning();
},true);
globalThis.addEventListener?.('resize',()=>syncPlanning());
// The line of the pilots without a crew opens the start with that list unfolded, under the crews.
globalThis.document?.addEventListener('click',event=>{
  const line=event.target?.closest?.('[data-free-pilots]');
  const start=line?.closest('.planning-start');
  if(!start)return;
  event.preventDefault();
  start.open=true;
  const pilots=start.querySelector('.ux-course-pilots-accordion');
  if(pilots){pilots.open=true;requestAnimationFrame(()=>pilots.scrollIntoView({behavior:'smooth',block:'nearest'}));}
},true);

