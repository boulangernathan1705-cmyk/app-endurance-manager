export const entryCommunityId=(item,fallback='')=>item?.community?.id||item?.communityId||fallback;

// Never discard the full event: filtering is only a view, not an authorization or a mutation.
export function filterEventCommunities(event,chosen=[],communityId=''){
  if(!event?.official||!chosen.length)return event;
  const keep=item=>chosen.includes(entryCommunityId(item,communityId));
  return {...event,absences:(event.absences||[]).filter(keep),departures:(event.departures||[]).map(departure=>({...departure,
    availability:(departure.availability||[]).filter(keep),crews:(departure.crews||[]).filter(keep)}))};
}
export function eventCommunities(event,communities=[],current=null){
  const present=new Map();
  if(!event?.official)return present;
  for(const community of [...communities,current].filter(Boolean))if(community.id)present.set(community.id,{community,pilots:new Set()});
  for(const departure of event.departures||[])for(const item of [...(departure.availability||[]),...(departure.crews||[])]){
    const id=entryCommunityId(item,current?.id),community=item.community||present.get(id)?.community;
    if(!id||!community)continue;
    if(!present.has(id))present.set(id,{community,pilots:new Set()});
    if(item.status!==undefined&&item.status!=='unavailable')present.get(id).pilots.add(item.participantId||item.id);
  }
  return present;
}
