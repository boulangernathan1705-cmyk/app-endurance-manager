// Text recaps configured explicitly by an admin. Legacy webhook publications remain independent.
import {loadWeeklyDiscordSnapshot, siteOf} from './discord-weekly.mjs';
import {buildWeeklyDiscordPayload} from './discord-weekly-format.mjs';

import {eventDeletionTime, courseCategory, closeCourseVoices} from './discord-course-space.mjs';
export {eventDeletionTime} from './discord-course-space.mjs';

const API = 'https://discord.com/api/v10';
const VIEW = 1024n, SEND = 2048n, HISTORY = 65536n, MANAGE = 16n, ADMIN = 8n;
const REQUIRED = VIEW | SEND | HISTORY;
export const RECAP_BOT_PERMISSIONS = String(REQUIRED | MANAGE);
export const botRecapSettings = (env, community) => env.DB.prepare('SELECT * FROM community_recap_settings WHERE community_id=?').bind(community.id).first();

export function recapError(error) {
  if (error.status === 429) return 'Discord limite les requêtes. Le récap réessaiera automatiquement.';
  if (error.status === 403) return 'Dans les permissions du salon ou de la catégorie, autorise le bot à Voir le salon, Envoyer des messages et Voir les anciens messages ; en mode par événement, ajoute Gérer les salons.';
  if (error.status === 404) return 'La destination Discord est introuvable. Choisis un salon texte ou une catégorie existante.';
  if (error.status === 401) return 'Le bot du site n’est pas disponible. Préviens le gestionnaire de la plateforme.';
  return 'Discord ne répond pas. Le récap réessaiera automatiquement.';
}
async function discord(env, method, path, body, budget = {left:12}) {
  if (!String(env.DISCORD_BOT_TOKEN || '').trim()) throw Object.assign(new Error('Le bot du site n’est pas configuré.'), {status:401});
  if (--budget.left < 0) throw new Error('Lot terminé ; les autres événements seront traités au prochain passage.');
  const response = await fetch(API + path, {method, signal:AbortSignal.timeout(8000),
    headers:{Authorization:`Bot ${env.DISCORD_BOT_TOKEN}`, ...(body ? {'Content-Type':'application/json'} : {})}, body:body ? JSON.stringify(body) : undefined});
  const data = response.status === 204 ? null : await response.json().catch(() => null);
  if (response.status === 429) budget.left = 0;
  if (!response.ok) throw Object.assign(new Error('Discord indisponible'), {status:response.status, code:data?.code});
  return data;
}
function effectivePermissions(roles, member, guildId, channel, clientId) {
  const ids = new Set([guildId, ...(member.roles || [])]);
  let rights = roles.filter(role => ids.has(role.id)).reduce((all, role) => all | BigInt(role.permissions || 0), 0n);
  if (rights & ADMIN) return ~0n;
  const overrides = channel.permission_overwrites || [];
  const apply = override => { if (override) rights = (rights & ~BigInt(override.deny || 0)) | BigInt(override.allow || 0); };
  apply(overrides.find(item => item.id === guildId));
  const roleOverrides = overrides.filter(item => item.type === 0 && item.id !== guildId && ids.has(item.id));
  const deny = roleOverrides.reduce((all, item) => all | BigInt(item.deny || 0), 0n);
  const allow = roleOverrides.reduce((all, item) => all | BigInt(item.allow || 0), 0n);
  rights = (rights & ~deny) | allow;
  apply(overrides.find(item => item.type === 1 && item.id === clientId));
  return rights;
}
export async function recapDestinations(env, community) {
  if (!community.discordGuildId || !env.DISCORD_CLIENT_ID) throw Object.assign(new Error('Relie le serveur de la communauté au bot.'), {status:401});
  const guild = community.discordGuildId;
  const [channels, roles, member] = await Promise.all([
    discord(env, 'GET', `/guilds/${guild}/channels`), discord(env, 'GET', `/guilds/${guild}/roles`),
    discord(env, 'GET', `/guilds/${guild}/members/${env.DISCORD_CLIENT_ID}`)]);
  if (!Array.isArray(channels) || !Array.isArray(roles) || !member) throw new Error('Réponse Discord invalide.');
  return channels.filter(channel => [0,4].includes(channel.type)).map(channel => {
    const rights = effectivePermissions(roles, member, guild, channel, env.DISCORD_CLIENT_ID);
    const required = REQUIRED | (channel.type === 4 ? MANAGE : 0n);
    return {id:channel.id, name:channel.name, type:channel.type, ready:(rights & required) === required,
      missing:[['Voir le salon',VIEW],['Envoyer des messages',SEND],['Voir les anciens messages',HISTORY], ...(channel.type === 4 ? [['Gérer les salons',MANAGE]] : [])].filter(([,bit]) => !(rights & bit)).map(([label]) => label)};
  });
}
export function recapInput(input) {
  if (!['general','events'].includes(input.mode) || !['all','lmu','iracing'].includes(input.scope) || !/^\d{15,22}$/.test(String(input.destinationId || '')))
    throw Object.assign(new Error('Choisis le mode, au moins un simulateur et une destination Discord.'), {status:400});
  const separate = input.mode === 'events' && input.scope === 'all' && input.iracingDestinationId;
  if (separate && !/^\d{15,22}$/.test(String(input.iracingDestinationId))) throw Object.assign(new Error('Choisis une catégorie iRacing valide.'), {status:400});
  return {mode:input.mode, scope:input.scope, destinationId:input.destinationId,destinationName:String(input.destinationName || '').slice(0,100),
    iracingDestinationId:separate ? input.iracingDestinationId : null,iracingDestinationName:separate ? String(input.iracingDestinationName || '').slice(0,100) : null};
}
export async function validateRecapDestination(env, community, input) {
  const settings = recapInput(input);
  const destinations = await recapDestinations(env, community);
  const destination = destinations.find(item => item.id === settings.destinationId && item.type === (settings.mode === 'events' ? 4 : 0));
  if (!destination) throw Object.assign(new Error('Choisis une destination sur le serveur Discord de cette communauté.'), {status:400});
  if (!destination.ready) throw Object.assign(new Error(`Dans les permissions de « ${destination.name} », autorise le bot : ${destination.missing.join(', ')}.`), {status:400});
  const iracing = settings.iracingDestinationId ? destinations.find(item => item.id === settings.iracingDestinationId && item.type === 4) : null;
  if (settings.iracingDestinationId && !iracing) throw Object.assign(new Error('Choisis une catégorie iRacing sur le serveur de cette communauté.'), {status:400});
  if (iracing && !iracing.ready) throw Object.assign(new Error(`Dans les permissions de « ${iracing.name} », autorise le bot : ${iracing.missing.join(', ')}.`), {status:400});
  return {...settings, destinationName:destination.name,iracingDestinationName:iracing?.name || null};
}
export function eventChannelName(name, eventId) {
  const slug = String(name).normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'') || 'endurance';
  // A stable short suffix makes homonymous races readable. The topic stores the complete identity.
  let hash = 2166136261;
  for (const char of String(eventId)) hash = Math.imul(hash ^ char.charCodeAt(0),16777619);
  const suffix = (hash >>> 0).toString(16).padStart(8,'0');
  return `${slug.slice(0, Math.max(1, 99 - suffix.length))}-${suffix}`.slice(0,100);
}
async function digest(value) {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(value))))].map(byte => byte.toString(16).padStart(2,'0')).join('');
}
async function snapshotPayload(env, timestamp, community, settings, eventId = null) {
  const snapshot = await loadWeeklyDiscordSnapshot(env, timestamp, community, settings.scope, eventId);
  const payload = buildWeeklyDiscordPayload(snapshot, siteOf(env, community), timestamp, settings.scope);
  // Message edits are silent; never turn driver names into mentions.
  payload.allowed_mentions = {parse:[]};
  return {snapshot, payload, hash:await digest(snapshot)};
}
export async function previewBotRecap(env, timestamp, community, settings) {
  if (settings.mode === 'general') {
    const {payload} = await snapshotPayload(env, timestamp, community, settings);
    return [{eventId:'', name:settings.destinationName || 'Salon texte choisi', payload}];
  }
  const snapshot = await loadWeeklyDiscordSnapshot(env, timestamp, community, settings.scope);
  const events = new Map([...snapshot.currentDepartures,...snapshot.futureDepartures].map(item => [item.eventId,item.eventName]));
  const previews = [];
  for (const [eventId,name] of [...events].slice(0,10)) {
    const {payload} = await snapshotPayload(env, timestamp, community, settings, eventId);
    previews.push({eventId,name:eventChannelName(name,eventId),payload});
  }
  return previews;
}
export async function saveBotRecap(env, community, settings, enabled = true, adopted = true) {
  // Configuration and synchronisation share the lock. A destination cannot change during a publication.
  const token = crypto.randomUUID(), now = Date.now();
  const current = await botRecapSettings(env, community);
  if (current && current.guild_id !== community.discordGuildId) {
    const existing = await env.DB.prepare("SELECT 1 FROM discord_recap_publications WHERE community_id=? AND event_id<>'' AND closed_at IS NULL LIMIT 1").bind(community.id).first();
    if (existing) throw Object.assign(new Error('Les salons du serveur précédent doivent être supprimés avant de changer de serveur.'), {status:400});
  }
  await env.DB.prepare(`INSERT OR IGNORE INTO community_recap_settings(community_id,enabled,mode,scope,guild_id,destination_id,destination_name)
    VALUES(?,0,?,?,?,?,?)`).bind(community.id,settings.mode,settings.scope,community.discordGuildId,settings.destinationId,settings.destinationName).run();
  const result = await env.DB.prepare("UPDATE community_recap_settings SET lock_token=?,lock_until=? WHERE community_id=? AND lock_until<?")
    .bind(token,now+180000,community.id,now).run();
  if (!result.meta.changes) throw Object.assign(new Error('Une synchronisation est en cours. Réessaie dans un instant.'), {status:409});
  try {
    await env.DB.prepare(`UPDATE community_recap_settings SET enabled=?,adopted=?,mode=?,scope=?,guild_id=?,destination_id=?,destination_name=?,iracing_destination_id=?,iracing_destination_name=?,revision=revision+1,last_error=NULL
      WHERE community_id=? AND lock_token=?`)
      .bind(Number(enabled),Number(adopted),settings.mode,settings.scope,community.discordGuildId,settings.destinationId,settings.destinationName,settings.iracingDestinationId || null,settings.iracingDestinationName || null,community.id,token).run();
  } finally {
    await env.DB.prepare("UPDATE community_recap_settings SET lock_token='',lock_until=0 WHERE community_id=? AND lock_token=?").bind(community.id,token).run();
  }
}
async function ensurePublication(env, community, eventId, settings) {
  const marker = 'endurance-manager:' + (await digest([community.id,eventId])).slice(0,24);
  await env.DB.prepare('INSERT OR IGNORE INTO discord_recap_publications(community_id,event_id,guild_id,marker) VALUES(?,?,?,?)')
    .bind(community.id,eventId,settings.guild_id,marker).run();
  return env.DB.prepare('SELECT * FROM discord_recap_publications WHERE community_id=? AND event_id=?').bind(community.id,eventId).first();
}
async function publish(env, timestamp, community, settings, row, event, budget, prepared = null) {
  const isEvent = row.event_id !== '';
  const destination = isEvent ? courseCategory(settings, event) : settings.destination_id;
  if (isEvent) await env.DB.prepare('UPDATE discord_recap_publications SET delete_after=? WHERE community_id=? AND event_id=?').bind(eventDeletionTime(event),community.id,row.event_id).run();
  if (row.closed_at) return;
  let channel = row.channel_id;
  if (!isEvent && channel !== settings.destination_id) {
    channel = settings.destination_id;
    row.message_id = null; row.content_hash = '';
    await env.DB.prepare('UPDATE discord_recap_publications SET channel_id=?,message_id=NULL,content_hash=? WHERE community_id=? AND event_id=?')
      .bind(channel,'',community.id,'').run();
  }
  if (isEvent) {
    // Recover a channel created just before a timeout/crash from its exact topic marker, never its name.
    if (!channel) {
      const channels = await discord(env,'GET',`/guilds/${row.guild_id}/channels`,null,budget);
      const existing = channels.find(item => item.type === 0 && item.topic === row.marker);
      let name = eventChannelName(event.name,event.id);
      if (channels.some(item => item.name === name && item.topic !== row.marker)) name = `${name.slice(0,62)}-${String(event.id).replace(/[^a-z0-9]/gi,'')}`.slice(0,100);
      const created = existing || await discord(env,'POST',`/guilds/${row.guild_id}/channels`,
        {type:0,name,parent_id:destination,topic:row.marker},budget);
      channel = created.id;
      await env.DB.prepare('UPDATE discord_recap_publications SET channel_id=?,category_id=? WHERE community_id=? AND event_id=?').bind(channel,destination,community.id,row.event_id).run();
    } else if (row.category_id !== destination) {
      await discord(env,'PATCH',`/channels/${channel}`,{parent_id:destination},budget);
      await env.DB.prepare('UPDATE discord_recap_publications SET category_id=? WHERE community_id=? AND event_id=?').bind(destination,community.id,row.event_id).run();
    }
  }
  const {payload, hash} = prepared || await snapshotPayload(env,timestamp,community,settings,isEvent ? row.event_id : null);
  if (row.message_id && row.content_hash === hash) return;
  if (row.message_id) {
    // A removed message or channel is reported, not recreated on every update (no surprise notifications).
    await discord(env,'PATCH',`/channels/${channel}/messages/${row.message_id}`,payload,budget);
  } else {
    // Recover a first message after a lost response. No second POST on an ambiguous first send.
    const messages = await discord(env,'GET',`/channels/${channel}/messages?limit=100`,null,budget);
    const existing = messages.find(item => item.author?.id === env.DISCORD_CLIENT_ID && item.nonce === row.marker.slice(-24));
    const message = existing || await discord(env,'POST',`/channels/${channel}/messages`,
      {...payload,nonce:row.marker.slice(-24),enforce_nonce:true,flags:4096},budget);
    row.message_id = message.id;
  }
  await env.DB.prepare('UPDATE discord_recap_publications SET message_id=?,content_hash=? WHERE community_id=? AND event_id=?')
    .bind(row.message_id,hash,community.id,row.event_id).run();
}
async function syncLocked(env,timestamp,community,settings, test = false, budget = {left:12}, priorityEventId = null) {
  const rows = (await env.DB.prepare('SELECT * FROM discord_recap_publications WHERE community_id=? AND closed_at IS NULL ORDER BY checked_at,event_id').bind(community.id).all()).results || [];
  const events = (await env.DB.prepare("SELECT id,name,circuit,departures,duration_hours,duration_minutes,schedule_pending FROM events WHERE community_id=? OR community_id='official'").bind(community.id).all()).results || [];
  // Cleanup is independent of mode/activation. Only bot-created event channels may be deleted.
  for (const row of (priorityEventId ? [] : rows.filter(item => item.event_id).slice(0,2))) {
    const event = events.find(item => item.id === row.event_id), deleteAt = event ? eventDeletionTime(event) : row.delete_after;
    if (deleteAt !== null && timestamp >= deleteAt) {
      if (!await closeCourseVoices(env,row,timestamp,(method,path) => discord(env,method,path,null,budget))) continue;
      if (row.channel_id) {
        try { await discord(env,'DELETE',`/channels/${row.channel_id}`,null,budget); }
        catch (error) { if (error.status !== 404) throw error; }
      }
      await env.DB.prepare('UPDATE discord_recap_publications SET closed_at=? WHERE community_id=? AND event_id=?').bind(timestamp,community.id,row.event_id).run();
      row.closed_at = timestamp;
    }
    await env.DB.prepare('UPDATE discord_recap_publications SET checked_at=? WHERE community_id=? AND event_id=?').bind(timestamp,community.id,row.event_id).run();
  }
  if (!settings.enabled && !test) return {ok:true,disabled:true};
  if (settings.guild_id !== community.discordGuildId) throw new Error('Le serveur Discord a changé. Configure à nouveau la destination.');
  if (settings.mode === 'general') {
    const row = await ensurePublication(env,community,'',settings);
    await publish(env,timestamp,community,settings,row,null,budget);
  } else {
    const snapshot = await loadWeeklyDiscordSnapshot(env,timestamp,community,settings.scope);
    const eligible = [...new Set([...snapshot.currentDepartures,...snapshot.futureDepartures].map(item => item.eventId))];
    const ids = priorityEventId ? [priorityEventId] : [...new Set([...rows.filter(row => row.event_id && !row.closed_at).map(row => row.event_id),...eligible])];
    const ordered = ids.sort((a,b) => (rows.find(row => row.event_id === a)?.checked_at || 0) - (rows.find(row => row.event_id === b)?.checked_at || 0));
    for (const eventId of ordered.slice(0,2)) {
      const event = events.find(item => item.id === eventId);
      if (!event || (eventDeletionTime(event) !== null && timestamp >= eventDeletionTime(event))) continue;
      // Reuse the eligibility/isolation query even for previously published official races.
      const prepared = await snapshotPayload(env,timestamp,community,settings,eventId);
      if (!prepared.snapshot.futureDepartures.length && !rows.some(row => row.event_id === eventId)) continue;
      const row = await ensurePublication(env,community,eventId,settings);
      await publish(env,timestamp,community,settings,row,event,budget,prepared);
      await env.DB.prepare('UPDATE discord_recap_publications SET checked_at=? WHERE community_id=? AND event_id=?').bind(timestamp,community.id,eventId).run();
    }
  }
  return {ok:true};
}
export async function syncBotRecaps(env,timestamp,community, test = false, {eventId = null, budget = {left:12}} = {}) {
  const token = crypto.randomUUID(), now = Date.now();
  await env.DB.prepare('UPDATE community_recap_settings SET dirty=1 WHERE community_id=?').bind(community.id).run();
  const lock = await env.DB.prepare("UPDATE community_recap_settings SET lock_token=?,lock_until=? WHERE community_id=? AND lock_until<?")
    .bind(token,now+180000,community.id,now).run();
  if (!lock.meta.changes) return {ok:true,queued:true};
  try {
    let result;
    for (let attempt=0;attempt<2;attempt++) {
      await env.DB.prepare('UPDATE community_recap_settings SET dirty=0 WHERE community_id=? AND lock_token=?').bind(community.id,token).run();
      result = await syncLocked(env,timestamp,community,await botRecapSettings(env,community),test,budget,eventId);
      const current = await botRecapSettings(env,community);
      if (!current.dirty) break;
    }
    await env.DB.prepare('UPDATE community_recap_settings SET last_error=NULL WHERE community_id=? AND lock_token=?').bind(community.id,token).run();
    return result;
  } catch (error) {
    const message = error.message.startsWith('Discord') ? recapError(error) : error.message;
    await env.DB.prepare('UPDATE community_recap_settings SET last_error=?,dirty=1 WHERE community_id=? AND lock_token=?').bind(message,community.id,token).run();
    throw Object.assign(new Error(message), {status:error.status,code:error.code});
  } finally {
    await env.DB.prepare("UPDATE community_recap_settings SET checked_at=?,lock_token='',lock_until=0 WHERE community_id=? AND lock_token=?").bind(timestamp,community.id,token).run();
  }
}
export async function sendBotRecapTest(env,timestamp,community,settings) {
  // Explicit test only: same publication identities as activation, never disposable extra messages.
  const current = await botRecapSettings(env,community);
  const unchanged = current && current.mode === settings.mode && current.scope === settings.scope && current.destination_id === settings.destinationId && (current.iracing_destination_id || null) === (settings.iracingDestinationId || null);
  if (current?.adopted && !unchanged) throw Object.assign(new Error('Pour tester une nouvelle destination, active d’abord ces réglages. Le récap existant reste inchangé.'), {status:400});
  await saveBotRecap(env,community,settings,Boolean(unchanged && current.enabled),Boolean(current?.adopted));
  return syncBotRecaps(env,timestamp,community,true);
}

// Every 15 minutes, separately from the hourly recap rotation. Re-read race times before deleting.
export async function cleanupEventRecaps(env, timestamp = Date.now(), limit = 2) {
  if (!env?.DB || !env.DISCORD_BOT_TOKEN) return 0;
  const rows = (await env.DB.prepare(`SELECT p.*,e.id AS current_event_id,e.departures,e.duration_hours,e.duration_minutes,e.schedule_pending
    FROM discord_recap_publications p LEFT JOIN events e ON e.id=p.event_id
    WHERE p.event_id<>'' AND p.closed_at IS NULL`).all()).results || [];
  const due = rows.map(row => ({...row,expiry:row.current_event_id ? eventDeletionTime(row) : row.delete_after}))
    .filter(row => row.expiry !== null && timestamp >= row.expiry).sort((a,b) => a.expiry-b.expiry);
  let deleted = 0;
  for (const row of due.slice(0,limit)) {
    const token = crypto.randomUUID(), now = Date.now();
    const lock = await env.DB.prepare('UPDATE community_recap_settings SET lock_token=?,lock_until=? WHERE community_id=? AND lock_until<?')
      .bind(token,now+180000,row.community_id,now).run();
    if (!lock.meta.changes) continue;
    try {
      // Configuration synchronisations cannot race this deletion; recheck the event after taking the lock.
      const event = await env.DB.prepare('SELECT departures,duration_hours,duration_minutes,schedule_pending FROM events WHERE id=?').bind(row.event_id).first();
      const expiry = event ? eventDeletionTime(event) : row.delete_after;
      if (expiry === null || timestamp < expiry) continue;
      const budget = {left:12};
      if (!await closeCourseVoices(env,row,timestamp,(method,path) => discord(env,method,path,null,budget))) continue;
      if (row.channel_id) {
        try { await discord(env,'DELETE',`/channels/${row.channel_id}`,null,budget); }
        catch (error) { if (error.status !== 404) throw error; }
      }
      await env.DB.prepare('UPDATE discord_recap_publications SET closed_at=? WHERE community_id=? AND event_id=? AND closed_at IS NULL').bind(timestamp,row.community_id,row.event_id).run();
      deleted++;
    } catch (error) {
      await env.DB.prepare('UPDATE community_recap_settings SET last_error=? WHERE community_id=?').bind(recapError(error),row.community_id).run();
    } finally {
      await env.DB.prepare("UPDATE community_recap_settings SET lock_token='',lock_until=0 WHERE community_id=? AND lock_token=?").bind(row.community_id,token).run();
    }
  }
  return deleted;
}
