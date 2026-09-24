// Keeps the address bar in sync with the page, so a race can be shared as a link
// (/lmu/#event=<id>) and the browser Back button returns to the previous page.
import {app,state} from './core.mjs';

const EVENT_HASH=/^#event=([a-f0-9-]{36})$/;
const ENTRIES_HASH='#inscriptions';
let views=null;
let homeScroll=0;

export function routeFromLocation(){
  const match=location.hash.match(EVENT_HASH);
  if(match)return {page:'event',eventId:match[1]};
  if(location.hash===ENTRIES_HASH)return {page:'my-entries'};
  return {page:'home'};
}

function hashFor(detail){
  if(detail.page==='event'&&detail.eventId)return `#event=${detail.eventId}`;
  if(detail.page==='my-entries')return ENTRIES_HASH;
  if(detail.page==='home')return '';
  return null; // Event form: keep the current address.
}

function bringPageIntoView(){
  if(app.getBoundingClientRect().top<0)app.scrollIntoView({block:'start'});
}

export function applyRoute(route,message=''){
  if(route.page==='event'){
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
    const wanted=hashFor(detail);
    if(wanted===null||location.hash===wanted)return;
    history.pushState(null,'',location.pathname+location.search+wanted);
    if(changedPage||detail.page==='event')bringPageIntoView();
  });
  addEventListener('popstate',()=>{
    const route=routeFromLocation();
    applyRoute(route);
    if(route.page==='home')requestAnimationFrame(()=>scrollTo(0,homeScroll));
    else bringPageIntoView();
  });
}
