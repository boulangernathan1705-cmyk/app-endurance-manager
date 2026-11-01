// « Équipages » (#equipages): the organisers' page (permission « Équipages », Nathan 2026-11-01). Every endurance of
// the next two weeks, LMU and iRacing together (a simulator filter kept in the browser), one card per start: its
// crews on one side, its pilots without a crew on the other, each with the bar of their hours. The organiser ticks
// pilots and creates a crew (the usual crew window, filled in), puts a pilot in an open crew (« Ajouter à… »), or
// checks a pilot's request (« Demander un équipage ») before creating it. Pilots only see their race pages.
import {app,state,esc,button,api,activeGame,coversHour,can,logo,notifyRender,showError} from './core.mjs';
import {gameForEvent} from '../../shared/catalog.mjs';
import {eventMinutes,raceFinishAt} from '../../shared/duration.mjs';

const DAY=86400000,HORIZON=14*DAY;
const SIM_NAME={lmu:'LMU',iracing:'iRacing'};
const OTHER={lmu:'iracing',iracing:'lmu'};
const SIMS_KEY='em-crews-sims';
const dateFormat=new Intl.DateTimeFormat('fr-FR',{timeZone:'Europe/Paris',weekday:'short',day:'numeric',month:'short'});
const clock=new Intl.DateTimeFormat('fr-FR',{timeZone:'Europe/Paris',hour:'2-digit',minute:'2-digit'});
const dayOf=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit'});
const endDay=new Intl.DateTimeFormat('fr-FR',{timeZone:'Europe/Paris',weekday:'short'});
const hour=at=>clock.format(at).replace(':','h').replace(/h00$/,'h').replace(/^0(?=\d)/,'');
const day=at=>dateFormat.format(at).replace(/\./g,'');

// The endurances of the other simulator (the page loads only its own): read once a minute at most.
let other={game:'',events:[],at:0,loading:null};
function otherEndurances(){
  const game=OTHER[activeGame];
  if(other.game===game&&Date.now()-other.at<60000)return other.events;
  other.loading??=api(`/api/races?game=${game}&scope=upcoming`).then(result=>{
    other={game,events:(Array.isArray(result.events)?result.events:[]).filter(event=>event.format!=='solo'&&gameForEvent(event)===game),at:Date.now(),loading:null};
    if(state.page==='crews')renderCrewsPage();
    document.dispatchEvent(new CustomEvent('endurance:crews-count'));
  }).catch(()=>{other={game,events:[],at:Date.now(),loading:null};});
  return other.game===game?other.events:[];
}
// After a change on the other simulator's race: read again.
export function forgetOtherEndurances(){other.at=0;}

// Simulators shown, kept in the browser (« si on veut toujours voir qu'une simu »).
function chosenSims(){
  try{const saved=JSON.parse(localStorage.getItem(SIMS_KEY)||'null');if(Array.isArray(saved)&&saved.length)return saved.filter(sim=>SIM_NAME[sim]);}catch{}
  return ['lmu','iracing'];
}
function toggleSim(sim){
  const sims=new Set(chosenSims());
  sims.has(sim)?sims.delete(sim):sims.add(sim);
  // Never none: unticking the last one shows both again.
  try{localStorage.setItem(SIMS_KEY,JSON.stringify(sims.size?[...sims]:['lmu','iracing']));}catch{}
}

// Entries and crews of this community only (an official race shows those of the viewer's other communities too).
const ours=reg=>!reg.foreign&&reg.status!=='unavailable';
const ourCrew=crew=>!crew.community||!state.community?.id||crew.community.id===state.community.id;
const hoursOf=event=>Math.max(1,Math.ceil(eventMinutes(event)/60));
// A pilot entered in several categories shows once, with all of them.
function pilotsAlone(departure){
  const assigned=new Set((departure.crews||[]).flatMap(crew=>crew.registrationIds||[]).map(String));
  const byPilot=new Map();
  for(const reg of (departure.availability||[]).filter(ours)){
    if(assigned.has(String(reg.id)))continue;
    const key=reg.participantId||`reg:${reg.id}`;
    if(!byPilot.has(key))byPilot.set(key,[]);
    byPilot.get(key).push(reg);
  }
  return [...byPilot.values()].map(regs=>({main:regs.find(reg=>reg.status==='whole')||regs[0],regs}));
}

// Every start of the next two weeks with pilots or a request, the soonest first.
export function crewStarts(now=Date.now()){
  const requests=state.crewRequests||[];
  const events=[...state.events.filter(event=>!event.archived),...otherEndurances()].filter(event=>event.format!=='solo');
  const starts=[];
  for(const event of events){
    const game=gameForEvent(event);
    for(const departure of event.departures||[]){
      const startsAt=Number(departure.startsAt);
      if(!Number.isFinite(startsAt)||startsAt<=now||startsAt>now+HORIZON)continue;
      const asked=requests.filter(item=>item.departureId===departure.id);
      const alone=pilotsAlone(departure),crews=(departure.crews||[]).filter(ourCrew);
      if(!alone.length&&!crews.length&&!asked.length)continue;
      starts.push({event,game,departure,startsAt,alone,crews,requests:asked});
    }
  }
  return starts.sort((a,b)=>a.startsAt-b.startsAt);
}
// The red number of the « Équipages » tab: pilots waiting for a crew, and the requests.
export function crewsTodoCount(){
  if(!can('crews')||state.access!=='member')return 0;
  return crewStarts().reduce((sum,start)=>sum+start.alone.length+start.requests.length,0);
}

// The hours of a pilot, one cell per hour of the race (the race page's bar, in small).
function hoursBar(event,departure,reg){
  const cells=Array.from({length:hoursOf(event)},(_,index)=>`<i${coversHour(reg,index)?' class="on"':''}></i>`).join('');
  return `<span class="crews-bar" style="--hours:${hoursOf(event)}" role="img" aria-label="${esc(hoursText(event,departure,reg))}">${cells}</span>`;
}
function hoursText(event,departure,reg){
  if(reg.status==='whole')return 'Toute la course';
  const ranges=[];
  for(let index=0;index<hoursOf(event);index++){if(!coversHour(reg,index))continue;const last=ranges.at(-1);if(last&&last.end===index)last.end=index+1;else ranges.push({start:index,end:index+1});}
  const at=offset=>hour(Number(departure.startsAt)+offset*3600000);
  return ranges.length?ranges.map(range=>`${at(range.start)}–${at(range.end)}`).join(', '):'Aucune heure';
}
// The hours nobody of a group drives: « de 19h à 21h30 ».
function gaps(event,departure,regs){
  const total=hoursOf(event),list=[];
  for(let index=0;index<total;index++){if(regs.some(reg=>coversHour(reg,index)))continue;const last=list.at(-1);if(last&&last.end===index)last.end=index+1;else list.push({start:index,end:index+1});}
  const end=raceFinishAt(Number(departure.startsAt),eventMinutes(event));
  const at=offset=>offset>=total?hour(end):hour(Number(departure.startsAt)+offset*3600000);
  return list.map(range=>`de ${at(range.start)} à ${at(range.end)}`);
}
const cars=reg=>reg.carAny?'Peu importe':(reg.cars?.length?reg.cars.join(', '):reg.car||'');
const plural=(count,word)=>`${count} ${word}${count>1?'s':''}`;

function crewCard(start,crew){
  const {event,game,departure}=start;
  const regs=(crew.registrationIds||[]).map(id=>(departure.availability||[]).find(reg=>String(reg.id)===String(id))).filter(Boolean);
  const status=crew.locked?'<span class="crews-chip is-ok">🔒 Complet</span>':'<span class="crews-chip is-warn">Ouvert</span>';
  const manage=crew.canManage?`<button type="button" class="link-button crews-manage" data-action="edit-crew" data-id="${esc(crew.id)}" data-event="${esc(event.id)}" data-game="${game}" aria-label="Gérer l’équipage ${esc(crew.name)}">Gérer</button>`:'';
  return `<article class="crews-crew">
    <div class="crews-crew-head"><span class="crews-cat">${logo(crew.category)}</span><strong>${esc(crew.name)}</strong><small>${esc(crew.car||'Voiture à choisir')}</small>${status}${manage}</div>
    ${regs.length?regs.map(reg=>`<div class="crews-line"><span>${esc(reg.name)}</span>${hoursBar(event,departure,reg)}</div>`).join(''):'<p class="crews-empty">Aucun pilote</p>'}
  </article>`;
}
function pilotCard(start,{main,regs}){
  const {event,departure,crews}=start;
  const categories=regs.map(reg=>reg.category);
  // « Ajouter à… »: the open crews of one of his categories.
  const open=crews.filter(crew=>!crew.locked&&crew.canManage&&categories.includes(crew.category));
  const add=open.length?`<label class="crews-add"><span class="sr-only">Ajouter ${esc(main.name)} à un équipage</span><select data-crews-add>${['<option value="">Ajouter à…</option>',...open.map(crew=>{const reg=regs.find(item=>item.category===crew.category);return `<option value="${esc(crew.id)}|${esc(reg.id)}|${crew.version}">${esc(crew.name)} · ${esc(crew.category)}</option>`;})].join('')}</select></label>`:'';
  return `<div class="crews-pilot">
    <label class="crews-pick"><input type="checkbox" data-crews-pick value="${esc(regs.map(reg=>reg.id).join(','))}" data-category="${esc(main.category)}"><span><strong>${esc(main.name)}</strong> ${categories.map(category=>`<span class="crews-cat">${logo(category)}</span>`).join('')} <small>${esc([cars(main),hoursText(event,departure,main)].filter(Boolean).join(' · '))}</small></span></label>
    ${add}
    ${hoursBar(event,departure,main)}
  </div>`;
}
// A pilot's request, to check before creating it: its crew, its pilots' hours, the hours nobody drives and the
// pilots of the start who would stay alone (Nathan: « qu'on puisse vérifier que personne n'est oublié »).
function requestRecap(start,request){
  const {event,game,departure,alone}=start;
  const regs=request.registrationIds.map(id=>(departure.availability||[]).find(reg=>String(reg.id)===String(id))).filter(Boolean);
  const holes=gaps(event,departure,regs);
  const left=alone.filter(pilot=>!pilot.regs.some(reg=>request.registrationIds.includes(reg.id)));
  const notes=[holes.length?`Personne ${holes.join(', ')}.`:'',left.length?`${left.map(pilot=>`${pilot.main.name} (${pilot.regs.map(reg=>reg.category).join(', ')})`).join(', ')} ${left.length>1?'restent':'reste'} sans équipage sur ce départ.`:''].filter(Boolean);
  const preset=`data-crew-builder-open data-event="${esc(event.id)}" data-game="${game}" data-departure="${esc(departure.id)}" data-registrations="${esc(request.registrationIds.join(','))}" data-name="${esc(request.name)}" data-category="${esc(request.category)}" data-car="${esc(request.car)}" data-request="${esc(request.id)}"`;
  return `<section class="crews-request" id="request-${esc(request.id)}">
    <h4>Demande de ${esc(request.requester)} · ${esc(ago(request.createdAt))}</h4>
    <dl><div><dt>Équipage</dt><dd>${esc(request.name)}</dd></div><div><dt>Catégorie</dt><dd>${esc(request.category)}</dd></div><div><dt>Voiture</dt><dd>${esc(request.car||'À choisir')}</dd></div><div><dt>Pilotes</dt><dd>${esc(regs.map(reg=>reg.name).join(', '))}</dd></div></dl>
    ${regs.map(reg=>`<div class="crews-line"><span>${esc(reg.name)}</span>${hoursBar(event,departure,reg)}</div>`).join('')}
    ${notes.length?`<p class="crews-note">⚠ ${esc(notes.join(' '))}</p>`:''}
    <div class="crews-actions"><button type="button" class="primary-button" ${preset} data-step="3">Créer cet équipage</button><button type="button" class="secondary-button" ${preset} data-step="1">Modifier</button>${button('crew-request-refuse','Refuser',`data-id="${esc(request.id)}" data-name="${esc(request.requester)}"`,'link-button crews-refuse')}</div>
  </section>`;
}
function ago(seconds){
  const minutes=Math.max(0,Math.round((Date.now()/1000-Number(seconds))/60));
  if(minutes<1)return 'à l’instant';if(minutes<60)return `il y a ${minutes} min`;
  const hours=Math.round(minutes/60);return hours<24?`il y a ${hours} h`:`il y a ${Math.round(hours/24)} j`;
}
function when(start){
  const {departure,event,startsAt}=start;
  if(departure.hideClock)return `${day(startsAt)} · horaire à définir`;
  const end=raceFinishAt(startsAt,eventMinutes(event));
  return `${day(startsAt)} · ${hour(startsAt)} → ${dayOf.format(end)!==dayOf.format(startsAt)?`${endDay.format(end).replace('.','')} `:''}${hour(end)}`;
}
function startCard(start,focus){
  const {event,game,departure,alone,crews,requests}=start;
  const todo=alone.length+requests.length;
  const status=alone.length?`<span class="crews-chip is-alert">${plural(alone.length,'pilote')} sans équipage</span>`:'<span class="crews-chip is-ok">✓ Tout le monde a un équipage</span>';
  const asked=requests.length?`<span class="crews-chip is-ask">${plural(requests.length,'demande')}</span>`:'';
  const open=event.otherGame||game!==activeGame?`<a class="link-button" href="/${game}/#event=${esc(event.id)}">Ouvrir la course →</a>`:button('open','Ouvrir la course →',`data-id="${esc(event.id)}"`,'link-button');
  const pick=alone.length?`<button type="button" class="primary-button crews-create" data-crews-create data-event="${esc(event.id)}" data-game="${game}" data-departure="${esc(departure.id)}" disabled>Créer un équipage</button>`:'';
  return `<details class="crews-start is-${game}${focus===departure.id?' is-focus':''}" id="crews-${esc(departure.id)}" ${todo||focus===departure.id?'open':''}>
    <summary><span class="crews-sim">${SIM_NAME[game]}</span><strong>${esc(event.name)}</strong><span class="crews-when">${esc(when(start))}</span><span class="crews-status">${asked}${status}</span></summary>
    ${requests.map(request=>requestRecap(start,request)).join('')}
    <div class="crews-cols">
      <section><h3>Équipages · ${crews.length}</h3>${crews.length?crews.map(crew=>crewCard(start,crew)).join(''):'<p class="crews-empty">Aucun équipage pour l’instant.</p>'}</section>
      <section><h3>Sans équipage · ${alone.length}</h3>${alone.map(pilot=>pilotCard(start,pilot)).join('')||'<p class="crews-empty">Personne.</p>'}
        <div class="crews-actions">${pick}${open}</div></section>
    </div>
  </details>`;
}

export function renderCrewsPage(focus=state.crewsFocus||''){
  if(state.access!=='member'||!can('crews')){state.page='home';return false;}
  state.page='crews';state.currentEventId=null;state.crewsFocus=focus;
  const view=state.crewsView||'todo',sims=chosenSims(),all=crewStarts();
  const shownSims=all.filter(start=>sims.includes(start.game));
  const todo=shownSims.filter(start=>start.alone.length||start.requests.length);
  const starts=view==='todo'&&!focus?todo:shownSims;
  const requests=shownSims.flatMap(start=>start.requests.map(request=>({request,start})));
  const chip=(action,label,pressed,extra='')=>button(action,label,`${extra} aria-pressed="${pressed}"`,`event-filter-button crews-filter${pressed?' is-on':''}`);
  const list=requests.length?`<section class="crews-requests" aria-label="Demandes d’équipage"><h2>Demandes d’équipage · ${requests.length}</h2>${requests.map(({request,start})=>`<div class="crews-request-row"><span><strong>${esc(request.requester)}</strong> demande l’équipage <strong>« ${esc(request.name)} »</strong> · ${esc(request.category)}${request.car?` · ${esc(request.car)}`:''}<small>${esc(start.event.name)} · ${esc(when(start))} · ${esc(ago(request.createdAt))}</small></span>${button('crews-see','Voir',`data-departure="${esc(start.departure.id)}" data-request="${esc(request.id)}"`,'primary-button')}</div>`).join('')}</section>`:'';
  app.innerHTML=`<div class="crews-page" data-crews-page>
    <div class="crews-head"><h1 class="page-title">ÉQUIPAGES</h1><p class="crews-lead">Les endurances des deux prochaines semaines.</p></div>
    <div class="event-filter crews-filters" role="group" aria-label="Filtrer les départs">${chip('crews-view',`À former · ${todo.length}`,view==='todo','data-view="todo"')}${chip('crews-view',`Tous les départs · ${shownSims.length}`,view==='all','data-view="all"')}<span class="crews-sep" aria-hidden="true"></span>${['lmu','iracing'].map(sim=>chip('crews-sim',`<i aria-hidden="true"></i>${SIM_NAME[sim]}`,sims.includes(sim),`data-sim="${sim}" data-sim-color="${sim}"`)).join('')}</div>
    ${list}
    ${starts.length?starts.map(start=>startCard(start,focus)).join(''):`<p class="crews-done">${shownSims.length?'✓ Tout le monde a un équipage sur les deux prochaines semaines.':'Aucun pilote inscrit sur les deux prochaines semaines.'}</p>`}
    <div id="crew-builder-root"></div>
  </div>`;
  notifyRender();
  if(focus)requestAnimationFrame(()=>document.getElementById(`crews-${focus}`)?.scrollIntoView({block:'start',behavior:'smooth'}));
  return true;
}

export async function crewsAction(action,target){
  if(action==='crews-view'){state.crewsView=target.dataset.view;state.crewsFocus='';renderCrewsPage('');return true;}
  if(action==='crews-sim'){toggleSim(target.dataset.sim);renderCrewsPage('');return true;}
  if(action==='crews-see'){renderCrewsPage(target.dataset.departure);requestAnimationFrame(()=>document.getElementById(`request-${target.dataset.request}`)?.scrollIntoView({block:'center',behavior:'smooth'}));return true;}
  if(action==='crew-request-refuse'){
    if(!confirm(`Refuser la demande de ${target.dataset.name} ? Le pilote reçoit une notification sur le site.`))return true;
    await api(`/api/crew-requests/${target.dataset.id}/refuse`,'POST',{});
    return 'refresh';
  }
  return false;
}

// Ticking pilots: the « Créer un équipage » button of their start counts them and opens the crew window with them.
if(typeof document!=='undefined'){
  document.addEventListener('change',async event=>{
    const field=event.target;
    if(field.matches?.('[data-crews-pick]')){
      const card=field.closest('.crews-start'),create=card?.querySelector('[data-crews-create]');
      if(!create)return;
      const picked=[...card.querySelectorAll('[data-crews-pick]:checked')];
      create.disabled=!picked.length;
      create.textContent=picked.length?`Créer un équipage avec ${plural(picked.length,'pilote')}`:'Créer un équipage';
      if(picked.length){create.dataset.crewBuilderOpen='';create.dataset.registrations=picked.map(item=>item.value).join(',');create.dataset.category=picked[0].dataset.category;create.dataset.step='1';}
      else delete create.dataset.crewBuilderOpen;
      return;
    }
    if(field.matches?.('[data-crews-add]')&&field.value){
      const [crewId,registrationId,version]=field.value.split('|');
      field.disabled=true;
      try{
        await api(`/api/crews/${crewId}/members`,'POST',{registrationId,version:Number(version)});
        forgetOtherEndurances();
        document.dispatchEvent(new CustomEvent('endurance:refresh'));
      }catch(error){field.disabled=false;field.value='';showError(error);}
    }
  });
}
