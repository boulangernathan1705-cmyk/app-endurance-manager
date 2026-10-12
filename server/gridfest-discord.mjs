import {assignStreamerWaitlist, streamersOf, eventDetails, gridfestPasswordValid} from '../shared/grindfest.mjs';
import {fail, hash, id, now} from './core.mjs';

const API = 'https://discord.com/api/v10';
const BATCH_SIZE = 8; // At most 24 Discord calls, within the Worker's subrequest budget.
const LEASE_SECONDS = 120;

async function discord(env, method, path, data) {
  let response;
  try {
    response = await fetch(API + path, {method, headers:{Authorization:`Bot ${env.DISCORD_BOT_TOKEN}`, 'Content-Type':'application/json'},
      ...(data ? {body:JSON.stringify(data)} : {}), signal:AbortSignal.timeout(8000)});
  } catch { throw Error('Discord ne répond pas. Réessaie plus tard.'); }
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    if (response.status === 429) fail(429, 'Discord limite les envois. Attends un peu avant de réessayer.');
    if (Number(error.code) === 50007) throw Error('MP bloqués : le pilote doit autoriser les messages privés du serveur.');
    if (response.status === 404 && Number(error.code) === 10007) throw Error('Ce pilote n’est plus membre du Discord de la communauté.');
    throw Error('Envoi refusé par Discord. Vérifie le bot et les messages privés du pilote.');
  }
  return response.json();
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
export async function sendGridfestPasswords(env, community, event, cursor = '') {
  if (typeof cursor !== 'string' || (cursor && !/^\d{15,22}$/.test(cursor))) fail(400, 'Reprise d’envoi invalide.');
  const password = eventDetails(event).password || '';
  if (!gridfestPasswordValid(password)) fail(400, 'Génère et enregistre un mot de passe Gridfest de 12 à 30 caractères (lettres, chiffres, - ou _).');
  if (!env.DISCORD_BOT_TOKEN || !community.discordGuildId) fail(503, 'Le bot Discord de la communauté doit être configuré pour envoyer les MP.');
  const digest = await hash(password);
  const current = await entries(env, community, event);
  const byUser = new Map(current.confirmed.filter(row => /^\d{15,22}$/.test(row.user_id || '') && row.game_name?.trim()).map(row => [row.user_id, row]));
  const candidates = [...byUser.values()].sort((a,b) => a.user_id < b.user_id ? -1 : a.user_id > b.user_id ? 1 : 0).filter(row => row.user_id > cursor);
  const batch = candidates.slice(0, BATCH_SIZE), results = [];
  for (const pilot of batch) {
    const attempt = id(), at = now();
    const claimed = await env.DB.prepare(`INSERT INTO gridfest_password_deliveries(event_id,user_id,password_hash,status,attempt_token,attempted_at)
      VALUES(?,?,?,'sending',?,?) ON CONFLICT(event_id,user_id,password_hash) DO UPDATE SET
      status='sending',attempt_token=excluded.attempt_token,attempted_at=excluded.attempted_at,error=''
      WHERE gridfest_password_deliveries.status='failed' OR
      (gridfest_password_deliveries.status='sending' AND gridfest_password_deliveries.attempted_at<?)`)
      .bind(event.id, pilot.user_id, digest, attempt, at, at - LEASE_SECONDS).run();
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
        content:`Gridfest TDZ · ${event.name}\nTa place est confirmée pour ${currentPilot.game_name}.\nMot de passe du serveur de course : ${password}\nCe mot de passe est réservé aux pilotes invités. Ne le partage pas.`,
        nonce:(await hash(`${event.id}:${pilot.user_id}:${digest}`)).slice(0,24), enforce_nonce:true, allowed_mentions:{parse:[]}});
      await env.DB.prepare("UPDATE gridfest_password_deliveries SET status='sent',sent_at=?,error='' WHERE event_id=? AND user_id=? AND password_hash=? AND attempt_token=?")
        .bind(now(), event.id, pilot.user_id, digest, attempt).run();
      results.push({name:pilot.name, status:'sent'});
    } catch (error) {
      const message = error.message || 'Envoi impossible.';
      await env.DB.prepare("UPDATE gridfest_password_deliveries SET status='failed',error=? WHERE event_id=? AND user_id=? AND password_hash=? AND attempt_token=?")
        .bind(message, event.id, pilot.user_id, digest, attempt).run();
      if (error.status === 429 || error.status === 409) throw error;
      results.push({name:pilot.name, status:'failed', error:message});
    }
  }
  return {results, nextCursor:candidates.length > batch.length ? batch.at(-1).user_id : null, ...await gridfestPasswordStatus(env, community, event)};
}
