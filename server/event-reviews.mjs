import {body, fail, json, id, communityName, rateLimit} from './core.mjs';
import {eventById, can} from './api-shared.mjs';
import {requirePermission} from './access.mjs';
import {isGrindfest, streamersOf, assignStreamerWaitlist} from '../shared/grindfest.mjs';
import {isStream} from '../shared/stream.mjs';
import {simForEvent} from '../shared/catalog.mjs';

export const REVIEW_WINDOW = 7 * 86400000;
export const REVIEW_GRACE = 30 * 60000;
export const REVIEW_RETENTION = 30 * 86400000;
const PAGE_SIZE=20;
const pageOffset = request => Math.max(0,Math.min(100000,Math.floor(Number(new URL(request.url).searchParams.get('offset'))||0)));
const displayName = `COALESCE(NULLIF(m.nickname,''),u.name,'Pilote')`;
export function validateReply(input) {
  if(typeof input?.comment!=='string') fail(400,'Écris une réponse.');
  const comment=input.comment.trim();
  if(!comment || [...comment].length>1000) fail(400,'La réponse doit contenir entre 1 et 1000 caractères.');
  return comment;
}
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
  if (typeof input?.rating!=='number' || !Number.isInteger(input.rating*2) || input.rating<0.5 || input.rating>5) fail(400,'Choisis une note de 0,5 à 5 étoiles, par demi-étoile.');
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

// A fixed event-relative expiry, never extended by a new reply. The aggregate is kept without identities.
export async function purgeEventDiscussions(env,at=Date.now()) {
  const expired=await all(env,`SELECT event_id,community_id FROM event_review_sessions WHERE archived_count IS NULL AND opens_at<=? ORDER BY opens_at LIMIT 5`,at-REVIEW_RETENTION);
  for(const item of expired) {
    const args=[item.event_id,item.community_id];
    await env.DB.batch([
      env.DB.prepare(`UPDATE event_review_sessions SET archived_count=(SELECT COUNT(*) FROM event_reviews r WHERE r.event_id=event_review_sessions.event_id AND r.community_id=event_review_sessions.community_id), archived_sum=(SELECT COALESCE(SUM(rating),0) FROM event_reviews r WHERE r.event_id=event_review_sessions.event_id AND r.community_id=event_review_sessions.community_id) WHERE event_id=? AND community_id=? AND archived_count IS NULL`).bind(...args),
      // Eligibility -> votes -> replies: the foreign keys remove all personal content.
      env.DB.prepare('DELETE FROM event_review_eligible WHERE event_id=? AND community_id=?').bind(...args),
      env.DB.prepare("DELETE FROM notifications WHERE event_id=? AND community_id=? AND kind IN ('event_review','event_review_reply')").bind(...args)
    ]);
  }
  return expired.length;
}
const publicStats=(stats,admin)=>({average:stats && (stats.count>=3 || admin) && stats.count?stats.average:null,count:stats && (stats.count>=3 || admin)?stats.count:null});
const canReadThreads=(session,at,admin)=>admin || !session.eligible || session.rating!=null || at>=session.closes_at;
function publicReview(row,actor,admin) {
  return {key:row.review_key,author:row.author,rating:row.rating,comment:row.comment,createdAt:row.created_at,replyCount:row.reply_count,mine:row.user_id===actor.user.id,canModerate:admin};
}
export async function eventReviewsApi(path,method,request,env,actor,community) {
  const adminPath=path==='/api/event-reviews/admin';
  const match=path.match(/^\/api\/events\/([^/]+)\/review(?:\/(threads|[^/]+)(?:\/(replies|comment)(?:\/([^/]+))?)?)?$/);
  if (!adminPath&&!match) return null;
  if (!actor.user || !community.modules?.eventReviews) fail(404,'Module Avis et discussions désactivé.');
  const admin=can(actor,'admin'), offset=pageOffset(request);
  if (adminPath) {
    requirePermission(actor,'admin');
    if (method!=='GET') fail(405,'Action indisponible.');
    const selected=new URL(request.url).searchParams.get('event');
    if (selected) {
      await eventById(env,selected,community);
      const comments=await all(env,`SELECT r.review_key AS key,r.rating,r.comment,r.public,CASE WHEN r.public=1 THEN ${displayName} ELSE 'Pilote anonyme' END AS author
        FROM event_reviews r JOIN event_review_sessions s ON s.event_id=r.event_id AND s.community_id=r.community_id
        LEFT JOIN users u ON u.id=r.user_id AND r.public=1 LEFT JOIN memberships m ON m.user_id=u.id AND m.community_id=r.community_id AND m.status='member'
        WHERE r.community_id=? AND r.event_id=? AND s.opens_at>? AND s.archived_count IS NULL ORDER BY r.created_at DESC,r.review_key LIMIT 51 OFFSET ?`,community.id,selected,Date.now()-REVIEW_RETENTION,offset);
      return json({reviews:comments.slice(0,50),more:comments.length>50});
    }
    const events=await all(env,`SELECT e.id,e.name,s.opens_at AS opensAt,COALESCE(s.archived_count,COUNT(r.rating)) AS count,
      CASE WHEN s.archived_count IS NOT NULL THEN s.archived_sum/NULLIF(s.archived_count,0) ELSE AVG(r.rating) END AS average
      FROM event_review_sessions s JOIN events e ON e.id=s.event_id
      LEFT JOIN event_reviews r ON r.event_id=s.event_id AND r.community_id=s.community_id
      WHERE s.community_id=? GROUP BY s.event_id,s.community_id ORDER BY s.opens_at DESC LIMIT 21 OFFSET ?`,community.id,offset);
    return json({events:events.slice(0,20),more:events.length>20});
  }
  const event=await eventById(env,match[1],community);
  const at=Date.now(),finish=reviewOpensAt(event),args=[event.id,community.id];
  const session=await env.DB.prepare(`SELECT s.opens_at,s.closes_at,s.archived_count,s.archived_sum,x.user_id AS eligible,r.rating,r.comment,r.public
    FROM event_review_sessions s LEFT JOIN event_review_eligible x ON x.event_id=s.event_id AND x.community_id=s.community_id AND x.user_id=?
    LEFT JOIN event_reviews r ON r.event_id=x.event_id AND r.community_id=x.community_id AND r.user_id=x.user_id
    WHERE s.event_id=? AND s.community_id=?`).bind(actor.user.id,...args).first();
  const active=!!session && finish!==null && at>=Math.max(finish,session.opens_at);
  const discussing=active && session.archived_count===null && at<session.opens_at+REVIEW_RETENTION;
  const open=discussing && at<session.closes_at;
  const own=discussing && session.rating!=null?{rating:session.rating,comment:session.comment,public:!!session.public}:null;
  const visible=active && canReadThreads(session,at,admin);
  const mayReply=discussing && visible && (admin||!!session.eligible);
  const part=match[2],action=match[3],replyId=match[4];
  if (!part && method==='GET') {
    if (!active) return json({available:false});
    const stats=visible?(session.archived_count!==null?{count:session.archived_count,average:session.archived_count?session.archived_sum/session.archived_count:null}:await env.DB.prepare('SELECT COUNT(*) AS count,AVG(rating) AS average FROM event_reviews WHERE event_id=? AND community_id=?').bind(...args).first()):null;
    return json({available:true,canVote:open&&!!session.eligible,own,canDelete:discussing&&!!own,canReadThreads:discussing&&visible,canReply:mayReply,discussionEndsAt:session.opens_at+REVIEW_RETENTION,...publicStats(stats,admin)});
  }
  if (!discussing) fail(403,'La discussion est clôturée.');
  if (part==='threads' && !action && method==='GET') {
    if(!visible)fail(403,'Donne d’abord ton avis.');
    const rows=await all(env,`SELECT r.review_key,r.user_id,r.rating,r.comment,r.created_at,${displayName} AS author,
      (SELECT COUNT(*) FROM event_review_replies p WHERE p.review_key=r.review_key) AS reply_count
      FROM event_reviews r JOIN users u ON u.id=r.user_id LEFT JOIN memberships m ON m.user_id=u.id AND m.community_id=r.community_id AND m.status='member'
      WHERE r.event_id=? AND r.community_id=? AND r.public=1 ORDER BY r.created_at DESC,r.review_key DESC LIMIT ? OFFSET ?`,...args,PAGE_SIZE+1,offset);
    return json({reviews:rows.slice(0,PAGE_SIZE).map(row=>publicReview(row,actor,admin)),more:rows.length>PAGE_SIZE,canReply:mayReply});
  }
  if(part && action) {
    // The opaque key is always resolved within this event AND community.
    const review=await env.DB.prepare('SELECT review_key,user_id,public FROM event_reviews WHERE event_id=? AND community_id=? AND review_key=?').bind(...args,part).first();
    if(!review || (!review.public && !(admin&&action==='comment')))fail(404,'Avis introuvable.');
    if(action==='comment' && !replyId && method==='DELETE') {
      if(!admin && review.user_id!==actor.user.id)fail(403,'Action réservée à l’auteur ou à un administrateur.');
      await env.DB.batch([env.DB.prepare("UPDATE event_reviews SET comment='' WHERE review_key=?").bind(part),env.DB.prepare('DELETE FROM event_review_replies WHERE review_key=?').bind(part)]);
      return json({ok:true});
    }
    if(action!=='replies'||!visible)fail(403,'Action indisponible.');
    if(!replyId&&method==='GET'){
      const rows=await all(env,'SELECT id,user_id,author_name,comment,created_at,updated_at FROM event_review_replies WHERE review_key=? ORDER BY created_at,id LIMIT ? OFFSET ?',part,PAGE_SIZE+1,offset);
      return json({replies:rows.slice(0,PAGE_SIZE).map(r=>({id:r.id,author:r.author_name,comment:r.comment,createdAt:r.created_at,updatedAt:r.updated_at,mine:r.user_id===actor.user.id,canModerate:admin})),more:rows.length>PAGE_SIZE});
    }
    if(!replyId&&method==='POST'){
      if(!mayReply)fail(403,'Seuls les participants et administrateurs peuvent répondre.');
      await rateLimit(request,env,'event-review-reply',30);
      const input=await body(request,8192),comment=validateReply(input);
      let recipient=review.user_id;
      if(input.replyTo){
        const target=await env.DB.prepare('SELECT user_id FROM event_review_replies WHERE id=? AND review_key=?').bind(input.replyTo,part).first();
        if(!target)fail(404,'Réponse introuvable.');
        recipient=target.user_id;
      }
      const author=await communityName(env,actor.user.id,community.id)||actor.user.name||'Pilote',reply=id();
      const statements=[env.DB.prepare('INSERT INTO event_review_replies(id,review_key,user_id,author_name,comment,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').bind(reply,part,actor.user.id,author,comment,at,at)];
      if(recipient && recipient!==actor.user.id && !String(recipient).startsWith('system:')){
        const payload=JSON.stringify({eventName:event.name,game:simForEvent(event)==='iracing'?'iracing':'lmu',by:author});
        statements.push(env.DB.prepare("INSERT INTO notifications(id,user_id,community_id,official,kind,event_id,data,created_at) VALUES(?,?,?,0,'event_review_reply',?,?,?)").bind(id(),recipient,community.id,event.id,payload,Math.floor(at/1000)));
      }
      await env.DB.batch(statements);
      return json({ok:true});
    }
    if(replyId && ['PUT','DELETE'].includes(method)){
      const reply=await env.DB.prepare('SELECT user_id FROM event_review_replies WHERE id=? AND review_key=?').bind(replyId,part).first();
      if(!reply)fail(404,'Réponse introuvable.');
      if(method==='DELETE'){
        if(!admin&&reply.user_id!==actor.user.id)fail(403,'Action réservée à l’auteur ou à un administrateur.');
        await env.DB.prepare('DELETE FROM event_review_replies WHERE id=? AND review_key=?').bind(replyId,part).run();
      } else {
        if(reply.user_id!==actor.user.id)fail(403,'Seul l’auteur peut modifier sa réponse.');
        const comment=validateReply(await body(request,8192));
        await env.DB.prepare('UPDATE event_review_replies SET comment=?,updated_at=? WHERE id=? AND review_key=?').bind(comment,at,replyId,part).run();
      }
      return json({ok:true});
    }
    fail(405,'Action indisponible.');
  }
  if(part)fail(404,'Action indisponible.');
  // The owner may withdraw their own content during the full discussion window; new/edited ratings close after 7 days.
  if(method==='DELETE'&&own){
    await env.DB.prepare('DELETE FROM event_reviews WHERE event_id=? AND community_id=? AND user_id=?').bind(...args,actor.user.id).run();
    return json({ok:true});
  }
  if (!open || !session.eligible) fail(403,'Tu ne peux plus évaluer cet événement.');
  if (method!=='PUT') fail(405,'Action indisponible.');
  const input=await body(request,8192),data=validateReview(input);
  if(input.public!==true)fail(400,'Confirme que ton avis et ton pseudo seront visibles par la communauté.');
  await env.DB.prepare(`INSERT INTO event_reviews(event_id,community_id,user_id,rating,comment,created_at,updated_at,public,review_key)
    VALUES(?,?,?,?,?,?,?,1,?) ON CONFLICT(event_id,community_id,user_id) DO UPDATE SET rating=excluded.rating,comment=excluded.comment,updated_at=excluded.updated_at,public=1,review_key=COALESCE(event_reviews.review_key,excluded.review_key)`)
    .bind(...args,actor.user.id,data.rating,data.comment,at,at,id()).run();
  return json({ok:true});
}
