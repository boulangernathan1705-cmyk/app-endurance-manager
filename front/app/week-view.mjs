// « Semaine » (audit R26): the week at a glance, Monday to Sunday (Paris), every start of the community: its events
// (every simulator, Gridfest, streams) and the endurances of LMU and iRacing together. A view only: a click opens the
// race's own page (the other simulator's races in its own space), nothing is entered here. On a phone the days follow
// each other in a list.
import {app,state,esc,button,notifyRender,activeGame,api} from './core.mjs';
import {gameForEvent} from '../../shared/catalog.mjs';
import {isSolo} from './solo.mjs';
import {isStream} from '../../shared/stream.mjs';
import {isGrindfest} from '../../shared/grindfest.mjs';
import {simForEvent,SIMS} from '../../shared/catalog.mjs';
import {parisDay,weekStart,weekDays} from '../week-days.mjs';

const DAY=86400000;
const dateOf=day=>new Date(day*DAY);
const OTHER={lmu:'iracing',iracing:'lmu'};
// The endurances of the other simulator (the page only loads those of its own): read once a minute at most.
let other={game:'',events:[],at:0,loading:null};
function otherEndurances(){
  const game=OTHER[activeGame];
  if(other.game===game&&Date.now()-other.at<60000)return other.events;
  other.loading??=api(`/api/races?game=${game}&scope=upcoming`).then(result=>{
    other={game,events:(Array.isArray(result.events)?result.events:[]).filter(event=>event.format!=='solo'&&gameForEvent(event)===game).map(event=>({...event,otherGame:game})),at:Date.now(),loading:null};
    if(state.page==='week')renderWeek();
  }).catch(()=>{other.loading=null;other.at=Date.now();other.game=game;});
  return other.game===game?other.events:[];
}
const dayName=new Intl.DateTimeFormat('fr-FR',{timeZone:'UTC',weekday:'long'});
const dayShort=new Intl.DateTimeFormat('fr-FR',{timeZone:'UTC',weekday:'short',day:'numeric'});
const monthDayRaw=new Intl.DateTimeFormat('fr-FR',{timeZone:'UTC',day:'numeric',month:'long'});
// « 1er novembre », as written in French.
const monthDay={format:date=>monthDayRaw.format(date).replace(/^1 /,'1er ')};
const clock=new Intl.DateTimeFormat('fr-FR',{timeZone:'Europe/Paris',hour:'2-digit',minute:'2-digit'});
const endDay=new Intl.DateTimeFormat('fr-FR',{timeZone:'Europe/Paris',weekday:'short'});

const hour=timestamp=>clock.format(timestamp).replace(':','h').replace(/h00$/,'h').replace(/^0(?=\d)/,'');

// What kind of race a start is: the colour of its block and the filter it answers to.
function kindOf(event){
  if(isStream(event))return {key:'stream',label:'Stream'};
  if(isGrindfest(event))return {key:'gridfest',label:'Gridfest'};
  if(isSolo(event))return {key:'event',label:event.details?.type||state.soloLabel||'Event'};
  return {key:'endurance',label:'Endurance'};
}
// Every start of the week, by day, each with the kind of its race.
const weekStarts=(events,monday)=>weekDays(events,monday).map(day=>({...day,items:day.items.map(item=>({...item,kind:kindOf(item.event),pending:item.departure.hideClock===true}))}));

function block(item,now){
  const {event,departure,startsAt,endsAt,kind,mine,pilots,pending}=item;
  const past=(endsAt||startsAt)<now;
  // A race over several days says when it ends (« → dim. 16h »).
  const ends=endsAt&&parisDay(endsAt)!==parisDay(startsAt)?` → ${endDay.format(endsAt).replace('.','')} ${hour(endsAt)}`:'';
  const sim=isSolo(event)&&!isStream(event)?SIMS.find(item=>item.id===simForEvent(event))?.short||'':'';
  const places=isSolo(event)&&!isStream(event)&&Number(event.capacity)>0?`${pilots}/${event.capacity}`:pilots?`${pilots} pilote${pilots>1?'s':''}`:'';
  const label=`${pending?'Horaire à définir':hour(startsAt)} · ${event.name}${mine?' · tu es inscrit':''}`;
  const sim2=isSolo(event)?'':` is-${event.otherGame||activeGame}`;
  const open=event.otherGame?`<a class="week-block is-${kind.key}${sim2}${mine?' is-mine':''}${past?' is-past':''}" href="/${event.otherGame}/#event=${event.id}" aria-label="${esc(label)}">`
    :`<button type="button" class="week-block is-${kind.key}${sim2}${mine?' is-mine':''}${past?' is-past':''}" data-action="open" data-id="${event.id}" aria-label="${esc(label)}">`;
  return `${open}
    <span class="week-block-time">${pending?'à définir':esc(hour(startsAt))}${ends?`<small>${esc(ends)}</small>`:''}</span>
    <span class="week-block-name">${mine?'<span class="week-mine" aria-hidden="true">✓</span>':''}${esc(event.name)}</span>
    <span class="week-block-meta"><span class="week-kind">${esc(kind.label)}</span>${sim?`<span>${esc(sim)}</span>`:''}${!isSolo(event)?`<span>${(event.otherGame||activeGame)==='iracing'?'iRacing':'LMU'}</span>`:''}${places?`<span>${esc(places)}</span>`:''}${(event.departures||[]).length>1&&!isSolo(event)?`<span>départ ${(event.departures||[]).indexOf(departure)+1}</span>`:''}</span>
  ${event.otherGame?'</a>':'</button>'}`;
}

const FILTERS=[['all','Tout'],['endurance','Endurance'],['event','Events'],['mine','Mes courses']];
const keep=(item,filter)=>filter==='all'||(filter==='mine'?item.mine:filter==='event'?item.kind.key!=='endurance':item.kind.key==='endurance');

export function renderWeek(){
  if(state.access!=='member'){state.page='home';return;}
  state.page='week';state.currentEventId=null;
  const offset=Number(state.weekOffset)||0,filter=state.weekFilter||'all',now=Date.now();
  const monday=weekStart(now,offset),today=parisDay(now);
  const days=weekStarts([...state.events,...otherEndurances()],monday).map(day=>({...day,items:day.items.filter(item=>keep(item,filter))}));
  const count=days.reduce((total,day)=>total+day.items.length,0);
  const title=`Semaine du ${monthDay.format(dateOf(monday))} au ${monthDay.format(dateOf(monday+6))}`;
  const filters=FILTERS.filter(([key])=>key!=='event'||state.soloRaces).filter(([key])=>key!=='endurance'||state.soloRaces)
    .map(([key,label])=>button('week-filter',label,`data-filter="${key}" aria-pressed="${filter===key}"`,'event-filter-button')).join('');
  const columns=days.map(day=>`<section class="week-day${day.day===today?' is-today':''}${day.day<today?' is-past':''}" aria-labelledby="week-day-${day.day}">
      <h3 class="week-day-head" id="week-day-${day.day}"><span class="week-day-name">${esc(dayName.format(dateOf(day.day)))}</span><span class="week-day-short" aria-hidden="true">${esc(dayShort.format(dateOf(day.day)))}</span><small>${esc(monthDay.format(dateOf(day.day)))}</small></h3>
      <div class="week-day-list">${day.items.map(item=>block(item,now)).join('')||'<p class="week-empty">—</p>'}</div>
    </section>`).join('');
  app.innerHTML=`<div class="page-head week-head"><h1 class="page-title">SEMAINE</h1>
      <div class="week-nav" role="group" aria-label="Changer de semaine">${button('week','‹ Précédente','data-offset="-1" aria-label="Semaine précédente"','secondary-button')}${offset?button('week','Cette semaine','data-offset="0"','secondary-button'):''}${button('week','Suivante ›','data-offset="1" aria-label="Semaine suivante"','secondary-button')}</div>
      ${filters?`<div class="event-filter" role="group" aria-label="Filtrer la semaine">${filters}</div>`:''}</div>
    <h2 class="week-title">${esc(title)} <small>${count} départ${count>1?'s':''}</small></h2>
    <div class="week-grid">${columns}</div>`;
  notifyRender();
}
