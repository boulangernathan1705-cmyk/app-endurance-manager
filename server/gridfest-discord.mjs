import {assignStreamerWaitlist, streamersOf, eventDetails, gridfestPasswordValid} from '../shared/grindfest.mjs';
import {HttpError, fail, hash, id, now} from './core.mjs';
import {discordFetch, pause} from './discord-api.mjs';
import {eventById} from './api-shared.mjs';
import {communityById} from './community.mjs';

const BATCH_SIZE = 6; // At most 18 Discord calls, 36 with one retry each: within the Worker's subrequest budget.
const LEASE_SECONDS = 120;
const RETRY_MS = 2000;
const RETRY_AFTER = 240, RETRY_MAX = 3, RETRY_WINDOW = 6 * 3600; // seconds: again after 4 min, 3 times, for 6 h
// Refusals that pass: Discord down for a moment, or « you are opening direct messages too fast » (40003).
const passing = answer => answer.status >= 500 || answer.code === 40003;

async function discord(env, method, path, data) {
  let answer;
  for (let attempt = 0; attempt < 2; attempt++) {
    try { answer = await discordFetch(env, method, path, data); }
    catch { answer = {ok:false, status:0, code:0}; }
    if (answer.ok || (answer.status && !passing(answer))) break;
    if (!attempt) await pause(RETRY_MS);
  }
  if (!answer.ok) {
    // A refusal that may pass later is marked: the bot sends that MP again by itself (retryGridfestPasswords).
    const later = message => Object.assign(Error(message), {retry:true});
    if (!answer.status) throw later('Discord ne répond pas. Nouvel essai automatique.');
    if (answer.status === 429) throw Object.assign(new HttpError(429, 'Discord limite les envois. Nouvel essai automatique.'), {retry:true});
    if (answer.code === 50007) throw Error('MP bloqués : le pilote doit autoriser les messages privés du serveur.');
    if (answer.status === 404 && answer.code === 10007) throw Error('Ce pilote n’est plus membre du Discord de la communauté.');
    if (answer.code === 10013) throw Error('Ce compte Discord n’existe plus.');
    if (answer.code === 40003 || passing(answer)) throw later(`Discord limite les MP (${answer.code || answer.status}). Nouvel essai automatique.`);
    // Keep Discord's own code: without it, a refusal cannot be explained afterwards. Unknown: tried again too.
    throw later(`Envoi refusé par Discord (${answer.code || answer.status}). Nouvel essai automatique.`);
  }
  return answer.data;
}

async function entries(env, community, event) {
  const rows = (await env.DB.prepare(`SELECT r.id,r.departure_id,r.streamer_id,r.status,r.game_name,
    p.user_id,p.name FROM registrations r JOIN participants p ON p.id=r.participant_id
    WHERE r.event_id=? AND r.community_id=? AND p.community_id=?
    ORDER BY COALESCE(r.streamer_order,r.created_at),r.rowid`).bind(event.id, community.id, community.id).all()).results || [];
  const departures = new Map();
  for (const row of rows) {
    if (!departures.has(row.departure_id)) departures.set(row.departure_id, []);
    departures.get(row.departure_id).push({...row, streamerId:row.streamer_id});
  }
  const ranked = [...departures.values()].flatMap(list => assignStreamerWaitlist(list, streamersOf(event)));
  const confirmed = ranked.filter(row => row.status !== 'unavailable' && !row.waitlistPosition);
  return {confirmed, waiting:ranked.filter(row => row.status !== 'unavailable' && row.waitlistPosition).length};
}

export async function gridfestPasswordStatus(env, community, event) {
  const {confirmed, waiting} = await entries(env, community, event);
  const password = eventDetails(event).password || '';
  const digest = password ? await hash(password) : '';
  const deliveries = digest ? (await env.DB.prepare('SELECT user_id,status,error,attempted_at FROM gridfest_password_deliveries WHERE event_id=? AND password_hash=?')
    .bind(event.id, digest).all()).results || [] : [];
  const byUser = new Map(deliveries.map(row => [row.user_id, row]));
  const seen = new Set();
  const pilots = confirmed.filter(row => !row.user_id || (!seen.has(row.user_id) && seen.add(row.user_id))).map(row => {
    const delivery = byUser.get(row.user_id);
    const eligible = /^\d{15,22}$/.test(row.user_id || '') && Boolean(row.game_name?.trim());
    return {name:row.name, gameName:row.game_name, status:!eligible ? 'incomplete' : delivery?.status || 'pending',
      error:!row.user_id ? 'Compte Discord manquant.' : !row.game_name?.trim() ? 'Nom en jeu manquant.' : delivery?.error || ''};
  });
  return {ready:gridfestPasswordValid(password), botReady:Boolean(env.DISCORD_BOT_TOKEN && community.discordGuildId), waiting, pilots};
}

// Called only by the module's admin route. Never post the secret in a channel, a recap or a notification.
// Batches can resume after a browser/network interruption; successful deliveries of this password are skipped.
export async function sendGridfestPasswords(env, community, event, cursor = '', {only = null, limit = BATCH_SIZE} = {}) {
  if (typeof cursor !== 'string' || (cursor && !/^\d{15,22}$/.test(cursor))) fail(400, 'Reprise d’envoi invalide.');
  const password = eventDetails(event).password || '';
  if (!gridfestPasswordValid(password)) fail(400, 'Enregistre un mot de passe Gridfest dans « Modifier l’événement ».');
  if (!env.DISCORD_BOT_TOKEN || !community.discordGuildId) fail(503, 'Le bot Discord de la communauté doit être configuré pour envoyer les MP.');
  const digest = await hash(password);
  const current = await entries(env, community, event);
  const byUser = new Map(current.confirmed.filter(row => /^\d{15,22}$/.test(row.user_id || '') && row.game_name?.trim()).map(row => [row.user_id, row]));
  const candidates = [...byUser.values()].sort((a,b) => a.user_id < b.user_id ? -1 : a.user_id > b.user_id ? 1 : 0).filter(row => row.user_id > cursor && (!only || only.has(row.user_id)));
  const batch = candidates.slice(0, limit), results = [];
  for (const pilot of batch) {
    const attempt = id(), at = now();
    const claimed = await env.DB.prepare(`INSERT INTO gridfest_password_deliveries(event_id,user_id,password_hash,status,attempt_token,attempted_at)
      VALUES(?,?,?,'sending',?,?) ON CONFLICT(event_id,user_id,password_hash) DO UPDATE SET
      status='sending',attempt_token=excluded.attempt_token,attempted_at=excluded.attempted_at,error='',
      retries=CASE WHEN ? THEN gridfest_password_deliveries.retries+1 ELSE 0 END
      WHERE gridfest_password_deliveries.status='failed' OR
      (gridfest_password_deliveries.status='sending' AND gridfest_password_deliveries.attempted_at<?)`)
      .bind(event.id, pilot.user_id, digest, attempt, at, only ? 1 : 0, at - LEASE_SECONDS).run();
    if (!claimed.meta.changes) { results.push({name:pilot.name, status:'skipped'}); continue; }
    try {
      // Check membership live: a cached site session must not invite someone who left TDZ.
      const member = await discord(env, 'GET', `/guilds/${community.discordGuildId}/members/${pilot.user_id}`);
      if (member.user?.bot) throw Error('Un bot ne peut pas recevoir une invitation pilote.');
      const channel = await discord(env, 'POST', '/users/@me/channels', {recipient_id:pilot.user_id});
      if (!/^\d{15,22}$/.test(channel.id || '')) throw Error('La conversation privée Discord est indisponible.');
      // A withdrawal, queue change, module switch or password edit during the batch invalidates the invite.
      const latest = await env.DB.prepare('SELECT e.*,c.modules FROM events e JOIN communities c ON c.id=e.community_id WHERE e.id=? AND c.id=?')
        .bind(event.id, community.id).first();
      if (!latest || latest.version !== event.version || eventDetails(latest).password !== password || JSON.parse(latest.modules || '{}').grindfest !== true)
        fail(409, 'Le Gridfest a changé pendant l’envoi. Actualise la page avant de continuer.');
      const currentPilot = (await entries(env, community, latest)).confirmed.find(row => row.id === pilot.id && row.user_id === pilot.user_id && row.game_name?.trim());
      if (!currentPilot) throw Error('La place de ce pilote n’est plus confirmée.');
      await discord(env, 'POST', `/channels/${channel.id}/messages`, {
        content:'', embeds:[{color:0x23a55a, author:{name:'Gridfest TDZ'}, title:String(event.name).slice(0, 256),
          description:`✅ Ta place est confirmée pour **${String(currentPilot.game_name).replace(/[\\`*_~|]/g, '\\$&')}**.`,
          fields:[{name:'🔑 Mot de passe du serveur de course', value:String(password).includes('`') ? String(password) : `\`${password}\``}], footer:{text:'Réservé aux pilotes invités, ne le partage pas.'}}],
        nonce:(await hash(`${event.id}:${pilot.user_id}:${digest}`)).slice(0,24), enforce_nonce:true, allowed_mentions:{parse:[]}});
      await env.DB.prepare("UPDATE gridfest_password_deliveries SET status='sent',sent_at=?,error='' WHERE event_id=? AND user_id=? AND password_hash=? AND attempt_token=?")
        .bind(now(), event.id, pilot.user_id, digest, attempt).run();
      results.push({name:pilot.name, status:'sent'});
    } catch (error) {
      const message = error.message || 'Envoi impossible.';
      await env.DB.prepare("UPDATE gridfest_password_deliveries SET status='failed',error=?,retryable=? WHERE event_id=? AND user_id=? AND password_hash=? AND attempt_token=?")
        .bind(message, error.retry ? 1 : 0, event.id, pilot.user_id, digest, attempt).run();
      if (error.status === 429 || error.status === 409) throw error;
      results.push({name:pilot.name, status:'failed', error:message});
    }
  }
  return {results, nextCursor:candidates.length > batch.length ? batch.at(-1).user_id : null, ...await gridfestPasswordStatus(env, community, event)};
}

// Every few minutes (scheduled crews job): the MPs refused for a reason that may pass are sent again, at most
// RETRY_MAX times, only for the password they were refused with. Only an admin click starts a first send.
export async function retryGridfestPasswords(env, at = now(), limit = 2) {
  if (!env.DISCORD_BOT_TOKEN) return 0;
  const rows = (await env.DB.prepare(`SELECT d.event_id,d.user_id,d.password_hash,e.community_id FROM gridfest_password_deliveries d
    JOIN events e ON e.id=d.event_id WHERE d.status='failed' AND d.retryable=1 AND d.retries<? AND d.attempted_at<? AND d.attempted_at>?
    ORDER BY d.attempted_at LIMIT ?`).bind(RETRY_MAX, at - RETRY_AFTER, at - RETRY_WINDOW, limit).all()).results || [];
  let sent = 0;
  for (const row of rows) {
    try {
      const community = await communityById(env, row.community_id);
      const event = community && await eventById(env, row.event_id, community);
      const password = eventDetails(event || {}).password || '';
      // The password changed since: that refusal is out of date, an admin sends the new one.
      if (!event || !gridfestPasswordValid(password) || await hash(password) !== row.password_hash) {
        await env.DB.prepare("UPDATE gridfest_password_deliveries SET retryable=0 WHERE event_id=? AND user_id=? AND password_hash=?")
          .bind(row.event_id, row.user_id, row.password_hash).run();
        continue;
      }
      const result = await sendGridfestPasswords(env, community, event, '', {only:new Set([row.user_id]), limit:1});
      sent += result.results.filter(item => item.status === 'sent').length;
      // Not a confirmed pilot any more (withdrawn, on the waiting list): nothing to send again.
      if (!result.results.length) await env.DB.prepare("UPDATE gridfest_password_deliveries SET retryable=0 WHERE event_id=? AND user_id=? AND password_hash=?")
        .bind(row.event_id, row.user_id, row.password_hash).run();
    } catch (error) {
      if (error.status === 429) break;
      if (error.status === 404) await env.DB.prepare("UPDATE gridfest_password_deliveries SET retryable=0 WHERE event_id=? AND user_id=? AND password_hash=?")
        .bind(row.event_id, row.user_id, row.password_hash).run();
    }
  }
  return sent;
}
