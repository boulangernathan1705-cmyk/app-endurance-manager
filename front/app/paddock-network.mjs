import {state} from './core.mjs';
import {renderEvent} from './event-view.mjs?v=14-community-directory';
import {allAudienceIds,organizationById} from './organization-context.mjs?v=5-community-directory';

export function resetNetworkScope(){
  state.activeOrganizationId=null;
  state.visibleAudienceIds=allAudienceIds(state.organizations||{});
  try{localStorage.removeItem('endurance_audience_filter');}catch{}
}
export function scopeNetworkTo(value){
  if(value==='all'){resetNetworkScope();return;}
  if(value==='general'||!value){state.activeOrganizationId=null;state.visibleAudienceIds=new Set(['general']);return;}
  const organization=organizationById(state.organizations,value);
  if(!organization){resetNetworkScope();return;}
  state.activeOrganizationId=organization.id;
  state.visibleAudienceIds=new Set([organization.id]);
}
function ensureScopeStillValid(){
  if(!state.activeOrganizationId)return;
  if(!organizationById(state.organizations,state.activeOrganizationId))resetNetworkScope();
}
document.addEventListener('endurance:render',ensureScopeStillValid);
document.addEventListener('click',event=>{
  const core=event.target.closest?.('[data-action="home"],[data-action="my-entries"],[data-action="communities"]');
  if(core)resetNetworkScope();
},true);
document.addEventListener('click',event=>{
  const scope=event.target.closest?.('[data-paddock-scope]');
  if(scope){event.preventDefault();scopeNetworkTo(scope.dataset.paddockScope);renderEvent();return;}
  const target=event.target.closest?.('[data-network-event]');
  if(!target)return;
  event.preventDefault();scopeNetworkTo(target.dataset.organizationId||'all');
  state.currentEventId=target.dataset.eventId;state.selectedDepartureId=target.dataset.departureId||null;
  state.registrationOpen.clear();state.drafts={};renderEvent();
});
queueMicrotask(resetNetworkScope);
