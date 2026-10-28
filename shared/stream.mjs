// « Annoncer un stream »: an entry of the events calendar (events.sim 'stream') that only tells the community when the
// streamer is live. No entry, no category, no duration: a title, a day, the stream's start and/or, when it is a race
// (LMU or iRacing), its start. details = {streamTime?:'19:45', raceSim?:'lmu'|'iracing', raceTime?:'20:00', streamUrl?}.
export const STREAM_SIM = 'stream';
export const STREAM_RACE_SIMS = ['lmu', 'iracing'];
export const isStream = event => event?.sim === STREAM_SIM;
export const streamDetails = event => {
  const details = event?.details || {};
  return {streamTime:details.streamTime || '', raceSim:STREAM_RACE_SIMS.includes(details.raceSim) ? details.raceSim : '', raceTime:details.raceTime || '', streamUrl:details.streamUrl || ''};
};
// « 19h45 ».
export const hourLabel = time => String(time || '').replace(':', 'h');

const STREAM_HOSTS = ['twitch.tv', 'youtube.com', 'youtu.be', 'kick.com'];
// A channel name (« tondeuz » = Twitch) or the address of a Twitch, YouTube or Kick channel. Null when invalid.
export function streamUrl(raw) {
  const text = String(raw ?? '').trim();
  if (!text) return null;
  if (/^@?[a-zA-Z0-9_]{2,25}$/.test(text)) return `https://www.twitch.tv/${text.replace(/^@/, '').toLowerCase()}`;
  let url;
  try { url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`); } catch { return null; }
  const host = url.hostname.toLowerCase().replace(/^(www\.|m\.)/, '');
  if (!STREAM_HOSTS.includes(host) || url.pathname.length < 2 || text.length > 200) return null;
  url.protocol = 'https:';
  return url.toString();
}
// « Twitch », « YouTube », « Kick »: the platform of a stream address, to name the link.
export function streamPlatform(url) {
  const host = URL.canParse(String(url || '')) ? new URL(url).hostname.replace(/^www\./, '') : '';
  return /(^|\.)twitch\.tv$/.test(host) ? 'Twitch' : /(^|\.)(youtube\.com|youtu\.be)$/.test(host) ? 'YouTube' : /(^|\.)kick\.com$/.test(host) ? 'Kick' : 'le stream';
}
