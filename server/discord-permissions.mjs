// Shared Discord permission calculation. Never change another role/member's overwrites.
export const VIEW = 1n << 10n, MANAGE = 1n << 4n, SEND = 1n << 11n;
export const HISTORY = 1n << 16n, CONNECT = 1n << 20n, EMBED = 1n << 14n, ADMIN = 1n << 3n;
export const VOICE_ACCESS = VIEW | MANAGE | SEND | HISTORY | CONNECT;
export function guildPermissions(roles, member, guildId) {
  const ids = new Set([String(guildId), ...(member.roles || []).map(String)]);
  return roles.filter(role => ids.has(String(role.id))).reduce((rights,role) => rights | BigInt(role.permissions || 0),0n);
}
export function effectivePermissions(roles, member, guildId, channel, clientId) {
  let rights = guildPermissions(roles,member,guildId);
  if (rights & ADMIN) return ~0n;
  const ids = new Set([String(guildId), ...(member.roles || []).map(String)]);
  const overwrites = channel.permission_overwrites || [];
  const apply = item => { if (item) rights = (rights & ~BigInt(item.deny || 0)) | BigInt(item.allow || 0); };
  apply(overwrites.find(item => String(item.id) === String(guildId) && Number(item.type) === 0));
  const rolesHere = overwrites.filter(item => Number(item.type) === 0 && String(item.id) !== String(guildId) && ids.has(String(item.id)));
  rights = (rights & ~rolesHere.reduce((bits,item) => bits | BigInt(item.deny || 0),0n))
    | rolesHere.reduce((bits,item) => bits | BigInt(item.allow || 0),0n);
  apply(overwrites.find(item => Number(item.type) === 1 && String(item.id) === String(clientId)));
  return rights;
}
export function missingVoicePermissions(rights) {
  return [['Voir le salon',VIEW],['Gérer les salons',MANAGE],['Envoyer des messages',SEND],['Voir les anciens messages',HISTORY],['Se connecter',CONNECT]]
    .filter(([,bit]) => !(rights & bit)).map(([label]) => label);
}
// POST Create Guild Channel may only allow permissions already held by the bot in the guild.
// Callers validate the destination first. Existing member restrictions remain byte-for-byte equivalent.
export function withBotAccess(overwrites, clientId, required) {
  const copy = (overwrites || []).map(item => ({...item}));
  if (!clientId) throw new Error('Le bot du site n’est pas configuré.');
  let mine = copy.find(item => String(item.id) === String(clientId) && Number(item.type) === 1);
  if (!mine) { mine = {id:String(clientId),type:1,allow:'0',deny:'0'}; copy.push(mine); }
  mine.allow = String(BigInt(mine.allow || 0) | required);
  mine.deny = String(BigInt(mine.deny || 0) & ~required);
  return copy;
}
