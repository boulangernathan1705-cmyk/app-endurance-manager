// « Inscription par catégorie » (community module): on a race with several starts, the pilot enters once, for the
// race: his categories, then the starts he can do. Each start gets his usual entry (whole race, hours changeable
// there); the TM makes the crews on the start he picks.
import {weekdayLong,dayMonthShort,timeLabel} from '../dates.mjs';
import {state,esc,button,logo,categories,api,can} from './core.mjs';

const future=event=>(event.departures||[]).filter(departure=>!departure.tbd&&Number(departure.startsAt)>Date.now());
export function categoryEntryOn(event){return state.categoryEntry===true&&event?.format!=='solo'&&future(event).length>1;}
// The pilot's own entries on the race's starts still to come.
function mine(event){return future(event).flatMap(departure=>(departure.availability||[]).filter(reg=>reg.mine&&reg.status!=='unavailable').map(reg=>({departure,reg})));}
const placed=(event,reg)=>(event.departures||[]).some(departure=>(departure.crews||[]).some(crew=>(crew.registrationIds||[]).includes(reg.id)));

// Above the starts: where the pilot stands, and the one button to enter or change.
export function categoryEntryBar(event){
  if(!categoryEntryOn(event)||!state.user||!can('endurance'))return '';
  const own=mine(event),cats=[...new Set(own.map(item=>item.reg.category))],starts=new Set(own.map(item=>item.departure.id)).size;
  const crew=(event.departures||[]).flatMap(departure=>departure.crews||[]).find(crew=>own.some(item=>(crew.registrationIds||[]).includes(item.reg.id)));
  const status=crew?`<span class="category-entry-mine">${logo(crew.category)}<strong>${esc(crew.name)}</strong><em>Ton équipage</em></span>`:!own.length?'<span>Choisis tes catégories et tes départs. Le TM forme ensuite les équipages.</span>'
    :`<span class="category-entry-mine">${cats.map(category=>`${logo(category)}<strong>${esc(category)}</strong>`).join('')}<em>${starts} départ${starts>1?'s':''} possible${starts>1?'s':''}</em>${crew?'':'<em class="is-waiting">En attente d’équipage</em>'}</span>`;
  return `<section class="category-entry-bar${own.length?' is-entered':''}"><div>${status}</div>${crew?'':button('category-entry-open',own.length?'Modifier':'M’inscrire','','primary-button')}</section>`;
}

let draft=null;
export function openCategoryEntry(event){
  const own=mine(event);
  draft={eventId:event.id,step:1,categories:[...new Set(own.map(item=>item.reg.category))],starts:[...new Set(own.map(item=>item.departure.id))]};
  renderCategoryEntry(event);
}
export function closeCategoryEntry(){draft=null;document.querySelector('[data-category-entry]')?.remove();}
function days(event){
  const list=new Map();
  for(const departure of future(event)){const key=new Date(departure.startsAt).toDateString();if(!list.has(key))list.set(key,{at:departure.startsAt,items:[]});list.get(key).items.push(departure);}
  return [...list.values()];
}
export function renderCategoryEntry(event){
  document.querySelector('[data-category-entry]')?.remove();
  if(!draft)return;
  const step=draft.step,steps=['Catégories','Départs','Récapitulatif'];
  const pane=(n,content)=>`<section class="registration-step" ${n===step?'':'hidden'}>${content}</section>`;
  const cats=event.categories.map(category=>button('category-entry-category',`${logo(category)}<span class="registration-category-copy"><strong>${esc(category)}</strong></span>`,`data-value="${esc(category)}" aria-pressed="${draft.categories.includes(category)}"`,`category-button ${categories[category]?.css||''} ${draft.categories.includes(category)?'active':''}`)).join('');
  const startList=days(event).map(day=>`<div class="category-entry-day"><span>${esc(weekdayLong(day.at))} ${esc(dayMonthShort(day.at))}</span><div>${day.items.map(departure=>button('category-entry-start',esc(timeLabel(departure.time)),`data-value="${departure.id}" aria-pressed="${draft.starts.includes(departure.id)}"`,`race-filter-chip${draft.starts.includes(departure.id)?' active':''}`)).join('')}</div></div>`).join('');
  const chosen=future(event).filter(departure=>draft.starts.includes(departure.id));
  const row=(n,label,value)=>`<button type="button" class="registration-summary-row" data-action="category-entry-step" data-step="${n}"><span>${label}</span><strong>${value}</strong><em>Modifier</em></button>`;
  const summary=`<div class="registration-summary"><div class="registration-summary-row is-static"><span>Pilote</span><strong>${esc(state.user?.name||'')}</strong></div>${row(1,'Catégories',draft.categories.length?draft.categories.map(esc).join(' · '):'—')}${row(2,'Départs',chosen.length?chosen.map(departure=>`${esc(weekdayLong(departure.startsAt).slice(0,3))}. ${esc(timeLabel(departure.time))}`).join(' · '):'—')}</div><p class="registration-step-help">Tu es inscrit sur toute la course de chaque départ. Tu pourras préciser tes heures sur chacun.</p>`;
  const ready=step===1?draft.categories.length>0:step===2?draft.starts.length>0:true;
  const next=step<3?button('category-entry-step','Continuer',`data-step="${step+1}" ${ready?'':'disabled'}`,'primary-button registration-next'):'<button type="button" class="save-button registration-next" data-action="category-entry-save">VALIDER MON INSCRIPTION</button>';
  const overlay=document.createElement('div');
  overlay.className='crew-builder-overlay';overlay.dataset.categoryEntry='true';
  overlay.innerHTML=`<section class="crew-builder-panel registration-sheet" role="dialog" aria-modal="true" aria-labelledby="category-entry-title">
    <div class="registration-workspace-head"><div class="registration-workspace-title"><h2 id="category-entry-title">Ton inscription</h2><p>${esc(event.name)}</p></div><span class="registration-workspace-actions">${button('category-entry-close','Fermer','','secondary-button registration-close-button')}</span></div>
    <div class="registration-stepper"><div class="registration-progress" aria-hidden="true">${steps.map((_,index)=>`<span class="${index<step?'done':''}"></span>`).join('')}</div>
      <p class="registration-step-label">Étape ${step} sur 3 · ${steps[step-1]}</p>
      ${pane(1,`<div class="category-area"><span class="form-label">Dans quelles catégories veux-tu rouler ?</span><div class="categories registration-category-list">${cats}</div><p class="registration-step-help">Une ou plusieurs.</p></div>`)}
      ${pane(2,`<span class="form-label">Quels départs peux-tu faire ?</span><div class="category-entry-days">${startList}</div>`)}
      ${pane(3,summary)}
      <p class="creation-error" data-category-entry-error hidden></p>
      <div class="registration-step-nav">${step>1?button('category-entry-step','Retour',`data-step="${step-1}"`,'secondary-button registration-back'):''}${next}</div>
    </div></section>`;
  document.getElementById('app')?.appendChild(overlay);
}
export function categoryEntryAction(event,action,target){
  if(!draft)return false;
  if(action==='category-entry-close'){closeCategoryEntry();return true;}
  if(action==='category-entry-step'){draft.step=Number(target.dataset.step)||1;renderCategoryEntry(event);return true;}
  const toggle=(list,value)=>list.includes(value)?list.filter(item=>item!==value):[...list,value];
  if(action==='category-entry-category'){draft.categories=toggle(draft.categories,target.dataset.value);renderCategoryEntry(event);return true;}
  if(action==='category-entry-start'){draft.starts=toggle(draft.starts,target.dataset.value);renderCategoryEntry(event);return true;}
  return false;
}
// The entries follow the choice: added where missing (whole race), withdrawn where no longer wanted.
export async function saveCategoryEntry(event){
  const own=mine(event),name=(state.user?.name||'').slice(0,32);
  for(const departure of future(event))for(const category of event.categories){
    const wanted=draft.starts.includes(departure.id)&&draft.categories.includes(category);
    const found=own.find(item=>item.departure.id===departure.id&&item.reg.category===category);
    if(wanted&&!found)await api(`/api/races/${event.id}/departures/${departure.id}/registrations`,'POST',{name,category,status:'whole',cars:[],carAny:true,forOther:false});
    if(!wanted&&found&&!placed(event,found.reg))await api(`/api/registrations/${found.reg.id}`,'DELETE',{version:found.reg.version});
  }
  closeCategoryEntry();
}
