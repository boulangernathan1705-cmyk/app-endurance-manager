// « Demander un équipage » on Discord (Nathan 2026-11-09): an admin may pick a text channel (layout.requests, setting
// « Discord »); each request made on the site is posted there as a card, without a ping. The organisers still create
// the crew on the site: the same card then turns green (« Équipage créé ») or grey (« non retenue »). Cancelled,
// replaced or no longer useful (start passed, pilot placed or gone): the card is deleted.
// Never on the dev site (its communities share the production's Discord servers).
import {discordRequest, botRecapSettings} from './recap-discord.mjs';
import {parseLayout} from './discord-layout.mjs';
import {communityUrl} from './community.mjs';
import {catalogForGame} from '../shared/catalog.mjs';
import {startTimeLabel} from './discord-weekly-format.mjs';
import {isDevelopment} from './dev-environment.mjs';

export const COLORS = {pending:0xe7b653, accepted:0x23a55a, refused:0x80848e};
const clip = (value, size) => { const text = String(value || '').trim(); return text.length > size ? `${text.slice(0, size - 1)}…` : text; };
const safe = value => String(value || '').replace(/[@<>*_~`|\\[\]]/g, '').replace(/\s+/g, ' ').trim();
const gameOf = event => String(event?.circuit || '').startsWith('iracing-') ? 'iracing' : 'lmu';

// The channel chosen for the requests, or '' (layout.requests).
export const requestsChannel = settings => !settings || settings.enabled === 0 ? '' : String(parseLayout(settings.layout)?.requests || '');

// The card of a request. card: {status, requester, name, category, car, pilots:[names], by, eventName, circuit, game,
// startsAt, timePending, url}. Pending: what is asked and the link; created: a big green title, the crew as made.
export function crewRequestCard(card) {
  const sim = card.game === 'iracing' ? '🏁 iRacing' : '🏎️ LMU';
  const race = [sim, safe(card.circuit)].filter(Boolean).join(' · ');
  const when = card.startsAt ? `🟢 ${startTimeLabel(card.startsAt, card.timePending)}` : '';
  const car = `🚗 ${[safe(card.car) || 'Voiture à choisir', safe(card.category)].filter(Boolean).join(' · ')}`;
  const pilots = card.pilots?.length ? `👥 ${card.pilots.map(safe).filter(Boolean).join(', ')}` : '';
  const event = `**${safe(card.eventName) || 'Endurance'}** · ${race}`;
  if (card.status === 'accepted') return {color:COLORS.accepted, title:clip(`✅ ÉQUIPAGE CRÉÉ · ${safe(card.name)}`, 256), ...(card.url ? {url:card.url} : {}),
    description:clip([event, when, car, pilots, '', `Validé par **${safe(card.by) || 'un responsable'}**`].filter(line => line !== null && line !== undefined && line !== false).join('\n').replace(/\n{3,}/g, '\n\n'), 4096),
    footer:{text:clip(`Demande de ${safe(card.requester)}`, 2048)}};
  if (card.status === 'refused') return {color:COLORS.refused, title:'❌ Demande non retenue',
    description:clip(`« ${safe(card.name)} » de **${safe(card.requester)}**\n${event}`, 4096),
    footer:{text:clip(`Par ${safe(card.by) || 'un responsable'}`, 2048)}};
  return {color:COLORS.pending, title:'🙋 Demande d’équipage', ...(card.url ? {url:card.url} : {}),
    description:clip([`**${safe(card.requester)}** demande l’équipage **« ${safe(card.name)} »**`, event, when, car, pilots, card.url ? `\n[Voir sur le site](${card.url})` : '']
      .filter(Boolean).join('\n'), 4096),
    footer:{text:'⏳ En attente d’un responsable'}};
}

const nameSql = `COALESCE(NULLIF((SELECT m.nickname FROM memberships m WHERE m.user_id=p.user_id AND m.community_id=? AND m.status='member'),''),p.name,r.name)`;
async function pilotNames(env, communityId, registrationIds) {
  if (!registrationIds.length) return [];
  const rows = (await env.DB.prepare(`SELECT r.id, ${nameSql} AS name FROM registrations r JOIN participants p ON p.id=r.participant_id
    WHERE r.id IN (${registrationIds.map(() => '?').join(',')})`).bind(communityId, ...registrationIds).all()).results || [];
  return registrationIds.map(id => rows.find(row => row.id === id)?.name).filter(Boolean);
}
const parse = (value, fallback) => { try { return JSON.parse(value) ?? fallback; } catch { return fallback; } };

// What the card of a request shows. crew: the crew made from it ({name, category, car, registrationIds}), when accepted.
async function cardOf(env, community, row, {status = 'pending', by = '', crew = null} = {}) {
  const event = await env.DB.prepare('SELECT * FROM events WHERE id=?').bind(row.event_id).first();
  if (!event) return null;
  const game = gameOf(event), departure = parse(event.departures, []).find(item => item.id === row.departure_id) || {};
  const requester = (await env.DB.prepare(`SELECT COALESCE(NULLIF(m.nickname,''),u.name) AS name FROM users u
    LEFT JOIN memberships m ON m.user_id=u.id AND m.community_id=? WHERE u.id=?`).bind(community.id, row.user_id).first())?.name || '';
  let url = '';
  try { url = `${communityUrl(env, community)}/${game}/#event=${encodeURIComponent(event.id)}`; } catch {}
  const source = crew || {name:row.name, category:row.category, car:row.car, registrationIds:parse(row.registration_ids, [])};
  return {status, by, requester, name:source.name, category:source.category, car:source.car, pilots:await pilotNames(env, community.id, source.registrationIds),
    eventName:event.name, circuit:catalogForGame(game).circuits?.find(item => item.id === event.circuit)?.name || '', game,
    startsAt:Number(departure.startsAt) || 0, timePending:Boolean(departure.timePending || event.schedule_pending), url};
}

// A new request: its card in the chosen channel (nothing when no channel is chosen). Never stops the request itself.
export async function postCrewRequestCard(env, community, requestId) {
  try {
    if (isDevelopment(env) || !env.DISCORD_BOT_TOKEN) return;
    const channel = requestsChannel(await botRecapSettings(env, community));
    if (!channel) return;
    const row = await env.DB.prepare('SELECT * FROM crew_requests WHERE id=?').bind(requestId).first();
    const card = row && await cardOf(env, community, row);
    if (!card) return;
    const message = await discordRequest(env, 'POST', `/channels/${channel}/messages`, {content:'', embeds:[crewRequestCard(card)], allowed_mentions:{parse:[]}}, {left:1});
    if (message?.id) await env.DB.prepare('UPDATE crew_requests SET discord_channel_id=?, discord_message_id=? WHERE id=?').bind(channel, message.id, row.id).run();
  } catch (error) { console.error('Crew request card failed', error instanceof Error ? error.message : 'unknown'); }
}

// A request decided on the site: its card turns green or grey. row: the request as it was (with its card).
export async function decideCrewRequestCard(env, community, row, {status, by, crewId = ''}) {
  try {
    if (isDevelopment(env) || !env.DISCORD_BOT_TOKEN || !row?.discord_message_id) return;
    let crew = null;
    if (status === 'accepted' && crewId) {
      const made = await env.DB.prepare('SELECT name, category, car FROM crews WHERE id=?').bind(crewId).first();
      const members = (await env.DB.prepare('SELECT registration_id FROM crew_members WHERE crew_id=? ORDER BY rowid').bind(crewId).all()).results || [];
      if (made) crew = {...made, registrationIds:members.map(item => item.registration_id)};
    }
    const card = await cardOf(env, community, row, {status, by, crew});
    if (!card) return;
    await discordRequest(env, 'PATCH', `/channels/${row.discord_channel_id}/messages/${row.discord_message_id}`, {content:'', embeds:[crewRequestCard(card)], allowed_mentions:{parse:[]}}, {left:1});
  } catch (error) { console.error('Crew request card update failed', error instanceof Error ? error.message : 'unknown'); }
}

// A card no longer needed (request cancelled or replaced): deleted. A message already gone is fine.
export async function deleteCrewRequestCard(env, row) {
  try {
    if (isDevelopment(env) || !env.DISCORD_BOT_TOKEN || !row?.discord_message_id) return;
    await discordRequest(env, 'DELETE', `/channels/${row.discord_channel_id}/messages/${row.discord_message_id}`, null, {left:1}).catch(error => { if (error?.status !== 404) throw error; });
  } catch (error) { console.error('Crew request card delete failed', error instanceof Error ? error.message : 'unknown'); }
}

// Every 15 minutes: the cards of the pending requests no longer useful (start passed, pilot no longer entered alone)
// are deleted, a few at a time.
export async function cleanCrewRequestCards(env, timestamp = Date.now(), limit = 10) {
  if (isDevelopment(env) || !env.DISCORD_BOT_TOKEN) return 0;
  const rows = (await env.DB.prepare(`SELECT q.*, e.departures AS event_departures,
      EXISTS (SELECT 1 FROM registrations r WHERE r.id=json_extract(q.registration_ids,'$[0]') AND r.status!='unavailable'
        AND NOT EXISTS (SELECT 1 FROM crew_members cm WHERE cm.registration_id=r.id)) AS still_alone
    FROM crew_requests q LEFT JOIN events e ON e.id=q.event_id
    WHERE q.status='pending' AND q.discord_message_id IS NOT NULL ORDER BY q.created_at LIMIT 200`).all()).results || [];
  const stale = rows.filter(row => {
    const start = parse(row.event_departures, []).find(item => item.id === row.departure_id);
    return !row.still_alone || !start || Number(start.startsAt) <= timestamp;
  }).slice(0, limit);
  for (const row of stale) {
    await deleteCrewRequestCard(env, row);
    await env.DB.prepare('UPDATE crew_requests SET discord_message_id=NULL WHERE id=?').bind(row.id).run();
  }
  return stale.length;
}
