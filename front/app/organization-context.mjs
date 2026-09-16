export const GENERAL_AUDIENCE='general';

export function joinedOrganizations(organizations={}){
  const values=[];
  if(organizations.team)values.push(organizations.team);
  values.push(...(organizations.communities||[]));
  return values;
}

export function organizationById(organizations,organizationId){
  if(!organizationId||organizationId===GENERAL_AUDIENCE)return null;
  return joinedOrganizations(organizations).find(item=>item.id===organizationId)||null;
}

export function organizationShortLabel(organizations,organizationId){
  const organization=organizationById(organizations,organizationId);
  if(!organization)return'Général';
  return `${organization.type==='team'?'🔒':'🌐'} ${organization.name}`;
}

export function audienceChoices(organizations={}){
  const choices=[{key:GENERAL_AUDIENCE,id:GENERAL_AUDIENCE,type:'general',name:'Général',label:'Général'}];
  if(organizations.team)choices.push({key:organizations.team.id,id:organizations.team.id,type:'team',name:organizations.team.name,label:`🔒 ${organizations.team.name}`});
  for(const community of organizations.communities||[])choices.push({key:community.id,id:community.id,type:'community',name:community.name,label:`🌐 ${community.name}`});
  return choices;
}

export function organizationChoices(organizations={},{includeGeneral=true}={}){
  return audienceChoices(organizations).filter(choice=>includeGeneral||choice.type!=='general').map(choice=>({
    id:choice.type==='general'?'':choice.id,
    type:choice.type,
    name:choice.type==='general'?'Endurance Manager · Général':`${choice.type==='team'?'Team':'Communauté'} · ${choice.name}`
  }));
}

export function allAudienceIds(organizations={}){
  return new Set(audienceChoices(organizations).map(choice=>choice.key));
}

export function normalizeAudienceFilter(organizations={},value){
  const valid=allAudienceIds(organizations);
  const source=value instanceof Set?[...value]:Array.isArray(value)?value:typeof value==='string'?[value]:[];
  const result=new Set(source.map(item=>item||GENERAL_AUDIENCE).filter(item=>valid.has(item)));
  return result.size?result:valid;
}

export function registrationAudienceIds(registration){
  if(Array.isArray(registration?.audienceIds)&&registration.audienceIds.length)return [...new Set(registration.audienceIds.map(value=>value||GENERAL_AUDIENCE))];
  return [registration?.organizationId||GENERAL_AUDIENCE];
}

function filterSet(filter){
  if(filter instanceof Set)return filter.size?filter:new Set([GENERAL_AUDIENCE]);
  if(Array.isArray(filter))return new Set(filter.length?filter:[GENERAL_AUDIENCE]);
  return new Set([filter||GENERAL_AUDIENCE]);
}

export function scopeDeparture(departure,audiences){
  if(!departure)return departure;
  const visible=filterSet(audiences);
  return {
    ...departure,
    availability:(departure.availability||[]).filter(reg=>registrationAudienceIds(reg).some(key=>visible.has(key))),
    crews:(departure.crews||[]).filter(crew=>visible.has(crew.organizationId||GENERAL_AUDIENCE))
  };
}

export function scopeEvent(event,audiences){
  if(!event)return event;
  return {...event,departures:(event.departures||[]).map(departure=>scopeDeparture(departure,audiences))};
}

export function organizationAudienceLabels(organizations={},ids=[]){
  const wanted=new Set(ids);
  return audienceChoices(organizations).filter(choice=>wanted.has(choice.key)).map(choice=>choice.label);
}

export function defaultRegistrationAudienceIds(state){
  const selected=normalizeAudienceFilter(state?.organizations||{},state?.visibleAudienceIds);
  return selected.size===1?[...selected]:[GENERAL_AUDIENCE];
}

export function defaultCrewOrganizationId(state){
  const selected=normalizeAudienceFilter(state?.organizations||{},state?.visibleAudienceIds);
  if(selected.size!==1)return null;
  const key=[...selected][0];
  return key===GENERAL_AUDIENCE?null:key;
}
