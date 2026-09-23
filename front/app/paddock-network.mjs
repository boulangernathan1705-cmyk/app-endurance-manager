import {state} from './core.mjs';
import {renderEvent} from './event-view.mjs?v=16-community-branding';
import {organizationById} from './organization-context.mjs?v=6-community-context';

export function resetNetworkScope(){
  state.activeOrganizationId=state.activeCommunityId||null;
  state.visibleAudienceIds=new Set([state.activeCommunityId||'general']);
}
export function scopeNetworkTo(value){
  if(value==='general'||!value||value==='all'){state.activeOrganizationId=null;state.visibleAudienceIds=new Set(['general']);return;}
  const organization=organizationById(state.organizations,value);
  if(!organization){resetNetworkScope();return;}
  state.activeOrganizationId=organization.id;
  state.visibleAudienceIds=new Set([organization.id]);
}
function ensureScopeStillValid(){
  if(state.activeCommunityId){
    state.activeOrganizationId=state.activeCommunityId;
    state.visibleAudienceIds=new Set([state.activeCommunityId]);
    return;
  }
  if(state.activeOrganizationId&&!organizationById(state.organizations,state.activeOrganizationId))resetNetworkScope();
}
document.addEventListener('endurance:render',ensureScopeStillValid);
document.addEventListener('click',event=>{
  const core=event.target.closest?.('[data-action="home"],[data-action="my-entries"]');
  if(core)resetNetworkScope();
},true);
document.addEventListener('click',event=>{
  const scope=event.target.closest?.('[data-paddock-scope]');
  if(scope){event.preventDefault();scopeNetworkTo(scope.dataset.paddockScope);renderEvent();return;}
  const target=event.target.closest?.('[data-network-event]');
  if(!target)return;
  event.preventDefault();scopeNetworkTo(target.dataset.organizationId||'general');
  state.currentEventId=target.dataset.eventId;state.selectedDepartureId=target.dataset.departureId||null;
  state.registrationOpen.clear();state.drafts={};renderEvent();
});
