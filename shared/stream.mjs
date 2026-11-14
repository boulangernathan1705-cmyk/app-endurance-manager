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
  return {streamTime:details.streamTime || '', streamEnd:details.streamEnd || '', raceSim, raceTime:isRace ? details.raceTime || '' : '', streamUrl:streamUrl(details.streamUrl) || '',
    isRace, activity, description:details.description || '', streamerName:details.streamerName || '', logoUrl:isStreamLogo(details.logoUrl) ? details.logoUrl : ''};
};
// « 19h45 ».
export const hourLabel = time => String(time || '').replace(':', 'h');
// « 19h45–23h », « 21h », « jusqu’à 23h »: when a stream is live, short (Nathan 2026-11-02: start and end on the calendar).
const shortHour = time => hourLabel(time).replace(/h00$/, 'h');
export const streamSpan = (start, end) => start && end ? `${shortHour(start)}–${shortHour(end)}` : start ? shortHour(start) : end ? `jusqu’à ${shortHour(end)}` : '';

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

// « Annoncer un stream » during an endurance start the community streams (« Je streame ce départ »): the same stream,
// told once, by the endurance (Nathan, 2026-11-08: « STREAMS 13H30 & 14H00 » for one stream). startsAt: the stream's
// start; starts: [{startsAt, endsAt}] of the streamed endurance starts. A stream from 3 h before such a start to its end
// is the endurance's.
const MERGE_BEFORE = 3 * 3600000;
export const streamDuringEndurance = (startsAt, starts) => Number.isFinite(Number(startsAt))
  && starts.some(start => Number(startsAt) >= Number(start.startsAt) - MERGE_BEFORE && Number(startsAt) <= Number(start.endsAt || start.startsAt));

// « Annoncer un stream » of a race shown elsewhere (an event of the calendar): the same race, told once, with its stream
// (Nathan, 2026-11-11). stream: {name, startsAt, time ('HH:MM' of startsAt), raceSim, raceTime}; race: {name, sim, startsAt}.
// Same race: the same name that day, the same sim with a start within an hour of the stream's race (or stream) time,
// or any race starting at the stream's race time (± 15 min).
const clock = time => { const [hours, mins] = String(time || '').split(':').map(Number); return hours * 60 + mins; };
// The same race told twice (an event of the calendar and an endurance, or a stream and its race): same name, case aside.
export const sameRaceName = (a, b) => Boolean(raceNameKey(a)) && raceNameKey(a) === raceNameKey(b);
const raceNameKey = value => String(value || '').trim().toLowerCase();
// An event of the calendar for the same race as an endurance start: same name, starting within the hour. Told once,
// by the endurance (calendar and morning announcement alike).
export const isEnduranceTwin = (event, endurance) => sameRaceName(event.name, endurance.name) && Math.abs(Number(event.startsAt) - Number(endurance.startsAt)) < 3600000;
export function streamIsRace(stream, race) {
  const at = Number(stream.startsAt), shift = stream.raceTime && stream.time ? (clock(stream.raceTime) - clock(stream.time)) * 60000 : 0;
  const target = at + (Number.isFinite(shift) ? shift : 0), near = Math.abs(Number(race.startsAt) - target);
  return Number.isFinite(near) && ((sameRaceName(stream.name, race.name) && near <= 12 * 3600000)
    || (Boolean(stream.raceSim) && stream.raceSim === race.sim && near <= 3600000) || (Boolean(stream.raceTime) && near <= 15 * 60000));
}
