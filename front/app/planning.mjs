// Race over several days (special events: Friday to Sunday, sometimes a whole week): the starts as a planning,
// one column per race day; on a phone, one day at a time with a tab per day. A start opens where it is; up to
// three days, its day widens so its crews sit side by side, and a finished day narrows.
import {timeLabel,timeAt,weekdayLabel,weekdayLong,dayMonthLong,dayMonthShort,dateRangeBlock} from '../dates.mjs';
import {eventMinutes} from '../../shared/duration.mjs';
import {raceDays,parisDayKey as dayKey} from '../../shared/start-times.mjs';
import {state,esc,categories,logo,sortedCrews,crewColorClass,pilotCount} from './core.mjs';

const CHEVRON='<svg class="planning-chevron" viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" d="m6 9 6 6 6-6"/></svg>';

// The race days with their starts, or [] when the race is not over several days (a start to define, a solo
// race or a single day keep the list of starts).
export function planningDays(event){return event.format==='solo'?[]:raceDays(event.departures||[]);}

// Date block of a race: the span of its days when it runs over several days.
export function raceRangeBlock(event){
  const days=planningDays(event);
  if(!days.length)return '';
  return dateRangeBlock(days[0].items[0].departure.startsAt,days.at(-1).items[0].departure.startsAt);
}

function startCard(event,departure,body,{minutes,now,open}){
  const start=Number(departure.startsAt),end=start+minutes*60000,done=end<=now,live=start<=now&&!done;
  const crews=sortedCrews(event,departure),assigned=new Set(crews.flatMap(crew=>crew.registrationIds||[]));
  const present=(departure.availability||[]).filter(reg=>reg.status!=='unavailable');
  const pilots=pilotCount(departure.availability||[]),mine=present.some(reg=>reg.mine);
  const compact=!open&&(done||!pilots);
  const endDay=dayKey(end)!==dayKey(start)?` le ${weekdayLabel(end)}`:'';
  const tags=compact?'':`${mine?'<span class="planning-tag is-mine">Ton départ</span>':''}${live?'<span class="planning-tag is-live">En cours</span>':''}`;
  const head=`<span class="planning-start-head"><strong>Départ ${esc(timeLabel(departure.time))}</strong>${compact?(done?'<span class="planning-start-state">Terminé</span>':''):`<span class="planning-start-end">fin ${esc(timeAt(end))}${esc(endDay)}</span>`}${tags}</span>`;
  // Pilots without a crew, by category ("sans équipage 2 GT3 1 Hypercar"): where a pilot can find a crew.
  const free=event.categories.map(category=>[category,present.filter(reg=>!assigned.has(reg.id)&&reg.category===category).length]).filter(([,count])=>count);
  const freeLine=free.length?`<span class="planning-free"><span>· sans équipage</span>${free.map(([category,count])=>`<span class="planning-free-pill ${categories[category]?.css||''}">${count} ${esc(category)}</span>`).join('')}</span>`:'';
  const crewLine=crews.length?`<span class="planning-crews">${crews.map((crew,index)=>`<span class="planning-crew ${crewColorClass(crew.id,index)}">${logo(crew.category)}<span>${esc(crew.name)}</span></span>`).join('')}</span>`:'';
  const details=compact?'':`<span class="planning-start-line"><span>${pilots} pilote${pilots>1?'s':''}</span>${freeLine}</span>${crewLine}`;
  return `<details class="planning-start${compact?' is-compact':''}${done?' is-done':''}${mine?' is-mine':''}${!pilots?' is-empty':''}" id="departure-${departure.id}" ${open?'open':''}><summary>${head}${details}${CHEVRON}</summary><div class="departure-fold planning-body">${body}</div></details>`;
}

// `body(departure, index)`: what an opened start shows (buttons, registration, crews and pilots), as in the list.
export function renderPlanning(event,days,body){
  const minutes=eventMinutes(event),now=Date.now();
  const finished=day=>day.items.every(({departure})=>Number(departure.startsAt)+minutes*60000<=now);
  const openId=state.selectedDepartureId||[...state.registrationOpen].find(id=>days.some(day=>day.items.some(item=>item.departure.id===id)));
  const active=days.find(day=>day.key===state.planningDay)||days.find(day=>day.items.some(item=>item.departure.id===openId))||days.find(day=>!finished(day))||days[0];
  const tabs=days.map(day=>{const first=day.items[0].departure.startsAt,mine=day.items.some(({departure})=>(departure.availability||[]).some(reg=>reg.mine&&reg.status!=='unavailable'));
    return `<button type="button" class="planning-tab${day===active?' is-active':''}" data-action="planning-day" data-day="${day.key}" aria-pressed="${day===active}"><small>${esc(weekdayLabel(first))}</small><strong>${esc(dayMonthShort(first))}</strong><small>${finished(day)?'terminé':`${day.items.length} départ${day.items.length>1?'s':''}`}</small>${mine?'<i class="planning-tab-mine" aria-label="ton départ"></i>':''}</button>`;}).join('');
  const columns=days.map(day=>{const first=day.items[0].departure.startsAt,pilots=day.items.reduce((sum,{departure})=>sum+pilotCount(departure.availability||[]),0),today=dayKey(now)===day.key;
    return `<section class="planning-day${finished(day)?' is-past':''}${day===active?' is-active':''}" data-day="${day.key}" aria-label="${esc(weekdayLong(first))} ${esc(dayMonthLong(first))}"><div class="planning-day-head"><span class="planning-day-name"><strong>${esc(weekdayLong(first))}</strong><span>${esc(dayMonthLong(first))}</span></span>${today?'<span class="planning-today">Aujourd’hui</span>':`<small>${finished(day)?'Terminé':`${day.items.length} départ${day.items.length>1?'s':''} · ${pilots} pilote${pilots>1?'s':''}`}</small>`}</div>${day.items.map(({departure,index})=>startCard(event,departure,body(departure,index),{minutes,now,open:departure.id===openId})).join('')}</section>`;}).join('');
  const total=days.reduce((sum,day)=>sum+day.items.length,0),span=planningSpan(days.length);
  // More than three days: three on screen by default, or five or seven at once (remembered on this browser).
  const spans=days.length>3?[...new Set([...SPANS.filter(count=>count<days.length),days.length])]:[];
  const spanChoice=spans.length?`<span class="planning-span" role="group" aria-label="Jours affichés">${spans.map(count=>`<button type="button" data-action="planning-span" data-span="${count}" aria-pressed="${count===span}">${count} jours</button>`).join('')}</span>`:'';
  return `<section class="departure-planning${span>=days.length?' is-fit':''}" style="--days:${days.length}" data-span="${span}" data-event="${event.id}" aria-label="Départs de la course"><div class="planning-heading"><h2>Départs</h2><small>${total} départs sur ${days.length} jours</small>${spanChoice}<span class="planning-arrows"><button type="button" data-action="planning-scroll" data-step="-1" aria-label="Jours précédents">‹</button><button type="button" data-action="planning-scroll" data-step="1" aria-label="Jours suivants">›</button></span></div><div class="planning-tabs" role="group" aria-label="Jour de course">${tabs}</div><div class="planning-scroll"><div class="planning-days">${columns}</div></div></section>`;
}

const SPANS=[3,5,7],GAP=16;
function planningSpan(count){
  if(count<=3)return count;
  let chosen=state.planningSpan;
  if(!chosen)try{chosen=Number(globalThis.localStorage?.getItem('em_planning_span'))||3;}catch{chosen=3;}
  return Math.min(chosen,count);
}

// Widths of the days and the arrows when every day is not on screen. All the days on screen: the one of the
// opened start wider (its crews side by side), a finished one narrower. Fewer days on screen (3 of 7): days of
// equal width, the opened one wider.
export function syncPlanning(root=globalThis.document){
  for(const planning of root?.querySelectorAll?.('.departure-planning')||[]){
    const days=[...planning.querySelectorAll('.planning-day')],scroll=planning.querySelector('.planning-scroll');
    const span=Math.min(Number(planning.dataset.span)||days.length,days.length),fit=span>=days.length;
    const unit=Math.max(210,(scroll.clientWidth-(span-1)*GAP)/span);
    const columns=days.map(day=>{
      const open=day.querySelector('.planning-start[open]');
      if(fit)return open?'minmax(440px,1.8fr)':day.classList.contains('is-past')?'minmax(170px,.75fr)':'minmax(210px,1fr)';
      return `${Math.round(open?Math.max(440,unit*1.6):unit)}px`;
    });
    planning.classList.toggle('is-fit',fit);
    planning.querySelector('.planning-days').style.setProperty('--cols',columns.join(' '));
    planning.classList.toggle('has-overflow',scroll.scrollWidth>scroll.clientWidth+2);
  }
}
// After drawing: the planning scrolled as the pilot left it, otherwise on the day to come.
export function placePlanning(root=globalThis.document){
  const planning=root?.querySelector?.('.departure-planning');
  if(!planning)return;
  const scroll=planning.querySelector('.planning-scroll');
  if(state.planningScroll?.event===planning.dataset.event){scroll.scrollLeft=state.planningScroll.left;return;}
  const active=planning.querySelector('.planning-day.is-active');
  if(active)scroll.scrollLeft+=active.getBoundingClientRect().left-scroll.getBoundingClientRect().left;
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
export function scrollPlanning(button){
  const scroll=button.closest('.departure-planning').querySelector('.planning-scroll'),day=scroll.querySelector('.planning-day');
  scroll.scrollBy({left:Number(button.dataset.step)*(day.offsetWidth+GAP),behavior:'smooth'});
}
// "Ton départ" of the race header: opens that start (its day on a phone) and brings it on screen.
export function goToDeparture(departureId){
  const start=document.getElementById(`departure-${departureId}`);
  if(!start)return;
  const tab=start.closest('.departure-planning')?.querySelector(`.planning-tab[data-day="${start.closest('.planning-day')?.dataset.day}"]`);
  if(tab)showPlanningDay(tab);
  start.open=true;
  start.scrollIntoView({behavior:'smooth',block:'center',inline:'center'});
}

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
globalThis.document?.addEventListener('scroll',event=>{
  const scroll=event.target;
  if(scroll?.classList?.contains('planning-scroll'))state.planningScroll={event:scroll.closest('.departure-planning')?.dataset.event,left:scroll.scrollLeft};
},true);
