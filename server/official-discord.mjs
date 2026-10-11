// The official Discord server of Endurance Manager, set up by the bot in one click (platform managers only).
// What is missing is made; what exists (same name, emoji and accents aside, or a former name) is moved into its
// category and renamed, never deleted with its messages. Only the former « 🔊 VOCAUX GÉNÉRAUX », once empty, goes.
// The races' categories (« 🏎️ LMU · 6h de Spa ») are made by the recap (server/recap-discord.mjs) right under
// « 📌 INFOS », its anchor.
// The bot needs the Administrator right for this (taken back afterwards): channels, roles and the server's
// Community mode (forums and the announcement channel need it).
const API = 'https://discord.com/api/v10';
const TEXT = 0, VOICE = 2, CATEGORY = 4, NEWS = 5, FORUM = 15;
const VIEW = 1n << 10n, SEND = 1n << 11n, SEND_IN_THREADS = 1n << 38n, CREATE_THREADS = 1n << 35n;
const STAFF_RIGHTS = (1n << 13n) | (1n << 34n) | (1n << 22n) | (1n << 23n) | (1n << 24n) | (1n << 40n); // messages, threads, mute, deafen, move, timeout

// `site`: what the role may do on the site (server/access.mjs), set by the setup. The Staff moderates the server and
// the site; the Organisateur only the site; « @Fondateur » is made by hand, above the bot's own role.
export const OFFICIAL_ROLES = [
  {name:'Staff', color:0x52d3d8, hoist:true, permissions:String(STAFF_RIGHTS), site:['access', 'admin']},
  {name:'Organisateur', color:0xf5a524, hoist:true, permissions:'0', site:['access', 'admin']},
];
export const EVERYONE_SITE = ['access', 'endurance', 'crews'];
const tags = (...names) => names.map(name => ({name}));
// Read-only: everyone reads, the staff writes. Team: the staff (and the bot) only. `was`: former names, renamed;
// `existing`: moved there when it exists, never made.
export const OFFICIAL_LAYOUT = [
  {name:'📌 INFOS', was:['👋 ACCUEIL'], access:'read-only', anchor:true, channels:[
    {name:'bienvenue'}, {name:'règlement', rules:true}, {name:'annonces', type:NEWS}]},
  {name:'💬 COMMUNAUTÉ', channels:[{name:'discussion'}, {name:'Discussion', type:VOICE}, {name:'Détente', type:VOICE}]},
  {name:'🆘 AIDE', was:['🆘 AIDE ET RETOURS'], channels:[
    {name:'aide', type:FORUM, tags:tags('Connexion', 'Inscription', 'Équipages', 'Bot Discord', 'SimHub', 'Résolu')},
    {name:'bugs', type:FORUM, tags:tags('Nouveau', 'En cours', 'Corrigé')},
    {name:'idées', was:['fonctionnalités'], type:FORUM, tags:tags('Proposée', 'Prévue', 'Faite'), reaction:'👍'}]},
  {name:'🔒 ÉQUIPE', access:'team', channels:[{name:'modération', updates:true}, {name:'logs-bot'}, {name:'suivi-discord', existing:true}]},
];
// Former categories: deleted once their channels have moved out.
const RETIRED = ['🔊 VOCAUX GÉNÉRAUX'];

// « 👋 ACCUEIL » and « accueil » are the same; so are « fonctionnalites » and « fonctionnalités ».
export const sameName = (a, b) => key(a) === key(b);
const key = name => String(name || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '');

async function discord(env, method, path, body) {
  const response = await fetch(API + path, {method, signal:AbortSignal.timeout(8000),
    headers:{Authorization:`Bot ${String(env.DISCORD_BOT_TOKEN || '').trim()}`, ...(body ? {'Content-Type':'application/json'} : {})}, body:body ? JSON.stringify(body) : undefined});
  const data = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) throw Object.assign(new Error(`Discord ${response.status}`), {status:response.status, code:data?.code});
  return data;
}

function overwrites(access, guildId, staffId, botId) {
  if (access === 'read-only') return [{id:guildId, type:0, allow:'0', deny:String(SEND | CREATE_THREADS | SEND_IN_THREADS)},
    ...(staffId ? [{id:staffId, type:0, allow:String(SEND | SEND_IN_THREADS), deny:'0'}] : [])];
  if (access === 'team') return [{id:guildId, type:0, allow:'0', deny:String(VIEW)},
    ...(staffId ? [{id:staffId, type:0, allow:String(VIEW | SEND), deny:'0'}] : []),
    ...(botId ? [{id:botId, type:1, allow:String(VIEW | SEND), deny:'0'}] : [])];
  return undefined;
}

// Makes what is missing. Returns what was made and what already existed; stops at the first refusal of Discord
// (what is made stays, a second click goes on from there).
export async function setupOfficialServer(env, guildId) {
  if (!guildId) throw Object.assign(new Error('Relie d’abord le serveur Discord à cette communauté.'), {status:400});
  if (!String(env.DISCORD_BOT_TOKEN || '').trim()) throw Object.assign(new Error('Le bot du site n’est pas configuré.'), {status:503});
  const made = [], kept = [], moved = [];
  try {
    const [guild, roles, channels] = await Promise.all([discord(env, 'GET', `/guilds/${guildId}`), discord(env, 'GET', `/guilds/${guildId}/roles`),
      discord(env, 'GET', `/guilds/${guildId}/channels`)]);
    let staffId = null;
    const site = {[guildId]:EVERYONE_SITE};
    for (const {site:allowed, ...role} of OFFICIAL_ROLES) {
      let found = roles.find(item => sameName(item.name, role.name));
      if (!found) { found = await discord(env, 'POST', `/guilds/${guildId}/roles`, role); made.push(`@${role.name}`); }
      else if (String(found.permissions) !== role.permissions) {
        await discord(env, 'PATCH', `/guilds/${guildId}/roles/${found.id}`, {permissions:role.permissions}); moved.push(`@${role.name}`);
      }
      else kept.push(`@${role.name}`);
      if (role.name === 'Staff') staffId = found.id;
      site[found.id] = allowed;
    }
    const community = (guild.features || []).includes('COMMUNITY');
    // Community mode first needs its rules channel and its updates channel: those (plain text) are made in the
    // first pass, the announcement channel and the forums in the second, once the server is a Community.
    const ids = {};
    const named = (item, entry) => [entry.name, ...(entry.was || [])].some(name => sameName(item.name, name));
    for (const pass of [1, 2]) {
      for (const [position, group] of OFFICIAL_LAYOUT.entries()) {
        const access = overwrites(group.access, guildId, staffId, env.DISCORD_CLIENT_ID);
        let category = channels.find(item => item.type === CATEGORY && named(item, group));
        if (!category) {
          category = await discord(env, 'POST', `/guilds/${guildId}/channels`, {name:group.name, type:CATEGORY, position,
            ...(access ? {permission_overwrites:access} : {})});
          channels.push(category); made.push(group.name);
        } else if (pass === 1 && !sameName(category.name, group.name)) {
          Object.assign(category, await discord(env, 'PATCH', `/channels/${category.id}`, {name:group.name}));
          moved.push(group.name);
        } else if (pass === 1) kept.push(group.name);
        if (group.anchor) ids.anchor = category.id;
        for (const channel of group.channels) {
          const type = channel.type || TEXT;
          const needsCommunity = type === NEWS || type === FORUM;
          if (needsCommunity !== (pass === 2)) continue;
          const found = channels.find(item => item.type !== CATEGORY && (item.type === VOICE) === (type === VOICE) && named(item, channel));
          if (found) {
            ids[channel.name] = found.id;
            if (found.parent_id === category.id && sameName(found.name, channel.name)) { kept.push(`#${channel.name}`); continue; }
            // Moved into its category with its rights (a channel moved into « ÉQUIPE » is hidden like the others).
            Object.assign(found, await discord(env, 'PATCH', `/channels/${found.id}`, {parent_id:category.id,
              ...(sameName(found.name, channel.name) ? {} : {name:channel.name}), ...(access ? {permission_overwrites:access} : {})}));
            moved.push(`#${channel.name}`); continue;
          }
          if (channel.existing || (needsCommunity && !community && !ids.community)) continue;
          const created = await discord(env, 'POST', `/guilds/${guildId}/channels`, {name:channel.name, type, parent_id:category.id,
            ...(access ? {permission_overwrites:access} : {}),
            ...(channel.tags ? {available_tags:channel.tags} : {}),
            ...(channel.reaction ? {default_reaction_emoji:{emoji_name:channel.reaction}} : {})});
          channels.push(created); ids[channel.name] = created.id; made.push(`#${channel.name}`);
        }
      }
      if (pass === 1 && !community) {
        const rules = OFFICIAL_LAYOUT.flatMap(group => group.channels).find(item => item.rules).name;
        const updates = OFFICIAL_LAYOUT.flatMap(group => group.channels).find(item => item.updates).name;
        await discord(env, 'PATCH', `/guilds/${guildId}`, {features:[...(guild.features || []), 'COMMUNITY'], rules_channel_id:ids[rules],
          public_updates_channel_id:ids[updates], verification_level:Math.max(1, guild.verification_level || 0), explicit_content_filter:2});
        ids.community = true; made.push('Mode Communauté');
      }
    }
    // A former category left empty: deleted.
    for (const old of channels.filter(item => item.type === CATEGORY && RETIRED.some(name => sameName(item.name, name)))) {
      if (channels.some(item => item.parent_id === old.id)) continue;
      await discord(env, 'DELETE', `/channels/${old.id}`);
      channels.splice(channels.indexOf(old), 1); moved.push(`${old.name} (supprimée, vide)`);
    }
    // The categories in order: « INFOS », the races' and any other category, then the rest of the layout.
    const categories = channels.filter(item => item.type === CATEGORY).sort((a, b) => (a.position || 0) - (b.position || 0));
    const layout = OFFICIAL_LAYOUT.map(group => categories.find(item => sameName(item.name, group.name))).filter(Boolean);
    const order = [layout[0], ...categories.filter(item => !layout.includes(item)), ...layout.slice(1)].filter(Boolean);
    if (order.some((item, index) => item !== categories[index]))
      await discord(env, 'PATCH', `/guilds/${guildId}/channels`, order.map((item, position) => ({id:item.id, position})));
    return {made, kept, moved, anchor:ids.anchor, site};
  } catch (error) {
    const reason = error?.status === 403 ? 'Le bot n’a pas les droits : donne-lui le rôle Administrateur le temps de la mise en place.'
      : error?.status === 404 ? 'Le bot n’est pas sur ce serveur.' : 'Discord n’a pas répondu. Réessaie : ce qui est fait reste fait.';
    throw Object.assign(new Error(reason), {status:error?.status === 403 ? 403 : 502, made, kept, moved});
  }
}
