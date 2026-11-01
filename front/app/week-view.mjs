// « Accueil » (audit R25 + R26): the week at a glance, the pilot's next race beside it (none if signed up nowhere), and
// for those who may create races the « event » and « stream » buttons. The week: Monday to Sunday (Paris), every start of the community: its events (every simulator,
// Gridfest, streams) and the endurances of LMU and iRacing together. A view only: a click opens the race's own page
// (the other simulator's races in its own space), nothing is entered here. On a phone the days follow each other in
// a list.
import {app,state,esc,button,notifyRender,activeGame,api,coversHour,can} from './core.mjs';
import {gameForEvent} from '../../shared/catalog.mjs';
import {isSolo,eventAccessLogo} from './solo.mjs';
import {isStream} from '../../shared/stream.mjs';
import {isGrindfest} from '../../shared/grindfest.mjs';
import {simForEvent,SIMS} from '../../shared/catalog.mjs';
import {parisDay,weekStart,weekDays} from '../week-days.mjs';
import {eventMinutes,raceFinishAt} from '../../shared/duration.mjs';
import {RACE_WEATHERS} from '../../shared/catalog.mjs';
import {crewStarts} from './crews-page.mjs';

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
const weekStarts=(events,monday)=>weekDays(events,monday).map(day=>({...day,items:day.items.map(item=>({...item,kind:kindOf(item.event),pending:item.starts.every(start=>start.departure.hideClock===true)}))}));

// The forecast in a word: « Pluie » when a slot says rain, else the race's single forecast (details).
function weatherOf(event){
  const info=event.details||{},slots=(info.weatherSlots||[]).filter(Boolean);
  if(slots.some(sky=>/Rain|Drizzle|Storm/.test(sky)))return 'Pluie';
  if(slots.length)return 'Sec';
  return RACE_WEATHERS[info.weather]||'';
}
// « 6H », « 12H », « 1H30 »: an endurance's length on its block.
// The hours a pilot drives: « toute la course » or « 15h–18h ».
function hoursOf(departure,reg,event){
  if(reg.status==='whole')return 'toute la course';
  const hours=Math.ceil(eventMinutes(event)/60),ranges=[];
  for(let index=0;index<hours;index++){if(!coversHour(reg,index))continue;const last=ranges.at(-1);if(last&&last.end===index)last.end=index+1;else ranges.push({start:index,end:index+1});}
  const at=offset=>hour(Number(departure.startsAt)+offset*3600000);
  return ranges.map(range=>`${at(range.start)}–${at(range.end)}`).join(', ');
}
const myReg=departure=>(departure.availability||[]).find(reg=>reg.mine&&reg.status!=='unavailable')||null;

// The event's logo (OPEN or SAFE of its simulator, Gridfest), as on its card.
const logoOf=event=>isGrindfest(event)?'<img class="event-access-logo" src="/images/event-access/gridfest-stacked.png" alt="Gridfest" width="308" height="320" loading="lazy" decoding="async">':eventAccessLogo(event);

function block(item,now){
  const {event,departure,startsAt,endsAt,kind,mine,pilots,pending,starts}=item;
  const past=(endsAt||startsAt)<now,solo=isSolo(event),stream=isStream(event);
  const live=starts.some(start=>start.departure.hideClock!==true&&start.startsAt<=now&&(start.endsAt||start.startsAt)>=now);
  // Several starts the same day: one card with every start time, no end time (Nathan 2026-11-01).
  const several=starts.length>1;
  const times=several?esc(starts.map(start=>start.departure.hideClock?'à définir':hour(start.startsAt)).join(' · ')):'';
  // Simulator on top, then « 15h – fin 18h10 » (« – fin dim 2h30 » over several days), then the name (Nathan chose version B, 2026-11-01).
  const late=endsAt&&parisDay(endsAt)!==parisDay(startsAt);
  const fin=several||pending||!endsAt||(solo&&!late)?'':`fin ${late?`${endDay.format(endsAt).replace('.','')} `:''}${hour(endsAt)}`;
  const sim=solo?(stream?'':SIMS.find(item=>item.id===simForEvent(event))?.short||''):SIM_NAME[event.otherGame||activeGame];
  const badge=solo?kind.label:'',logo=solo?logoOf(event):'';
  const weather=solo?'':weatherOf(event);
  const rounds=solo&&!stream&&Array.isArray(event.rounds)&&event.rounds.length>1?`${event.rounds.length} manches`:'';
  const left=solo&&!stream&&Number(event.capacity)>0?Number(event.capacity)-pilots:null;
  const reg=mine?myReg(departure):null,crew=reg&&!solo?crewOf(departure,reg):null;
  const situation=!mine?'':solo?'<span class="week-chip is-ok">✓ Inscrit</span>'
    :crew?`<span class="week-chip is-ok">✓ ${esc(crew.name)}${reg?` · ${esc(hoursOf(departure,reg,event))}`:''}</span>`:'<span class="week-chip is-alert">Sans équipage</span>';
  const places=left===null||past?'':left<=0?'<span class="week-chip is-warn">Complet</span>':`<span class="week-chip is-warn">${left} place${left>1?'s':''} restante${left>1?'s':''}</span>`;
  const label=`${pending?'Horaire à définir':several?starts.map(start=>start.departure.hideClock?'à définir':hour(start.startsAt)).join(', '):hour(startsAt)} · ${event.name}${mine?' · tu es inscrit':''}`;
  // An event takes its simulator's colour, as its card on the events page (Nathan 2026-11-01).
  const sim2=!solo?` is-${event.otherGame||activeGame}`:kind.key==='event'?` sim-${simForEvent(event)}`:'';
  const cls=`week-block is-${kind.key}${sim2}${mine?' is-mine':''}${past?' is-past':''}${live?' is-live':''}`;
  const open=event.otherGame?`<a class="${cls}" href="/${event.otherGame}/#event=${event.id}" aria-label="${esc(label)}">`
    :`<button type="button" class="${cls}" data-action="open" data-id="${event.id}" aria-label="${esc(label)}">`;
  const meta=[rounds,weather&&`${weather==='Pluie'?'🌧':'☀️'} ${weather}`,past&&'Terminé'].filter(Boolean);
  return `${open}
    ${sim||logo||badge?`<span class="week-block-head"><span class="week-block-sim">${esc(sim)}</span>${logo?`<span class="week-block-logo">${logo}</span>`:badge?`<span class="week-badge">${esc(badge)}</span>`:''}</span>`:''}
    <span class="week-block-time">${several?times:pending?'à définir':esc(hour(startsAt))}${fin?` <small>– ${esc(fin)}</small>`:''}</span>
    ${live?'<span class="week-chip is-live">● En cours</span>':''}
    <span class="week-block-name">${esc(event.name)}</span>
    ${meta.length?`<span class="week-block-meta">${meta.map(text=>`<span>${esc(text)}</span>`).join('')}</span>`:''}
    ${situation}${places}
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
      const minutes=eventMinutes(event),endsAt=isSolo(event)?startsAt+Math.max(minutes,0)*60000:raceFinishAt(startsAt,Math.max(minutes,0));
      if(endsAt<now&&startsAt<now)continue;
      const crew=regs.map(reg=>crewOf(departure,reg)).find(Boolean)||null;
      starts.push({event,departure,startsAt,crew});
    }
  }
  return starts.sort((a,b)=>a.startsAt-b.startsAt);
}
const openRace=(event,inner,cls)=>event.otherGame?`<a class="${cls}" href="/${event.otherGame}/#event=${event.id}">${inner}</a>`:`<button type="button" class="${cls}" data-action="open" data-id="${event.id}">${inner}</button>`;

// « Ta prochaine course »: the pilot's next start with his crew, his hours, the car and the forecast.
function nextBox(all,now){
  const next=myStarts(all,now)[0];
  // Not signed up anywhere: no box, the week takes the whole width (Nathan 2026-11-01).
  if(!next)return '';
  const {event,departure,startsAt,crew}=next,live=startsAt<=now,reg=myReg(departure);
  const sim=isSolo(event)?SIMS.find(item=>item.id===simForEvent(event))?.short||'':SIM_NAME[simOf(event)];
  const weather=isSolo(event)?'':weatherOf(event);
  const rows=[['Simu',sim],['Équipage',crew?.name],['Tes heures',!isSolo(event)&&reg?hoursOf(departure,reg,event):''],['Voiture',crew?.car],['Météo',weather]].filter(([,value])=>value);
  const go=event.otherGame?`<a class="home-next-go" href="/${event.otherGame}/#event=${event.id}">Voir la course →</a>`:button('open','Voir la course →',`data-id="${event.id}"`,'home-next-go');
  return `<aside class="home-next-box"><h2 class="home-next-label">${live?'En course':'Ta prochaine course'}</h2>
    <p class="home-next-name">${esc(event.name)}</p><p class="home-next-when">${esc(when(startsAt))} · ${esc(hour(startsAt))}</p>
    ${rows.length?`<dl class="home-next-rows">${rows.map(([key,value])=>`<div><dt>${esc(key)}</dt><dd>${esc(value)}</dd></div>`).join('')}</dl>`:''}
    ${go}</aside>`;
}

// « Équipages à former » (organisers): the starts where pilots wait for a crew or ask for one, and the way to the
// « Équipages » page (Nathan 2026-11-01).
function crewsBox(){
  if(!can('crews'))return '';
  const starts=crewStarts().filter(start=>start.alone.length||start.requests.length);
  const row=start=>`<li>${button('crews-page',`<span><strong>${esc(start.event.name)}</strong><small>${esc(when(start.startsAt))}${start.departure.hideClock?'':` · ${esc(hour(start.startsAt))}`}</small></span><span class="week-chip ${start.requests.length?'is-warn':'is-alert'}">${start.requests.length?`${start.requests.length} demande${start.requests.length>1?'s':''}`:`${start.alone.length} seul${start.alone.length>1?'s':''}`}</span>`,`data-departure="${esc(start.departure.id)}" data-game="${esc(gameForEvent(start.event))}"`,'home-crews-row')}</li>`;
  return `<aside class="home-crews-box"><h2 class="home-next-label">Équipages à former</h2>
    ${starts.length?`<ul>${starts.slice(0,4).map(row).join('')}</ul>${starts.length>4?`<p class="home-crews-more">+ ${starts.length-4} autre${starts.length-4>1?'s':''} départ${starts.length-4>1?'s':''}</p>`:''}`:'<p class="home-crews-done">✓ Tout le monde a un équipage.</p>'}
    ${button('crews-page','Voir les équipages →','','home-next-go')}</aside>`;
}

export function renderWeek(){
  if(state.access!=='member'){state.page='home';return;}
  state.page='week';state.currentEventId=null;
  const offset=Number(state.weekOffset)||0,filter=state.weekFilter||'all',now=Date.now();
  const all=[...state.events,...otherEndurances()];
  const monday=weekStart(now,offset),today=parisDay(now);
  const days=weekStarts(all,monday).map(day=>({...day,items:day.items.filter(item=>keep(item,filter))}));
  const range=`du ${monthDay.format(dateOf(monday))} au ${monthDay.format(dateOf(monday+6))}`;
  const filters=FILTERS.filter(([key])=>key!=='event'||state.soloRaces)
    .map(([key,label])=>button('week-filter',`${key==='all'?'':'<i aria-hidden="true"></i>'}${label}`,`data-filter="${key}" aria-pressed="${filter===key}"`,`event-filter-button week-filter is-${key}`)).join('');
  const columns=days.map(day=>`<section class="week-day${day.day===today?' is-today':''}${day.day<today?' is-past':''}${day.items.length?'':' is-empty'}" aria-labelledby="week-day-${day.day}">
      <h3 class="week-day-head" id="week-day-${day.day}"><span class="week-day-name">${esc(dayName.format(dateOf(day.day)))}</span><small>${esc(monthDay.format(dateOf(day.day)))}</small>${day.day===today?'<span class="week-today">Aujourd’hui</span>':''}</h3>
      <div class="week-day-list">${day.items.map(item=>block(item,now)).join('')||'<p class="week-empty">—</p>'}</div>
    </section>`).join('');
  const name=String(state.user?.name||'').trim().split(/\s+/)[0],side=nextBox(all,now)+crewsBox(),box=side?`<div class="home-side">${side}</div>`:'';
  // Admins create an event or announce a stream from here too (Nathan 2026-11-01), as on the events page.
  const create=can('create_race')&&state.soloRaces?`<div class="home-create">${button('create-stream','🎙 Annoncer un stream','','secondary-button')}${button('create','Ajouter un événement','data-format="solo"','primary-button')}</div>`:'';
  const weekLabel=offset===0?'Cette semaine':offset===1?'La semaine prochaine':offset===-1?'La semaine dernière':`Semaine du ${monthDay.format(dateOf(monday))}`;
  app.innerHTML=`<div class="page-head home-head"><h1 class="page-title">${name?`SALUT ${esc(name.toLocaleUpperCase('fr-FR'))}`:'ACCUEIL'}</h1>
      <div class="week-nav" role="group" aria-label="Changer de semaine">${button('week','‹','data-offset="-1" aria-label="Semaine précédente"','secondary-button week-step')}<span class="week-label">${esc(weekLabel)}<small>${esc(range)}</small></span>${button('week','›','data-offset="1" aria-label="Semaine suivante"','secondary-button week-step')}${offset?button('week','Revenir à cette semaine','data-offset="0"','link-button week-back'):''}</div>${create}</div>
    <div class="home-layout${box?'':' is-full'}">
      <section class="home-week" aria-label="${esc(weekLabel)}">
        <div class="event-filter week-filters" role="group" aria-label="Filtrer la semaine">${filters}</div>
        <div class="week-grid${days.some(day=>day.items.length)?'':' is-quiet'}">${columns}</div>
      </section>
      ${box}
    </div>`;
  notifyRender();
}
