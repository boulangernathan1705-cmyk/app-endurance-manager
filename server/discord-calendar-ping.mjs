// « Prévenir @everyone du calendrier ? » (Discord setting, TDZ 2026-11-23): once a week, on the day and at the hour the
// admins chose (Paris), a short @everyone message under the week's calendar, linking to it. The calendar itself stays
// silent (edited in place); last week's ping is deleted. layout.calendarPing = {day:1 (Monday) … 7 (Sunday), time:'HH:MM', from}.
import {discordRequest} from './recap-discord.mjs';
import {parseLayout} from './discord-layout.mjs';
import {effectivePermissions} from './discord-permissions.mjs';
import {communityById} from './community.mjs';
import {communityAdmins} from './access.mjs';
import {notify} from './notifications.mjs';
import {parisDay} from './discord-weekly-format.mjs';

const EVERYONE = 131072n, MINUTE = 60000;
// A pass missed (Discord busy, deploy): still sent within the next two hours, never later.
const WINDOW = 120;
const WEEKDAYS = {Mon:1, Tue:2, Wed:3, Thu:4, Fri:5, Sat:6, Sun:7};
const clock = new Intl.DateTimeFormat('en-GB', {timeZone:'Europe/Paris', weekday:'short', hour:'2-digit', minute:'2-digit', hourCycle:'h23'});

export const calendarPing = settings => settings?.enabled === 0 ? null : parseLayout(settings?.layout)?.calendarPing || null;

// The Paris day (YYYY-MM-DD) whose ping is due at `timestamp`, or '' (not the day, not yet, too late, or turned on after).
export function calendarPingDue(ping, timestamp, done = '') {
  if (!ping) return '';
  const parts = Object.fromEntries(clock.formatToParts(timestamp).map(part => [part.type, part.value]));
  const minutes = Number(parts.hour) * 60 + Number(parts.minute), [hour, minute] = ping.time.split(':').map(Number), at = hour * 60 + minute;
  if (WEEKDAYS[parts.weekday] !== ping.day || minutes < at || minutes >= at + WINDOW) return '';
  if (Number(ping.from || 0) > timestamp - (minutes - at + 1) * MINUTE) return '';
  const day = parisDay(timestamp);
  return day === done ? '' : day;
}

// Every 2 minutes (server/worker-with-migrations.mjs): the first community whose ping is due. true when Discord was asked.
export async function syncCalendarPings(env, timestamp = Date.now()) {
  if (!env?.DB || !env.DISCORD_BOT_TOKEN) return false;
  const rows = (await env.DB.prepare(`SELECT * FROM community_recap_settings WHERE enabled=1 AND layout LIKE '%"calendarPing":%'`).all()).results || [];
  for (const settings of rows) {
    const day = calendarPingDue(calendarPing(settings), timestamp, settings.calendar_ping_day);
    if (!day) continue;
    const calendar = await env.DB.prepare("SELECT channel_id,message_id FROM discord_recap_publications WHERE community_id=? AND event_id LIKE 'week:calendar%' AND channel_id IS NOT NULL AND message_id IS NOT NULL AND closed_at IS NULL ORDER BY event_id LIMIT 1")
      .bind(settings.community_id).first();
    // No calendar on the server (yet): looked at again on the next pass, within the window.
    if (!calendar) continue;
    const community = await communityById(env, settings.community_id);
    if (!community?.discordGuildId) continue;
    try { await pingCommunity(env, community, settings, calendar, day); }
    catch (error) { console.error('Discord calendar ping failed', community.slug, error instanceof Error ? error.message : 'unknown'); }
    return true;
  }
  return false;
}

async function pingCommunity(env, community, settings, calendar, day) {
  const budget = {left:6}, guild = community.discordGuildId, channel = calendar.channel_id;
  // Marked first: an ambiguous answer from Discord never makes a second @everyone.
  await env.DB.prepare('UPDATE community_recap_settings SET calendar_ping_day=? WHERE community_id=?').bind(day, community.id).run();
  const [place, roles, member] = await Promise.all([
    discordRequest(env, 'GET', `/channels/${channel}`, null, budget), discordRequest(env, 'GET', `/guilds/${guild}/roles`, null, budget),
    discordRequest(env, 'GET', `/guilds/${guild}/members/${env.DISCORD_CLIENT_ID}`, null, budget)]);
  // Without « Mentionner @everyone » Discord would send the message without notifying anyone: the admins are told instead.
  if (!(effectivePermissions(roles, member, guild, place, env.DISCORD_CLIENT_ID) & EVERYONE)) {
    await notify(env, await communityAdmins(env, community), 'discord_error', {id:null, name:'', community_id:community.id},
      {rights:true, message:`« Mentionner @everyone » dans # ${place.name || 'calendrier'}, pour prévenir du calendrier. Réinvite-le depuis Administration → Discord.`});
    return;
  }
  if (settings.calendar_ping_message && settings.calendar_ping_channel)
    await discordRequest(env, 'DELETE', `/channels/${settings.calendar_ping_channel}/messages/${settings.calendar_ping_message}`, null, budget).catch(error => { if (error.status !== 404) throw error; });
  const sent = await discordRequest(env, 'POST', `/channels/${channel}/messages`,
    {content:`@everyone 📅 Le calendrier de la semaine est à jour : https://discord.com/channels/${guild}/${channel}/${calendar.message_id}`, allowed_mentions:{parse:['everyone']}}, budget);
  await env.DB.prepare('UPDATE community_recap_settings SET calendar_ping_channel=?,calendar_ping_message=? WHERE community_id=?').bind(channel, sent.id, community.id).run();
}
