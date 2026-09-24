import {state} from './core.mjs?v=11-community-navigation';

export function resetNetworkScope(){
  state.activeOrganizationId=state.activeCommunityId||null;
  state.visibleAudienceIds=new Set([state.activeCommunityId||'general']);
}
function ensureScopeStillValid(){
  if(state.activeCommunityId){
    state.activeOrganizationId=state.activeCommunityId;
    state.visibleAudienceIds=new Set([state.activeCommunityId]);
    return;
  }
  if(state.activeOrganizationId!==null)resetNetworkScope();
}
document.addEventListener('endurance:render',ensureScopeStillValid);
document.addEventListener('click',event=>{
  const core=event.target.closest?.('[data-action="home"],[data-action="my-entries"]');
  if(core)resetNetworkScope();
},true);
