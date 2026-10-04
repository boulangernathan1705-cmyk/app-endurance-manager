// Requests for a new community (migration 0042): the manager of a Discord server fills the page « Demander un
// espace » (demande.html) once signed in with Discord; the platform managers read the requests in
// « Administration → Plateforme », create the community from one, or refuse it.
import {fail, json, now, body, rateLimit, text} from './core.mjs';
import {WEBHOOK_URL} from './discord-weekly.mjs';

const GAMES = {lmu:'Le Mans Ultimate', iracing:'iRacing', both:'LMU et iRacing'};
const MEMBERS = ['moins de 20', '20 à 50', '50 à 150', 'plus de 150'];
const STATUSES = ['pending', 'done', 'rejected'];
const RESERVED = ['www', 'app', 'api', 'admin', 'dev', 'auth'];
// Pending requests one account may have at once (a typo is fixed by a new request, not by twenty).
const MAX_PENDING = 3;

const optional = (value, max, label) => value == null || String(value).trim() === '' ? null : text(String(value), max, label);

function validate(input) {
  const communityName = text(input.communityName, 80, 'Nom de la communauté');
  const shortName = text(input.shortName, 12, 'Nom court');
  const slug = String(input.slug || '').trim().toLowerCase();
  if (!/^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/.test(slug)) fail(400, 'L’adresse souhaitée : 3 à 40 caractères, lettres minuscules, chiffres et tirets (pas au début ni à la fin).');
  if (RESERVED.includes(slug)) fail(400, 'Cette adresse est réservée : choisis-en une autre.');
  const guildId = String(input.guildId || '').trim();
  if (!/^\d{15,22}$/.test(guildId)) fail(400, 'L’ID du serveur Discord : un nombre de 17 à 20 chiffres (clic droit sur le serveur → Copier l’identifiant du serveur).');
  const invite = optional(input.inviteUrl, 200, 'Lien d’invitation');
  if (invite && !/^https:\/\/(discord\.gg|discord\.com\/invite)\/[\w-]+$/.test(invite)) fail(400, 'Le lien d’invitation doit commencer par https://discord.gg/ ou https://discord.com/invite/.');
  if (!GAMES[input.games]) fail(400, 'Choisis le ou les simulateurs de ta communauté.');
  if (!MEMBERS.includes(input.members)) fail(400, 'Indique la taille de ta communauté.');
  return {communityName, shortName, slug, guildId, invite, games:input.games, members:input.members,
    contact:optional(input.contact, 120, 'Autre contact'), message:optional(input.message, 1500, 'Message')};
}

function publicRequest(row) {
  return {id:row.id, communityName:row.community_name, shortName:row.short_name, slug:row.slug, guildId:row.discord_guild_id,
    inviteUrl:row.discord_invite_url, games:row.games, gamesLabel:GAMES[row.games], members:row.members, contact:row.contact,
    message:row.message, status:row.status, createdAt:row.created_at, updatedAt:row.updated_at,
    requester:row.requester_name == null ? undefined : {id:row.user_id, name:row.requester_name}};
}

// The platform manager is told on Discord when a webhook is set (COMMUNITY_REQUESTS_WEBHOOK_URL); without it the
// request waits in « Plateforme ». A Discord failure never loses the request.
async function notify(env, request, user) {
  const url = String(env.COMMUNITY_REQUESTS_WEBHOOK_URL || '').trim();
  if (!WEBHOOK_URL.test(url)) return;
  const lines = [`📨 **Nouvelle demande de communauté : ${request.communityName}**`,
    `Demandée par ${user.name} (<@${user.id}>)`, `Simulateurs : ${GAMES[request.games]} · Taille : ${request.members}`,
    `Adresse souhaitée : ${request.slug}`, 'À traiter dans Administration → Plateforme.'];
  try {
    await fetch(url, {method:'POST', headers:{'Content-Type':'application/json'}, signal:AbortSignal.timeout(10000),
      body:JSON.stringify({content:lines.join('\n'), allowed_mentions:{parse:[]}})});
  } catch (error) {
    console.error('Community request notification failed', String(error?.message || 'unknown').slice(0, 80));
  }
}

export async function communityRequestsApi(path, method, request, env, actor) {
  if (path === '/api/community-requests' && method === 'GET') {
    if (!actor.user) fail(401, 'Connecte-toi avec Discord pour voir tes demandes.');
    const rows = (await env.DB.prepare('SELECT * FROM community_requests WHERE user_id=? ORDER BY created_at DESC').bind(actor.user.id).all()).results || [];
    return json({requests:rows.map(publicRequest)});
  }
  if (path === '/api/community-requests' && method === 'POST') {
    if (!actor.user) fail(401, 'Connecte-toi avec Discord pour envoyer ta demande.');
    const input = validate(await body(request));
    // Counted once the form is valid: a typo fixed by the requester costs nothing.
    await rateLimit(request, env, 'community-request', 5);
    const pending = await env.DB.prepare("SELECT COUNT(*) AS n FROM community_requests WHERE user_id=? AND status='pending'").bind(actor.user.id).first();
    if (Number(pending?.n) >= MAX_PENDING) fail(429, 'Tu as déjà plusieurs demandes en attente : elles seront traitées avant d’en envoyer une autre.');
    if (await env.DB.prepare("SELECT 1 FROM community_requests WHERE discord_guild_id=? AND status='pending'").bind(input.guildId).first()) fail(409, 'Une demande pour ce serveur Discord est déjà en attente.');
    if (await env.DB.prepare('SELECT 1 FROM communities WHERE discord_guild_id=?').bind(input.guildId).first()) fail(409, 'Ce serveur Discord a déjà son espace sur Endurance Manager.');
    if (await env.DB.prepare('SELECT 1 FROM communities WHERE slug=?').bind(input.slug).first()) fail(409, 'Cette adresse est déjà prise : choisis-en une autre.');
    const id = crypto.randomUUID(), time = now();
    await env.DB.prepare(`INSERT INTO community_requests(id,user_id,community_name,short_name,slug,discord_guild_id,discord_invite_url,games,members,contact,message,status,created_at,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,'pending',?,?)`).bind(id, actor.user.id, input.communityName, input.shortName, input.slug, input.guildId,
      input.invite, input.games, input.members, input.contact, input.message, time, time).run();
    await notify(env, input, actor.user);
    return json({ok:true, id}, 201);
  }
  if (path === '/api/platform/community-requests' && method === 'GET') {
    if (!actor.manager) fail(403, 'Réservé aux gestionnaires de la plateforme.');
    const rows = (await env.DB.prepare(`SELECT r.*, u.name AS requester_name FROM community_requests r JOIN users u ON u.id=r.user_id
      ORDER BY r.status='pending' DESC, r.created_at DESC LIMIT 100`).all()).results || [];
    return json({requests:rows.map(publicRequest)});
  }
  const one = path.match(/^\/api\/platform\/community-requests\/([a-f0-9-]{36})$/);
  if (one && method === 'PATCH') {
    if (!actor.manager) fail(403, 'Réservé aux gestionnaires de la plateforme.');
    const input = await body(request);
    if (!STATUSES.includes(input.status)) fail(400, 'Statut inconnu.');
    const result = await env.DB.prepare('UPDATE community_requests SET status=?, updated_at=? WHERE id=?').bind(input.status, now(), one[1]).run();
    if (!result.meta.changes) fail(404, 'Demande introuvable.');
    return json({ok:true});
  }
  return null;
}

// A community created from a request: the request is done.
export async function closeCommunityRequest(env, requestId) {
  if (!/^[a-f0-9-]{36}$/.test(String(requestId || ''))) return;
  await env.DB.prepare("UPDATE community_requests SET status='done', updated_at=? WHERE id=? AND status='pending'").bind(now(), requestId).run();
}
