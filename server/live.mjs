// Mur des stands: the team's live room. The SimHub plugin of the pilot at the wheel opens a WebSocket with his own key
// (GET /api/combos/plugin/live) and sends a snapshot about once a second; the teammates' pages open one too (GET
// /api/combos/live, signed in, « combos » permission) and receive each car's feed as it comes. One room per community
// (a Durable Object, binding LIVE): every car of the team and every viewer meet there, and a single object stays
// within the free plan however many drivers are on track. The room keeps each car's history (laps, stops, stints,
// laps per driver) and writes it aside every 30 s, so a restart of the object loses at most that much.
//
// Rights are checked when a socket opens and again by making it reconnect after RECHECK. The object is never
// reachable from outside: only these two routes forward to it, with who is connecting in X-Live-* headers.
import {fail} from './core.mjs';
import {cleanSnapshot, ingest, outlineOf, prune, publicFeed, LIVE_FOR} from '../shared/live.mjs';

const MESSAGE_LIMIT = 256_000;
const RECHECK = 4 * 3600_000;
const SAVE_EVERY = 30_000;
// On opening, the page gets the feeds sent to in the last half hour (the latest state of a car parked in the garage).
const SHOWN_FOR = 30 * 60_000;

const wantsSocket = request => (request.headers.get('Upgrade') || '').toLowerCase() === 'websocket';

// Forwards a WebSocket opening to the community's room, saying who connects. The 101 answer goes back as it is.
export async function openLive(request, env, communityId, who) {
  if (request.method !== 'GET' || !wantsSocket(request)) fail(426, 'Connexion en direct attendue (WebSocket).');
  if (!env.LIVE) fail(503, 'Le direct n’est pas encore configuré sur ce site.');
  const headers = new Headers({Upgrade:'websocket'});
  for (const [name, value] of Object.entries(who)) headers.set(`X-Live-${name}`, encodeURIComponent(String(value ?? '')));
  const room = env.LIVE.get(env.LIVE.idFromName(communityId));
  return room.fetch('https://live.invalid/socket', {headers});
}

export class LiveRoom {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.feeds = null;
    this.savedAt = Date.now();
    this.dirty = new Set();
    // Per feed, the outline and profile last sent: sent again only when they change.
    this.shapes = new Map();
  }

  async load() {
    if (this.feeds) return this.feeds;
    const stored = await this.state.storage.list({prefix:'feed:'});
    this.feeds = {};
    for (const feed of stored.values()) if (feed?.key) this.feeds[feed.key] = feed;
    return this.feeds;
  }

  async fetch(request) {
    if (!wantsSocket(request)) return new Response('WebSocket attendu.', {status:426});
    const read = name => decodeURIComponent(request.headers.get(`X-Live-${name}`) || '');
    const role = read('Role') === 'driver' ? 'driver' : 'viewer';
    const [client, server] = Object.values(new WebSocketPair());
    this.state.acceptWebSocket(server, [role]);
    server.serializeAttachment({role, user:read('User'), name:read('Name'), color:read('Color') || null, until:Date.now() + RECHECK});
    if (role === 'viewer') {
      const feeds = await this.load(), at = Date.now();
      const recent = Object.values(feeds).filter(feed => feed.snap && at - feed.updated < SHOWN_FOR).map(publicFeed);
      server.send(JSON.stringify({type:'hello', now:at, live:LIVE_FOR, feeds:recent}));
    }
    return new Response(null, {status:101, webSocket:client});
  }

  // A pilot's snapshot: into its car's history, then to every page watching. Anything else is ignored.
  async webSocketMessage(socket, message) {
    const info = socket.deserializeAttachment() || {};
    if (Date.now() > info.until) { socket.close(4001, 'Reconnexion'); return; }
    if (info.role !== 'driver' || typeof message !== 'string' || message.length > MESSAGE_LIMIT) return;
    let snap;
    try { snap = cleanSnapshot(JSON.parse(message)); } catch { return; }
    const feeds = await this.load(), at = Date.now();
    const feed = ingest(feeds, snap, at, {id:info.user, name:info.name, color:info.color});
    this.dirty.add(feed.key);
    const shape = `${outlineOf(feed).length}|${feed.mapFromGame}|${snap.me.profile?.[100] ?? ''}`, changed = this.shapes.get(feed.key) !== shape;
    this.shapes.set(feed.key, shape);
    const out = JSON.stringify({type:'feed', now:at, feed:publicFeed(feed, changed)});
    for (const viewer of this.state.getWebSockets('viewer')) {
      const seen = viewer.deserializeAttachment() || {};
      try { if (at > seen.until) viewer.close(4001, 'Reconnexion'); else viewer.send(out); } catch {}
    }
    if (at - this.savedAt > SAVE_EVERY) await this.save(at);
  }

  async save(at = Date.now()) {
    this.savedAt = at;
    const feeds = await this.load(), before = new Set(Object.keys(feeds));
    prune(feeds, at);
    const gone = [...before].filter(key => !feeds[key]).map(key => `feed:${key}`);
    const changed = Object.fromEntries([...this.dirty].filter(key => feeds[key]).map(key => [`feed:${key}`, feeds[key]]));
    this.dirty.clear();
    if (gone.length) await this.state.storage.delete(gone);
    if (Object.keys(changed).length) await this.state.storage.put(changed);
  }

  async webSocketClose(socket, code) {
    try { socket.close(code === 1005 || code === 1006 ? 1000 : code, 'Fermé'); } catch {}
    // The last pilot gone: his history is written now rather than lost if the room is put to sleep.
    if (this.dirty.size && !this.state.getWebSockets('driver').length) await this.save();
  }

  async webSocketError(socket) {
    try { socket.close(1011, 'Erreur'); } catch {}
  }
}
