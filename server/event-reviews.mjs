import {body, fail, json} from './core.mjs';
import {eventById, can} from './api-shared.mjs';
import {requirePermission} from './access.mjs';
import {isGrindfest, streamersOf, assignStreamerWaitlist} from '../shared/grindfest.mjs';
import {isStream} from '../shared/stream.mjs';
import {simForEvent} from '../shared/catalog.mjs';

export const REVIEW_WINDOW = 7 * 86400000;
export const REVIEW_GRACE = 30 * 60000;
const parse = (value, fallback) => {try {return typeof value==='string'?JSON.parse(value):value??fallback;} catch {return fallback;}};
const all = async (env,sql,...params) => (await env.DB.prepare(sql).bind(...params).all()).results || [];

export function reviewOpensAt(event) {
  if (event.schedule_pending || event.official_schedule_status || isStream(event)) return null;
  const departures=parse(event.departures,[]);
  const starts=departures.filter(d=>!d.tbd && Number.isFinite(d.startsAt) && d.startsAt>0).map(d=>d.startsAt);
  const duration=Number(event.duration_minutes)||Number(event.duration_hours)*60;
  if (!starts.length || !Number.isFinite(duration) || duration<=0) return null;
  return Math.max(...starts)+duration*60000+REVIEW_GRACE;
}

export function eligibleReviewUsers(event, rows) {
  const real=new Set(parse(event.departures,[]).filter(d=>!d.tbd && Number.isFinite(d.startsAt) && d.startsAt>0).map(d=>d.id));
  const groups=new Map(), users=new Set();
  for (const row of rows) {
    if (row.status==='unavailable' || !real.has(row.departure_id)) continue;
    if (!groups.has(row.departure_id)) groups.set(row.departure_id,[]);
    groups.get(row.departure_id).push({...row,streamerId:row.streamer_id,roundChoices:parse(row.round_choices,[])});
  }
  const rounds=parse(event.rounds,[]);
  for (const entries of groups.values()) {
    if (isGrindfest(event)) assignStreamerWaitlist(entries,streamersOf(event));
    const counts=rounds.map(()=>0);
    entries.forEach((reg,index)=>{
      const roundConfirmed=rounds.length===0 || rounds.map((round,i)=>{
        if (reg.roundChoices?.[i]?.skip) return false;
        counts[i]++;
        return !round.capacity || counts[i]<=round.capacity;
      }).some(Boolean);
      const confirmed=event.format!=='solo' || (isGrindfest(event)?!reg.waitlistPosition:(!event.capacity || index<Number(event.capacity)) && roundConfirmed);
      if (confirmed && reg.user_id && !String(reg.user_id).startsWith('system:') && !reg.absent) users.add(reg.user_id);
    });
  }
  return [...users];
}

export function validateReview(input) {
  if (!Number.isInteger(input?.rating) || input.rating<1 || input.rating>5) fail(400,'Choisis une note de 1 à 5 étoiles.');
  if (input.comment!=null && typeof input.comment!=='string') fail(400,'Commentaire invalide.');
  const comment=(input.comment||'').trim();
  if ([...comment].length>1000) fail(400,'Le commentaire est limité à 1000 caractères.');
  return {rating:input.rating,comment};
}

// Bounded maintenance: indexed recent starts only; one atomic snapshot and one notification per eligible user.
// A disabled module retains its sessions but cannot create new ones. An activation is never retroactive.
export async function solicitEventReviews(env, at=Date.now()) {
  const candidates=await all(env,`SELECT e.*, c.id AS review_community
    FROM communities c JOIN events e ON (e.community_id=c.id OR e.community_id='official')
    WHERE json_extract(c.modules,'$.eventReviews')=1
      AND e.last_start BETWEEN ? AND ?
      AND e.schedule_pending=0 AND COALESCE(e.official_schedule_status,'')=''
      AND COALESCE(e.sim,'')!='stream'
      AND e.last_start+COALESCE(NULLIF(e.duration_minutes,0),e.duration_hours*60)*60000+? BETWEEN MAX(?,COALESCE(json_extract(c.modules,'$.eventReviewsSince'),?)) AND ?
      AND EXISTS (SELECT 1 FROM registrations r WHERE r.event_id=e.id AND r.community_id=c.id)
      AND NOT EXISTS (SELECT 1 FROM event_review_sessions s WHERE s.event_id=e.id AND s.community_id=c.id)
    ORDER BY e.last_start LIMIT 5`,at-REVIEW_WINDOW-2*86400000,at,REVIEW_GRACE,at-REVIEW_WINDOW,at,at);
  for (const event of candidates) {
    const opens=reviewOpensAt(event), community=event.review_community;
    if (opens===null || opens>at || opens+REVIEW_WINDOW<=at) continue;
    const rows=await all(env,`SELECT r.departure_id,r.status,r.streamer_id,r.round_choices,p.user_id,
       EXISTS(SELECT 1 FROM event_absences a WHERE a.event_id=r.event_id AND a.community_id=r.community_id AND a.user_id=p.user_id) AS absent
       FROM registrations r JOIN participants p ON p.id=r.participant_id
       WHERE r.event_id=? AND r.community_id=? ORDER BY COALESCE(r.streamer_order,r.created_at),r.rowid`,event.id,community);
    const users=JSON.stringify(eligibleReviewUsers(event,rows));
    const payload=JSON.stringify({eventName:event.name,game:simForEvent(event)==='iracing'?'iracing':'lmu'});
    // All three statements are atomic. A deterministic id protects against overlapping cron runs.
    await env.DB.batch([
      env.DB.prepare(`INSERT OR IGNORE INTO event_review_sessions(event_id,community_id,opens_at,closes_at) VALUES(?,?,?,?)`).bind(event.id,community,opens,opens+REVIEW_WINDOW),
      env.DB.prepare(`INSERT OR IGNORE INTO event_review_eligible(event_id,community_id,user_id) SELECT ?,?,value FROM json_each(?)`).bind(event.id,community,users),
      env.DB.prepare(`INSERT OR IGNORE INTO notifications(id,user_id,community_id,official,kind,event_id,data,created_at)
        SELECT 'review:'||json_array(event_id,community_id,user_id),user_id,community_id,0,'event_review',event_id,?,?
        FROM event_review_eligible WHERE event_id=? AND community_id=?`).bind(payload,Math.floor(at/1000),event.id,community)
    ]);
  }
  return candidates.length;
}

export async function eventReviewsApi(path,method,request,env,actor,community) {
  const admin=path==='/api/event-reviews/admin';
  const match=path.match(/^\/api\/events\/([^/]+)\/review$/);
  if (!admin&&!match) return null;
  if (!actor.user || !community.modules?.eventReviews) fail(404,'Module Avis des pilotes désactivé.');
  if (admin) {
    requirePermission(actor,'admin');
    if (method!=='GET') fail(405,'Action indisponible.');
    const params=new URL(request.url).searchParams;
    const offset=Math.max(0,Math.min(100000,Math.floor(Number(params.get('offset'))||0)));
    const selected=params.get('event');
    if (selected) {
      await eventById(env,selected,community);
      const comments=await all(env,`SELECT rating,comment FROM event_reviews WHERE community_id=? AND event_id=? ORDER BY updated_at DESC LIMIT 51 OFFSET ?`,community.id,selected,offset);
      return json({reviews:comments.slice(0,50),more:comments.length>50});
    }
    const events=await all(env,`SELECT e.id,e.name,s.opens_at AS opensAt,COUNT(r.rating) AS count,AVG(r.rating) AS average
      FROM event_review_sessions s JOIN events e ON e.id=s.event_id
      LEFT JOIN event_reviews r ON r.event_id=s.event_id AND r.community_id=s.community_id
      WHERE s.community_id=? GROUP BY s.event_id,s.community_id ORDER BY s.opens_at DESC LIMIT 21 OFFSET ?`,community.id,offset);
    return json({events:events.slice(0,20),more:events.length>20});
  }
  const event=await eventById(env,match[1],community);
  const at=Date.now(), finish=reviewOpensAt(event);
  const session=await env.DB.prepare(`SELECT s.opens_at,s.closes_at,x.user_id AS eligible,r.rating,r.comment
    FROM event_review_sessions s LEFT JOIN event_review_eligible x ON x.event_id=s.event_id AND x.community_id=s.community_id AND x.user_id=?
    LEFT JOIN event_reviews r ON r.event_id=x.event_id AND r.community_id=x.community_id AND r.user_id=x.user_id
    WHERE s.event_id=? AND s.community_id=?`).bind(actor.user.id,event.id,community.id).first();
  const open=!!session && finish!==null && at>=Math.max(finish,session.opens_at) && at<session.closes_at;
  const own=session?.rating!=null?{rating:session.rating,comment:session.comment}:null;
  if (method==='GET') {
    if (!session || finish===null || at<finish) return json({available:false});
    // Participants vote before seeing the average; admins and non-participants may see it immediately.
    const visible=can(actor,'admin') || !session.eligible || !!own || !open;
    const stats=visible?await env.DB.prepare('SELECT COUNT(*) AS count,AVG(rating) AS average FROM event_reviews WHERE event_id=? AND community_id=?').bind(event.id,community.id).first():null;
    return json({available:true,canVote:open&&!!session.eligible,own,
      average:stats && (stats.count>=3 || can(actor,'admin'))?stats.average:null,
      count:stats && (stats.count>=3 || can(actor,'admin'))?stats.count:null});
  }
  if (!open || !session.eligible) fail(403,'Tu ne peux plus évaluer cet événement.');
  if (method==='DELETE') {
    await env.DB.prepare('DELETE FROM event_reviews WHERE event_id=? AND community_id=? AND user_id=?').bind(event.id,community.id,actor.user.id).run();
    return json({ok:true});
  }
  if (method!=='PUT') fail(405,'Action indisponible.');
  const data=validateReview(await body(request,8192));
  await env.DB.prepare(`INSERT INTO event_reviews(event_id,community_id,user_id,rating,comment,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?) ON CONFLICT(event_id,community_id,user_id) DO UPDATE SET rating=excluded.rating,comment=excluded.comment,updated_at=excluded.updated_at`)
    .bind(event.id,community.id,actor.user.id,data.rating,data.comment,at,at).run();
  return json({ok:true});
}
