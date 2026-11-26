// Compare the source with its last accepted snapshot, never infer an administrator's intent.
import {id} from './core.mjs';
import {notify, eventPilots} from './notifications.mjs';

const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const future=(starts,at)=>starts.filter(t=>t>at);
const sorted=values=>[...new Set(values)].sort((a,b)=>a-b);
export function sourceSnapshot(data){
  return {name:data.name,circuit:data.circuit,durationMinutes:data.durationMinutes,categories:data.categories,rounds:data.rounds,
    starts:sorted(data.departures.filter(d=>!d.tbd).map(d=>d.startsAt))};
}
function savedSnapshot(row){
  return sourceSnapshot({name:row.name,circuit:row.circuit,durationMinutes:Number(row.duration_minutes)||Number(row.duration_hours)*60,
    categories:JSON.parse(row.categories),rounds:JSON.parse(row.rounds||'[]'),departures:JSON.parse(row.departures)});
}
// The first pass records a baseline, not a blind overwrite. Only an explicit source change
// after that pass is eligible; any diverging local field remains protected.
export function compareSource(row,data,baseline,at,{special=false}={}){
  const next=sourceSnapshot(data), current=savedSnapshot(row);
  if(!baseline)return {baseline:next,changes:[],conflicts:[],initial:true};
  const changes=[], conflicts=[], accepted={...baseline};
  for(const field of ['name','circuit','durationMinutes','categories','rounds',...(special?[]:['starts'])]){
    const before=field==='starts'?future(baseline.starts||[],at):baseline[field];
    const incoming=field==='starts'?future(next.starts,at):next[field];
    const local=field==='starts'?future(current.starts,at):current[field];
    if(equal(before,incoming))continue;
    if(equal(local,incoming)){accepted[field]=next[field];continue;}
    if(!equal(local,before)){conflicts.push(field);continue;}
    changes.push(field);accepted[field]=next[field];
  }
  return {baseline:accepted,changes,conflicts,initial:false,next};
}

// Preserve IDs of unchanged starts and all historical starts. A removed future start is
// not automatically reassigned to a different time: occupied races require explicit review.
export function reconcileStarts(existing,incoming,at){
  const byTime=new Map(existing.filter(d=>!d.tbd).map(d=>[d.startsAt,d]));
  return [...existing.filter(d=>d.tbd||d.startsAt<=at),...incoming.filter(d=>!d.tbd&&d.startsAt>at).map(d=>byTime.get(d.startsAt)||{...d,id:id()})]
    .sort((a,b)=>a.startsAt-b.startsAt||Number(Boolean(b.tbd))-Number(Boolean(a.tbd)));
}

export async function synchronizeKnown(env,row,data,at,{special=false}={}){
  const baseline=row.source_snapshot?JSON.parse(row.source_snapshot):null;
  const diff=compareSource(row,data,baseline,at,{special});
  const store=next=>env.DB.prepare('UPDATE iracing_imports SET source_snapshot=? WHERE community_id=? AND external_id=? AND source_snapshot IS ?')
    .bind(JSON.stringify(next),'official',row.external_id,row.source_snapshot??null);
  if(diff.initial){await store(diff.baseline).run();return {initialized:1};}
  if(!diff.changes.length){
    if(!equal(baseline,diff.baseline))await store(diff.baseline).run();
    return {conflicts:diff.conflicts.length?1:0};
  }
  const fields=new Set(diff.changes);
  const existing=JSON.parse(row.departures);
  const deps=fields.has('starts')?reconcileStarts(existing,data.departures,at):existing;
  const onlyAdditions=fields.size===1&&fields.has('starts')&&existing.every(d=>deps.some(n=>n.id===d.id));
  // Occupied races may gain starts, but no destructive or ambiguous change is applied automatically.
  // This check is part of the UPDATE, not a preceding query susceptible to a registration race.
  if(deps.length>30||!deps.length)return {conflicts:1};
  const update=env.DB.prepare(`UPDATE events SET name=?,circuit=?,duration_hours=?,duration_minutes=?,categories=?,rounds=?,departures=?,version=version+1
    WHERE id=? AND version=? AND EXISTS(SELECT 1 FROM iracing_imports WHERE community_id='official' AND external_id=? AND source_snapshot IS ?)
    AND (?=1 OR (NOT EXISTS(SELECT 1 FROM registrations WHERE event_id=events.id) AND NOT EXISTS(SELECT 1 FROM crews WHERE event_id=events.id)))`)
    .bind(fields.has('name')?data.name:row.name,fields.has('circuit')?data.circuit:row.circuit,
      fields.has('durationMinutes')?data.durationHours:row.duration_hours,fields.has('durationMinutes')?data.durationMinutes:row.duration_minutes,
      fields.has('categories')?JSON.stringify(data.categories):row.categories,fields.has('rounds')?JSON.stringify(data.rounds):row.rounds,
      JSON.stringify(deps),row.id,row.version,row.external_id,row.source_snapshot,onlyAdditions?1:0);
  const snapshot=env.DB.prepare('UPDATE iracing_imports SET source_snapshot=? WHERE community_id=? AND external_id=? AND source_snapshot IS ? AND changes()=1')
    .bind(JSON.stringify(diff.baseline),'official',row.external_id,row.source_snapshot);
  const result=await env.DB.batch([update,snapshot]);
  if(!result[0].meta.changes)return {conflicts:1};
  if(onlyAdditions)await notify(env,await eventPilots(env,row.id),'race_changed',row,{changes:['starts']});
  return {updated:1,conflicts:diff.conflicts.length?1:0};
}
