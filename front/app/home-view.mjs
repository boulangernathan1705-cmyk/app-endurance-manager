import {app,nav,state,activeGame,esc,button,canManage,isAdmin,can,circuitLabel,eventTypeBadge,schedulePendingBadge,eventBadge,eventCategoryCount,circuitVisual,logo,dateLabel,countdown,groupEvents,notifyRender,notifyNav} from './core.mjs';
import {raceRangeBlock} from './planning.mjs';
import {dateBlock,dayLabel,timeLabel} from '../dates.mjs';
import {durationLabel,eventMinutes} from '../../shared/duration.mjs';
import {isSolo,accessBadge,soloRoundsLabel,soloFill,ANY_CATEGORY} from './solo.mjs';

const dayKeyFormatter=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit'});
function datedDepartures(event){return (event.departures||[]).filter(d=>Number.isFinite(Number(d.startsAt))).sort((a,b)=>Number(a.startsAt)-Number(b.startsAt));}
// Date block of a race card: the day of the next start (the last one for archived races); times are listed below.
export function raceDateBlock(event,archived){
  // A race over several days: the span of its days ("ven. → dim. 16–18 oct.").
  const range=raceRangeBlock(event);
  if(range)return range;
  const dated=datedDepartures(event),upcoming=dated.filter(d=>Number(d.startsAt)>Date.now());
  const shown=archived||!upcoming.length?dated.at(-1):upcoming[0];
  return dateBlock(shown?.startsAt);
}
// Start times grouped by day ("sam. 26 · 05h 12h 16h"), all shown alike.
export function raceStarts(event,archived){
  const dated=datedDepartures(event),now=Date.now();
  const shown=archived?dated:dated.filter(d=>Number(d.startsAt)>now);
  if(!shown.length)return '';
  const days=new Map();
  for(const departure of shown){const key=dayKeyFormatter.format(new Date(Number(departure.startsAt)));if(!days.has(key))days.set(key,[]);days.get(key).push(departure);}
  const entries=[...days.values()],visible=entries.slice(0,3),hidden=entries.length-visible.length;
  const time=departure=>`<span class="race-start">${esc(timeLabel(departure.time))}</span>`;
  return `<span class="race-starts">${visible.map(list=>`<span class="race-day"><em>${esc(dayLabel(list[0].startsAt))}</em>${list.map(time).join('')}</span>`).join('')}${hidden>0?`<span class="race-day race-more">+ ${hidden} jour${hidden>1?'s':''}</span>`:''}</span>`;
}
// Where the current pilot stands on a race: their next start with a registration, and their crew if any.
export function mySituation(event,{includePast=false}={}){
  const now=Date.now();
  const departures=[...(event.departures||[])].filter(d=>includePast||Number(d.startsAt)>now).sort((a,b)=>Number(a.startsAt)-Number(b.startsAt));
  for(const departure of departures){
    const regs=(departure.availability||[]).filter(reg=>reg.mine&&reg.status!=='unavailable');
    if(!regs.length)continue;
    for(const reg of regs){
      const crew=(departure.crews||[]).find(item=>(item.registrationIds||[]).includes(reg.id));
      if(crew)return {departure,reg,crew,mates:(crew.registrationIds||[]).map(id=>departure.availability.find(item=>item.id===id)).filter(item=>item&&item.id!==reg.id).map(item=>item.name)};
    }
    return {departure,reg:regs[0],crew:null,mates:[],categories:regs.map(reg=>reg.category).filter(Boolean)};
  }
  return null;
}
function situationBadge(event,archived){
  const mine=mySituation(event,{includePast:archived});
  if(!mine)return '';
  const when=(event.departures||[]).length>1?` · ${esc(timeLabel(mine.departure.time))}`:'';
  if(isSolo(event)){
    const categoryName=mine.reg.category===ANY_CATEGORY?'Peu importe':mine.reg.category;
    return mine.reg.waitlistPosition
      ?`<span class="event-situation is-waiting">Liste d’attente · ${mine.reg.waitlistPosition}${mine.reg.waitlistPosition===1?'er':'e'}</span>`
      :`<span class="event-situation is-crew">✓ Inscrit · ${esc(categoryName)}</span>`;
  }
  return mine.crew
    ?`<span class="event-situation is-crew">✓ Équipage ${esc(mine.crew.name)} · ${esc(mine.reg.category)}${when}</span>`
    :`<span class="event-situation is-registered">Inscrit · ${esc((mine.categories||[mine.reg.category]).join(' / '))}${when} · sans équipage</span>`;
}
function hasRegisteredPilot(departure){return (departure?.availability||[]).some(reg=>reg.status!=='unavailable');}
function registeredRaceStatus(event,now=Date.now()){
  const departures=[...(event.departures||[])].filter(d=>Number.isFinite(Number(d.startsAt))&&hasRegisteredPilot(d)).sort((a,b)=>Number(a.startsAt)-Number(b.startsAt));
  return {next:departures.find(d=>Number(d.startsAt)>now)||null};
}
const gameLink=(game,full,short)=>`<a class="nav-game-switcher-button nav-game-switcher-${game}" href="/${game}/"${activeGame===game?' aria-current="page"':''}><span class="nav-full">${full}</span><span class="nav-short">${short}</span></a>`;
// Two calendars, Endurance and Solo races, plus My entries. On a race page the tab of its format is active.
function activeList(page){
  if(page==='event'){const event=state.events.find(item=>item.id===state.currentEventId);return event?.format==='solo'?'solo':'endurance';}
  return state.listFormat;
}
function syncNavSection(page){for(const item of nav.querySelectorAll('.nav-section-button')){const current=item.dataset.action==='my-entries'?page==='my-entries':page!=='my-entries'&&item.dataset.list===activeList(page);item.setAttribute('aria-current',current?'page':'false');}}
export function renderNav(){nav.innerHTML=`<div class="nav-game-switcher" role="group" aria-label="Changer de simulateur">${gameLink('lmu','Le Mans Ultimate','LMU')}${gameLink('iracing','iRacing','iRacing')}</div><div class="nav-sections" role="group" aria-label="Sections">${button('home','Endurance','data-list="endurance"','nav-section-button')}${state.soloRaces?button('home',esc(state.soloLabel),'data-list="solo"','nav-section-button'):''}${button('my-entries','Mes inscriptions','','nav-section-button')}</div>`;syncNavSection(state.page);notifyNav();}
document.addEventListener('endurance:render',event=>syncNavSection(event.detail?.page));
function eventCard({event,next,archived,end}){
  const registered=registeredRaceStatus(event);const displayNext=registered.next;
  const untilNext=displayNext?displayNext.startsAt-Date.now():Infinity,statusClass=archived?'finished':displayNext&&untilNext<=3600000?'soon':'upcoming';
  const status=archived?`Tous les départs ont eu lieu · ${esc(dateLabel({startsAt:end}))}`:displayNext?`Prochain départ avec pilotes : ${esc(dateLabel(displayNext))} à ${esc(timeLabel(displayNext.time))} · <span data-countdown="${displayNext.startsAt}">${countdown(displayNext.startsAt)}</span>`:next?'Aucun départ à venir avec pilote inscrit':'Dates à confirmer';
  const situation=`${schedulePendingBadge(event)}${situationBadge(event,archived)}`;
  return `<button class="event-card event-card-harmonized race-card event-type-${event.eventType||'private'}${isSolo(event)?` is-solo is-solo-${event.access||'open'}`:''} ${archived?'archived':''}" data-action="open" data-id="${event.id}"><span class="event-card-body race-card-body"><span class="race-card-content"><span class="race-card-top">${raceDateBlock(event,archived)}<span class="race-head"><span class="event-name">${esc(event.name)}</span><span class="race-meta">${isSolo(event)?soloRoundsLabel(event):`${esc(circuitLabel(event.circuit))} · ${durationLabel(eventMinutes(event))}`}</span>${isSolo(event)?accessBadge(event):eventTypeBadge(event.eventType)}</span></span>${raceStarts(event,archived)}${situation?`<span class="race-situation">${situation}</span>`:''}<span class="race-fill">${isSolo(event)?`${soloFill(event)}<span class="solo-card-categories">${event.categories.map(category=>logo(category)).join('')}</span>`:`<span class="event-category-badges">${event.categories.map(category=>eventBadge(category,eventCategoryCount(event,category))).join('')}</span>`}</span></span><span class="race-card-circuit" aria-hidden="true">${circuitVisual(event.circuit,true)}</span><span class="event-card-status"><span class="event-countdown ${statusClass}" ${displayNext&&!archived?`data-status-time="${displayNext.startsAt}"`:''}>${status}</span></span></span></button>`;
}
// Not a member of the community (or not signed in): no data, only how to get in.
// Welcome screen for visitors (not signed in, or not members of the community): what the site does, and the
// Discord sign-in. The main address presents the platform; a community site presents the community.
const DISCORD_MARK=`<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M19.5 5.3A16.3 16.3 0 0 0 15.4 4l-.5 1.1a14.6 14.6 0 0 0-5.8 0L8.6 4a16.1 16.1 0 0 0-4.1 1.3C1.9 9.2 1.2 13 1.6 16.8A16.8 16.8 0 0 0 6.7 19l1.2-1.7c-.7-.3-1.4-.7-2-1.2l.5-.4c3.8 1.8 7.8 1.8 11.6 0l.5.4c-.6.5-1.3.9-2 1.2l1.2 1.7a16.7 16.7 0 0 0 5.1-2.2c.5-4.4-.9-8.2-3.3-11.5ZM8.5 14.7c-1.2 0-2.1-1.1-2.1-2.4 0-1.4.9-2.4 2.1-2.4s2.1 1.1 2.1 2.4-.9 2.4-2.1 2.4Zm7 0c-1.2 0-2.1-1.1-2.1-2.4 0-1.4.9-2.4 2.1-2.4s2.1 1.1 2.1 2.4-.9 2.4-2.1 2.4Z"/></svg>`;
const WELCOME_FEATURES=[
  ['M12 7v5l3 2M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z','Disponibilités heure par heure','Chaque pilote indique ses relais possibles ; les trous du plateau se voient d’un coup d’œil.'],
  ['M16 19v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1M9 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm13 9v-1a4 4 0 0 0-3-3.9M16 4.1a3 3 0 0 1 0 5.8','Création d’équipage','Crée ton équipage en quelques clics : catégorie, voiture, coéquipiers, puis les relais de chacun.'],
  ['M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z','Calendrier LMU et iRacing','Les endurances officielles iRacing arrivent toutes seules, avec leurs horaires dès qu’ils sont publiés.'],
  ['M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2Z','Pensé pour Discord','Connexion en un clic avec ton compte Discord, et récap des courses de la semaine sur le serveur.']];
export function communityGate(){
  const name=esc(state.community?.name||'cette communauté');
  const login=`<a class="welcome-discord" href="/api/auth/discord?return=${encodeURIComponent(location.pathname)}">${DISCORD_MARK}<span>Se connecter avec Discord</span></a>`;
  const invite=state.community?.discordInviteUrl?`<a class="welcome-discord" href="${esc(state.community.discordInviteUrl)}" rel="noopener">${DISCORD_MARK}<span>Rejoindre le Discord de ${name}</span></a>`:'';
  const partner=state.platformDiscordUrl?`<a class="secondary-button" href="${esc(state.platformDiscordUrl)}" rel="noopener">Trouver une communauté partenaire</a>`:'';
  const trust='<p class="welcome-trust"><span aria-hidden="true">🔒</span> Connexion via Discord : aucun mot de passe, seuls ton pseudo et ton avatar sont utilisés. <a href="/about.html#connexion">En savoir plus</a></p>';
  let kicker,title,lead,actions;
  if(state.openSite){
    kicker='Simracing · Endurance';title='Vos endurances en équipe, enfin simples à organiser';
    lead='Inscriptions, disponibilités, création d’équipage et relais : tout le plateau au même endroit, pour Le Mans Ultimate et iRacing.';actions=login+trust;
  }else if(state.access==='anonymous'){
    kicker=name;title=`Bienvenue sur l’espace de ${name}`;
    lead='Cet espace est réservé aux membres de son serveur Discord. Connecte-toi pour voir les courses et t’inscrire.';actions=login+trust;
  }else if(state.access==='not-member'){
    kicker=name;title=`Rejoins ${name} pour rouler avec eux`;
    lead=`Tu n’es pas encore membre du serveur Discord de ${name}. Rejoins-le, puis reviens sur cette page : l’accès s’ouvre tout seul.`;actions=`<div class="welcome-actions">${invite}${partner}</div>`;
  }else{
    kicker=name;title='Accès momentanément indisponible';lead=`L’accès à ${name} ne peut pas être vérifié pour le moment. Réessaie dans quelques minutes.`;actions='';
  }
  const features=WELCOME_FEATURES.map(([icon,heading,text])=>`<li><svg viewBox="0 0 24 24" aria-hidden="true"><path d="${icon}"/></svg><strong>${heading}</strong><span>${text}</span></li>`).join('');
  return `<section class="community-gate welcome${state.access==='anonymous'?' is-visitor':''}" aria-labelledby="community-gate-title">
    <div class="welcome-hero"><p class="welcome-kicker">${kicker}</p><h1 id="community-gate-title">${title}</h1><p class="welcome-lead">${lead}</p>${actions}</div>
    <ul class="welcome-features">${features}</ul></section>`;
}
export function renderHome(message=''){if(state.access!=='member'){state.page='home';app.innerHTML=communityGate();notifyRender();return;}state.page='home';state.currentEventId=null;state.editingEvent=null;state.drafts={};state.registrationOpen.clear();const solo=state.listFormat==='solo';const listEvents=state.events.filter(event=>(event.format==='solo')===solo);const hasMine=listEvents.some(event=>mySituation(event));if(state.eventFilter==='mine'&&!hasMine)state.eventFilter='upcoming';const mineOnly=state.eventFilter==='mine';const groups=groupEvents(mineOnly?listEvents.filter(event=>mySituation(event)):listEvents,mineOnly?'upcoming':state.eventFilter);const filters=`<div class="event-filter" role="group" aria-label="Filtrer les événements">${button('event-filter','À venir',`data-filter="upcoming" aria-pressed="${state.eventFilter==='upcoming'}"`,'event-filter-button')}${hasMine?button('event-filter','Mes courses',`data-filter="mine" aria-pressed="${state.eventFilter==='mine'}"`,'event-filter-button'):''}${button('event-filter','Archivés',`data-filter="archived" aria-pressed="${state.eventFilter==='archived'}"`,'event-filter-button')}</div>`;app.innerHTML=`<div class="page-head"><h1 class="page-title">${solo?esc(state.soloLabel).toUpperCase():'ENDURANCE'}</h1>${filters}${can('create_race')||(activeGame==='iracing'&&isAdmin())?`<div class="home-create-event">${activeGame==='iracing'&&isAdmin()&&!solo?button('iracing-import','Mettre à jour le calendrier iRacing','title="Importe les nouvelles endurances officielles et les horaires des événements spéciaux"','secondary-button'):''}${can('create_race')?button('create',solo?'Ajouter une course solo':'Ajouter un événement',`data-format="${solo?'solo':'endurance'}"`,'primary-button'):''}</div>`:''}</div>${message?`<p class="creation-success" role="status">${esc(message)}</p>`:''}${groups.length?`<div class="event-agenda">${groups.map(group=>`<section class="event-period" aria-labelledby="period-${group.key}"><h2 class="event-period-heading" id="period-${group.key}"><span>${esc(group.label)}</span><small>${group.items.length} événement${group.items.length>1?'s':''}</small></h2><div class="event-list">${group.items.map(eventCard).join('')}</div></section>`).join('')}</div>`:`<div class="empty">${state.eventFilter==='upcoming'?'Aucun événement à venir.':'Aucun événement archivé.'}</div>`}`;notifyRender();}
