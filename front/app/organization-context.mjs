const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

export function sameOrganization(item,organizationId){
  return (item?.organizationId||null)===(organizationId||null);
}

export function scopeDeparture(departure,organizationId){
  if(!departure)return departure;
  return {
    ...departure,
    availability:(departure.availability||[]).filter(item=>sameOrganization(item,organizationId)),
    crews:(departure.crews||[]).filter(item=>sameOrganization(item,organizationId))
  };
}

export function scopeEvent(event,organizationId){
  if(!event)return event;
  return {...event,departures:(event.departures||[]).map(departure=>scopeDeparture(departure,organizationId))};
}

export function joinedOrganizations(organizations={}){
  const values=[];
  if(organizations.team)values.push(organizations.team);
  values.push(...(organizations.communities||[]));
  return values;
}

export function organizationById(organizations,organizationId){
  if(!organizationId)return null;
  return joinedOrganizations(organizations).find(item=>item.id===organizationId)||null;
}

export function organizationLabel(organizations,organizationId){
  const organization=organizationById(organizations,organizationId);
  if(!organization)return'Endurance Manager · général';
  return `${organization.type==='team'?'Team':'Communauté'} · ${organization.name}`;
}

export function organizationShortLabel(organizations,organizationId){
  const organization=organizationById(organizations,organizationId);
  if(!organization)return'Général';
  return `${organization.type==='team'?'🔒':'🌐'} ${organization.name}`;
}

export function organizationChoices(organizations={},{includeGeneral=true}={}){
  const choices=[];
  if(includeGeneral)choices.push({id:'',type:'general',name:'Endurance Manager · général'});
  if(organizations.team)choices.push({id:organizations.team.id,type:'team',name:`🔒 ${organizations.team.name} · Ma Team`});
  for(const community of organizations.communities||[])choices.push({id:community.id,type:'community',name:`🌐 ${community.name} · Communauté`});
  return choices;
}

export function organizationContextMarkup(state,{compact=false}={}){
  if(!state?.user)return'';
  const choices=organizationChoices(state.organizations);
  const selected=state.selectedOrganizationId||'';
  return `<section class="organization-context ${compact?'is-compact':''}" aria-label="Organisation de la participation"><div class="organization-context-copy"><span>ORGANISATION</span><strong>${esc(organizationShortLabel(state.organizations,state.selectedOrganizationId))}</strong>${compact?'':'<small>Choisis avec quel groupe tu organises cette participation. L’événement officiel reste le même.</small>'}</div><label><span class="sr-only">Organisation</span><select name="organizationContext">${choices.map(choice=>`<option value="${esc(choice.id)}" ${choice.id===selected?'selected':''}>${esc(choice.name)}</option>`).join('')}</select></label></section>`;
}

export function defaultOrganizationId(organizations={}){
  return organizations.team?.id||(organizations.communities||[])[0]?.id||null;
}

export function hasOrganization(organizations,id){
  return !id||joinedOrganizations(organizations).some(item=>item.id===id);
}
