// Mur des stands: the team's live room. The SimHub plugin of the pilot at the wheel opens a WebSocket with his own key
// (GET /api/combos/plugin/live) and sends a snapshot about once a second; the teammates' pages open one too (GET
// /api/combos/live, signed in, « combos » permission) and receive each car's feed as it comes. One room per community
// (a Durable Object, binding LIVE): every car of the team and every viewer meet there, and a single object stays
// within the free plan however many drivers are on track. The room keeps each car's history (laps, stops, stints,
// laps per driver) and writes it aside every 30 s, so a restart of the object loses at most that much.
//
// As little as possible goes over the network: plugin 1.6 sends only what changed (shared/live.mjs mergeSnapshot), the
// pages get a complete feed once then only what changed (diff), the cars' positions only while they show the map, and
// nothing while hidden. The room tells the plugins whether anyone watches ({type:'mode', watch, map}): with nobody,
// they send only what the history needs. Plugin 1.5 and earlier never hear from the room (they would close on it).
//
// Rights are checked when a socket opens and again by making it reconnect after RECHECK. The object is never
// reachable from outside: only these two routes forward to it, with who is connecting in X-Live-* headers.
import {fail} from './core.mjs';
import {cleanFrames, cleanPositions, cleanSnapshot, diff, ingest, mergeSnapshot, positionsOf, prune, publicFeed, raceGaps, DELTA_VERSION, LIVE_FOR} from '../shared/live.mjs';

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
    // The field's path per track, kept from one session to the next (storage path:<track>).
    this.paths = null;
    this.stored = new Set();
    this.savedAt = Date.now();
    this.dirty = new Set();
    // Per feed, what the watching pages last got (their copy, which the next patch builds on), and each car's distance
    // trail for the gaps. Per plugin connection, the last snapshot its changes build on. Lost when the object sleeps:
    // the pages then get a complete feed, the plugin is asked for a complete snapshot.
    this.sent = new Map();
    this.trails = new Map();
    this.bases = new Map();
    // Per plugin connection, the feed its quick messages belong to (known from its first snapshot).
    this.keys = new Map();
  }

  async load() {
    if (this.feeds) return this.feeds;
    const [stored, paths] = await Promise.all([this.state.storage.list({prefix:'feed:'}), this.state.storage.list({prefix:'path:'})]);
    this.feeds = {};
    for (const feed of stored.values()) if (feed?.key) this.feeds[feed.key] = feed;
    this.stored = new Set(Object.keys(this.feeds));
    this.paths = Object.fromEntries([...paths].map(([key, path]) => [key.slice(5), path]));
    return this.feeds;
  }

  async fetch(request) {
    if (!wantsSocket(request)) return new Response('WebSocket attendu.', {status:426});
    const read = name => decodeURIComponent(request.headers.get(`X-Live-${name}`) || '');
    const role = read('Role') === 'driver' ? 'driver' : 'viewer';
    const [client, server] = Object.values(new WebSocketPair());
    this.state.acceptWebSocket(server, [role]);
    server.serializeAttachment({role, user:read('User'), name:read('Name'), color:read('Color') || null, until:Date.now() + RECHECK,
      conn:crypto.randomUUID(), ...(role === 'viewer' ? {watch:true, map:false} : {})});
    if (role === 'viewer') {
      await this.hello(server);
      await this.tellDrivers();
    }
    return new Response(null, {status:101, webSocket:client});
  }

  // A page opening (or shown again): every car's complete feed, and where the cars are.
  async hello(socket) {
    const feeds = await this.load(), at = Date.now();
    const recent = Object.values(feeds).filter(feed => feed.snap && at - feed.updated < SHOWN_FOR);
    const out = recent.map(feed => { if (!this.sent.has(feed.key)) this.sent.set(feed.key, this.publish(feed)); return this.sent.get(feed.key); });
    socket.send(JSON.stringify({type:'hello', now:at, live:LIVE_FOR, feeds:out, pos:Object.fromEntries(recent.map(feed => [feed.key, positionsOf(feed)]))}));
  }

  // The feed as the pages get it, as JSON gives it back to them (so the next patch is worked out on the same copy).
  publish(feed) {
    let trails = this.trails.get(feed.key);
    if (!trails || trails.since !== feed.since) this.trails.set(feed.key, trails = Object.assign(new Map(), {since:feed.since}));
    return JSON.parse(JSON.stringify(publicFeed(feed, raceGaps(feed, trails))));
  }

  // Pages still allowed (the others are made to reconnect), and among them those shown on screen.
  viewers(at = Date.now(), leaving = null) {
    const list = [];
    for (const socket of this.state.getWebSockets('viewer')) {
      if (socket === leaving) continue;
      const info = socket.deserializeAttachment() || {};
      if (at > info.until) { try { socket.close(4001, 'Reconnexion'); } catch {} continue; }
      list.push({socket, info});
    }
    return list;
  }

  // Each plugin told whether a page is shown, and whether one shows the map (only when it changes).
  async tellDrivers(leaving = null) {
    const watching = this.viewers(Date.now(), leaving).filter(item => item.info.watch !== false);
    const mode = {type:'mode', watch:watching.length > 0, map:watching.some(item => item.info.map)}, text = JSON.stringify(mode);
    for (const socket of this.state.getWebSockets('driver')) {
      const info = socket.deserializeAttachment() || {};
      if (!info.delta || info.mode === text) continue;
      try { socket.send(text); socket.serializeAttachment({...info, mode:text}); } catch {}
    }
  }

  async webSocketMessage(socket, message) {
    const info = socket.deserializeAttachment() || {};
    if (Date.now() > info.until) { socket.close(4001, 'Reconnexion'); return; }
    if (typeof message !== 'string' || message.length > MESSAGE_LIMIT) return;
    if (info.role === 'viewer') return this.viewerMessage(socket, info, message);
    if (info.role !== 'driver') return;
    let input;
    try { input = JSON.parse(message); } catch { return; }
    // Plugin 2.4: a quick message between two snapshots (our car's last frames, the cars on the map), only passed on.
    if (input?.f === 1) return this.fast(info, input);
    // Plugin 2.0: the last second of our car, passed on as it is and never merged into the snapshot.
    const frames = cleanFrames(input?.tm);
    if (input && typeof input === 'object') delete input.tm;
    // Plugin 1.6: its changes onto the last snapshot of this connection; without it, a complete one is asked for.
    if (input?.v === DELTA_VERSION) {
      const merged = mergeSnapshot(this.bases.get(info.conn), input);
      if (!merged) { this.bases.delete(info.conn); try { socket.send(JSON.stringify({type:'full'})); } catch {} return; }
      this.bases.set(info.conn, merged);
      input = {...merged};
      delete merged.map;
      if (!info.delta) { socket.serializeAttachment({...info, delta:true}); await this.tellDrivers(); }
    }
    let snap;
    try { snap = cleanSnapshot(input); } catch { return; }
    const feeds = await this.load(), at = Date.now();
    const feed = ingest(feeds, snap, at, {id:info.user, name:info.name, color:info.color}, this.paths);
    this.keys.set(info.conn, feed.key);
    this.dirty.add(feed.key);
    this.broadcast(feed, at, frames);
    if (at - this.savedAt > SAVE_EVERY) await this.save(at);
  }

  // To every page shown: what changed in this car's feed (all of it when the room has no copy), with the positions for
  // those showing the map, and the last second of our car (frames). Nobody watching: nothing, and the copy is dropped
  // (the next page gets it complete).
  broadcast(feed, at, frames = []) {
    const watching = this.viewers(at).filter(item => item.info.watch !== false);
    const before = this.sent.get(feed.key);
    if (!watching.length) { this.sent.delete(feed.key); return; }
    const after = this.publish(feed);
    this.sent.set(feed.key, after);
    const out = before ? {type:'patch', now:at, key:feed.key, patch:diff(before, after) ?? {}} : {type:'feed', now:at, feed:after};
    if (frames.length) out.tm = frames;
    const plain = JSON.stringify(out);
    let withMap = null;
    for (const {socket, info} of watching) {
      try { socket.send(info.map ? withMap ??= JSON.stringify({...out, pos:positionsOf(feed)}) : plain); } catch {}
    }
  }

  // Plugin 2.4's quick message, nine times a second while a page watches: the frames go to every page shown, the
  // positions to those showing the map (and onto the car's last snapshot, for a page opening). Nothing is computed.
  fast(info, input) {
    const feed = this.feeds?.[this.keys.get(info.conn)];
    if (!feed?.snap) return;
    const at = Date.now(), frames = cleanFrames(input.tm), pos = cleanPositions(input.pos), et = Number(input.et);
    if (pos) { const where = new Map(pos.map(([id, x, z]) => [id, [x, z]])); for (const car of feed.snap.field) if (where.has(car.id)) [car.x, car.z] = where.get(car.id); }
    if (!frames.length && !pos) return;
    const out = {type:'fast', now:at, key:feed.key, ...(Number.isFinite(et) ? {et} : {})};
    if (frames.length) out.tm = frames;
    let plain = null, withMap = null;
    for (const {socket, info:page} of this.viewers(at)) {
      if (page.watch === false) continue;
      const text = page.map && pos ? withMap ??= JSON.stringify({...out, pos}) : frames.length ? plain ??= JSON.stringify(out) : null;
      if (text) try { socket.send(text); } catch {}
    }
  }

  // A page says whether it is shown and on which tab: {type:'view', watch, map}; again: its copy was lost, all again.
  async viewerMessage(socket, info, message) {
    let input;
    try { input = JSON.parse(message); } catch { return; }
    if (input?.type !== 'view') return;
    const watch = input.watch !== false, map = Boolean(input.map) && watch;
    socket.serializeAttachment({...info, watch, map});
    if (watch && (info.watch === false || input.again)) await this.hello(socket);
    await this.tellDrivers();
  }

  async save(at = Date.now()) {
    this.savedAt = at;
    const feeds = await this.load();
    prune(feeds, at);
    // Gone: too old, or an earlier session of a car now in a new one.
    const gone = [...this.stored].filter(key => !feeds[key]).map(key => `feed:${key}`);
    const changed = Object.fromEntries([...this.dirty].filter(key => feeds[key]).map(key => [`feed:${key}`, feeds[key]]));
    for (const key of this.dirty) { const feed = feeds[key]; if (feed?.path && this.paths[feed.track] === feed.path) changed[`path:${feed.track}`] = feed.path; }
    this.dirty.clear();
    this.stored = new Set(Object.keys(feeds));
    for (const key of [...this.sent.keys(), ...this.trails.keys()]) if (!feeds[key]) { this.sent.delete(key); this.trails.delete(key); }
    if (gone.length) await this.state.storage.delete(gone);
    if (Object.keys(changed).length) await this.state.storage.put(changed);
  }

  async webSocketClose(socket, code) {
    try { socket.close(code === 1005 || code === 1006 ? 1000 : code, 'Fermé'); } catch {}
    const info = socket.deserializeAttachment() || {};
    if (info.role === 'viewer') { await this.tellDrivers(socket); return; }
    this.bases.delete(info.conn);
    this.keys.delete(info.conn);
    // The last pilot gone: his history is written now rather than lost if the room is put to sleep.
    if (this.dirty.size && !this.state.getWebSockets('driver').filter(item => item !== socket).length) await this.save();
  }

  async webSocketError(socket) {
    try { socket.close(1011, 'Erreur'); } catch {}
  }
}
