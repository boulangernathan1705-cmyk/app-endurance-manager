// « Diagnostic Discord » (admin page, Discord section): what the bot should have made now, what it has noted as made,
// and what is waiting. Read from the database only; with live, two Discord requests check that the threads and voices
// are still there.
import {botRecapSettings, expectedRaceThreads, scopeOf, discordRequest} from './recap-discord.mjs';
import {raceWeekOpen, parisDay} from './discord-weekly-format.mjs';
import {raceFinishAt} from '../shared/duration.mjs';

const parse = (value, fallback) => { try { return JSON.parse(value) ?? fallback; } catch { return fallback; } };
const sim = circuit => String(circuit || '').startsWith('iracing-') ? 'iracing' : 'lmu';
const minutesOf = row => Number(row.duration_minutes) || (Number(row.duration_hours) || 0) * 60;
const firstStart = (event, timestamp) => Math.min(...parse(event.departures, [])
  .filter(item => !item.tbd && Number.isFinite(Number(item.startsAt)) && raceFinishAt(item.startsAt, minutesOf(event)) > timestamp)
  .map(item => Number(item.startsAt)));
// LMU first, then iRacing, each by start (as on Discord).
const order = (a, b) => (a.sim === b.sim ? 0 : a.sim === 'lmu' ? -1 : 1) || a.startsAt - b.startsAt || a.name.localeCompare(b.name);

// The crews whose voice should be open now: their start this week (Monday rule) and not over yet.
async function expectedCrews(env, community, timestamp) {
  const rows = (await env.DB.prepare(`SELECT c.id,c.name,c.departure_id,e.id AS event_id,e.name AS event_name,e.circuit,e.departures,e.duration_hours,e.duration_minutes,
      d.voice_id,d.closed_at,d.created_at
    FROM crews c JOIN events e ON e.id=c.event_id LEFT JOIN crew_discord d ON d.crew_id=c.id
    WHERE c.community_id=? AND e.schedule_pending=0`).bind(community.id).all()).results || [];
  return rows.map(row => {
    const start = parse(row.departures, []).find(item => item?.id === row.departure_id), startsAt = Number(start?.startsAt);
    if (!start || start.tbd || !Number.isFinite(startsAt) || raceFinishAt(startsAt, minutesOf(row)) <= timestamp || !raceWeekOpen(startsAt, timestamp)) return null;
    return {id:row.id, name:String(row.name || 'Équipage'), race:String(row.event_name || 'Endurance'), eventId:row.event_id, sim:sim(row.circuit), startsAt,
      channelId:row.closed_at ? '' : row.voice_id || ''};
  }).filter(Boolean).sort((a, b) => order({...a, name:a.race}, {...b, name:b.race}) || a.name.localeCompare(b.name));
}

// state: 'ok' (made, and found on Discord when checked), 'waiting' (not made yet), 'missing' (made, not found).
const stateOf = (channelId, found) => !channelId ? 'waiting' : found && !found.has(channelId) ? 'missing' : 'ok';

export async function discordDiagnostic(env, community, {timestamp = Date.now(), live = false} = {}) {
  const settings = await botRecapSettings(env, community), crewSetting = await env.DB.prepare('SELECT * FROM community_crew_discord WHERE community_id=?').bind(community.id).first();
  const recapOn = Boolean(settings && settings.enabled !== 0 && scopeOf(settings)), voicesOn = community.modules?.crewChannels === true && Boolean(crewSetting);
  const sameServer = Boolean(settings?.guild_id) && settings.guild_id === community.discordGuildId;
  let found = null, liveError = '';
  if (live && community.discordGuildId && (recapOn || voicesOn)) {
    try {
      const budget = {left:2};
      const channels = await discordRequest(env, 'GET', `/guilds/${community.discordGuildId}/channels`, null, budget);
      const active = await discordRequest(env, 'GET', `/guilds/${community.discordGuildId}/threads/active`, null, budget);
      found = new Set([...(Array.isArray(channels) ? channels : []), ...(active?.threads || [])].map(item => String(item.id)));
    } catch (error) {
      liveError = error?.status === 403 || error?.status === 404 ? 'Le bot ne voit plus le serveur Discord.' : 'Discord n’a pas répondu, réessaie dans un instant.';
    }
  }
  const publications = new Map(((await env.DB.prepare('SELECT event_id,channel_id,closed_at FROM discord_recap_publications WHERE community_id=?').bind(community.id).all()).results || [])
    .map(row => [row.event_id, row]));
  const threads = !recapOn || !sameServer ? [] : (await expectedRaceThreads(env, community, settings, timestamp)).map(event => {
    const row = publications.get(event.id), channelId = row && !row.closed_at ? row.channel_id || '' : '';
    return {id:event.id, name:String(event.name || 'Endurance'), sim:sim(event.circuit), startsAt:firstStart(event, timestamp), state:stateOf(channelId, found)};
  }).sort(order);
  const voices = !voicesOn ? [] : (await expectedCrews(env, community, timestamp)).map(({channelId, ...crew}) => ({...crew, state:stateOf(channelId, found)}));
  const pending = await env.DB.prepare('SELECT queued_at FROM discord_pending WHERE community_id=?').bind(community.id).first();
  const day = parisDay(timestamp);
  const intro = await env.DB.prepare("SELECT message_id,checked_at FROM discord_announcements WHERE community_id=? AND day=? AND item='intro'").bind(community.id, day).first();
  const announced = (await env.DB.prepare("SELECT COUNT(*) AS n FROM discord_announcements WHERE community_id=? AND day=? AND kind IN ('race','event','stream')").bind(community.id, day).first())?.n || 0;
  return {
    checkedLive:Boolean(found), liveError,
    recap:{on:recapOn, sameServer, lastPass:Number(settings?.checked_at || 0), error:settings?.last_error || '', waiting:Boolean(pending) || settings?.dirty === 1},
    voices:{on:voicesOn, error:crewSetting?.last_error || ''},
    announcement:{posted:Boolean(intro?.message_id && intro.message_id !== '-'), items:Number(announced), lastPass:Number(intro?.checked_at || 0)},
    threads, crews:voices,
  };
}
