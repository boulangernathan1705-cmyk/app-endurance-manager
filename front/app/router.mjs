// Keeps the address bar in sync with the page, so a race can be shared as a link
// (/lmu/#event=<id>) and the browser Back button returns to the previous page.
// The events calendar (every sim) has its own address, /events/, so a copied link never names a sim.
import {app,state,activeGame,loadArchive,showError} from './core.mjs';

const EVENT_HASH=/^#event=([a-f0-9-]{36})$/;
const ENTRIES_HASH='#inscriptions';
const SOLO_HASH='#solo';
const EVENTS_PATH='/events/';
const onEvents=()=>/^\/events\/?$/i.test(location.pathname);
let views=null;
let homeScroll=0;

export function routeFromLocation(){
  const match=location.hash.match(EVENT_HASH);
  if(match)return {page:'event',eventId:match[1]};
  // Shared links are often typed by hand (#SOLO, #Inscriptions): the case does not matter.
  const hash=location.hash.toLowerCase();
  // Older links to the calendar (/lmu/#solo) show its own address.
  if(hash===SOLO_HASH){history.replaceState(null,'',EVENTS_PATH+location.search);return {page:'home',list:'solo'};}
  if(hash!==location.hash&&hash===ENTRIES_HASH)history.replaceState(null,'',location.pathname+location.search+hash);
  if(hash===ENTRIES_HASH)return {page:'my-entries'};
  if(onEvents())return {page:'home',list:'solo'};
  return {page:'home',list:'endurance'};
}

function addressFor(detail){
  const here=location.pathname+location.search;
  if(detail.page==='event'&&detail.eventId)return `${here}#event=${detail.eventId}`;
  if(detail.page==='my-entries')return `${here}${ENTRIES_HASH}`;
  if(detail.page==='home')return detail.list==='solo'?EVENTS_PATH+location.search:onEvents()?`/${activeGame}/${location.search}`:here;
  return null; // Event form: keep the current address.
}

function bringPageIntoView(){
  if(app.getBoundingClientRect().top<0)app.scrollIntoView({block:'start'});
}

export async function applyRoute(route,message=''){
  if(route.page==='event'){
    // A shared link can point to a past race: fetch the archive before giving up.
    if(!state.events.some(event=>event.id===route.eventId)&&!state.archiveLoaded)await loadArchive();
    if(state.events.some(event=>event.id===route.eventId)){
      state.currentEventId=route.eventId;state.selectedDepartureId=null;state.eventSection='race';
      state.drafts={};state.pendingCrewJoin=null;state.registrationOpen.clear();
      views.renderEvent(message);
      return;
    }
    history.replaceState(null,'',location.pathname+location.search);
    views.renderHome(message||'Cette course n’est plus disponible.');
    return;
  }
  if(route.page==='my-entries'){views.renderMyEntries();return;}
  if(route.list)state.listFormat=route.list==='solo'&&!state.soloRaces?'endurance':route.list;
  views.renderHome(message);
}

export function installRouter(renderers){
  views=renderers;
  let currentPage=state.page;
  document.addEventListener('endurance:render',event=>{
    const detail=event.detail||{};
    if(currentPage==='home'&&detail.page!=='home')homeScroll=scrollY;
    const changedPage=detail.page!==currentPage;
    currentPage=detail.page;
    const wanted=addressFor(detail);
    if(wanted===null||location.pathname+location.search+location.hash===wanted)return;
    history.pushState(null,'',wanted);
    if(changedPage||detail.page==='event')bringPageIntoView();
  });
  addEventListener('popstate',()=>{
    const route=routeFromLocation();
    applyRoute(route).then(()=>{
      if(route.page==='home')requestAnimationFrame(()=>scrollTo(0,homeScroll));
      else bringPageIntoView();
    }).catch(showError);
  });
}
