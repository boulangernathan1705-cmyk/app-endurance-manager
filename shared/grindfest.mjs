// Entitlement is tied to the immutable community slug, never to a client-supplied flag.
export const grindfestAvailable = (community, development = false) => community?.slug === 'tdz' || (development && community?.slug === 'test');
export const grindfestEnabled = (community, development = false) => grindfestAvailable(community, development) && community?.modules?.grindfest === true;
export function eventDetails(event) {
  return typeof event?.details === 'string' ? JSON.parse(event.details || '{}') : event?.details || {};
}
export const isGrindfest = event => eventDetails(event).type === 'Grindfest';
export const streamersOf = event => eventDetails(event).streamers || [];

export function normalizeStreamers(raw) {
  if (!Array.isArray(raw) || raw.length < 2 || raw.length > 12) throw Error('Ajoute entre 2 et 12 streamers.');
  const ids = new Set(), names = new Set();
  const result = raw.map(item => {
    const id = String(item?.id || ''), name = String(item?.name || '').trim(), capacity = Number(item?.capacity);
    if (!/^[a-zA-Z0-9-]{1,64}$/.test(id) || ids.has(id)) throw Error('Identifiant de streamer invalide ou en double.');
    const key = name.normalize('NFKC').toLocaleLowerCase('fr-FR');
    if (!name || name.length > 60 || names.has(key)) throw Error('Chaque streamer doit avoir un nom unique (60 caractères maximum).');
    if (!Number.isInteger(capacity) || capacity < 1 || capacity > 120) throw Error('Choisis entre 1 et 120 places par streamer.');
    const twitchUrl = String(item?.twitchUrl || '').trim();
    if (!/^https:\/\/(www\.)?twitch\.tv\/[a-zA-Z0-9_]{1,25}\/?$/.test(twitchUrl)) throw Error('Indique le lien Twitch de chaque streamer.');
    const logoUrl = String(item?.logoUrl || '').trim();
    if (logoUrl && !/^https:\/\/(cdn\.discordapp\.com|static-cdn\.jtvnw\.net|static\.twitchcdn\.net)\/[^\s]{1,400}$/.test(logoUrl) && !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]{1,6000}$/.test(logoUrl)) throw Error('Importe un logo ou utilise un lien d’image Twitch ou Discord.');
    ids.add(id); names.add(key);
    return {id, name, capacity, twitchUrl, logoUrl};
  });
  if (JSON.stringify(result).length > 18000) throw Error('Les logos sont trop volumineux. Utilise des images plus simples.');
  return result;
}

// Entries arrive in database order. Deriving ranks avoids overselling when two pilots enter together.
// Removing an entry automatically promotes the first waiting pilot for that streamer only.
export function assignStreamerWaitlist(entries, streamers) {
  const counts = new Map(), capacities = new Map(streamers.map(item => [item.id, item.capacity]));
  for (const reg of entries) {
    if (reg.status === 'unavailable') continue;
    const count = (counts.get(reg.streamerId) || 0) + 1;
    counts.set(reg.streamerId, count);
    const capacity = capacities.get(reg.streamerId);
    reg.waitlistPosition = capacity == null ? count : count > capacity ? count - capacity : null;
  }
  return entries;
}
