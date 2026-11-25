import {allCommunities} from './community.mjs';
import {CALENDAR_FORMAT, lastWeekTurn} from './discord-weekly-format.mjs';
import {syncBotRecaps, botRecapSettings} from './recap-discord.mjs';

export {flattenDepartures, loadCalendarSnapshot, loadWeeklyDiscordSnapshot, siteOf} from './discord-weekly-snapshot.mjs';

// Mutations and scheduled jobs use the same bot publications in both modes.
// eventId: the race just changed, published first.
export async function syncWeeklyDiscord(env,timestamp=Date.now(),community=null,eventId=null) {
  if (!env?.DB) return {ok:false,skipped:'not-configured'};
  let result={ok:true};
  for (const target of community ? [community] : await allCommunities(env)) {
    if (!await botRecapSettings(env,target)) continue;
    try { result=await syncBotRecaps(env,timestamp,target,false,eventId); }
    catch (error) { result={ok:false,error:error.message};console.error('Discord recap sync failed',target.slug,error.message); }
  }
  return result;
}

// pending: only a community with work left from its last pass (a new setting takes several), never one in error.
// then: what follows the pass for that community (its crews' voices).
export async function syncDueRecaps(env,limit=3,timestamp=Date.now(),{pending=false,then=null}={}) {
  if (!env?.DB || limit < 1) return 0;
  // Pending: a change on the site (dirty), an old calendar format, or a community not looked at since the week turned
  // (Monday 7h30, Paris): its calendar, week messages and finished race threads change with the time alone, not with a
  // change on the site, so they would otherwise wait for its hourly turn (up to 4 hours with 4 communities, 2026-11-02).
  // The calendar predicates match the partial index added by migration 0103.
  const statement=env.DB.prepare(`SELECT community_id,checked_at FROM community_recap_settings ${pending ? `WHERE last_error IS NULL AND (dirty=1 OR (enabled=1 AND checked_at<?) OR (enabled=1 AND EXISTS (SELECT 1 FROM discord_recap_publications p WHERE p.community_id=community_recap_settings.community_id AND p.closed_at IS NULL AND p.event_id LIKE 'week:calendar%' AND p.message_id IS NOT NULL AND p.content_hash NOT LIKE '${CALENDAR_FORMAT}%')))` : ''} ORDER BY checked_at,community_id`);
  const rows=(await (pending ? statement.bind(lastWeekTurn(timestamp)) : statement).all()).results || [];
  if (!rows.length) return 0;
  const communities=await allCommunities(env);
  for (const row of rows) {
    const community=communities.find(item=>item.id===row.community_id);
    if (!community) continue;
    // One bot batch uses the remaining invocation budget, including channel cleanup.
    try { await syncBotRecaps(env,timestamp,community);if(then)await then(community);return 1; }
    catch (error) { console.error('Discord recap sync failed',error.message);return 0; }
  }
  return 0;
}

