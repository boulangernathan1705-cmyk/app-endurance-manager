// « Annoncer un stream »: an entry of the events calendar (events.sim 'stream') that only tells the community when the
// streamer is live: free activity and description, optional identity/logo, a day and the stream's start and/or race start.
// raceSim remains an internal hint for matching an endurance crew, never a UI restriction.
export const STREAM_SIM = 'stream';
export const STREAM_RACE_SIMS = ['lmu', 'iracing'];
export const STREAM_LOGO_MAX_LENGTH = 12000;
export const STREAM_LOGO_MAX_FILE_SIZE = 5 * 1024 * 1024;
export function streamRaceSim(activity) {
  const name = String(activity || '').trim().toLowerCase();
  return ['lmu', 'le mans ultimate'].includes(name) ? 'lmu' : name === 'iracing' ? 'iracing' : '';
}
// Inline raster images only, already resized by the browser. Keep the event within the 24 KB JSON request budget.
export function isStreamLogo(value) {
  if (typeof value !== 'string' || value.length > STREAM_LOGO_MAX_LENGTH) return false;
  const match = value.match(/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/);
  if (!match) return false;
  try {
    const bytes = atob(match[2]);
    return match[1] === 'webp' ? bytes.startsWith('RIFF') && bytes.slice(8, 12) === 'WEBP'
      : match[1] === 'png' ? bytes.startsWith('\x89PNG\r\n\x1a\n')
      : bytes.startsWith('\xff\xd8\xff');
  } catch { return false; }
}
export const isStream = event => event?.sim === STREAM_SIM;
export const streamDetails = event => {
  const details = event?.details || {};
  const isRace = typeof details.isRace === 'boolean' ? details.isRace : Boolean(details.raceSim);
  const activity = details.activity ?? ({lmu:'Le Mans Ultimate', iracing:'iRacing'}[details.raceSim] || '');
  const raceSim = isRace ? streamRaceSim(activity) : '';
  return {streamTime:details.streamTime || '', raceSim, raceTime:isRace ? details.raceTime || '' : '', streamUrl:streamUrl(details.streamUrl) || '',
    isRace, activity, description:details.description || '', streamerName:details.streamerName || '', logoUrl:isStreamLogo(details.logoUrl) ? details.logoUrl : ''};
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
