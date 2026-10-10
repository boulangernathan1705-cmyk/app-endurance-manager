// The official Discord server of Endurance Manager, set up by the bot in one click (platform managers only).
// Only what is missing is made: a category, channel or role that already exists (same name, emoji and accents
// aside) is left as it is, never moved, renamed or deleted. The races' categories (« 🏎️ LMU · 6h de Spa ») are
// made later by the recap (server/recap-discord.mjs), under « 🆘 AIDE ET RETOURS ».
// The bot needs the Administrator right for this (taken back afterwards): channels, roles and the server's
// Community mode (forums and the announcement channel need it).
const API = 'https://discord.com/api/v10';
const TEXT = 0, VOICE = 2, CATEGORY = 4, NEWS = 5, FORUM = 15;
const VIEW = 1n << 10n, SEND = 1n << 11n, SEND_IN_THREADS = 1n << 38n, CREATE_THREADS = 1n << 35n;
const STAFF_RIGHTS = (1n << 13n) | (1n << 34n) | (1n << 22n) | (1n << 23n) | (1n << 24n) | (1n << 40n); // messages, threads, mute, deafen, move, timeout

export const OFFICIAL_ROLES = [
  {name:'Staff', color:0x52d3d8, hoist:true, permissions:String(STAFF_RIGHTS)},
  {name:'Organisateur', color:0xf5a524, hoist:true, permissions:'0'},
];
const tags = (...names) => names.map(name => ({name}));
// Read-only: everyone reads, the staff writes. Team: the staff (and the bot) only.
export const OFFICIAL_LAYOUT = [
  {name:'👋 ACCUEIL', access:'read-only', channels:[
    {name:'bienvenue'}, {name:'règlement', rules:true}, {name:'annonces', type:NEWS}, {name:'bien-démarrer'}]},
  {name:'💬 COMMUNAUTÉ', channels:[{name:'discussion'}]},
  {name:'🆘 AIDE ET RETOURS', channels:[
    {name:'aide', type:FORUM, tags:tags('Connexion', 'Inscription', 'Équipages', 'Bot Discord', 'SimHub', 'Résolu')},
    {name:'bugs', type:FORUM, tags:tags('Nouveau', 'En cours', 'Corrigé')},
    {name:'fonctionnalités', type:FORUM, tags:tags('Proposée', 'Prévue', 'Faite'), reaction:'👍'}]},
  {name:'🔊 VOCAUX GÉNÉRAUX', channels:[{name:'Discussion', type:VOICE}, {name:'Détente', type:VOICE}]},
  {name:'🔒 ÉQUIPE', access:'team', channels:[{name:'modération', updates:true}, {name:'logs-bot'}]},
];

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
  const made = [], kept = [];
  try {
    const [guild, roles, channels] = await Promise.all([discord(env, 'GET', `/guilds/${guildId}`), discord(env, 'GET', `/guilds/${guildId}/roles`),
      discord(env, 'GET', `/guilds/${guildId}/channels`)]);
    let staffId = null;
    for (const role of OFFICIAL_ROLES) {
      let found = roles.find(item => sameName(item.name, role.name));
      if (found) kept.push(`@${role.name}`);
      else { found = await discord(env, 'POST', `/guilds/${guildId}/roles`, role); made.push(`@${role.name}`); }
      if (role.name === 'Staff') staffId = found.id;
    }
    const community = (guild.features || []).includes('COMMUNITY');
    // Community mode first needs its rules channel and its updates channel: those (plain text) are made in the
    // first pass, the announcement channel and the forums in the second, once the server is a Community.
    const ids = {};
    for (const pass of [1, 2]) {
      for (const [position, group] of OFFICIAL_LAYOUT.entries()) {
        let category = channels.find(item => item.type === CATEGORY && sameName(item.name, group.name));
        if (!category) {
          category = await discord(env, 'POST', `/guilds/${guildId}/channels`, {name:group.name, type:CATEGORY, position,
            ...(overwrites(group.access, guildId, staffId, env.DISCORD_CLIENT_ID) ? {permission_overwrites:overwrites(group.access, guildId, staffId, env.DISCORD_CLIENT_ID)} : {})});
          channels.push(category); made.push(group.name);
        } else if (pass === 1) kept.push(group.name);
        for (const channel of group.channels) {
          const type = channel.type || TEXT;
          const needsCommunity = type === NEWS || type === FORUM;
          if (needsCommunity !== (pass === 2)) continue;
          if (needsCommunity && !community && !ids.community) continue;
          const found = channels.find(item => item.type !== CATEGORY && (item.type === VOICE) === (type === VOICE) && sameName(item.name, channel.name));
          if (found) { ids[channel.name] = found.id; kept.push(`#${channel.name}`); continue; }
          const access = overwrites(group.access, guildId, staffId, env.DISCORD_CLIENT_ID);
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
    return {made, kept};
  } catch (error) {
    const reason = error?.status === 403 ? 'Le bot n’a pas les droits : donne-lui le rôle Administrateur le temps de la mise en place.'
      : error?.status === 404 ? 'Le bot n’est pas sur ce serveur.' : 'Discord n’a pas répondu. Réessaie : ce qui est fait reste fait.';
    throw Object.assign(new Error(reason), {status:error?.status === 403 ? 403 : 502, made, kept});
  }
}
