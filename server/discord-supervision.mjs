// Platform-wide snapshot: a fixed number of database reads, zero Discord requests, no mutations.
import {allCommunities} from './community.mjs';
import {eventDeletionTime} from './recap-discord.mjs';
import {parseLayout} from './discord-layout.mjs';
import {raceWeekOpen} from './discord-weekly-format.mjs';
import {raceFinishAt} from '../shared/duration.mjs';
import {isDevelopment} from './dev-environment.mjs';

const HOUR = 3600000, GRACE = 15*60000;
const parse = value => { try { const list=JSON.parse(value); return Array.isArray(list)?list:[]; } catch { return []; } };
const startOf = row => {
  if (row.schedule_pending) return null;
  const start=parse(row.departures).find(item=>item && item.id===row.departure_id && !item.tbd);
  const at=Number(start?.startsAt), minutes=Number(row.duration_minutes)||Number(row.duration_hours)*60;
  return at>0 && Number.isFinite(at) && minutes>0 && Number.isFinite(minutes) ? {at,end:raceFinishAt(at,minutes)} : null;
};
export async function discordSupervision(env,timestamp=Date.now()) {
  const all=async sql=>(await env.DB.prepare(sql).all()).results||[];
  const [communities,settings,publications,crews,orphans]=await Promise.all([
    allCommunities(env),
    all(`SELECT c.id AS community_id,s.enabled,s.checked_at AS recap_checked,s.last_error AS recap_error,s.dirty,s.guild_id,s.layout,
      v.community_id AS voice_setting,v.last_error AS voice_error,v.last_error_at,
      p.queued_at,(SELECT MAX(d.checked_at) FROM crew_discord d WHERE d.community_id=c.id) AS voice_checked
      FROM communities c LEFT JOIN community_recap_settings s ON s.community_id=c.id
      LEFT JOIN community_crew_discord v ON v.community_id=c.id LEFT JOIN discord_pending p ON p.community_id=c.id`),
    all(`SELECT p.community_id,p.event_id,p.channel_id,p.category_id,p.delete_after,p.checked_at,
      e.id AS current_event_id,e.name,e.departures,e.duration_hours,e.duration_minutes,e.schedule_pending
      FROM discord_recap_publications p LEFT JOIN events e ON e.id=p.event_id
      WHERE p.closed_at IS NULL AND p.event_id NOT LIKE 'week:%' AND p.event_id<>''`),
    all(`SELECT c.id,c.community_id,c.name,c.departure_id,c.created_at,e.name AS race,e.circuit,e.departures,e.duration_hours,e.duration_minutes,e.schedule_pending,
      d.voice_id,d.closed_at,d.message_id,d.created_at AS tracked_at
      FROM crews c JOIN events e ON e.id=c.event_id LEFT JOIN crew_discord d ON d.crew_id=c.id`),
    all(`SELECT d.community_id,COUNT(*) AS n FROM crew_discord d LEFT JOIN crews c ON c.id=d.crew_id
      WHERE (d.voice_id IS NOT NULL OR d.text_id IS NOT NULL OR d.category_id IS NOT NULL)
      AND (c.id IS NULL OR d.closed_at IS NOT NULL) GROUP BY d.community_id`),
  ]);
  const byId=new Map(settings.map(row=>[row.community_id,row]));
  const rows=communities.filter(c=>c.discordGuildId).map(c=>{
    const s=byId.get(c.id)||{}, recapOn=s.enabled===1, voicesOn=c.modules?.crewChannels===true && Boolean(s.voice_setting);
    const configured=recapOn||voicesOn;
    const queueAt=Number(s.queued_at)||0, lastRecap=Number(s.recap_checked)||0, lastVoice=Number(s.voice_checked)||0;
    const issues=[], errors=[s.recap_error,s.voice_error].filter(Boolean);
    const add=(kind,name,since)=>issues.push({kind,name:String(name||'Sans nom'),since:Number(since)||0});
    const simFilter=parseLayout(s.layout)?.sims;
    let openThreads=0, openVoices=0, waitingVoices=0, overdueThreads=0, overdueVoices=0, incompleteVoices=0;
    for(const p of publications.filter(p=>p.community_id===c.id)){
      if(!p.channel_id&&!p.category_id)continue;
      openThreads++;
      const expiry=p.current_event_id?eventDeletionTime(p):p.delete_after;
      if(expiry!=null && Number(expiry)<=timestamp-GRACE){overdueThreads++;add('thread',p.name||p.event_id,expiry);}
    }
    for(const row of crews.filter(row=>row.community_id===c.id)){
      const start=startOf(row), game=String(row.circuit||'').startsWith('iracing-')?'iracing':'lmu';
      const voice=Boolean(row.voice_id&&!row.closed_at);
      if(voice)openVoices++;
      if(voice&&start&&timestamp>=start.end+2*HOUR+GRACE){overdueVoices++;add('voice-close',row.name,start.end+2*HOUR);}
      const expected=voicesOn&&start&&(!simFilter||simFilter==='all'||simFilter===game)&&raceWeekOpen(start.at,timestamp)&&timestamp<start.end;
      if(expected&&!voice){waitingVoices++;add('voice-create',row.name,Number(row.tracked_at)||0);}
      else if(expected&&voice&&!row.message_id){incompleteVoices++;add('voice-message',row.name,Number(row.tracked_at)||0);}
    }
    const orphanCount=Number(orphans.find(o=>o.community_id===c.id)?.n)||0;
    const warnings=Number(Boolean(queueAt&&timestamp-queueAt>GRACE))+Number(Boolean(recapOn&&(!lastRecap||timestamp-lastRecap>4*HOUR)))+
      Number(Boolean(recapOn&&s.guild_id!==c.discordGuildId))+overdueThreads+overdueVoices+waitingVoices+incompleteVoices+orphanCount;
    return {slug:c.slug,name:c.name,recapOn,voicesOn,lastRecap,lastVoice,queueAt,dirty:Boolean(s.dirty),wrongServer:recapOn&&s.guild_id!==c.discordGuildId,
      openThreads,openVoices,waitingVoices,overdueThreads,overdueVoices,incompleteVoices,orphanCount,errors,
      state:errors.length?'error':warnings?'attention':configured?'recorded':'off',
      issues:issues.sort((a,b)=>a.since-b.since).slice(0,12),issueCount:issues.length};
  });
  return {generatedAt:timestamp,development:isDevelopment(env),botConfigured:Boolean(String(env.DISCORD_BOT_TOKEN||'').trim()),communities:rows};
}
