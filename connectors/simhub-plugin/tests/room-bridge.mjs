// Le salon du mur des stands rejoué hors du site (tests/Replay) : les messages que le plugin aurait envoyés
// (<nom>.plugin.jsonl) passent par le même code que le salon (shared/live.mjs, comme server/live.mjs : fusion des
// changements, nettoyage, historique, écarts), et ressortent comme une page ou le mur dans SimHub les reçoit
// (hello, puis patch) dans <nom>.room.jsonl.
//   node room-bridge.mjs <entrée.plugin.jsonl> <sortie.room.jsonl>
import {readFileSync, writeFileSync} from 'node:fs';
import {cleanSnapshot, diff, ingest, mergeSnapshot, publicFeed, raceGaps, DELTA_VERSION, LIVE_FOR} from '../../../shared/live.mjs';

const [input, output] = process.argv.slice(2);
const feeds = {}, trails = new Map(), sent = new Map(), pilot = {id:'pilote', name:'Pilote', color:'#45d4d0'};
let base = null;
const lines = [];

// server/live.mjs publish(): the feed as pages get it, through JSON.
function publish(feed) {
  let trail = trails.get(feed.key);
  if (!trail || trail.since !== feed.since) trails.set(feed.key, trail = Object.assign(new Map(), {since:feed.since}));
  return JSON.parse(JSON.stringify(publicFeed(feed, raceGaps(feed, trail))));
}

for (const line of readFileSync(input, 'utf8').split('\n').filter(Boolean)) {
  const {at, message} = JSON.parse(line);
  let data = JSON.parse(message);
  const frames = Array.isArray(data.tm) ? data.tm : [];
  delete data.tm;
  if (data.v === DELTA_VERSION) {
    const merged = mergeSnapshot(base, data);
    if (!merged) throw Error(`Changement sans base à ${at} : le plugin aurait dû renvoyer tout.`);
    base = merged;
    data = {...merged};
    delete merged.map;
  }
  const snap = cleanSnapshot(data);
  const feed = ingest(feeds, snap, at, pilot, null);
  const after = publish(feed), before = sent.get(feed.key);
  sent.set(feed.key, after);
  const out = before ? {type:'patch', now:at, key:feed.key, patch:diff(before, after) ?? {}} : {type:'hello', now:at, live:LIVE_FOR, feeds:[after]};
  // server/live.mjs broadcast(): our car's last second goes along, as it came.
  if (frames.length) out.tm = frames;
  lines.push(JSON.stringify({at, message:JSON.stringify(out)}));
}
writeFileSync(output, lines.join('\n') + '\n');
console.log(`${lines.length} messages du salon → ${output}`);
