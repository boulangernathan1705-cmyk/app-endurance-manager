// The buttons of the races' threads and of the morning announcement on Discord (server/discord-weekly-format.mjs,
// server/discord-announce.mjs): « ❌ Absent » marks the pilot absent
// on the site, as the site's own « Absent » button (/api/events/:id/absence), « Annuler » takes it back.
// Discord sends each click here (the « Interactions Endpoint URL » of the application, Developer Portal), signed with
// the application's key (DISCORD_PUBLIC_KEY): an unsigned or wrongly signed request is refused. Only the one who
// clicked sees the answer (an ephemeral message). Without DISCORD_PUBLIC_KEY the threads have no « Absent » button.
import {communityById, communityUrl} from './community.mjs';
import {memberPermissions} from './access.mjs';
import {now} from './core.mjs';
import {tdzOnly} from '../shared/catalog.mjs';
import {isDevelopment} from './dev-environment.mjs';

const PING = 1, COMPONENT = 3;
const REPLY = 4, UPDATE = 7, EPHEMERAL = 64;
const ADMINISTRATOR = 0x8n;

const hex = value => new Uint8Array((String(value || '').match(/[0-9a-f]{2}/gi) || []).map(byte => parseInt(byte, 16)));
async function signed(request, env, body) {
  const key = String(env.DISCORD_PUBLIC_KEY || '').trim(), signature = request.headers.get('X-Signature-Ed25519') || '';
  const timestamp = request.headers.get('X-Signature-Timestamp') || '';
  if (!/^[0-9a-f]{64}$/i.test(key) || !/^[0-9a-f]{128}$/i.test(signature) || !timestamp) return false;
  try {
    const publicKey = await crypto.subtle.importKey('raw', hex(key), {name:'Ed25519'}, false, ['verify']);
    return await crypto.subtle.verify('Ed25519', publicKey, hex(signature), new TextEncoder().encode(timestamp + body));
  } catch { return false; }
}

const answer = data => new Response(JSON.stringify(data), {headers:{'Content-Type':'application/json'}});
const linkRow = (label, url) => url ? [{type:1, components:[{type:2, style:5, label, url}]}] : [];
const reply = (content, components = []) => answer({type:REPLY, data:{content, flags:EPHEMERAL, components, allowed_mentions:{parse:[]}}});
const update = (content, components = []) => answer({type:UPDATE, data:{content, components, allowed_mentions:{parse:[]}}});

// The custom_id of the buttons: « absent:<event id> » on the race's message, « undo:<event id> » on the answer.
export const absentButton = eventId => ({type:2, style:4, label:'Absent', emoji:{name:'❌'}, custom_id:`absent:${eventId}`});
// The races' threads only get « Absent » once Discord sends the clicks here (the key is set).
export const discordAbsentButton = env => /^[0-9a-f]{64}$/i.test(String(env?.DISCORD_PUBLIC_KEY || '').trim()) ? absentButton : null;
const undoButton = eventId => ({type:2, style:2, label:'Annuler', custom_id:`undo:${eventId}`});

export async function discordInteraction(request, env) {
  if (request.method !== 'POST') return new Response(null, {status:405});
  const body = await request.text();
  if (!await signed(request, env, body)) return new Response('Signature invalide.', {status:401});
  const interaction = JSON.parse(body);
  if (interaction.type === PING) return answer({type:PING});
  if (interaction.type !== COMPONENT) return reply('Action inconnue.');
  const [action, eventId] = String(interaction.data?.custom_id || '').split(':');
  const user = interaction.member?.user;
  if (!['absent', 'undo'].includes(action) || !/^[a-f0-9-]{36}$/.test(eventId || '') || !user?.id || !interaction.guild_id) return reply('Action inconnue.');

  // The race's thread or the day's announcement says which community it belongs to (the same race can be on several servers).
  const publication = await env.DB.prepare('SELECT community_id FROM discord_recap_publications WHERE event_id=? AND guild_id=? AND closed_at IS NULL LIMIT 1')
    .bind(eventId, interaction.guild_id).first()
    || await env.DB.prepare('SELECT community_id FROM discord_announcements WHERE item=? AND guild_id=? ORDER BY day DESC LIMIT 1').bind(eventId, interaction.guild_id).first();
  const community = publication && await communityById(env, publication.community_id);
  const event = community && await env.DB.prepare('SELECT id,name,circuit,departures,format,access FROM events WHERE id=?').bind(eventId).first();
  if (!event) return reply('Cette course n’est plus sur le site.');
  let site = '';
  try { site = communityUrl(env, community); } catch {}
  const page = site ? `${site}/${String(event.circuit || '').startsWith('iracing-') ? 'iracing' : 'lmu'}/#event=${event.id}` : '';
  const starts = (() => { try { return JSON.parse(event.departures || '[]'); } catch { return []; } })();
  if (Math.max(0, ...starts.map(start => Number(start?.startsAt) || 0)) <= Date.now()) return reply('Cette course est passée.');

  if (action === 'undo') {
    await env.DB.prepare('DELETE FROM event_absences WHERE event_id=? AND user_id=? AND community_id=?').bind(event.id, user.id, community.id).run();
    return update('C’est retiré, tu n’es plus marqué absent. Pour t’inscrire, c’est sur le site.', linkRow('Ouvrir la course', page));
  }
  // Same rule as on the site: entering endurances on this server (its roles, as Discord gives them with the click).
  const member = interaction.member;
  const admin = (BigInt(member.permissions || '0') & ADMINISTRATOR) === ADMINISTRATOR;
  const permissions = await memberPermissions(env, community, {discord_admin:admin ? 1 : 0, discord_roles:JSON.stringify((member.roles || []).map(String))});
  // An event of EVENT TDZ: OPEN or SAFE, as on the site.
  const tdzEvent = event.format === 'solo' && tdzOnly(community, isDevelopment(env));
  if (tdzEvent ? !permissions.has('solo_open') && !permissions.has('solo_safe') : !permissions.has('endurance'))
    return reply(`Tu n’as pas l’accès aux ${event.format === 'solo' ? 'events' : 'endurances'} sur le site de ce serveur.`, linkRow('Ouvrir le site', site));
  if (await env.DB.prepare("SELECT 1 FROM registrations WHERE event_id=? AND user_id=? AND community_id=? AND COALESCE(status,'')!='unavailable' LIMIT 1").bind(event.id, user.id, community.id).first())
    return reply('Tu es inscrit à cette course : retire d’abord ton inscription sur le site.', linkRow('Ouvrir la course', page));
  // A pilot who never came to the site gets his account, named as on Discord (his server nickname shows on the site).
  const name = String(user.global_name || user.username || 'Pilote').slice(0, 64);
  await env.DB.prepare('INSERT INTO users(id,name,created_at) VALUES(?,?,?) ON CONFLICT(id) DO NOTHING').bind(user.id, name, now()).run();
  await env.DB.prepare('INSERT OR IGNORE INTO event_absences(event_id,user_id,community_id,created_at) VALUES(?,?,?,?)').bind(event.id, user.id, community.id, now()).run();
  return reply(`C’est noté, tu es absent pour **${String(event.name).replace(/[*_~`|\\]/g, '')}**.`, [{type:1, components:[undoButton(event.id)]}]);
}
