export function rememberDepartureForCrewAction(state,target){
  const action=target?.dataset?.action;
  const departureId=target?.dataset?.departure;
  if(!departureId||!['join-crew','leave-crew'].includes(action))return false;
  state.selectedDepartureId=departureId;
  return true;
}

export function installCrewDepartureOpenState(state,root=globalThis.document){
  if(!root?.addEventListener)return;
  root.addEventListener('click',event=>{
    const target=event.target?.closest?.('[data-action]');
    rememberDepartureForCrewAction(state,target);
  },true);
}
