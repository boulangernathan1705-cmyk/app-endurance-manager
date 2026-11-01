// Refreshes registrations and crews in the background, replacing the manual "Actualiser" button.
// It never runs while the pilot is typing, has a form or dialog open, or an action is in progress,
// and it keeps open sections and the scroll position.
import {app,state} from './core.mjs';
import {isIdle,onWake} from '../idle.mjs';

const INTERVAL_MS=60000;
const STALE_AFTER_MS=20000;
let lastRefresh=Date.now();
let running=false;

function pilotIsBusy(){
  if(state.busy||state.pendingCrewJoin||state.registrationOpen.size)return true;
  if(!['home','event','my-entries','week'].includes(state.page))return true;
  const active=document.activeElement;
  if(active?.matches?.('input,select,textarea,[contenteditable="true"]'))return true;
  if(document.querySelector('[aria-modal="true"],dialog[open],[data-ux-error-modal]'))return true;
  if(document.querySelector('[data-crew-builder-panel]'))return true;
  return false;
}

function openSections(){
  return [...app.querySelectorAll('details[open]')].map(details=>details.id?`#${CSS.escape(details.id)}`:details.classList.contains('past-departures-fold')?'.past-departures-fold':null).filter(Boolean);
}

// A newer version of the site is online: the page reloads itself (only when the pilot is not busy), so a
// phone that keeps the page open does not stay on the old one.
const build=document.querySelector('meta[name="em-build"]')?.content;
async function newVersionOnline(){
  if(!build)return false;
  try{
    const response=await fetch('/front/version.json',{cache:'no-store'});
    const online=response.ok?(await response.json()).build:build;
    if(online===build)return false;
    // Never twice for the same version (a page still served old would reload in a loop).
    if(sessionStorage.getItem('em_reloaded_for')===online)return false;
    sessionStorage.setItem('em_reloaded_for',online);
    return true;
  }catch{return false;}
}

async function refreshInBackground(refresh){
  if(running||document.hidden||isIdle()||pilotIsBusy())return;
  running=true;
  if(await newVersionOnline()&&!pilotIsBusy()){location.reload();return;}
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
  const catchUp=()=>{if(!document.hidden&&Date.now()-lastRefresh>STALE_AFTER_MS)refreshInBackground(refresh);};
  document.addEventListener('visibilitychange',catchUp);
  onWake(catchUp);
}
