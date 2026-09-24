// Refreshes registrations and crews in the background, replacing the manual "Actualiser" button.
// It never runs while the pilot is typing, has a form or dialog open, or an action is in progress,
// and it keeps open sections and the scroll position.
import {app,state} from './core.mjs';

const INTERVAL_MS=60000;
const STALE_AFTER_MS=20000;
let lastRefresh=Date.now();
let running=false;

function pilotIsBusy(){
  if(state.busy||state.pendingCrewJoin||state.registrationOpen.size)return true;
  if(!['home','event','my-entries'].includes(state.page))return true;
  const active=document.activeElement;
  if(active?.matches?.('input,select,textarea,[contenteditable="true"]'))return true;
  if(document.querySelector('[aria-modal="true"],dialog[open],[data-ux-error-modal]'))return true;
  if(document.getElementById('crew-builder-root')?.childElementCount)return true;
  return false;
}

function openSections(){
  return [...app.querySelectorAll('details[open]')].map(details=>details.id?`#${CSS.escape(details.id)}`:details.classList.contains('past-departures-fold')?'.past-departures-fold':null).filter(Boolean);
}

async function refreshInBackground(refresh){
  if(running||document.hidden||pilotIsBusy())return;
  running=true;
  const sections=openSections(),scroll=scrollY;
  try{
    await refresh();
    for(const selector of sections)app.querySelector(selector)?.setAttribute('open','');
    scrollTo(0,scroll);
    lastRefresh=Date.now();
  }catch{
    // Network hiccup: the next tick retries silently.
  }finally{
    running=false;
  }
}

export function installAutoRefresh(refresh){
  setInterval(()=>refreshInBackground(refresh),INTERVAL_MS);
  document.addEventListener('visibilitychange',()=>{
    if(!document.hidden&&Date.now()-lastRefresh>STALE_AFTER_MS)refreshInBackground(refresh);
  });
}
