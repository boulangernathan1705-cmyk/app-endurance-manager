// « Accueil » (audit R25 + R26): the pilot's next race, a card for each part of the site with what is new there, then
// the week at a glance, Monday to Sunday (Paris), every start of the community: its events (every simulator,
// Gridfest, streams) and the endurances of LMU and iRacing together. A view only: a click opens the race's own page
// (the other simulator's races in its own space), nothing is entered here. On a phone the days follow each other in
// a list.
import {app,state,esc,button,notifyRender,activeGame,api,can} from './core.mjs';
import {todoItems} from '../admin-todo.mjs';
import {gameForEvent} from '../../shared/catalog.mjs';
import {isSolo} from './solo.mjs';
import {isStream} from '../../shared/stream.mjs';
import {isGrindfest} from '../../shared/grindfest.mjs';
import {simForEvent,SIMS} from '../../shared/catalog.mjs';
import {parisDay,weekStart,weekDays} from '../week-days.mjs';
import {eventMinutes} from '../../shared/duration.mjs';

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

const FILTERS=[['all','Tout'],['lmu','Endurance LMU'],['iracing','Endurance iRacing'],['event','Events'],['mine','Mes courses']];
const simOf=event=>event.otherGame||activeGame;
const keep=(item,filter)=>filter==='all'||(filter==='mine'?item.mine:filter==='event'?item.kind.key!=='endurance':item.kind.key==='endurance'&&simOf(item.event)===filter);

const SIM_NAME={lmu:'LMU',iracing:'iRacing'};
const dateShort=new Intl.DateTimeFormat('fr-FR',{timeZone:'Europe/Paris',weekday:'short',day:'numeric',month:'short'});
const when=timestamp=>dateShort.format(timestamp).replace(/\./g,'').replace(/ 1 /,' 1er ');
const endurances=events=>events.filter(event=>!event.archived&&!isSolo(event));
const nextStart=(event,now)=>Math.min(...(event.departures||[]).map(item=>Number(item.startsAt)).filter(at=>Number.isFinite(at)&&at>now));
// The first race still to come among some, with its first start.
function firstOf(events,now){
  return events.map(event=>({event,at:nextStart(event,now)})).filter(item=>Number.isFinite(item.at)).sort((a,b)=>a.at-b.at)[0]||null;
}
const myRegs=departure=>(departure.availability||[]).filter(reg=>reg.mine&&reg.status!=='unavailable');
const crewOf=(departure,reg)=>(departure.crews||[]).find(crew=>(crew.registrationIds||[]).some(id=>String(id)===String(reg.id)));
// My starts still running or to come, the soonest first, with my crew.
function myStarts(events,now){
  const starts=[];
  for(const event of events){
    if(event.archived)continue;
    for(const departure of event.departures||[]){
      const startsAt=Number(departure.startsAt),regs=myRegs(departure);
      if(!regs.length||!Number.isFinite(startsAt))continue;
      const minutes=eventMinutes(event),endsAt=startsAt+Math.max(minutes,0)*60000;
      if(endsAt<now&&startsAt<now)continue;
      const crew=regs.map(reg=>crewOf(departure,reg)).find(Boolean)||null;
      starts.push({event,departure,startsAt,crew});
    }
  }
  return starts.sort((a,b)=>a.startsAt-b.startsAt);
}
const openRace=(event,inner,cls)=>event.otherGame?`<a class="${cls}" href="/${event.otherGame}/#event=${event.id}">${inner}</a>`:`<button type="button" class="${cls}" data-action="open" data-id="${event.id}">${inner}</button>`;

function nextLine(all,now){
  const next=myStarts(all,now)[0];
  if(!next)return `<div class="home-next is-empty"><span class="home-next-label">Ta prochaine course</span><span>Aucune inscription pour l’instant.</span>${button('home','Voir les courses','data-list="endurance"','home-next-go')}</div>`;
  const {event,startsAt,crew}=next,live=startsAt<=now;
  const sim=isSolo(event)?SIMS.find(item=>item.id===simForEvent(event))?.short||'':SIM_NAME[simOf(event)];
  return openRace(event,`<span class="home-next-label">${live?'En course':'Ta prochaine course'}</span>
    <span class="home-next-text"><b>${esc(event.name)}</b> · ${esc(when(startsAt))} à ${esc(hour(startsAt))}${sim?` · ${esc(sim)}`:''}${crew?` · équipage <b>${esc(crew.name)}</b>`:''}</span>
    <span class="home-next-go" aria-hidden="true">Voir →</span>`,'home-next');
}

function card({tone,icon,title,live,alert='',action,href,attrs=''}){
  const inner=`<span class="home-card-arrow" aria-hidden="true">→</span><span class="home-card-icon" aria-hidden="true">${icon}</span><span class="home-card-title">${esc(title)}</span><span class="home-card-live">${esc(live)}${alert?` <span class="home-card-alert">${esc(alert)}</span>`:''}</span>`;
  return href?`<a class="home-card is-${tone}" href="${href}">${inner}</a>`:`<button type="button" class="home-card is-${tone}" data-action="${action}" ${attrs}>${inner}</button>`;
}

function cards(all,now){
  const list=[];
  for(const game of ['lmu','iracing']){
    const first=firstOf(endurances(all).filter(event=>simOf(event)===game),now);
    const live=first?`Prochaine : ${first.event.name}, ${when(first.at)}`:'Aucune course prévue';
    list.push(card({tone:game,icon:'🏁',title:`Endurance ${SIM_NAME[game]}`,live,...(game===activeGame?{action:'home',attrs:'data-list="endurance"'}:{href:`/${game}/`})}));
  }
  if(state.soloRaces){
    const open=all.filter(event=>!event.archived&&isSolo(event)&&!isStream(event)&&Number.isFinite(nextStart(event,now))).length;
    list.push(card({tone:'event',icon:'🏆',title:state.soloLabel||'Events',live:open?`${open} à venir`:'Rien de prévu',action:'home',attrs:'data-list="solo"'}));
  }
  const mine=myStarts(all,now),races=new Set(mine.map(item=>item.event.id)).size;
  const alone=mine.filter(item=>!isSolo(item.event)&&!item.crew).length;
  list.push(card({tone:'mine',icon:'✅',title:'Mes inscriptions',live:races?`${races} course${races>1?'s':''}`:'Aucune',alert:alone?`${alone} sans équipage`:'',action:'my-entries'}));
  if(state.combos)list.push(card({tone:'tools',icon:'🛠️',title:'Outils',live:'Fiches combo, mur des stands',href:'/fiches-combo.html'}));
  return list.join('');
}

// « À traiter » of the administration, counted here for its card.
function adminCard(all,now){
  if(!can('admin'))return '';
  const count=['lmu','iracing'].reduce((total,game)=>total+todoItems(endurances(all).filter(event=>simOf(event)===game),game,now).length,0);
  return `<h2 class="home-section">Organisation</h2><div class="home-cards is-small">${card({tone:'admin',icon:'⚙️',title:'Administration',live:count?`${count} point${count>1?'s':''} à traiter`:'Rien à traiter',href:'/members.html'})}</div>`;
}

export function renderWeek(){
  if(state.access!=='member'){state.page='home';return;}
  state.page='week';state.currentEventId=null;
  const offset=Number(state.weekOffset)||0,filter=state.weekFilter||'all',now=Date.now();
  const all=[...state.events,...otherEndurances()];
  const monday=weekStart(now,offset),today=parisDay(now);
  const days=weekStarts(all,monday).map(day=>({...day,items:day.items.filter(item=>keep(item,filter))}));
  const count=days.reduce((total,day)=>total+day.items.length,0);
  const title=`Du ${monthDay.format(dateOf(monday))} au ${monthDay.format(dateOf(monday+6))}`;
  const filters=FILTERS.filter(([key])=>key!=='event'||state.soloRaces)
    .map(([key,label])=>button('week-filter',label,`data-filter="${key}" aria-pressed="${filter===key}"`,'event-filter-button')).join('');
  const columns=days.map(day=>`<section class="week-day${day.day===today?' is-today':''}${day.day<today?' is-past':''}" aria-labelledby="week-day-${day.day}">
      <h3 class="week-day-head" id="week-day-${day.day}"><span class="week-day-name">${esc(dayName.format(dateOf(day.day)))}</span><span class="week-day-short" aria-hidden="true">${esc(dayShort.format(dateOf(day.day)))}</span><small>${esc(monthDay.format(dateOf(day.day)))}</small></h3>
      <div class="week-day-list">${day.items.map(item=>block(item,now)).join('')||'<p class="week-empty">—</p>'}</div>
    </section>`).join('');
  const name=String(state.user?.name||'').trim().split(/\s+/)[0];
  app.innerHTML=`<div class="page-head home-head"><h1 class="page-title">${name?`SALUT ${esc(name.toLocaleUpperCase('fr-FR'))}`:'ACCUEIL'}</h1></div>
    ${nextLine(all,now)}
    <div class="home-cards">${cards(all,now)}</div>
    <div class="week-head"><h2 class="week-title">${offset===0?'Cette semaine':offset===1?'La semaine prochaine':offset===-1?'La semaine dernière':'Semaine'} <small>${esc(title)} · ${count} départ${count>1?'s':''}</small></h2>
      <div class="week-nav" role="group" aria-label="Changer de semaine">${button('week','‹ Précédente','data-offset="-1" aria-label="Semaine précédente"','secondary-button')}${offset?button('week','Cette semaine','data-offset="0"','secondary-button'):''}${button('week','Suivante ›','data-offset="1" aria-label="Semaine suivante"','secondary-button')}</div></div>
    <div class="event-filter week-filters" role="group" aria-label="Filtrer la semaine">${filters}</div>
    <div class="week-grid">${columns}</div>
    ${adminCard(all,now)}`;
  notifyRender();
}
