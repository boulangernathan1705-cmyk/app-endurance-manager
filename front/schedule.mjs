export function countdown(timestamp) {
  const seconds=Math.max(0,Math.floor((timestamp-Date.now())/1000));
  if (!seconds) return 'Départ passé';
  const days=Math.floor(seconds/86400),hours=Math.floor(seconds%86400/3600),minutes=Math.floor(seconds%3600/60);
  return days?`${days}j ${hours}h ${minutes}m`:`${hours}h ${minutes}m ${seconds%60}s`;
}
export function dateLabel(departure) { return new Intl.DateTimeFormat('fr-FR',{timeZone:'Europe/Paris',dateStyle:'full'}).format(new Date(departure.startsAt)); }
export function parisCalendar(timestamp) {
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(timestamp));
  const value=type=>Number(parts.find(part=>part.type===type).value);
  return {year:value('year'),month:value('month'),day:Date.UTC(value('year'),value('month')-1,value('day'))};
}
export function eventSchedule(event,now) {
  const departures=[...event.departures].filter(d=>Number.isFinite(d.startsAt)).sort((a,b)=>a.startsAt-b.startsAt);
  const duration=(event.durationHours||6)*3600000;
  const next=departures.find(d=>d.startsAt>now);
  const running=departures.find(d=>d.startsAt<=now&&d.startsAt+duration>now);
  const end=departures.length?departures[departures.length-1].startsAt+duration:null;
  return {event,next,running,end,archived:end!==null&&end<=now,timestamp:running?.startsAt??next?.startsAt??end};
}
export function groupEvents(source,filter,now=Date.now()) {
  const today=parisCalendar(now);
  const monday=today.day-((new Date(today.day).getUTCDay()+6)%7)*86400000;
  const monthLabel=timestamp=>new Intl.DateTimeFormat('fr-FR',{timeZone:'Europe/Paris',month:'long',...(parisCalendar(timestamp).year!==today.year?{year:'numeric'}:{})}).format(new Date(timestamp));
  const items=source.map(event=>eventSchedule(event,now)).filter(item=>filter==='archived'?item.archived:!item.archived);
  items.sort((a,b)=>filter==='archived'?b.end-a.end:Number(!!b.running)-Number(!!a.running)||(a.timestamp??Infinity)-(b.timestamp??Infinity)||a.event.name.localeCompare(b.event.name,'fr'));
  const groups=new Map();
  for(const item of items){
    let key,label;
    if(item.timestamp===null){key='undated';label='Dates à confirmer';}
    else {
      const date=parisCalendar(item.timestamp);
      key=`${date.year}-${date.month}`;
      if(filter==='archived')label=monthLabel(item.timestamp);
      else if(item.running){key='running';label='En cours';}
      else if(date.day<monday+7*86400000){key='this-week';label='Cette semaine';}
      else if(date.day<monday+14*86400000){key='next-week';label='La semaine prochaine';}
      else label=`${date.year===today.year&&date.month===today.month?'Plus tard en ':''}${monthLabel(item.timestamp)}`;
    }
    if(!groups.has(key))groups.set(key,{key,label,items:[]});
    groups.get(key).items.push(item);
  }
  return [...groups.values()];
}
