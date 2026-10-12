// « Inscription par catégorie » (community module): on a race with several starts, the pilot first only says
// M'inscrire or Absent. Entering is one registration for the race: his categories, then "every start suits me" or
// his constraints per day; he is entered on every start they allow (whole race, or the hours he can do). The TM
// then makes the crews on a start.
import {weekdayLong,dayMonthShort,timeLabel} from '../dates.mjs';
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

// Availability is a rule, not a list: "every start suits me", or per day "all day" / "from … to …" / "not free".
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
  if(draft.mode==='all')return ()=>true;
  const rule=draft.days[dayKey(departure.startsAt)]||{kind:'all'},base=midnight(departure.startsAt);
  if(rule.kind==='none')return ()=>false;
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
// Reopening: the rule is rebuilt from the entries (every start whole = no constraint; else each day's hours).
function ruleFrom(event,own){
  const list=days(event),length=eventMinutes(event)*60000;
  const whole=future(event).every(departure=>own.some(item=>item.departure.id===departure.id&&item.reg.status==='whole'));
  if(!own.length||whole)return {mode:'all',days:Object.fromEntries(list.map(day=>[day.key,{kind:'all',from:day.from,to:day.to}]))};
  return {mode:'limits',days:Object.fromEntries(list.map(day=>{
    const spans=own.filter(item=>dayKey(item.departure.startsAt)===day.key).flatMap(({departure,reg})=>{
      const ks=reg.status==='whole'?Array.from({length:raceHours(event)},(_,i)=>i+1):String(reg.status).split(',').map(part=>Number(part.slice(1))).filter(Boolean);
      return ks.map(k=>[departure.startsAt+(k-1)*HOUR,Math.min(departure.startsAt+length,departure.startsAt+k*HOUR)]);
    });
    if(!spans.length)return [day.key,{kind:'none',from:day.from,to:day.to}];
    const base=midnight(day.at),from=Math.floor((Math.min(...spans.map(span=>span[0]))-base)/HOUR),to=Math.ceil((Math.max(...spans.map(span=>span[1]))-base)/HOUR);
    return [day.key,from<=day.from&&to>=day.to?{kind:'all',from:day.from,to:day.to}:{kind:'range',from,to:Math.min(24,to)}];
  }))};
}

let draft=null;
export function openCategoryEntry(event){
  const own=mine(event);
  draft={eventId:event.id,step:1,categories:[...new Set(own.map(item=>item.reg.category))],...ruleFrom(event,own)};
  renderCategoryEntry(event);
}
export function closeCategoryEntry(){draft=null;document.querySelector('[data-category-entry]')?.remove();}
const startName=departure=>`${weekdayLong(departure.startsAt).slice(0,3)}. ${timeLabel(departure.time)}`;
const hourOptions=(from,to,chosen)=>Array.from({length:to-from+1},(_,i)=>from+i).map(hour=>`<option value="${hour}" ${hour===chosen?'selected':''}>${hour===24?'minuit':`${hour} h`}</option>`).join('');
function startChip(event,departure){
  const status=statusFor(event,departure),n=covered(event,status),total=raceHours(event);
  return `<span class="ce-chip ${status==='whole'?'is-whole':status?'is-part':'is-off'}"><strong>${esc(timeLabel(departure.time))}</strong><em>${status==='whole'?'✓ toute la course':status?`${n} h sur ${total}`:'pas dispo'}</em></span>`;
}
function dayCard(event,day){
  const rule=draft.days[day.key];
  const kinds=[['all','Toute la journée'],['range','Une plage horaire'],['none','Pas dispo']].map(([kind,label])=>button('category-entry-kind',label,`data-day="${esc(day.key)}" data-value="${kind}" aria-pressed="${rule.kind===kind}"`,`ce-kind${rule.kind===kind?' active':''}`)).join('');
  const range=rule.kind==='range'?`<div class="ce-range"><label>De<select data-ce-range="from" data-day="${esc(day.key)}">${hourOptions(0,23,rule.from)}</select></label><label>À<select data-ce-range="to" data-day="${esc(day.key)}">${hourOptions(1,24,rule.to)}</select></label></div>`:'';
  return `<article class="ce-day ${rule.kind==='none'?'is-none':''}"><div class="ce-day-head"><h3>${esc(weekdayLong(day.at))} <span>${esc(dayMonthShort(day.at))}</span></h3><span class="ce-day-count">${day.items.length} départ${day.items.length>1?'s':''}</span></div><div class="ce-kinds" role="group">${kinds}</div>${range}<div class="ce-chips">${day.items.map(departure=>startChip(event,departure)).join('')}</div></article>`;
}
export function renderCategoryEntry(event){
  const previous=document.querySelector('[data-category-entry] .registration-sheet');
  const keep=previous&&previous.dataset.step===String(draft?.step)?previous.scrollTop:0;
  document.querySelector('[data-category-entry]')?.remove();
  if(!draft)return;
  const step=draft.step,steps=['Catégories','Disponibilités'],total=future(event).length,list=days(event);
  const pane=(n,content)=>`<section class="registration-step" ${n===step?'':'hidden'}>${content}</section>`;
  const cats=event.categories.map(category=>button('category-entry-category',`${logo(category)}<span class="registration-category-copy"><strong>${esc(category)}</strong><em>${draft.categories.includes(category)?'✓ Choisie':'Choisir'}</em></span>`,`data-value="${esc(category)}" aria-pressed="${draft.categories.includes(category)}"`,`category-button ${categories[category]?.css||''} ${draft.categories.includes(category)?'active':''}`)).join('');
  const found=matches(event),partial=found.filter(item=>item.status!=='whole').length;
  const choice=(mode,title,text)=>`<button type="button" class="ce-choice${draft.mode===mode?' active':''}" data-action="category-entry-mode" data-value="${mode}" aria-pressed="${draft.mode===mode}"><i aria-hidden="true"></i><span><strong>${title}</strong><em>${text}</em></span></button>`;
  const concerned=`<details class="ce-concerned"><summary>Voir les ${found.length} départ${found.length>1?'s':''} concerné${found.length>1?'s':''}</summary><ul>${found.map(({departure,status})=>`<li><strong>${esc(weekdayLong(departure.startsAt))} ${esc(dayMonthShort(departure.startsAt))} · ${esc(timeLabel(departure.time))}</strong><span class="${status==='whole'?'is-whole':'is-part'}">${status==='whole'?'toute la course':`${covered(event,status)} h sur ${raceHours(event)}`}</span></li>`).join('')}</ul></details>`;
  const tally=`<div class="ce-tally${found.length?'':' is-empty'}"><b>${found.length}</b><span><strong>départ${found.length>1?'s':''} possible${found.length>1?'s':''}</strong><em>${partial?`dont ${partial} en partie · `:''}${draft.categories.map(esc).join(' ou ')}</em></span></div>`;
  const ready=step===1?draft.categories.length>0:found.length>0;
  const next=step===1?button('category-entry-step','Continuer',`data-step="2" ${ready?'':'disabled'}`,'primary-button registration-next'):`<button type="button" class="primary-button registration-next" data-action="category-entry-save" ${ready?'':'disabled'}>Confirmer mon inscription</button>`;
  const overlay=document.createElement('div');
  overlay.className='crew-builder-overlay';overlay.dataset.categoryEntry='true';
  overlay.innerHTML=`<section class="crew-builder-panel registration-sheet category-entry-sheet" data-step="${step}" role="dialog" aria-modal="true" aria-labelledby="category-entry-title">
    <div class="registration-workspace-head"><div class="registration-workspace-title"><h2 id="category-entry-title">Ton inscription</h2><p>${esc(event.name)} · ${total} départs sur ${list.length} jour${list.length>1?'s':''}</p></div><span class="registration-workspace-actions">${button('category-entry-close','Fermer','','secondary-button registration-close-button')}</span></div>
    <div class="registration-stepper"><div class="ce-tabs">${steps.map((label,index)=>`<span class="${index+1===step?'active':index+1<step?'done':''}">${index+1}. ${label}</span>`).join('')}</div>
      ${pane(1,`<div class="ce-intro"><h3>Dans quelles catégories veux-tu rouler ?</h3><p>Une ou plusieurs. Ce choix vaut pour tous tes départs.</p></div><div class="categories category-entry-categories">${cats}</div>`)}
      ${pane(2,`<div class="ce-intro"><h3>As-tu des contraintes horaires ?</h3><p>Le site trouve les départs où tu peux rouler.</p></div><div class="ce-choices">${choice('all','Tous les départs me vont',`Tu es disponible sur les ${total} départs.`)}${choice('limits','J’ai des contraintes','Tu précises tes jours et tes heures.')}</div>${draft.mode==='limits'?`<div class="category-entry-days">${list.map(day=>dayCard(event,day)).join('')}</div>`:''}${found.length?concerned:''}`)}
      <div class="ce-footer">${step===2?tally:''}<div class="registration-step-nav">${step>1?button('category-entry-step','Retour','data-step="1"','secondary-button registration-back'):''}${next}</div>${step===2?'<p class="ce-footnote">Une seule inscription, quel que soit le nombre de départs.</p>':''}</div>
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
  if(action==='category-entry-mode')draft.mode=target.dataset.value;
  if(action==='category-entry-kind')draft.days[target.dataset.day].kind=target.dataset.value;
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
    const entry={name,category,status,cars:[],carAny:true,forOther:false};
    if(status&&!found)await api(`/api/races/${event.id}/departures/${departure.id}/registrations`,'POST',entry);
    else if(status&&found&&found.reg.status!==status)await api(`/api/registrations/${found.reg.id}`,'PATCH',{...entry,cars:found.reg.cars||[],carAny:found.reg.carAny!==false,version:found.reg.version});
    else if(!status&&found&&!placed(event,found.reg))await api(`/api/registrations/${found.reg.id}`,'DELETE',{version:found.reg.version});
  }
  closeCategoryEntry();
}
