// Compact, session-sized samples feed a publication, never the page's raw telemetry.
// Each pilot has the same weight. Sampling stops at the quorum and restarts every 15 days.
import {id} from './core.mjs';
import {memoSheet} from '../shared/training.mjs';

export const MEMO_QUORUM = {pilots:5, laps:100};
export const MEMO_PERIOD = 15 * 86400 * 1000;
export const mean = values => values.length ? values.reduce((sum,value)=>sum+value,0)/values.length : null;
const all = async (env,sql,...params) => (await env.DB.prepare(sql).bind(...params).all()).results || [];

// Keep sums and observation counts so multiple sessions do not distort a pilot's average.
export function memoSample(session, limit = 100) {
  const valid = session.laps.filter(lap=>!lap.pit&&!lap.invalid);
  const pace = mean(valid.map(lap=>lap.t).filter(value=>value>0));
  const laps = valid.filter(lap=>(!pace||!lap.t||lap.t<=pace*1.07)&&(lap.fuel>0||lap.ve>0)).slice(0,limit);
  const sample = {laps:laps.length, metrics:{}, tyres:{}, game:session.game||null};
  const add = (metrics,key,value) => {
    if(value===null||value===undefined||!Number.isFinite(value))return;
    const item=metrics[key] ||= {sum:0,count:0}; item.sum+=value;item.count++;
  };
  if(session.capacity>0)add(sample.metrics,'capacity',session.capacity);
  for(const lap of laps) {
    if(lap.fuel>0)add(sample.metrics,'fuel',lap.fuel);
    if(lap.ve>0)add(sample.metrics,'ve',lap.ve);
    if(lap.compound&&lap.wear.some(value=>value>0)) {
      const tyre=sample.tyres[lap.compound] ||= {laps:0,metrics:{}};tyre.laps++;
      add(tyre.metrics,'wear',mean(lap.wear.filter(value=>value!==null)));
      lap.wear.forEach((value,index)=>add(tyre.metrics,`wheel${index}`,value));
      add(tyre.metrics,'temp',mean(lap.temp.filter(value=>value!==null)));
      add(tyre.metrics,'track',lap.track);
    }
  }
  for(const stop of session.stops||[])if(stop.lane>stop.stopped)add(sample.metrics,'lane',stop.lane-stop.stopped);
  return sample;
}

export function samplePilots(rows) {
  const pilots = new Map();
  const merge = (target,source) => {for(const [key,value]of Object.entries(source)){
    const item=target[key] ||= {sum:0,count:0};item.sum+=value.sum;item.count+=value.count;
  }};
  for(const row of rows) {
    const sample=typeof row.sample==='string'?JSON.parse(row.sample):row.sample;
    const pilot=pilots.get(row.user_id)||{user:row.user_id,laps:0,metrics:{},tyres:{},game:null};
    pilot.laps+=sample.laps;merge(pilot.metrics,sample.metrics);pilot.game=sample.game||pilot.game;
    for(const [name,tyre]of Object.entries(sample.tyres)) {
      const target=pilot.tyres[name] ||= {laps:0,metrics:{}};target.laps+=tyre.laps;merge(target.metrics,tyre.metrics);
    }
    pilots.set(row.user_id,pilot);
  }
  const average=(metrics,key)=>metrics[key]?.count?metrics[key].sum/metrics[key].count:null;
  return [...pilots.values()].map(pilot=>({...pilot,
    fuel:average(pilot.metrics,'fuel'),ve:average(pilot.metrics,'ve'),capacity:average(pilot.metrics,'capacity'),
    lane:average(pilot.metrics,'lane'),range:{fuel:null,ve:null},
    tyres:Object.fromEntries(Object.entries(pilot.tyres).map(([name,tyre])=>[name,{
      laps:tyre.laps,wear:average(tyre.metrics,'wear'),range:null,
      worst:[0,1,2,3].map(index=>average(tyre.metrics,`wheel${index}`)),
      temp:average(tyre.metrics,'temp'),track:average(tyre.metrics,'track')
    }]))}));
}

function publication(pilots) {
  return memoSheet({summaries:pilots,aggregate:mean,min:{pilots:1,laps:5},
    game:pilots.find(pilot=>pilot.game)?.game||null,
    laneStops:pilots.filter(pilot=>pilot.lane>0).map(pilot=>({lane:pilot.lane,stopped:0}))});
}

export async function ensureMemoCycle(env,{circuit,car,track,car_class},at=Date.now()) {
  await env.DB.prepare(`INSERT OR IGNORE INTO training_memo_cycles(circuit,car,track,car_class,generation,started_at,renew_at)
    VALUES(?,?,?,?,?,?,?)`).bind(circuit,car,track,car_class,id(),at,at+MEMO_PERIOD).run();
  let cycle=await env.DB.prepare('SELECT * FROM training_memo_cycles WHERE circuit=? AND car=?').bind(circuit,car).first();
  if(cycle.renew_at<=at) {
    await env.DB.prepare(`UPDATE training_memo_cycles SET generation=?,started_at=?,renew_at=?,frozen_at=NULL,published_at=COALESCE(published_at,snapshot_at),reason='Renouvellement de 15 jours'
      WHERE circuit=? AND car=? AND generation=? AND renew_at<=?`).bind(id(),at,at+MEMO_PERIOD,circuit,car,cycle.generation,at).run();
    cycle=await env.DB.prepare('SELECT * FROM training_memo_cycles WHERE circuit=? AND car=?').bind(circuit,car).first();
    await env.DB.prepare('DELETE FROM training_memo_contributions WHERE circuit=? AND car=? AND generation<>?').bind(circuit,car,cycle.generation).run();
  }
  return cycle;
}

export async function collectMemo(env,user,session,sessionId,circuit,at=Date.now()) {
  const cycle=await ensureMemoCycle(env,{circuit,car:session.car,track:session.track,car_class:session.carClass},at);
  // A delayed/backlog upload from an old cycle must never contaminate a fresh game version.
  if(cycle.frozen_at||session.at<cycle.started_at||session.at>at+300000)return;
  const total=await env.DB.prepare(`SELECT COALESCE(SUM(laps),0) AS laps FROM training_memo_contributions
    WHERE circuit=? AND car=? AND generation=? AND user_id=?`).bind(circuit,session.car,cycle.generation,user).first();
  // 100 usable laps per contributor suffice for the quorum and bound the collection while waiting for others.
  if(total.laps>=100)return;
  const sample=memoSample(session,100-total.laps);if(!sample.laps)return;
  await env.DB.prepare(`INSERT OR IGNORE INTO training_memo_contributions(session_id,circuit,car,generation,user_id,laps,sample)
    SELECT ?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM training_memo_cycles WHERE circuit=? AND car=? AND generation=? AND frozen_at IS NULL)
    AND (SELECT COALESCE(SUM(laps),0) FROM training_memo_contributions WHERE circuit=? AND car=? AND generation=? AND user_id=?)+?<=100`)
    .bind(sessionId,circuit,session.car,cycle.generation,user,sample.laps,JSON.stringify(sample),circuit,session.car,cycle.generation,circuit,session.car,cycle.generation,user,sample.laps).run();
  const rows=await all(env,'SELECT user_id,sample FROM training_memo_contributions WHERE circuit=? AND car=? AND generation=?',circuit,session.car,cycle.generation);
  const pilots=samplePilots(rows),laps=pilots.reduce((sum,pilot)=>sum+pilot.laps,0);
  const complete=pilots.length>=MEMO_QUORUM.pilots&&laps>=MEMO_QUORUM.laps;
  // An existing publication stays visible during renewal. First-time figures can be provisional.
  if(complete||!cycle.published_at) {
    const snapshot={...publication(pilots),sample:{pilots:pilots.length,laps}};
    await env.DB.prepare(`UPDATE training_memo_cycles SET snapshot=?,snapshot_at=?,published_at=?,frozen_at=?
      WHERE circuit=? AND car=? AND generation=? AND frozen_at IS NULL`)
      .bind(JSON.stringify(snapshot),at,complete?at:null,complete?at:null,circuit,session.car,cycle.generation).run();
  }
}

export async function collectiveMemo(env,entry,at=Date.now()) {
  const cycle=await ensureMemoCycle(env,entry,at);
  if(!cycle.snapshot) {
    // One-time compact baseline for pre-cycle data; no raw laps and no repeat history scans.
    const rows=await all(env,'SELECT summary FROM training_memo_pilots WHERE circuit=? AND car=?',entry.circuit,entry.car);
    const pilots=rows.map(row=>JSON.parse(row.summary));
    if(pilots.length) {
      const snapshot={...publication(pilots.map(pilot=>({...pilot,lane:pilot.lane?.through}))),sample:{pilots:pilots.length,laps:pilots.reduce((sum,pilot)=>sum+pilot.laps,0)}};
      await env.DB.prepare('UPDATE training_memo_cycles SET snapshot=?,snapshot_at=? WHERE circuit=? AND car=? AND generation=? AND snapshot IS NULL')
        .bind(JSON.stringify(snapshot),at,entry.circuit,entry.car,cycle.generation).run();
      cycle.snapshot=JSON.stringify(snapshot);
    }
  }
  const count=await env.DB.prepare(`SELECT COUNT(DISTINCT user_id) AS pilots,COALESCE(SUM(laps),0) AS laps FROM training_memo_contributions
    WHERE circuit=? AND car=? AND generation=?`).bind(entry.circuit,entry.car,cycle.generation).first();
  return {sheet:cycle.snapshot?JSON.parse(cycle.snapshot):null,collection:{
    state:cycle.frozen_at?'stable':'collecting',startedAt:cycle.started_at,renewAt:cycle.renew_at,publishedAt:cycle.published_at,snapshotAt:cycle.snapshot_at,
    pilots:count.pilots,laps:count.laps,target:MEMO_QUORUM,reason:cycle.reason,
    previous:Boolean(cycle.published_at&&!cycle.frozen_at),sample:cycle.snapshot?JSON.parse(cycle.snapshot).sample:null
  }};
}

export async function restartMemo(env,reason,at=Date.now()) {
  const generation=id();
  await env.DB.prepare(`UPDATE training_memo_cycles SET generation=?,started_at=?,renew_at=?,frozen_at=NULL,published_at=COALESCE(published_at,snapshot_at),reason=?`)
    .bind(generation,at,at+MEMO_PERIOD,reason).run();
  await env.DB.prepare('DELETE FROM training_memo_contributions WHERE generation<>?').bind(generation).run();
}

export async function renewMemos(env,at=Date.now()) {
  const expired=await all(env,'SELECT circuit,car,track,car_class FROM training_memo_cycles WHERE renew_at<=? LIMIT 20',at);
  for(const entry of expired)await ensureMemoCycle(env,entry,at);
}
