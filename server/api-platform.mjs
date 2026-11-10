// The platform managers' actions: showcase, official community, communities (called by server/worker.mjs).
import {fail, now, baseDomain, json, body, text} from './core.mjs';
import {closeCommunityRequest} from './community-requests.mjs';
import {allCommunities, communityUrl, communitySlug} from './community.mjs';
import {isDevelopment} from './dev-environment.mjs';
import {discordGuild} from './access.mjs';
import {resetShowcase, makeOfficial} from './demo.mjs';
import {setupOfficialServer} from './official-discord.mjs';
import {botInvite} from './api-community.mjs';
// Answers the request when it is one of the platform's actions, else null.
export async function platformApi({path, method, request, env, actor, community, mainAddress, openSite}) {
  // Platform managers: the communities, and a new one (its admins then set it up on its « Mise en place » page).
  // Showcase of the main address: its data replaced by fictional races, crews and pilots (server/demo.mjs).
  if (path === '/api/platform/showcase' && method === 'POST') {
    if (!actor.manager) fail(403, 'Réservé aux gestionnaires de la plateforme.');
    if (!mainAddress) fail(400, 'La vitrine se réinitialise depuis l’adresse principale du site.');
    const input = await body(request);
    if (input.confirm !== 'VITRINE') fail(400, 'Tape VITRINE pour confirmer.');
    const result = await resetShowcase(env, community);
    // The official iRacing calendar comes back with the next scheduled import (within 15 minutes).
    return json({ok:true, ...result});
  }
  // The showcase becomes the official community, linked to the official Discord server (its fictional data goes).
  if (path === '/api/platform/official' && method === 'POST') {
    if (!actor.manager) fail(403, 'Réservé aux gestionnaires de la plateforme.');
    if (!openSite) fail(400, 'Seule la vitrine de l’adresse principale devient la communauté officielle.');
    const input = await body(request), guildId = String(input.guildId || '').trim();
    if (input.confirm !== 'OFFICIEL') fail(400, 'Tape OFFICIEL pour confirmer.');
    if (!/^\d{15,22}$/.test(guildId)) fail(400, 'L’ID du serveur Discord : un nombre de 17 à 20 chiffres (clic droit sur le serveur → Copier l’identifiant du serveur).');
    if (await env.DB.prepare('SELECT 1 FROM communities WHERE discord_guild_id=?').bind(guildId).first()) fail(409, 'Ce serveur Discord est déjà relié à une communauté.');
    await makeOfficial(env, community, guildId);
    return json({ok:true, botInviteUrl:botInvite(env, guildId)});
  }
  // The official Discord server: the bot makes the categories, channels, forums and roles that are missing.
  if (path === '/api/platform/official/setup' && method === 'POST') {
    if (!actor.manager) fail(403, 'Réservé aux gestionnaires de la plateforme.');
    if (!mainAddress || !community.discordGuildId) fail(400, 'Relie d’abord le Discord officiel à l’adresse principale.');
    try {
      const result = await setupOfficialServer(env, community.discordGuildId);
      // The races' categories go right under « 📌 INFOS » (anchor of the recap in « une catégorie par course »).
      if (result.anchor) await env.DB.prepare(`UPDATE community_recap_settings SET destination_id=CASE WHEN destination_id<>'' THEN ?1 ELSE '' END,
        destination_name=CASE WHEN destination_id<>'' THEN ?2 ELSE '' END,iracing_destination_id=CASE WHEN iracing_destination_id<>'' THEN ?1 ELSE '' END,
        iracing_destination_name=CASE WHEN iracing_destination_id<>'' THEN ?2 ELSE '' END,revision=revision+1 WHERE community_id=?3 AND mode='events' AND guild_id=?4`)
        .bind(result.anchor, '📌 INFOS', community.id, community.discordGuildId).run();
      // What @everyone, the Staff and the Organisateur may do on the site.
      await env.DB.batch(Object.entries(result.site).map(([role, permissions]) => env.DB.prepare(`INSERT INTO community_role_permissions(community_id,discord_role_id,permissions,updated_at) VALUES(?,?,?,?)
        ON CONFLICT(community_id,discord_role_id) DO UPDATE SET permissions=excluded.permissions,updated_at=excluded.updated_at`)
        .bind(community.id, role, JSON.stringify(permissions), now())));
      const {site, ...shown} = result;
      return json({ok:true, ...shown});
    }
    catch (error) { return json({error:error.message, made:error.made || [], kept:error.kept || []}, error.status || 502); }
  }
  // A community with no race and no pilot yet (made by mistake): its settings and members go with it. Never the
  // community of the main address.
  const platformCommunity = path.match(/^\/api\/platform\/communities\/([a-z0-9-]{3,40})$/);
  if (platformCommunity && method === 'DELETE') {
    if (!actor.manager) fail(403, 'Réservé aux gestionnaires de la plateforme.');
    const row = await env.DB.prepare('SELECT id, slug FROM communities WHERE slug=?').bind(platformCommunity[1]).first();
    if (!row) fail(404, 'Communauté introuvable.');
    if (row.slug === communitySlug(env, null)) fail(400, 'La communauté de l’adresse principale ne se supprime pas.');
    const used = await env.DB.prepare('SELECT (SELECT COUNT(*) FROM events WHERE community_id=?) + (SELECT COUNT(*) FROM participants WHERE community_id=?) AS n').bind(row.id, row.id).first();
    if (Number(used?.n) > 0) fail(409, 'Cette communauté a déjà des courses ou des pilotes : elle ne peut pas être supprimée.');
    await env.DB.batch([...['iracing_imports', 'memberships', 'community_role_permissions', 'community_recaps', 'discord_weekly_state', 'community_banners']
      .map(table => env.DB.prepare(`DELETE FROM ${table} WHERE community_id=?`).bind(row.id)), env.DB.prepare('DELETE FROM communities WHERE id=?').bind(row.id)]);
    return json({ok:true});
  }
  if (path === '/api/platform/communities' && method === 'GET') {
    if (!actor.manager) fail(403, 'Réservé aux gestionnaires de la plateforme.');
    const list = [];
    for (const item of await allCommunities(env)) {
      const discord = item.discordGuildId ? await discordGuild(env, item.discordGuildId) : null;
      list.push({slug:item.slug, name:item.name, url:communityUrl(env, item), guildId:item.discordGuildId, discordServer:discord?.name || null, botPresent:Boolean(discord), botInviteUrl:botInvite(env, item.discordGuildId)});
    }
    return json({communities:list, baseDomain:baseDomain(env) || null, showcase:openSite, testSite:isDevelopment(env),
      official:mainAddress && community.discordGuildId ? list.find(item => item.guildId === community.discordGuildId) || null : null});
  }
  if (path === '/api/platform/communities' && method === 'POST') {
    if (!actor.manager) fail(403, 'Réservé aux gestionnaires de la plateforme.');
    // The test site has its own database: a community made there could never be reached at its address.
    if (isDevelopment(env)) fail(403, 'Ce site est la version de test : une communauté créée ici n’est pas accessible. Crée-la depuis endurance-manager.app.');
    const input = await body(request);
    const name = text(input.name, 80, 'Nom de la communauté'), shortName = text(input.shortName, 12, 'Nom court');
    const slug = String(input.slug || '').trim().toLowerCase();
    if (!/^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/.test(slug)) fail(400, 'L’adresse : 3 à 40 caractères, lettres minuscules, chiffres et tirets (pas au début ni à la fin).');
    const guildId = String(input.guildId || '').trim();
    if (!/^\d{15,22}$/.test(guildId)) fail(400, 'L’ID du serveur Discord : un nombre de 17 à 20 chiffres (clic droit sur le serveur → Copier l’identifiant du serveur).');
    if (await env.DB.prepare('SELECT 1 FROM communities WHERE discord_guild_id=?').bind(guildId).first()) fail(409, 'Ce serveur Discord est déjà relié à une communauté.');
    try {
      await env.DB.prepare('INSERT INTO communities(id,slug,name,short_name,discord_guild_id,created_at) VALUES(?,?,?,?,?,?)').bind(crypto.randomUUID(), slug, name, shortName, guildId, now()).run();
    } catch (error) {
      if (/UNIQUE|CHECK|constraint/i.test(String(error?.message))) fail(409, 'Cette adresse est déjà prise ou réservée : choisis-en une autre.');
      throw error;
    }
    // Created from a request of the page « Demander un espace »: that request is done.
    await closeCommunityRequest(env, input.requestId);
    const created = {slug};
    return json({ok:true, url:communityUrl(env, created), botInviteUrl:botInvite(env, guildId)}, 201);
  }
  return null;
}
