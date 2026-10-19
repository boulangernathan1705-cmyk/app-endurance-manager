import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {cleanSnapshot, ingest, publicFeed, readFeed, fairShare, rejoin, stationary, lapsLeft, timeAt, FIELD, prune, STALE_DROP} from '../shared/live.mjs';
import {LiveRoom} from '../server/live.mjs';

const TRACK = 'Circuit de la Sarthe';
// A field row in the plugin's order (shared/live.mjs FIELD).
function row(car) {
  const base = {place:1, cls:'Hypercar', driver:'R. Rival', vehicle:'Rival #7', num:'7', laps:10, dist:0, pit:0, stops:0, pen:0, last:210, best:209,
    ls1:40, ls2:120, bs1:39.8, bs2:119.5, cs1:null, cs2:null, behind:0, lapsBehind:0, next:0, lapsNext:0, finish:0, x:0, z:0, ...car};
  return FIELD.map(key => base[key]);
}
// A snapshot: our car (id 1) and the field, the session at `et` seconds.
function snap({et = 1000, me = {}, field = [], session = 10, ...rest} = {}) {
  const ours = {id:1, laps:10, dist:6000, place:2, vehicle:'FMT #17', num:'17', driver:'N. Boulanger', ...(me.row || {})};
  return {v:1, track:TRACK, session, et, end:86400, maxLaps:2147483647, length:13626, air:22, trackTemp:31, rain:0, wet:0,
    me:{id:1, driver:ours.driver, car:'Ferrari 499P', vehicle:ours.vehicle, cls:'Hypercar', compound:'Medium', cur:80, pit:ours.pit || 0, ve:60, fuel:50, capacity:90,
      wheels:[[90, 85, 168, 600], [91, 86, 169, 610], [88, 90, 172, 450], [89, 91, 173, 455]], damage:0, stops:[], service:null, profile:null, ...me, row:undefined},
    field:[row(ours), ...field.map(row)], ...rest};
}

test('a snapshot is checked: our car must be in the field, numbers bounded, anything odd dropped', () => {
  assert.throws(() => cleanSnapshot({v:2}), /Format/);
  assert.throws(() => cleanSnapshot({...snap(), track:''}), /incomplète/);
  assert.throws(() => cleanSnapshot(snap({me:{id:99}})), /Notre voiture/);
  const clean = cleanSnapshot(snap({field:[{id:2, driver:'<b>x</b>\u0007', last:-1}, {id:3, laps:'12'}], me:{ve:400, profile:[1, 2, 3]}, map:[[1, 2]]}));
  const rival = clean.field.find(car => car.id === 2);
  assert.equal(rival.driver, '<b>x</b>', 'control characters dropped, text kept as text (the page escapes it)');
  assert.equal(clean.field.length, 2, 'a row whose laps are not a number is dropped');
  assert.equal(clean.me.ve, null);
  assert.equal(clean.me.profile, null, 'a profile is 101 rising times or nothing');
  assert.equal(clean.map, null, 'a map has at least 50 points');
  assert.equal(clean.maxLaps, null, 'a time race has no lap count');
});

test('the room keeps each car\'s laps and stops, our energy and tyres per lap, stints and laps per driver', () => {
  const feeds = {};
  let et = 1000, laps = 10, rival = 10, ve = 60, wear = 90;
  const send = (extra = {}) => ingest(feeds, cleanSnapshot(snap({et, me:{ve, row:{laps, dist:100}, wheels:[[wear, 85, 168, 600], [wear, 86, 169, 610], [wear, 90, 172, 450], [wear, 91, 173, 455]], ...extra.me},
    field:[{id:2, laps:rival, last:211 + (rival % 2) * 0.4, pit:extra.rivalPit || 0, stops:extra.rivalStops || 0, place:1}]})), et * 1000, {id:'u1', name:'Nathan', color:'#b98cff'});
  send();
  for (let lap = 0; lap < 6; lap++) { et += 210; laps++; rival++; ve -= 7; wear -= 0.6; send(); }
  let feed = publicFeed(feeds[Object.keys(feeds)[0]]);
  assert.equal(feed.ours.ve5, 7);
  assert.equal(feed.ours.wear5[0], 0.6);
  assert.ok(Math.abs(feed.cars[2].avg5 - 211.16) < 0.01, 'the rival\'s last 5 laps');
  assert.deepEqual(feed.ours.drivers, {'N. Boulanger':6});
  assert.equal(feed.pilot.name, 'Nathan');

  // The rival stops: 40 s from the lane entry to its exit, then 2 laps on.
  et += 5; send({rivalPit:1});
  et += 40; send({rivalPit:0, rivalStops:1});
  et += 205; rival++; send({rivalStops:1});
  et += 210; rival++; send({rivalStops:1});
  feed = publicFeed(feeds[Object.keys(feeds)[0]]);
  assert.equal(feed.cars[2].stop, 40);
  assert.equal(feed.cars[2].sinceStop, 2);

  // We stop and Lucas takes the car: a new stint, his laps count for him; our stop as the plugin measured it.
  et += 30; send({me:{pit:1, row:{laps, pit:1}}});
  et += 60; send({me:{driver:'L. Martin', row:{laps, driver:'L. Martin'}, stops:[{lap:laps, lane:62.5, stopped:31, ve:60, tyres:4, drive:21.2, driver:'N. Boulanger'}]}});
  for (let lap = 0; lap < 3; lap++) { et += 210; laps++; ve -= 7; send({me:{driver:'L. Martin', row:{laps, driver:'L. Martin'}}}); }
  feed = publicFeed(feeds[Object.keys(feeds)[0]]);
  assert.deepEqual(feed.ours.drivers, {'N. Boulanger':6, 'L. Martin':3});
  assert.deepEqual(feed.ours.stints.map(stint => [stint.driver, stint.laps]), [['N. Boulanger', 6], ['L. Martin', 3]]);
  assert.equal(feed.ours.stops.length, 1);
  assert.equal(feed.ours.stops[0].drive, 21.2);
  // Each stint sums itself up: energy per lap and the stop that ended it.
  assert.equal(feed.ours.stints[0].ve, 7);
  assert.equal(feed.ours.stints[0].stop.lane, 62.5);
  assert.equal(feed.ours.stints[1].stop, null);

  // The session starts again: history from scratch.
  et = 10; send();
  assert.deepEqual(publicFeed(feeds[Object.keys(feeds)[0]]).ours.drivers, {});
  assert.deepEqual(prune(feeds, et * 1000 + STALE_DROP + 1), {});
});

test('LMU\'s fair share: 50 % / N of the team\'s laps each, rounded down, today and at the flag', () => {
  assert.deepEqual(fairShare({A:30, B:20}), {share:0.25, team:50, now:12, end:12, rows:[
    {name:'A', laps:30, missingNow:0, missingEnd:0}, {name:'B', laps:20, missingNow:0, missingEnd:0}]});
  const three = fairShare({A:200, B:120, C:10}, 60);
  assert.equal(three.now, Math.floor(330 / 6));
  assert.equal(three.end, Math.floor(390 / 6));
  assert.equal(three.rows.find(item => item.name === 'C').missingEnd, 65 - 10);
  assert.equal(fairShare({}).rows.length, 0);
});

test('a stop\'s time stopped: refill at the game\'s rate, tyres during or after it, else our own stops', () => {
  const service = {connect:2, energyRate:2.5, fuelRate:2, tyres4:22, tyresAlong:1};
  assert.equal(stationary('energy', {service, energy:40, fuel:null, capacity:90}), 2 + 60 / 2.5);
  assert.equal(stationary('tyres', {service, energy:40, fuel:null, capacity:90}), 26);
  assert.equal(stationary('tyres', {service:{...service, tyresAlong:0}, energy:90, fuel:null, capacity:90}), 2 + 4 + 22);
  assert.equal(stationary('energy', {service, energy:null, fuel:30, capacity:90}), 2 + 60 / 2, 'no virtual energy: the fuel tank');
  assert.equal(stationary('tyres', {service:null, energy:50, stops:[{tyres:4, stopped:30}, {tyres:4, stopped:34}, {tyres:0, stopped:20}]}), 32);
});

test('the rejoin: each car moved at its own pace until we are out of the pits, the gap on track at our pace', () => {
  const feeds = {};
  const base = {length:10000, me:{row:{laps:10, dist:5000}}};
  // A car 10 s behind us on track, as fast; one 30 s ahead; one in the pits 8 s ahead.
  const field = [{id:2, laps:10, dist:4500, place:3, vehicle:'Behind #2'}, {id:3, laps:10, dist:6500, place:1, vehicle:'Ahead #3'}, {id:4, laps:10, dist:5400, place:2, pit:1, vehicle:'Pits #4'}];
  const feed = ingest(feeds, cleanSnapshot(snap({...base, field})), 0);
  const view = readFeed(publicFeed(feed));
  // Pace 200 s a lap for everyone (straight-line lap, no recorded one yet).
  view.ours.avg5 = 200; for (const id of [1, 2, 3, 4]) view.cars[id].avg5 = 200;
  const result = rejoin(view, 50);
  // Half a lap to the line (100 s) and the stop: 150 s on; the others moved the same 150 s, we only 100 s.
  assert.equal(result.tau, 150);
  const gap = id => [...result.ahead, ...result.behind].find(item => item.car.id === id).gap;
  assert.equal(gap(2), 40, 'the car 10 s behind is 40 s ahead once we lost 50 s');
  assert.equal(gap(3), 80);
  assert.equal(gap(4), -92, 'a car in the pits is not moved: we rejoin ahead of it');
  assert.ok(result.ahead.every(item => item.plus > 0.3));
  assert.equal(result.place, 3, 'the car 10 s behind passed us during the stop');
  assert.equal(timeAt(null, 0.25, 200), 50);
  assert.equal(timeAt([...Array(101).keys()].map(k => k * 2), 0.5, 100), 50);
});

test('laps to the flag: the rest of this lap, then whole laps until the clock runs out', () => {
  const s = cleanSnapshot(snap({et:1000, end:1000 + 650, length:10000, me:{row:{dist:5000}}}));
  assert.equal(lapsLeft(s, 200), 3.5, 'half a lap, then laps ending 300, 500 and 700 s from now');
  assert.equal(lapsLeft(cleanSnapshot(snap({maxLaps:30, field:[{id:2, laps:12}]})), 200), 18);
});

// The hibernation API of a Durable Object, enough for the room.
function fakeRoom() {
  const stored = new Map(), sockets = [];
  const state = {
    storage:{list:async ({prefix}) => new Map([...stored].filter(([key]) => key.startsWith(prefix))), put:async items => { for (const [key, value] of Object.entries(items)) stored.set(key, structuredClone(value)); },
      delete:async keys => { for (const key of keys) stored.delete(key); }},
    getWebSockets:tag => sockets.filter(socket => socket.tag === tag)
  };
  const socket = (tag, attachment) => {
    const item = {tag, sent:[], closed:null, attachment, deserializeAttachment:() => item.attachment, send:message => item.sent.push(message), close:code => { item.closed = code; }};
    sockets.push(item);
    return item;
  };
  return {room:new LiveRoom(state, {}), stored, socket};
}

test('the room passes a pilot\'s snapshot to every page watching, ignores the rest and writes the history aside', async () => {
  const {room, stored, socket} = fakeRoom();
  const until = Date.now() + 60_000;
  const driver = socket('driver', {role:'driver', user:'u1', name:'Nathan', color:'#b98cff', until});
  const viewer = socket('viewer', {role:'viewer', user:'u2', until});
  const late = socket('viewer', {role:'viewer', user:'u3', until:Date.now() - 1});
  await room.webSocketMessage(driver, JSON.stringify(snap()));
  assert.equal(viewer.sent.length, 1);
  const message = JSON.parse(viewer.sent[0]);
  assert.equal(message.type, 'feed');
  assert.equal(message.feed.pilot.name, 'Nathan');
  assert.equal(late.closed, 4001, 'a page past its time reconnects, so its rights are checked again');
  await room.webSocketMessage(viewer, JSON.stringify(snap()));
  await room.webSocketMessage(driver, '{"v":1}');
  await room.webSocketMessage(driver, 'x'.repeat(300_000));
  assert.equal(viewer.sent.length, 1, 'only a pilot\'s valid snapshot is passed on');
  // The outline and our lap's profile go again only when they change; the page keeps the previous ones.
  await room.webSocketMessage(driver, JSON.stringify(snap({et:1000.5})));
  const light = JSON.parse(viewer.sent[1]).feed;
  assert.ok(!('outline' in light) && light.snap.me.profile === undefined);
  assert.deepEqual(readFeed(light, readFeed(message.feed)).outline, readFeed(message.feed).outline);
  assert.equal(readFeed(light).snap.field[0].vehicle, 'FMT #17', 'the field comes as rows, read back into cars');
  room.savedAt = 0;
  await room.webSocketMessage(driver, JSON.stringify(snap({et:1001})));
  assert.equal(stored.size, 1);
  assert.equal([...stored.values()][0].snap.et, 1001);
});

test('the plugin and the pages reach the room only through their checks', async () => {
  const live = readFileSync(new URL('../server/live.mjs', import.meta.url), 'utf8');
  const combos = readFileSync(new URL('../server/combos.mjs', import.meta.url), 'utf8');
  assert.match(combos, /path === '\/api\/combos\/plugin\/live'\) \{\n\s+const \{community, user\} = await pluginAccess\(request, env\);/);
  assert.match(combos, /path === '\/api\/combos\/live'\) \{\n\s+if \(request\.headers\.get\('Origin'\) !== siteOrigin\(request, env\)\) fail\(403/);
  assert.match(live, /env\.LIVE\.idFromName\(communityId\)/);
  const entry = readFileSync(new URL('../server/worker-with-migrations.mjs', import.meta.url), 'utf8');
  assert.match(entry, /export \{LiveRoom\} from '\.\/live\.mjs';/);
  assert.match(entry, /if \(response\.status === 101\) return response;\n\s+return development \? markDevelopmentResponse/);
  for (const file of ['wrangler.jsonc', 'wrangler.dev.jsonc', 'wrangler.prod.jsonc']) {
    const config = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
    assert.match(config, /"durable_objects": \{ "bindings": \[\{ "name": "LIVE", "class_name": "LiveRoom" \}\] \}/, file);
    assert.match(config, /"new_sqlite_classes": \["LiveRoom"\]/, file);
  }
  const page = readFileSync(new URL('../mur-des-stands.html', import.meta.url), 'utf8');
  assert.match(page, /<main id="live-app"/);
  assert.doesNotMatch(page, /<script>|\son[a-z]+=/i, 'no inline script nor handler (CSP)');
  assert.doesNotMatch(readFileSync(new URL('../front/live-page.mjs', import.meta.url), 'utf8'), /\son[a-z]+="/i);
});
