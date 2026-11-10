// The community's own settings: members, season, look, modules and its Discord (called by server/worker.mjs).
import {saveCommunitySeason} from './season.mjs';
import {discordDiagnostic} from './discord-diagnostic.mjs';
import {grindfestAvailable, grindfestEnabled} from '../shared/grindfest.mjs';
import {
  discordRequest, botRecapSettings, recapDestinations, recapError, validateRecapDestinations, validateDiscordLayout, previewBotRecap,
  saveBotRecap, syncBotRecaps, repairBotRecap, removeBotDiscord, serverRights, RECAP_BOT_PERMISSIONS
} from './recap-discord.mjs';
import {siteOf} from './discord-weekly.mjs';
import {announceStream, sendAnnouncementPreview} from './discord-announce.mjs';
import {HttpError, fail, now, json, administrators, body, rateLimit, text} from './core.mjs';
import {TDZ_EVENT_TYPES, tdzOnly, eventsLabel} from '../shared/catalog.mjs';
import {appearanceOf, communityUrl, soloRacesEnabled} from './community.mjs';
import {isDevelopment} from './dev-environment.mjs';
import {
  requirePermission, PERMISSIONS, DEFAULT_EVERYONE, normalizePermissions, discordGuild, keepDiscordLook, memberPermissions,
  refreshCommunityMembers
} from './access.mjs';
import {syncIracingEvents} from './iracing-import.mjs';
import {combosEnabled} from './combos.mjs';
import {parseLayout} from './discord-layout.mjs';
import {checkCrewAccess, validateCrewAccess, serverCategories, CREW_BOT_PERMISSIONS} from './crew-discord.mjs';
// Body of an image upload (the banner), read up to `limit` bytes.
async function imageBody(request, limit) {
  const reader = request.body?.getReader();
  if (!reader) fail(400, 'Image manquante.');
  let size = 0; const chunks = [];
  while (true) { const {value, done} = await reader.read(); if (done) break; size += value.length; if (size > limit) { await reader.cancel(); fail(413, 'Image trop lourde (600 Ko au plus).'); } chunks.push(value); }
  const all = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { all.set(chunk, offset); offset += chunk.length; }
  return all;
}
// Type of an image from its first bytes (never from what the browser says).
function imageType(bytes) {
  const text = (start, end) => String.fromCharCode(...bytes.slice(start, end));
  if (text(0, 4) === 'RIFF' && text(8, 12) === 'WEBP') return 'image/webp';
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (text(1, 4) === 'PNG' && bytes[0] === 0x89) return 'image/png';
  return null;
}
// Invitation of the bot (the site's Discord application) to a community's server: it only reads members and roles.
// Without permissions the bot only reads the members and their roles; the crews on Discord need more
// (server/crew-discord.mjs): the admins invite it again with them.
export function botInvite(env, guildId, permissions = '0') {
  if (!env.DISCORD_CLIENT_ID) return null;
  return `https://discord.com/oauth2/authorize?client_id=${encodeURIComponent(env.DISCORD_CLIENT_ID)}&scope=bot&permissions=${permissions}${guildId ? `&guild_id=${guildId}&disable_guild_select=true` : ''}`;
}
// « Modules »: whether the bot may make the crews' channels, its invite link with those rights, what last
// stopped it, and where the voice channels are made (the server's categories to choose from).
async function crewDiscordState(env, community) {
  const saved = await env.DB.prepare('SELECT last_error, last_error_at, voice_category_id FROM community_crew_discord WHERE community_id=?').bind(community.id).first();
  const on = community.modules.crewChannels === true;
  const failedChannelId = saved?.last_error?.match(/salon (\d{15,22})/)?.[1] || null;
  const bot = await checkCrewAccess(env,community,{includeCategories:on,failedChannelId});
  return {botReady:bot.ready, botProblem:bot.why, botMissing:bot.missing || [], botChannelName:bot.channelName || null, botInviteUrl:botInvite(env, community.discordGuildId, CREW_BOT_PERMISSIONS),
    lastError:on ? saved?.last_error || null : null, voiceCategoryId:saved?.voice_category_id || null,
    categories:on ? bot.categories || null : null};
}
// Crews on Discord (server/crew-discord.mjs): turned on only once the bot has the rights to make the channels;
// crewCategory: where their voice channels are made, a category of the server or '' for the top of the server.
async function crewModuleStatements(env, community, modules, input) {
  const statements = [];
  if (typeof input.crewChannels === 'boolean') {
    if (input.crewChannels) await assertCrewAccess(env,community,{categoryId:typeof input.crewCategory === 'string' ? input.crewCategory.trim() : undefined, layout:input.layout === true});
    modules.crewChannels = input.crewChannels;
    if (input.crewChannels) statements.push(env.DB.prepare(`INSERT INTO community_crew_discord(community_id,updated_at) VALUES(?,?)
      ON CONFLICT(community_id) DO UPDATE SET last_error=NULL,last_error_at=NULL,updated_at=excluded.updated_at`).bind(community.id, now()));
  }
  if (typeof input.crewCategory === 'string') {
    const category = input.crewCategory.trim();
    await assertCrewAccess(env,community,{categoryId:category, layout:input.layout === true});
    if (category && !(await serverCategories(env, community.discordGuildId) || []).some(item => item.id === category)) fail(400, 'Cette catégorie n’existe pas sur ton serveur.');
    statements.push(env.DB.prepare(`INSERT INTO community_crew_discord(community_id,voice_category_id,updated_at) VALUES(?,?,?)
      ON CONFLICT(community_id) DO UPDATE SET voice_category_id=excluded.voice_category_id,last_error=NULL,last_error_at=NULL,updated_at=excluded.updated_at`).bind(community.id, category || null, now()));
  }
  return statements;
}
async function assertCrewAccess(env,community,options) {
  try { return await validateCrewAccess(env,community,options); }
  catch (error) { if (error.status === 400) fail(400,error.message); throw error; }
}
// Answers the request when it is one of the community's settings, else null.
export async function communityApi({path, method, request, env, actor, community}) {
  // Admins can run the daily import of official iRacing endurances at once.
  if (path === '/api/admin/iracing-import' && method === 'POST') {
    requirePermission(actor,'admin');
    // Manual update from the iRacing space (admins), e.g. to repair after a change of the schedule data.
    try { return json(await syncIracingEvents(env)); }
    catch (error) { fail(502, 'Le calendrier iRacing est momentanément indisponible. Réessaie plus tard.'); }
  }
  // Members of the community: the players found on its Discord server, with their Discord roles and what
  // these roles allow here. Roles and access are managed on Discord; the role settings page comes with step 4.
  if (path === '/api/members/refresh' && method === 'POST') {
    requirePermission(actor,'admin');
    return json({ok:true, checked:await refreshCommunityMembers(env, community)});
  }
  if (path === '/api/members' && method === 'GET') {
    requirePermission(actor,'admin');
    const rows = (await env.DB.prepare(`SELECT m.*, u.name FROM memberships m JOIN users u ON u.id=m.user_id
      WHERE m.community_id=? AND m.status='member' ORDER BY lower(u.name) LIMIT 500`).bind(community.id).all()).results || [];
    const discord = community.discordGuildId ? await discordGuild(env, community.discordGuildId) : null;
    const roleNames = new Map((discord?.roles || []).map(role => [role.id, role.name]));
    const members = [];
    for (const row of rows) members.push({id:row.user_id, name:row.name, nickname:row.nickname, discordAdmin:Boolean(row.discord_admin),
      manager:administrators(env).includes(row.user_id),
      roles:JSON.parse(row.discord_roles || '[]').map(roleId => ({id:roleId, name:roleNames.get(roleId) || roleId})),
      permissions:[...await memberPermissions(env, community, row)], checkedAt:row.checked_at});
    return json({community:{name:community.name, discordServer:discord?.name || null}, members, permissions:PERMISSIONS});
  }
  // Community settings (admins): what each Discord role allows, and the enabled modules.
  if (path === '/api/community/season' && method === 'PUT') {
    if (!tdzOnly(community, isDevelopment(env)) || !soloRacesEnabled(env, community)) fail(403, 'Le calendrier des events n’est pas activé.');
    return json(await saveCommunitySeason(env, actor, community, await body(request)));
  }
  if (path === '/api/community/settings' && method === 'GET') {
    requirePermission(actor,'admin');
    const discord = community.discordGuildId ? await discordGuild(env, community.discordGuildId) : null;
    const rows = (await env.DB.prepare('SELECT discord_role_id, permissions FROM community_role_permissions WHERE community_id=?').bind(community.id).all()).results || [];
    const saved = new Map(rows.map(row => [row.discord_role_id, JSON.parse(row.permissions || '[]')]));
    const roles = (discord?.roles || []).sort((a, b) => b.position - a.position).map(role => ({id:role.id, name:role.id === community.discordGuildId ? '@everyone' : role.name,
      administrator:role.administrator, permissions:saved.has(role.id) ? normalizePermissions(saved.get(role.id)) : (role.id === community.discordGuildId ? [...DEFAULT_EVERYONE] : [])}));
    await keepDiscordLook(env, community, discord);
    return json({community:{name:community.name, shortName:community.shortName, discordServer:discord?.name || null, ...appearanceOf(community), botAvatarUrl:community.appearance?.botAvatarUrl || null}, roles, permissions:PERMISSIONS,
      modules:{iracingImport:community.modules.iracingImport === true, discordWeekly:community.modules.discordWeekly === true, soloRaces:soloRacesEnabled(env, community), eventTdzAvailable:tdzOnly(community, isDevelopment(env)), eventsLabel:eventsLabel(community, isDevelopment(env)), eventTypes:!tdzOnly(community, isDevelopment(env)) ? [] : grindfestEnabled(community, isDevelopment(env)) ? [...TDZ_EVENT_TYPES, 'Gridfest'] : TDZ_EVENT_TYPES, grindfest:grindfestEnabled(community, isDevelopment(env)), grindfestAvailable:grindfestAvailable(community, isDevelopment(env)),
        crewChannels:community.modules.crewChannels === true, raceReminders:community.modules.raceReminders === true, categoryEntry:community.modules.categoryEntry === true, combos:combosEnabled(community), combosManager:actor.manager === true},
      crews:await crewDiscordState(env, community)});
  }
  // Banner sent by the admins: the image itself (already resized by the browser), WebP, JPEG or PNG, 600 KB at most.
  if (path === '/api/community/banner' && ['PUT','DELETE'].includes(method)) {
    requirePermission(actor,'admin');
    const appearance = {...community.appearance};
    if (method === 'DELETE') {
      delete appearance.bannerVersion;
      await env.DB.batch([env.DB.prepare('DELETE FROM community_banners WHERE community_id=?').bind(community.id),
        env.DB.prepare('UPDATE communities SET appearance=? WHERE id=?').bind(JSON.stringify(appearance), community.id)]);
      return json({ok:true});
    }
    const image = await imageBody(request, 600000);
    const type = imageType(image);
    if (!type) fail(400, 'Envoie une image WebP, JPEG ou PNG.');
    appearance.bannerVersion = now();
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO community_banners(community_id,image,content_type,updated_at) VALUES(?,?,?,?)
        ON CONFLICT(community_id) DO UPDATE SET image=excluded.image,content_type=excluded.content_type,updated_at=excluded.updated_at`).bind(community.id, image, type, now()),
      env.DB.prepare('UPDATE communities SET appearance=? WHERE id=?').bind(JSON.stringify(appearance), community.id)]);
    return json({ok:true, bannerUrl:`/api/community/banner?v=${appearance.bannerVersion}`});
  }
  // Logo of the bot on this community's Discord server only (Discord: Modify Current Member, avatar as a data URI,
  // PNG or JPEG). Without one, the bot keeps its own logo, the same everywhere.
  if (path === '/api/community/bot-avatar' && ['PUT','DELETE'].includes(method)) {
    requirePermission(actor,'admin');
    if (!community.discordGuildId) fail(400, 'Aucun serveur Discord n’est relié à cette communauté.');
    let avatar = null;
    if (method === 'PUT') {
      const image = await imageBody(request, 1000000);
      const type = imageType(image);
      if (!['image/png','image/jpeg'].includes(type)) fail(400, 'Envoie une image PNG ou JPEG.');
      let binary = ''; for (let i = 0; i < image.length; i += 0x8000) binary += String.fromCharCode(...image.subarray(i, i + 0x8000));
      avatar = `data:${type};base64,${btoa(binary)}`;
    }
    let member;
    try { member = await discordRequest(env, 'PATCH', `/guilds/${community.discordGuildId}/members/@me`, {avatar}); }
    catch (error) { fail(502, error.status === 429 ? 'Discord limite les changements de logo : réessaie dans quelques minutes.' : error.status === 403 || error.status === 404 ? 'Le bot n’est pas sur le serveur Discord.' : 'Discord a refusé ce logo. Réessaie avec une autre image.'); }
    const url = member?.avatar && member?.user?.id ? `https://cdn.discordapp.com/guilds/${community.discordGuildId}/users/${member.user.id}/avatars/${member.avatar}.png?size=256` : null;
    await (url ? env.DB.prepare("UPDATE communities SET appearance=json_set(COALESCE(appearance,'{}'),'$.botAvatarUrl',?) WHERE id=?").bind(url, community.id)
      : env.DB.prepare("UPDATE communities SET appearance=json_remove(COALESCE(appearance,'{}'),'$.botAvatarUrl') WHERE id=?").bind(community.id)).run();
    return json({ok:true, botAvatarUrl:url});
  }
  if (path === '/api/community/appearance' && method === 'PATCH') {
    requirePermission(actor,'admin');
    const input = await body(request);
    const name = text(input.name, 80, 'Nom de la communauté'), shortName = text(input.shortName, 12, 'Nom court');
    if (input.accent !== null && !/^#[0-9a-f]{6}$/i.test(input.accent || '')) fail(400, 'Choisis une couleur valide.');
    const appearance = {...community.appearance, accent:input.accent || null};
    delete appearance.palette;
    delete appearance.defaultMode;
    await env.DB.prepare('UPDATE communities SET name=?, short_name=?, appearance=? WHERE id=?').bind(name, shortName, JSON.stringify(appearance), community.id).run();
    return json({ok:true});
  }
  const roleSetting = path.match(/^\/api\/community\/roles\/(\d{15,22})$/);
  if (roleSetting && method === 'PUT') {
    requirePermission(actor,'admin');
    const input = await body(request);
    const discord = community.discordGuildId ? await discordGuild(env, community.discordGuildId) : null;
    if (!discord?.roles.some(role => role.id === roleSetting[1])) fail(404, 'Ce rôle n’existe pas sur le serveur Discord de la communauté.');
    if (!Array.isArray(input.permissions) || input.permissions.some(permission => !PERMISSIONS.includes(permission))) fail(400, 'Autorisations invalides.');
    await env.DB.prepare(`INSERT INTO community_role_permissions(community_id,discord_role_id,permissions,updated_at) VALUES(?,?,?,?)
      ON CONFLICT(community_id,discord_role_id) DO UPDATE SET permissions=excluded.permissions,updated_at=excluded.updated_at`)
      .bind(community.id, roleSetting[1], JSON.stringify([...new Set(input.permissions)]), now()).run();
    return json({ok:true});
  }
  if (path === '/api/community/modules' && method === 'PATCH') {
    requirePermission(actor,'admin');
    const input = await body(request);
    const modules = {...community.modules};
    if (typeof input.grindfest === 'boolean') {
      if (!grindfestAvailable(community, isDevelopment(env))) fail(403, 'Le module Gridfest est réservé aux TDZ.');
      modules.grindfest = input.grindfest;
      if (input.grindfest) modules.soloRaces = true;
    }
    if (input.soloRaces === false && modules.grindfest) fail(400, 'Éteins Gridfest avant de désactiver les événements solo.');
    // The Discord recap is configured through the guided bot module.
    for (const key of ['iracingImport','soloRaces','raceReminders','categoryEntry']) if (typeof input[key] === 'boolean') modules[key] = input[key];
    // Fiches combo: a private module, opened for a team by the platform managers only.
    if (typeof input.combos === 'boolean') {
      if (!actor.manager) fail(403, 'Seuls les gestionnaires de la plateforme ouvrent les fiches combo.');
      modules.combos = input.combos;
    }
    // EVENT TDZ: the Discord channel that explains how to become SAFE (a button for the pilots who are not).
    if (typeof input.safeGuideUrl === 'string') {
      const url = input.safeGuideUrl.trim();
      if (url && (url.length > 200 || !/^https:\/\/((ptb\.|canary\.)?discord\.com|discord\.gg)\//.test(url))) fail(400, 'Colle le lien d’un salon Discord (clic droit sur le salon → Copier le lien).');
      modules.safeGuideUrl = url;
    }
    const statements = await crewModuleStatements(env, community, modules, {...input, layout:false});
    statements.push(env.DB.prepare('UPDATE communities SET modules=? WHERE id=?').bind(JSON.stringify(modules), community.id));
    await env.DB.batch(statements);
    return json({ok:true, modules});
  }
  // « Mise en place » (admins): where the community stands, step by step (members page).
  if (path === '/api/community/setup' && method === 'GET') {
    requirePermission(actor,'admin');
    const discord = community.discordGuildId ? await discordGuild(env, community.discordGuildId) : null;
    const legacy = await env.DB.prepare('SELECT scope FROM community_recaps WHERE community_id=? ORDER BY scope').bind(community.id).all();
    const legacyScopes = (legacy.results || []).map(row=>row.scope);
    const rolesConfigured = Boolean(await env.DB.prepare('SELECT 1 FROM community_role_permissions WHERE community_id=? LIMIT 1').bind(community.id).first());
    const savedBotRecap = await botRecapSettings(env, community);
    const botRecap = savedBotRecap;
    return json({botRecap:botRecap ? {enabled:Boolean(botRecap.enabled),mode:botRecap.mode,lmuId:botRecap.destination_id,lmuName:botRecap.destination_name,
        iracingId:botRecap.iracing_destination_id,iracingName:botRecap.iracing_destination_name,calendarId:botRecap.calendar_destination_id,calendarName:botRecap.calendar_destination_name,lastError:botRecap.last_error,
        layout:parseLayout(botRecap.layout), leftovers:!botRecap.enabled && botRecap.bot_categories !== '{}'} : null,
      recapBotInviteUrl:env.DISCORD_CLIENT_ID ? `https://discord.com/oauth2/authorize?client_id=${encodeURIComponent(env.DISCORD_CLIENT_ID)}&scope=bot&permissions=${RECAP_BOT_PERMISSIONS}&guild_id=${community.discordGuildId}&disable_guild_select=true` : null,
      // Administrator: the only right that also opens the hidden categories (no exception to add there).
      recapBotAdminInviteUrl:env.DISCORD_CLIENT_ID ? `https://discord.com/oauth2/authorize?client_id=${encodeURIComponent(env.DISCORD_CLIENT_ID)}&scope=bot&permissions=8&guild_id=${community.discordGuildId}&disable_guild_select=true` : null,
      community:{name:community.name, slug:community.slug}, siteUrl:communityUrl(env, community), rolesConfigured, recapSetupRequired:!savedBotRecap, recapSuggestedScope:legacyScopes.length === 1 ? legacyScopes[0] : 'all',
      guild:{id:community.discordGuildId, name:discord?.name || null, botPresent:Boolean(discord)}, botInviteUrl:botInvite(env, community.discordGuildId),
      discordInviteUrl:community.discordInviteUrl});
  }
  // Guided bot recaps: preview is read-only; only explicit activation/test publishes.
  if (path === '/api/community/recap/destinations' && method === 'GET') {
    requirePermission(actor,'admin');
    try { const [destinations, server] = await Promise.all([recapDestinations(env, community), serverRights(env, community)]); return json({destinations, server}); }
    catch (error) { fail(400, recapError(error)); }
  }
  if (path === '/api/community/recap/preview' && method === 'POST') {
    requirePermission(actor,'admin');
    try {
      const input = await body(request);
      const settings = input.layout ? await validateDiscordLayout(env,community,input.layout) : await validateRecapDestinations(env,community,input);
      const saved = await botRecapSettings(env, community);
      return json({previews:await previewBotRecap(env,Date.now(),community,{...settings, bot_categories:saved?.bot_categories || '{}'})});
    } catch (error) { fail(400,error.message === 'Discord indisponible' ? recapError(error) : error.message); }
  }
  if(path==='/api/community/discord/announcement-test'&&method==='POST'){
    requirePermission(actor,'admin');
    await rateLimit(request,env,'discord-announcement-test',3);
    const input=await body(request),destinations=await recapDestinations(env,community);
    const matches=destinations.filter(channel=>channel.type===0&&(channel.id===input.channel||channel.name===input.channel));
    if(matches.length!==1)fail(400,'Choisis un salon texte unique du serveur de cette communauté.');
    const channel=matches[0];
    if(channel.announceMissing?.some(right=>!['Mentionner @everyone','Voir les anciens messages'].includes(right)))fail(400,'Le bot doit pouvoir voir le salon, envoyer des messages et intégrer des liens.');
    // The poster of a stream day with example data, as sent at 7h30 (the text when Cloudflare's browser is not set up).
    const site={...siteOf(env,community),streamUrl:announceStream(await botRecapSettings(env,community))||'https://www.twitch.tv/lapraline_tdz'};
    const sent=await sendAnnouncementPreview(env,community,channel.id,site);
    return json({ok:true,poster:sent.poster,url:`https://discord.com/channels/${community.discordGuildId}/${channel.id}/${sent.id}`});
  }
  // Everything the bot made for « Discord » taken off: the messages, channels and categories, the crews' voice channels.
  const removeDiscord = async () => {
    requirePermission(actor,'admin');
    const modules = {...community.modules, crewChannels:false, raceReminders:false};
    let result;
    try { result = await removeBotDiscord(env,Date.now(),community); }
    catch (error) { fail(error.status === 409 ? 409 : 400,error.message === 'Discord indisponible' ? recapError(error) : error.message); }
    await env.DB.prepare('UPDATE communities SET modules=? WHERE id=?').bind(JSON.stringify(modules), community.id).run();
    community.modules = modules;
    return json({ok:true, done:!result?.more && !result?.partial});
  };
  // « Discord » (Modules): the recaps, the crews' voice channels and the reminders, saved together.
  if (path === '/api/community/discord' && method === 'PUT') {
    requirePermission(actor,'admin');
    const input = await body(request);
    const modules = {...community.modules};
    if (input.enabled === false) return removeDiscord();
    try {
      // The setting asked question by question (input.layout), or the one of the previous page.
      const settings = input.layout ? await validateDiscordLayout(env,community,input.layout) : await validateRecapDestinations(env,community,input);
      const layout = parseLayout(settings.layout);
      const reminders = layout ? layout.reminders : input.raceReminders;
      if (typeof reminders === 'boolean') modules.raceReminders = reminders;
      const voices = layout ? layout.voices : input.crewChannels === true;
      // « Récap de la semaine »: the voice channels go to the category chosen for them (« Pit talk », made by the bot, gets
      // its id at the sync); « une catégorie par course »: to the race's.
      const crewCategory = layout ? (voices && layout.mode === 'general' && layout.pit === 'existing' ? (layout.pitAt === 'top' ? '' : layout.pitAt) : undefined)
        : voices && settings.mode === 'general' && typeof input.crewCategory === 'string' ? input.crewCategory : undefined;
      const crewInput = {crewChannels:voices, layout:Boolean(layout), ...(crewCategory !== undefined ? {crewCategory} : {})};
      const statements = await crewModuleStatements(env, community, modules, crewInput);
      await saveBotRecap(env,community,settings);
      await env.DB.batch([...statements, env.DB.prepare('UPDATE communities SET modules=? WHERE id=?').bind(JSON.stringify(modules), community.id)]);
      community.modules = modules;
      const publication = await syncBotRecaps(env,Date.now(),community).catch(error => ({ok:false,error:error.message}));
      return json({ok:true,published:publication.ok,error:publication.error});
    } catch (error) {
      if (error instanceof HttpError) throw error;
      fail(error.status === 409 ? 409 : 400,error.message === 'Discord indisponible' ? recapError(error) : error.message);
    }
  }
  // « Tout retirer »: the bot takes off what it made (a few requests per pass, the next ones every 2 minutes).
  if (path === '/api/community/discord' && method === 'DELETE') {
    requirePermission(actor,'admin');
    return removeDiscord();
  }
  if (path === '/api/community/discord/diagnostic' && method === 'GET') {
    requirePermission(actor,'admin');
    const live = new URL(request.url).searchParams.get('live') === '1';
    if (live) await rateLimit(request,env,'discord-diagnostic',6);
    return json(await discordDiagnostic(env,community,{live}));
  }
  if (path === '/api/community/recap/repair' && method === 'POST') {
    requirePermission(actor,'admin');
    await rateLimit(request,env,'recap-repair',10);
    try { return json(await repairBotRecap(env,Date.now(),community)); }
    catch (error) { fail(error.status === 409 ? 409 : 400,error.message === 'Discord indisponible' ? recapError(error) : error.message); }
  }
  // Retired endpoints cannot write or publish historical webhook configurations.
  if ((path === '/api/community/recaps' && method === 'PUT') || (path === '/api/community/recaps/test' && method === 'POST') || (path === '/api/community/recap/legacy-preview' && method === 'GET')) {
    requirePermission(actor,'admin');
    fail(410,'Les récaps sont désormais gérés par le bot. Configure le récap dans Administration → Modules.');
  }
  // Invitation to the community's Discord server, shown to the players who are not members yet.
  if (path === '/api/community/invite' && method === 'PATCH') {
    requirePermission(actor,'admin');
    const input = await body(request);
    const url = input.url == null || input.url === '' ? null : String(input.url).trim();
    if (url && !/^https:\/\/(?:discord\.gg|discord\.com\/invite)\/[\w-]{2,64}$/.test(url)) fail(400, 'Colle un lien d’invitation Discord (https://discord.gg/…).');
    await env.DB.prepare('UPDATE communities SET discord_invite_url=? WHERE id=?').bind(url, community.id).run();
    return json({ok:true});
  }
  return null;
}
