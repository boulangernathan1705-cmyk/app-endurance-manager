// EVENT TDZ « Event commenté »: the streamer comments the event live. Either the community's pilots race it
// (entries as usual), or it is only a commentary (no entry: the event just tells when the stream is).
// Stored in events.details.commentary = {mode:'race'|'watch', stream:'https://…'}; the channel is remembered
// per community (modules.streamChannel) to fill the next form.
export const COMMENTARY_MODES = ['race', 'watch'];
export const commentaryOf = event => {
  const value = event?.details?.commentary;
  return value && COMMENTARY_MODES.includes(value.mode) && value.stream ? value : null;
};
export const isWatchOnly = event => commentaryOf(event)?.mode === 'watch';

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
// « twitch.tv/tondeuz », to show the channel without the address around it.
export function streamLabel(url) {
  try { const parsed = new URL(url); return `${parsed.hostname.replace(/^(www\.|m\.)/, '')}${parsed.pathname.replace(/\/$/, '')}`; } catch { return ''; }
}
