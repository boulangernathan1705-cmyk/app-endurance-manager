import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {addToPath, cleanFrames, cleanPositions, cleanSnapshot, diff, ingest, mergeSnapshot, outlineLines, patch, publicFeed, raceGaps, readFeed, fairShare, rejoin, stationary, lapsLeft, timeAt, FIELD, prune, STALE_DROP} from '../shared/live.mjs';
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
  assert.throws(() => cleanSnapshot({v:3}), /Format/);
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
    const item = {tag, sent:[], closed:null, attachment, deserializeAttachment:() => item.attachment, serializeAttachment:value => { item.attachment = value; },
      send:message => item.sent.push(message), close:code => { item.closed = code; }};
    sockets.push(item);
    return item;
  };
  return {room:new LiveRoom(state, {}), stored, socket};
}

test('the room passes a pilot\'s snapshot to every page watching, then only what changed, and writes the history aside', async () => {
  const {room, stored, socket} = fakeRoom();
  const until = Date.now() + 60_000;
  const driver = socket('driver', {role:'driver', user:'u1', name:'Nathan', color:'#b98cff', until});
  const viewer = socket('viewer', {role:'viewer', user:'u2', until});
  const late = socket('viewer', {role:'viewer', user:'u3', until:Date.now() - 1});
  await room.webSocketMessage(driver, JSON.stringify(snap({field:[{id:2, x:120.4, z:-30.6}]})));
  assert.equal(viewer.sent.length, 1);
  const message = JSON.parse(viewer.sent[0]);
  assert.equal(message.type, 'feed', 'the room has no copy yet: the whole feed');
  assert.equal(message.feed.pilot.name, 'Nathan');
  assert.equal(late.closed, 4001, 'a page past its time reconnects, so its rights are checked again');
  assert.equal(driver.sent.length, 0, 'plugin 1.5 never hears from the room (it would close)');
  await room.webSocketMessage(viewer, JSON.stringify(snap()));
  await room.webSocketMessage(driver, '{"v":1}');
  await room.webSocketMessage(driver, 'x'.repeat(300_000));
  assert.equal(viewer.sent.length, 1, 'only a pilot\'s valid snapshot is passed on');
  // Then only what changed; the page rebuilds the same feed from its copy.
  await room.webSocketMessage(driver, JSON.stringify(snap({et:1000.5, field:[{id:2, x:125, z:-30.6, dist:50}]})));
  const second = JSON.parse(viewer.sent[1]);
  assert.equal(second.type, 'patch');
  assert.ok(viewer.sent[1].length < viewer.sent[0].length / 4, `${viewer.sent[1].length} vs ${viewer.sent[0].length}`);
  const rebuilt = patch(message.feed, second.patch);
  assert.deepEqual(rebuilt, room.sent.get(`${TRACK}|10|FMT #17`));
  assert.equal(readFeed(rebuilt).snap.field[1].dist, 50);
  assert.equal(readFeed(rebuilt).snap.field[0].vehicle, 'FMT #17', 'the field comes as rows, read back into cars');
  assert.equal(readFeed(rebuilt).snap.field[1].x, null, 'no positions for a page without the map');
  assert.equal(second.pos, undefined);
  // The map shown: the positions too, to the metre.
  await room.webSocketMessage(viewer, JSON.stringify({type:'view', watch:true, map:true}));
  await room.webSocketMessage(driver, JSON.stringify(snap({et:1000.8, field:[{id:2, x:125, z:-30.6, dist:60}]})));
  assert.deepEqual(JSON.parse(viewer.sent.at(-1)).pos, [[1, 0, 0], [2, 125, -31]]);
  // Hidden: nothing; shown again: everything.
  await room.webSocketMessage(viewer, JSON.stringify({type:'view', watch:false}));
  const count = viewer.sent.length;
  await room.webSocketMessage(driver, JSON.stringify(snap({et:1000.9})));
  assert.equal(viewer.sent.length, count);
  assert.equal(room.sent.size, 0, 'nobody watching: no copy kept');
  await room.webSocketMessage(viewer, JSON.stringify({type:'view', watch:true}));
  const hello = JSON.parse(viewer.sent.at(-1));
  assert.equal(hello.type, 'hello');
  assert.equal(hello.feeds[0].snap.et, 1000.9);
  assert.deepEqual(hello.pos[`${TRACK}|10|FMT #17`][0], [1, 0, 0]);
  room.savedAt = 0;
  await room.webSocketMessage(driver, JSON.stringify(snap({et:1001})));
  assert.deepEqual([...stored.keys()].sort(), [`feed:${TRACK}|10|FMT #17`, `path:${TRACK}`]);
  assert.equal(stored.get(`feed:${TRACK}|10|FMT #17`).snap.et, 1001);

  // The car goes on to the qualifying: only that session is shown and kept, the field's path carries on.
  await room.webSocketMessage(driver, JSON.stringify(snap({et:20, session:6})));
  room.savedAt = 0;
  await room.webSocketMessage(driver, JSON.stringify(snap({et:21, session:6})));
  assert.deepEqual([...stored.keys()].sort(), [`feed:${TRACK}|6|FMT #17`, `path:${TRACK}`]);
  assert.ok(stored.get(`feed:${TRACK}|6|FMT #17`).path.some(Boolean));
  assert.deepEqual([...room.sent.keys()], [`${TRACK}|6|FMT #17`], 'the earlier session\'s copy is dropped');
});

test('plugin 1.6 sends only what changed; the room asks for everything when it lost the snapshot, and says who watches', async () => {
  const {room, socket} = fakeRoom();
  const until = Date.now() + 60_000;
  const driver = socket('driver', {role:'driver', user:'u1', name:'Nathan', until, conn:'c1'});
  const full = {...snap(), v:2, full:true};
  await room.webSocketMessage(driver, JSON.stringify({v:2, et:1001, fd:[[1, 7, 6100]]}));
  assert.deepEqual(JSON.parse(driver.sent.at(-1)), {type:'full'}, 'changes with nothing to build on: everything is asked for');
  await room.webSocketMessage(driver, JSON.stringify(full));
  assert.deepEqual(JSON.parse(driver.sent.at(-1)), {type:'mode', watch:false, map:false}, 'nobody watching: the plugin is told');
  const feed = () => Object.values(room.feeds)[0];
  await room.webSocketMessage(driver, JSON.stringify({v:2, et:1001, me:{ve:58}, fd:[[1, 7, 6100, 6, 11, 11, 211.5]]}));
  assert.equal(feed().snap.et, 1001);
  assert.equal(feed().snap.me.ve, 58);
  assert.equal(feed().snap.me.driver, 'N. Boulanger', 'what did not change stays');
  const me = feed().snap.field.find(car => car.id === 1);
  assert.deepEqual([me.dist, me.laps, me.last], [6100, 11, 211.5]);
  assert.equal(feed().ours.laps.at(-1).ve, 2, 'the history goes on from the changes');
  await room.webSocketMessage(driver, JSON.stringify({v:2, et:1002, fd:[[99, 7, 10]]}));
  assert.deepEqual(JSON.parse(driver.sent.at(-1)), {type:'full'}, 'a car the room does not know: everything again');
  const sentBefore = driver.sent.length;
  const viewer = socket('viewer', {role:'viewer', user:'u2', until, watch:true, map:false});
  await room.tellDrivers();
  assert.deepEqual(JSON.parse(driver.sent.at(-1)), {type:'mode', watch:true, map:false});
  await room.webSocketMessage(viewer, JSON.stringify({type:'view', watch:true, map:true}));
  assert.deepEqual(JSON.parse(driver.sent.at(-1)), {type:'mode', watch:true, map:true});
  await room.webSocketMessage(viewer, JSON.stringify({type:'view', watch:true, map:true}));
  assert.equal(driver.sent.length, sentBefore + 2, 'told only when it changes');
  await room.webSocketClose(viewer, 1000);
  assert.deepEqual(JSON.parse(driver.sent.at(-1)), {type:'mode', watch:false, map:false}, 'the last page gone');
  assert.equal(mergeSnapshot(null, {v:1}), null);
});

test('plugin 2.0: the last second of our car goes to the pages watching with the snapshot, never into the history', async () => {
  const {room, socket} = fakeRoom();
  const until = Date.now() + 60_000;
  const driver = socket('driver', {role:'driver', user:'u1', name:'Nathan', until, conn:'c1'});
  const viewer = socket('viewer', {role:'viewer', user:'u2', until, watch:true, map:false});
  const frames = Array.from({length:10}, (_, k) => [6000 + k * 7.4, 266.4, 100, 0, -3, 6]);
  const settings = {control:{tc:4, cut:3, slip:5, abs:7, map:2, mig:1, arbF:3, arbR:4, bias:54.2, odd:9}, limits:1.5, battery:62, regen:180, delta:-0.21, water:88, oil:102};
  await room.webSocketMessage(driver, JSON.stringify({...snap({me:settings}), v:2, full:true, tm:frames}));
  const shown = JSON.parse(viewer.sent.at(-1)).feed;
  assert.deepEqual(shown.snap.me.control, {tc:4, cut:3, slip:5, abs:7, map:2, mig:1, arbF:3, arbR:4, bias:54.2}, 'the settings in the car, nothing else');
  assert.deepEqual([shown.snap.me.battery, shown.snap.me.delta, shown.snap.me.water], [62, -0.21, 88]);
  assert.ok(Array.isArray(shown.ours.laps), 'our laps for the lap history');
  assert.deepEqual(JSON.parse(viewer.sent.at(-1)).tm, cleanFrames(frames));
  await room.webSocketMessage(driver, JSON.stringify({v:2, et:1001, me:{ve:58}, tm:frames.slice(0, 3)}));
  assert.equal(JSON.parse(viewer.sent.at(-1)).tm.length, 3, 'with the changes too');
  const feed = Object.values(room.feeds)[0];
  assert.equal(feed.snap.tm, undefined);
  assert.equal(room.bases.get('c1').tm, undefined, 'the next changes do not carry old frames');
  await room.webSocketMessage(driver, JSON.stringify({v:2, et:1002, me:{ve:57}}));
  assert.equal(JSON.parse(viewer.sent.at(-1)).tm, undefined);
  assert.deepEqual(cleanFrames([[10.4, 120.06, 140, -5, -150, 3], ['x', 1], [null, 2], 'odd']), [[10, 120.1, null, null, null, 3]]);
  assert.equal(cleanFrames(Array.from({length:80}, () => [1, 1, 1, 1, 1, 1])).length, 60);
  assert.equal(cleanFrames(null).length, 0);
});

test('plugin 2.4: quick messages pass our car\'s frames to every page shown and the positions to the map, nothing stored', async () => {
  const {room, stored, socket} = fakeRoom();
  const until = Date.now() + 60_000;
  const driver = socket('driver', {role:'driver', user:'u1', name:'Nathan', until, conn:'c1'});
  const board = socket('viewer', {role:'viewer', user:'u2', until, watch:true, map:false});
  const mapPage = socket('viewer', {role:'viewer', user:'u3', until, watch:true, map:true});
  const hidden = socket('viewer', {role:'viewer', user:'u4', until, watch:false, map:true});
  const quick = {v:2, f:1, et:1000.2, tm:[[6000, 266.4, 100, 0, -3, 6], [6007, 266.9, 100, 0, -2, 6]], pos:[[2, 130.4, -28.6], [1, 'x', 0]]};
  await room.webSocketMessage(driver, JSON.stringify(quick));
  assert.equal(board.sent.length, 0, 'before its first snapshot the room does not know the car');
  await room.webSocketMessage(driver, JSON.stringify(snap({field:[{id:2, x:120, z:-30}]})));
  const counts = [board.sent.length, mapPage.sent.length, hidden.sent.length];
  room.savedAt = Date.now();
  await room.webSocketMessage(driver, JSON.stringify(quick));
  const toBoard = JSON.parse(board.sent.at(-1)), toMap = JSON.parse(mapPage.sent.at(-1));
  assert.equal(toBoard.type, 'fast');
  assert.equal(toBoard.key, `${TRACK}|10|FMT #17`);
  assert.equal(toBoard.et, 1000.2);
  assert.deepEqual(toBoard.tm, cleanFrames(quick.tm));
  assert.equal(toBoard.pos, undefined, 'no positions for a page without the map');
  assert.deepEqual(toMap.pos, [[2, 130, -29]]);
  assert.equal(hidden.sent.length, counts[2], 'nothing to a hidden page');
  assert.deepEqual([room.feeds[toBoard.key].snap.field[1].x, room.feeds[toBoard.key].snap.field[1].z], [130, -29], 'a page opening gets the latest place');
  assert.equal(room.feeds[toBoard.key].snap.et, 1000, 'the snapshot itself is untouched');
  // Positions alone go only to the map.
  await room.webSocketMessage(driver, JSON.stringify({v:2, f:1, et:1000.4, pos:[[2, 131, -28]]}));
  assert.equal(board.sent.length, counts[0] + 1);
  assert.equal(mapPage.sent.length, counts[1] + 2);
  assert.equal(stored.size, 0, 'nothing written');
  assert.equal(cleanPositions('x'), null);
  assert.equal(cleanPositions(Array.from({length:200}, (_, k) => [k, 1, 1])).length, 120);
});

test('only what changed, and the same value back once applied', () => {
  const before = {a:1, list:[1, 2, {x:1}], gone:true, keep:{deep:[1, 2]}, swap:[1]};
  const after = {a:2, list:[1, 3, {x:1, y:null}, 4], keep:{deep:[1, 2]}, swap:{n:1}, fresh:'é'};
  const change = diff(before, after);
  assert.equal(change.keep, undefined, 'nothing about what stays');
  assert.deepEqual(patch(before, change), after);
  assert.deepEqual(before.list, [1, 2, {x:1}], 'the copy it builds on is left as it was');
  assert.deepEqual(patch([1, 2, 3], diff([1, 2, 3], [1])), [1]);
  assert.equal(diff({a:[1]}, {a:[1]}), undefined);
});

test('the room measures the race gaps by class: seconds to the class leader and to the car ahead, laps once lapped', () => {
  const feeds = {}, trails = new Map();
  let feed;
  // Cars 1 (ours, P2) and 3 (P1) Hypercars, 1 runs 100 m behind 3; car 2 a GT3 two laps down.
  for (let et = 1000; et <= 1010; et++) {
    feed = ingest(feeds, cleanSnapshot(snap({et, me:{row:{place:2, dist:5000 + (et - 1000) * 50}},
      field:[{id:3, place:1, dist:5100 + (et - 1000) * 50, laps:10}, {id:2, place:3, cls:'GT3', laps:8, dist:1000}]})), et * 1000);
    var gaps = raceGaps(feed, trails);
  }
  assert.deepEqual(gaps[1], {lead:2, ahead:2}, '100 m at 50 m/s');
  assert.equal(gaps[3], undefined, 'the class leader has none');
  assert.equal(gaps[2], undefined, 'alone in its class');
  feed = ingest(feeds, cleanSnapshot(snap({et:1011, me:{row:{place:2, laps:8, dist:5000}}, field:[{id:3, place:1, dist:5100, laps:10}]})), 1011_000);
  assert.deepEqual(raceGaps(feed, trails)[1], {leadLaps:2, aheadLaps:2});
  assert.deepEqual(publicFeed(feed, {1:{leadLaps:2}}).cars[1].leadLaps, 2);
  assert.deepEqual(raceGaps(ingest(feeds, cleanSnapshot(snap({et:1011, session:1})), 1012_000), trails), {}, 'practice: the page compares best laps');
});

test('only the session under way counts: a restart, a server joined mid-session or another end starts the feed over', () => {
  const feeds = {}, paths = {};
  const send = (et, at, extra = {}) => ingest(feeds, cleanSnapshot(snap({et, session:1, ...extra})), at * 1000, null, paths);
  const first = send(1000, 0);
  send(1100, 100);
  assert.equal(send(1200, 200), first, 'the same session goes on');
  assert.equal(send(1300, 2000), first, 'a long drop (paused game, PC changed for a swap) keeps it');
  const joined = send(5000, 2100);
  assert.notEqual(joined, first, 'the game\'s clock ran ahead of the real one: another server');
  assert.notEqual(send(4990, 2101), joined, 'the clock went back: a restart');
  const now = Object.values(feeds)[0];
  assert.notEqual(send(5000, 2110, {end:7200}), now, 'another planned end');
  assert.equal(Object.keys(feeds).length, 1);
  assert.ok(paths[TRACK].some(Boolean), 'the field\'s path is kept for the next session on the track');
  const other = send(10, 2120, {session:2});
  assert.deepEqual(Object.keys(feeds), [other.key], 'a new session of the same car drops its earlier ones');
  assert.deepEqual(other.path, paths[TRACK]);
  assert.ok(publicFeed(other).since > publicFeed(first).since);
});

test('two of us in the same car, each in a session of his own, keep a feed each; a driver swap stays in one', () => {
  const feeds = {}, nathan = {id:'u1', name:'Nathan'}, hugo = {id:'u2', name:'Hugo'};
  const send = (who, et, at, extra = {}) => ingest(feeds, cleanSnapshot(snap({et, session:1, ...extra})), at * 1000, who);
  const mine = send(nathan, 1000, 0), his = send(hugo, 300, 0.5);
  assert.notEqual(his, mine);
  for (let at = 1; at < 30; at++) {
    assert.equal(send(nathan, 1000 + at, at), mine, 'no swapping back and forth');
    assert.equal(send(hugo, 300 + at, at + 0.5), his);
  }
  assert.equal(Object.keys(feeds).length, 2);
  assert.equal(his.pilot.name, 'Hugo');
  assert.equal(mine.ours.laps.length + his.ours.laps.length, 0);
  // Hugo stops; later Nathan restarts his session: Hugo's old feed goes with the earlier sessions.
  const again = send(nathan, 10, 200);
  assert.deepEqual(Object.keys(feeds), [again.key]);
  // A driver swap: Nathan hands the car to Hugo in the same session, a second apart.
  const swap = {};
  const into = (who, et, at) => ingest(swap, cleanSnapshot(snap({et})), at * 1000, who);
  const race = into(nathan, 5000, 0);
  into(nathan, 5010, 10);
  assert.equal(into(hugo, 5012, 12), race, 'the same session: one feed');
  assert.equal(Object.keys(swap).length, 1);
  // Two of our cars in that session, even under the same name: two feeds.
  const other = ingest(swap, cleanSnapshot(snap({et:5013, me:{id:2, row:{id:2}}, field:[{id:1}]})), 13_000, {id:'u3', name:'Léo'});
  assert.notEqual(other, race);
  assert.equal(Object.keys(swap).length, 2);
});

test('the plugin and the pages reach the room only through their checks', async () => {
  const live = readFileSync(new URL('../server/live.mjs', import.meta.url), 'utf8');
  const combos = readFileSync(new URL('../server/combos.mjs', import.meta.url), 'utf8');
  assert.match(combos, /path === '\/api\/combos\/plugin\/live' \|\| path === '\/api\/combos\/plugin\/live\/pass'\) \{\n\s+const \{community, user\} = await pluginAccess\(request, env\);/);
  // The relay (second Cloudflare account) opens a room only with a pass the site signed after those same checks.
  const relay = readFileSync(new URL('../relay/worker.mjs', import.meta.url), 'utf8');
  assert.match(relay, /const pass = await readPass\(env\.RELAY_SECRET, url\.searchParams\.get\('pass'\)\);\n\s+if \(!pass\) return text\(/);
  assert.match(relay, /openLive\(request, env, pass\.c, \{Role:pass\.r/);
  assert.match(combos, /path === '\/api\/combos\/live'\) \{\n\s+if \(request\.headers\.get\('Origin'\) !== siteOrigin\(request, env\)\) fail\(403/);
  assert.match(live, /env\.LIVE\.idFromName\(communityId\)/);
  const entry = readFileSync(new URL('../server/worker-with-migrations.mjs', import.meta.url), 'utf8');
  assert.match(entry, /export \{LiveRoom\} from '\.\/live\.mjs';/);
  assert.match(entry, /if \(response\.status === 101\) return response;\n\s+return development \? markDevelopmentResponse/);
  for (const file of ['wrangler.jsonc', 'wrangler.dev.jsonc', 'wrangler.prod.jsonc', 'wrangler.relay.jsonc']) {
    const config = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
    assert.match(config, /"durable_objects": \{ "bindings": \[\{ "name": "LIVE", "class_name": "LiveRoom" \}\] \}/, file);
    assert.match(config, /"new_sqlite_classes": \["LiveRoom"\]/, file);
  }
  const page = readFileSync(new URL('../mur-des-stands.html', import.meta.url), 'utf8');
  assert.match(page, /<main id="live-app"/);
  assert.doesNotMatch(page, /<script>|\son[a-z]+=/i, 'no inline script nor handler (CSP)');
  assert.doesNotMatch(readFileSync(new URL('../front/live-page.mjs', import.meta.url), 'utf8'), /\son[a-z]+="/i);
  // The new mur (PitData's organisation): full screen, five tabs, the same checks.
  const wall = readFileSync(new URL('../mur.html', import.meta.url), 'utf8');
  assert.match(wall, /<main id="pw-app"/);
  assert.doesNotMatch(wall, /<script>|\son[a-z]+=/i);
  const wallCode = readFileSync(new URL('../front/pit-wall.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(wallCode, /\son[a-z]+="/i);
  for (const tab of ['board', 'chrono', 'car', 'tele', 'map']) assert.match(wallCode, new RegExp(`\\['${tab}', '`));
});

test('without the game\'s map, the outline is the path the field drives, drawn as far as it is known', () => {
  const feeds = {};
  // 12 rivals spread over the lap, moving 300 m a second; our car in the pit lane.
  const send = et => ingest(feeds, cleanSnapshot(snap({et, me:{row:{pit:1, x:1, z:1}},
    field:Array.from({length:12}, (_, index) => {
      const dist = (et * 300 + index * 1135) % 13626, angle = dist / 13626 * 2 * Math.PI;
      return {id:index + 2, dist, x:Math.cos(angle) * 2000, z:Math.sin(angle) * 2000, pit:index === 11 ? 1 : 0};
    })})), et * 1000);
  send(1000);
  const feed = feeds[Object.keys(feeds)[0]];
  let outline = publicFeed(feed).outline;
  assert.equal(outline.length, 546, 'one place per 25 m of the lap');
  assert.equal(outline.filter(Boolean).length, 11, 'one point per car on track, none for the one in the pit lane');
  assert.equal(outlineLines(outline, 13626).length, 0, 'lone points are not drawn');
  for (let et = 1001; et < 1200; et++) send(et);
  outline = publicFeed(feed).outline;
  assert.ok(outline.every(point => !point || Math.abs(Math.hypot(...point) - 2000) < 1), 'only cars on track, never the one in the pit lane');
  const lines = outlineLines(outline, 13626);
  assert.equal(lines.length, 1);
  assert.ok(lines[0].closed && lines[0].points.length === outline.filter(Boolean).length);
  // The page fills the room's gaps with its own: an addToPath of the same snapshots gives the same places.
  const mine = addToPath(null, cleanSnapshot(snap({et:1300, field:[{id:2, dist:100, x:5, z:6}]})));
  assert.deepEqual(mine[4], [5, 6]);
});

test('the outline is cut where a stretch of the lap is unknown, and joined over the line', () => {
  const path = Array(100).fill(null).map((_, index) => index < 40 || index > 60 ? [index, 0] : null);
  const lines = outlineLines(path, 10000);
  assert.equal(lines.length, 1, 'the two ends meet over the line: one open line from index 61 round to 39');
  assert.equal(lines[0].closed, false);
  assert.deepEqual(lines[0].points[0], [61, 0]);
  assert.deepEqual(lines[0].points.at(-1), [39, 0]);
  assert.deepEqual(outlineLines(Array.from({length:30}, (_, index) => [index, 1])), [{points:Array.from({length:30}, (_, index) => [index, 1]), closed:true}], 'the game\'s map is one closed line');
});

test('gaps on track: seconds since the car ahead was here, laps once a whole lap down', async () => {
  const {addToTrail, trackGap, runOf} = await import('../shared/live.mjs');
  const L = 10000, trail = [];
  // The car ahead runs 50 m/s: at et 100 it is 500 m in lap 3.
  for (let et = 0; et <= 100; et++) addToTrail(trail, et, 2 * L + et * 50 - 4500 + 4500);
  const ref = {laps:2, dist:5000}, car = {laps:2, dist:4000};
  assert.equal(runOf(ref, L), 25000);
  assert.deepEqual(trackGap(car, ref, L, 100, trail), {seconds:20});
  assert.deepEqual(trackGap({laps:1, dist:4000}, ref, L, 100, trail), {laps:1}, 'lapped: the game gives no seconds, we give laps');
  assert.deepEqual(trackGap(car, ref, L, 100, [], 200), {seconds:20}, 'no trail yet: the distance at their pace');
  assert.equal(trackGap(car, ref, L, 100, []), null);
  assert.deepEqual(trackGap(ref, car, L, 100, trail), {seconds:0});
  // One reading behind at the line is skipped, a car sent back to the garage starts over.
  const odd = [{et:0, d:9990}];
  addToTrail(odd, 1, 0); assert.equal(odd.length, 1);
  addToTrail(odd, 2, 10040); assert.equal(odd.length, 2);
  for (let et = 3; et < 8; et++) addToTrail(odd, et, 100);
  assert.equal(odd.length, 1);
});

test('every car\'s tyres, damage and energy per lap: the game\'s figures kept, bounded, averaged over 5 laps', () => {
  const clean = cleanSnapshot(snap({field:[{id:2, cmp:'Medium', dmg:140, veLap:6.5}, {id:3}]}));
  const rival = clean.field.find(car => car.id === 2), old = clean.field.find(car => car.id === 3);
  assert.equal(rival.cmp, 'Medium');
  assert.equal(rival.dmg, null, 'damage is 0 to 100');
  assert.equal(rival.veLap, 6.5);
  assert.deepEqual([old.cmp, old.dmg, old.veLap], [null, null, null], 'a row from an older plugin has none');

  // Car 2 gives its energy per lap, car 3 only its tank: what each lap used comes from the drop of the tank.
  const feeds = {};
  let et = 1000, laps = 10, tank2 = 80, tank3 = 90;
  const send = () => ingest(feeds, cleanSnapshot(snap({et, me:{row:{laps, dist:100}}, field:[{id:2, laps, tank:tank2, veLap:7.2, place:1}, {id:3, laps, tank:tank3, place:3}]})), et * 1000);
  send();
  for (let lap = 0; lap < 3; lap++) { et += 210; laps++; tank2 -= 7; tank3 -= 6; send(); }
  const feed = publicFeed(feeds[Object.keys(feeds)[0]]);
  assert.equal(feed.cars[2].use5, 7.2, 'the game\'s figure first');
  assert.equal(feed.cars[3].use5, 6, 'the first lap seen has no start, the next two used 6 each');
});
