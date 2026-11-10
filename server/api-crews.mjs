// Crews and crew requests: « Demander un équipage », create, join, edit, delete (called by server/worker.mjs).
import {LEGACY_CAR_ALIASES, fail, now, id, json, personal, registrationSelect, body, text} from './core.mjs';
import {catalogForGame, gameForEvent} from '../shared/catalog.mjs';
import {requirePermission, crewOrganisers} from './access.mjs';
import {postCrewRequestCard, decideCrewRequestCard, deleteCrewRequestCard} from './crew-request-discord.mjs';
import {notify, crewPilots} from './notifications.mjs';
import {closeDeletedCrewDiscord} from './crew-discord.mjs';
import {eventById, actingCommunity, departureById, slotFor, can} from './api-shared.mjs';
// Car of a crew: none, or one of the catalog's cars of its category (older names accepted and renamed).
function crewCar(input,event) {
  if (input.car==null || input.car==='') return '';
  const car=LEGACY_CAR_ALIASES.get(input.car) || text(input.car,100,'Voiture');
  if (!catalogForGame(gameForEvent(event)).cars[input.category]?.includes(car)) fail(400,'Choisis une voiture proposée pour cette catégorie.');
  return car;
}
export function canManageCrew(crew, actor) {
  return can(actor, 'crews') || Boolean(actor.user && crew?.owner_user_id === actor.user.id);
}
// `community`: the site's community. An entry of another of the player's communities (on an official race) is shown
// with its community, and is changed on that community's site only.
// `perms`: the player's permissions in each of his other communities; `official`: ids of the official races, whose
// entries all show their community (logo or short name).
// Placed in a crew, the pilot leaves his other categories on that start, and his other starts of the race on the same
// day where he has no crew (Nathan 2026-11-09: a pilot stayed entered on the other start of the day); with
// « Inscription par catégorie », all his other starts. Run in a batch right after the crew_members insert.
const leaveOtherStarts=`DELETE FROM registrations WHERE changes()=1 AND id!=? AND event_id=? AND participant_id=? AND (departure_id=?
  OR (departure_id IN (SELECT value FROM json_each(?)) AND NOT EXISTS (SELECT 1 FROM crew_members cm WHERE cm.registration_id=registrations.id)))`;
const parisDay = timestamp => new Intl.DateTimeFormat('en-CA', {timeZone:'Europe/Paris', year:'numeric', month:'2-digit', day:'2-digit'}).format(new Date(Number(timestamp)));
function startsToLeave(event, departure, community) {
  const all = community?.modules?.categoryEntry === true;
  return JSON.stringify(JSON.parse(event.departures || '[]').filter(item => item.id !== departure.id && (all || parisDay(item.startsAt) === parisDay(departure.startsAt))).map(item => item.id));
}

// « Demander un équipage »: a pilot's request is answered as soon as he is placed in a crew, whatever the way
// (« Créer cet équipage », pilots ticked on the « Équipages » page, « Ajouter à… »): he is told and the Discord card
// turns green. Returns true when a request was answered.
async function acceptCrewRequests(env, community, registrationId, crewId, actor) {
  // Never blocks placing the pilot (a database without migration 0091 has no request to answer).
  const rows = (await env.DB.prepare(`SELECT * FROM crew_requests WHERE community_id=? AND status='pending' AND json_extract(registration_ids,'$[0]')=?`).bind(community.id, registrationId).all().catch(() => null))?.results || [];
  let answered = false;
  for (const row of rows) {
    const done = await env.DB.prepare(`UPDATE crew_requests SET status='accepted',decided_by=?,decided_at=? WHERE id=? AND status='pending'`).bind(actor.user.id, now(), row.id).run();
    if (!done.meta.changes) continue;
    answered = true;
    const [event, crew] = await Promise.all([env.DB.prepare('SELECT * FROM events WHERE id=?').bind(row.event_id).first(), env.DB.prepare('SELECT name FROM crews WHERE id=?').bind(crewId).first()]);
    if (event) await notify(env, [{user_id:row.user_id, community_id:community.id}], 'crew_request_accepted', event,
      {departure:JSON.parse(event.departures).find(item => item.id===row.departure_id)||null, skip:[actor.user.id], crewName:crew?.name || row.name, by:actor.user.name});
    await decideCrewRequestCard(env, community, row, {status:'accepted', by:actor.user.name, crewId});
  }
  return answered;
}

// Answers the request when it is about a crew or a crew request, else null.
export async function crewsApi({path, method, request, env, actor, community}) {
  // « Demander un équipage » (migration 0091): a pilot without « Équipages » proposes a crew on his start; the
  // organisers see the requests on the « Équipages » page, create the crew or refuse it.
  const requestCreate = path.match(/^\/api\/events\/([a-f0-9-]{36})\/departures\/([a-f0-9-]{36})\/crew-requests$/);
  const requestRoute = path.match(/^\/api\/crew-requests\/([a-f0-9-]{36})\/(accept|refuse|cancel)$/);
  if (path === '/api/crew-requests' && method === 'GET') {
    if (!actor.user) return json({requests:[]});
    const organiser = can(actor,'crews');
    const rows = (await env.DB.prepare(`SELECT q.*, COALESCE(NULLIF(m.nickname,''),u.name) AS requester, e.name AS event_name, e.circuit AS event_circuit, e.sim AS event_sim, e.departures AS event_departures
      FROM crew_requests q JOIN events e ON e.id=q.event_id JOIN users u ON u.id=q.user_id
      LEFT JOIN memberships m ON m.community_id=q.community_id AND m.user_id=q.user_id
      WHERE q.community_id=? AND q.status='pending' AND (?=1 OR q.user_id=?)
        AND EXISTS (SELECT 1 FROM registrations r WHERE r.id=json_extract(q.registration_ids,'$[0]') AND r.status!='unavailable'
          AND NOT EXISTS (SELECT 1 FROM crew_members cm WHERE cm.registration_id=r.id))
      ORDER BY q.created_at`).bind(community.id, organiser?1:0, actor.user.id).all()).results || [];
    // Still useful: its start is to come and its pilot is still entered without a crew.
    const open = rows.filter(row => Number(JSON.parse(row.event_departures || '[]').find(item => item.id===row.departure_id)?.startsAt) > Date.now());
    return json({requests:open.map(row => ({id:row.id, eventId:row.event_id, departureId:row.departure_id, eventName:row.event_name,
      game:gameForEvent({circuit:row.event_circuit, sim:row.event_sim}), name:row.name, category:row.category, car:row.car || '',
      registrationIds:JSON.parse(row.registration_ids || '[]'), requester:row.requester, mine:row.user_id===actor.user.id, createdAt:row.created_at}))});
  }
  if (requestCreate && method === 'POST') {
    if (!actor.user) fail(401,'Connecte-toi avec Discord pour demander un équipage.');
    const input = await body(request);
    const event = await eventById(env, requestCreate[1], community);
    if ((event.format||'endurance')==='solo') fail(409,'Les événements n’ont pas d’équipage.');
    const departure = departureById(event, requestCreate[2]);
    if (departure.startsAt<=Date.now()) fail(409,'Ce départ est passé.');
    if (!JSON.parse(event.categories).includes(input.category)) fail(400,'Choisis une catégorie de cet événement.');
    const name = text(input.name,60,'Nom de l’équipage'), car = crewCar(input,event);
    const regs = (await env.DB.prepare(registrationSelect+` WHERE r.event_id=? AND r.departure_id=? AND r.community_id=? AND r.status!='unavailable'
      AND NOT EXISTS (SELECT 1 FROM crew_members cm WHERE cm.registration_id=r.id)`).bind(event.id, departure.id, community.id).all()).results || [];
    const own = regs.find(reg => personal(reg,actor) && reg.category===input.category);
    if (!own) fail(409,'Inscris-toi d’abord sur ce départ dans cette catégorie, sans équipage.');
    const wanted = Array.isArray(input.registrationIds) ? input.registrationIds.slice(0,12) : [];
    const mates = wanted.map(item => regs.find(reg => reg.id===item && reg.category===input.category && reg.id!==own.id)).filter(Boolean);
    if (mates.length !== wanted.filter(item => item!==own.id).length) fail(409,'Un coéquipier choisi n’est plus libre dans cette catégorie. Actualise la page.');
    const requestId = id();
    // A new request replaces the pilot's last one on this start: its Discord card goes too.
    const replaced = await env.DB.prepare(`SELECT * FROM crew_requests WHERE user_id=? AND departure_id=? AND status='pending'`).bind(actor.user.id, departure.id).first();
    await env.DB.batch([
      env.DB.prepare(`DELETE FROM crew_requests WHERE user_id=? AND departure_id=? AND status='pending'`).bind(actor.user.id, departure.id),
      env.DB.prepare(`INSERT INTO crew_requests(id,community_id,event_id,departure_id,user_id,name,category,car,registration_ids,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)`)
        .bind(requestId, community.id, event.id, departure.id, actor.user.id, name, input.category, car || null, JSON.stringify([own.id, ...mates.map(reg => reg.id)]), now())
    ]);
    await notify(env, await crewOrganisers(env, community), 'crew_request', event, {departure, skip:[actor.user.id], pilot:own.participant_name||own.name, crewName:name, departureId:departure.id});
    await deleteCrewRequestCard(env, replaced);
    await postCrewRequestCard(env, community, requestId);
    return json({id:requestId},201);
  }
  if (requestRoute && method === 'POST') {
    if (!actor.user) fail(401,'Connecte-toi avec Discord.');
    const input = await body(request);
    const row = await env.DB.prepare(`SELECT * FROM crew_requests WHERE id=? AND community_id=?`).bind(requestRoute[1], community.id).first();
    const action = requestRoute[2];
    // Already accepted when its pilot joined the crew (acceptCrewRequests): the Discord card shows the full crew.
    if (row?.status === 'accepted' && action === 'accept' && can(actor,'crews')) {
      await decideCrewRequestCard(env, community, row, {status:'accepted', by:actor.user.name, crewId:input.crewId});
      return json({ok:true});
    }
    if (row?.status !== 'pending') fail(404,'Cette demande a déjà été traitée. Actualise la page.');
    if (action === 'cancel') {
      if (row.user_id !== actor.user.id) fail(403,'Seul le pilote qui l’a faite annule sa demande.');
      await env.DB.prepare('DELETE FROM crew_requests WHERE id=?').bind(row.id).run();
      await deleteCrewRequestCard(env, row);
      return json({ok:true});
    }
    requirePermission(actor,'crews','Seuls les organisateurs traitent les demandes d’équipage.');
    const event = await env.DB.prepare('SELECT * FROM events WHERE id=?').bind(row.event_id).first();
    let crewName = row.name;
    if (action === 'accept') {
      const crew = /^[a-f0-9-]{36}$/.test(input.crewId || '') ? await env.DB.prepare('SELECT name FROM crews WHERE id=? AND event_id=? AND community_id=?').bind(input.crewId, row.event_id, community.id).first() : null;
      if (!crew) fail(409,'Crée d’abord l’équipage de cette demande.');
      crewName = crew.name;
    }
    await env.DB.prepare(`UPDATE crew_requests SET status=?,decided_by=?,decided_at=? WHERE id=? AND status='pending'`).bind(action==='accept'?'accepted':'refused', actor.user.id, now(), row.id).run();
    if (event) await notify(env, [{user_id:row.user_id, community_id:community.id}], action==='accept'?'crew_request_accepted':'crew_request_refused', event,
      {departure:JSON.parse(event.departures).find(item => item.id===row.departure_id)||null, skip:[actor.user.id], crewName, by:actor.user.name});
    await decideCrewRequestCard(env, community, row, {status:action==='accept'?'accepted':'refused', by:actor.user.name, crewId:input.crewId});
    return json({ok:true});
  }
  const crewCreate = path.match(/^\/api\/events\/([a-f0-9-]{36})\/departures\/([a-f0-9-]{36})\/crews$/);
  const crewRoute = path.match(/^\/api\/crews\/([a-f0-9-]{36})(?:\/members(?:\/([a-f0-9-]{36}))?)?$/);
  if ((crewCreate && method==='POST') || (crewRoute && ['POST','PATCH','DELETE'].includes(method))) {
    if (!actor.user) fail(401,'Connecte-toi avec Discord pour gérer un équipage.');
    const input=await body(request);
    // A crew of the site's community, or of another of the player's communities on an official race (a new one:
    // the community chosen at its first step). Its community's rights apply.
    const crew=crewRoute ? await env.DB.prepare(`SELECT * FROM crews c WHERE id=? AND (community_id=? OR EXISTS (SELECT 1 FROM events oe WHERE oe.id=c.event_id AND oe.community_id='official'))`).bind(crewRoute[1],community.id).first() : null;
    if (crewRoute && !crew) fail(404,'Équipage introuvable.');
    const event=await eventById(env,crew?.event_id || crewCreate[1],community);
    const {community:here, actor:who} = await actingCommunity(env, actor, community, crew ? crew.community_id : input.communityId, event);
    if ((event.format||'endurance')==='solo') fail(409,'Les événements n’ont pas d’équipage.');
    const departure=departureById(event,crew?.departure_id || crewCreate[2]);
    if (departure.startsAt<=Date.now()) fail(409,'Ce départ est passé. Les équipages sont verrouillés.');
    if (crew && input.version!==crew.version) fail(409,'Cet équipage a changé. Actualise avant de réessayer.');
    const membership=crewRoute && path.includes('/members');
    if (membership) {
      if (method==='POST' && !crewRoute[2]) {
        if (crew.locked) fail(409,'Cet équipage est complet. Son responsable doit le rouvrir avant de pouvoir le rejoindre.');
        if (!/^[a-f0-9-]{36}$/.test(input.registrationId || '')) fail(400,'Sélectionne un pilote inscrit.');
        const selected=await env.DB.prepare(registrationSelect+' WHERE r.id=? AND r.community_id=?').bind(input.registrationId,here.id).first();
        if (!selected || selected.event_id!==crew.event_id || selected.departure_id!==crew.departure_id) fail(409,'Ce pilote n’est pas inscrit sur ce départ. Actualise la page.');
        if (selected.category!==crew.category || selected.status==='unavailable') fail(409,'Cette inscription ne correspond pas à la catégorie de l’équipage.');
        const selfJoin=input.selfJoin===true && personal(selected,actor);
        if (!canManageCrew(crew,who) && !selfJoin) fail(403,'Tu peux uniquement rejoindre un équipage avec ta propre inscription.');
        // Joining never makes a pilot the crew's manager: the organisers (« Équipages ») manage crews (2026-11-01).
        const crewUpdate=env.DB.prepare('UPDATE crews SET version=version+1 WHERE id=? AND version=?').bind(crew.id,input.version);
        const results=await env.DB.batch([
          crewUpdate,
          env.DB.prepare('INSERT INTO crew_members(registration_id,crew_id) SELECT ?,? WHERE changes()=1').bind(input.registrationId,crew.id),
          env.DB.prepare(leaveOtherStarts).bind(selected.id,selected.event_id,selected.participant_id,selected.departure_id,startsToLeave(event,departure,here))
        ]);
        if (!results[0].meta.changes) fail(409,'Cet équipage a changé. Actualise la page.');
        const pilot=selected.participant_name||selected.name;
        await notify(env,await crewPilots(env,crew.id),'crew_join',event,{departure,skip:[actor.user.id,selected.participant_user_id],pilot,crewName:crew.name});
        const answered=await acceptCrewRequests(env,here,selected.id,crew.id,actor);
        if (!selfJoin && !answered && selected.participant_user_id) await notify(env,[{user_id:selected.participant_user_id,community_id:here.id}],'crew_added',event,{departure,skip:[actor.user.id],crewName:crew.name,by:actor.user.name});
        return json({ok:true,removedRegistrations:results[2].meta.changes});
      }
      if (method==='DELETE' && crewRoute[2]) {
        const selected=await env.DB.prepare(registrationSelect+' WHERE r.id=? AND r.community_id=?').bind(crewRoute[2],here.id).first();
        if (!selected) fail(404,'Inscription introuvable.');
        const member=await env.DB.prepare('SELECT registration_id FROM crew_members WHERE crew_id=? AND registration_id=?').bind(crew.id,selected.id).first();
        if (!member) fail(409,'Ce pilote ne fait plus partie de cet équipage. Actualise la page.');
        const selfLeave=personal(selected,actor);
        if (!canManageCrew(crew,who) && !selfLeave) fail(403,'Tu peux uniquement quitter toi-même un équipage.');
        let nextOwner=crew.owner_user_id;
        if (crew.owner_user_id && selected.participant_user_id===crew.owner_user_id) {
          const replacement=await env.DB.prepare(`SELECT p.user_id
            FROM crew_members cm
            JOIN registrations r ON r.id=cm.registration_id
            JOIN participants p ON p.id=r.participant_id
            WHERE cm.crew_id=? AND cm.registration_id!=? AND p.user_id IS NOT NULL
            ORDER BY r.created_at,r.id LIMIT 1`).bind(crew.id,selected.id).first();
          nextOwner=replacement?.user_id || null;
        }
        const crewUpdate=Object.prototype.hasOwnProperty.call(crew,'owner_user_id')
          ? env.DB.prepare('UPDATE crews SET version=version+1,locked=0,owner_user_id=? WHERE id=? AND version=?').bind(nextOwner,crew.id,input.version)
          : env.DB.prepare('UPDATE crews SET version=version+1 WHERE id=? AND version=?').bind(crew.id,input.version);
        const results=await env.DB.batch([
          crewUpdate,
          env.DB.prepare('DELETE FROM crew_members WHERE crew_id=? AND registration_id=? AND changes()=1').bind(crew.id,selected.id)
        ]);
        if (!results[0].meta.changes) fail(409,'Cet équipage a changé. Actualise la page.');
        await notify(env,await crewPilots(env,crew.id),'crew_leave',event,{departure,skip:[actor.user.id,selected.participant_user_id],pilot:selected.participant_name||selected.name,crewName:crew.name});
        if (!selfLeave && selected.participant_user_id) await notify(env,[{user_id:selected.participant_user_id,community_id:here.id}],'crew_removed',event,{departure,skip:[actor.user.id],crewName:crew.name,by:actor.user.name});
        return json({ok:true,unlocked:Boolean(crew.locked)});
      }
      fail(404,'Action introuvable.');
    }
    if (crew) {
      if (!canManageCrew(crew,who)) fail(403,'Seul le responsable de cet équipage ou un pilote qui gère les équipages peut le modifier.');
      if (method==='DELETE') {
        const told = await crewPilots(env,crew.id);
        const result = await env.DB.prepare('DELETE FROM crews WHERE id=? AND version=?').bind(crew.id,input.version).run();
        if (!result.meta.changes) fail(409,'Cet équipage a changé. Actualise avant de réessayer.');
        await closeDeletedCrewDiscord(env,crew.id).catch(error => console.error('Deleted crew Discord cleanup failed', error instanceof Error ? error.message : 'unknown'));
        await notify(env,told,'crew_deleted',event,{departure,skip:[actor.user.id],crewName:crew.name,by:actor.user.name});
        return json({ok:true});
      }
      if (method!=='PATCH') fail(404,'Action introuvable.');
      // Common "Horaire à définir" start: once the official slots are known, the crew picks its start and
      // moves there with its pilots.
      if (input.departureId!==undefined) {
        const target=slotFor(event,departure,input.departureId);
        // One atomic batch: the crew assignment guards forbid moving an assigned entry, so the members leave
        // the crew, their entries and the crew move, then they join it again. Every step checks the crew
        // version, so a crew changed in the meantime is left untouched.
        const members=((await env.DB.prepare('SELECT registration_id FROM crew_members WHERE crew_id=?').bind(crew.id).all()).results||[]).map(row=>row.registration_id);
        const current='EXISTS(SELECT 1 FROM crews WHERE id=? AND version=?)';
        const results=await env.DB.batch([
          env.DB.prepare(`DELETE FROM crew_members WHERE crew_id=? AND ${current}`).bind(crew.id,crew.id,input.version),
          ...members.map(registrationId=>env.DB.prepare(`UPDATE registrations SET departure_id=?,version=version+1 WHERE id=? AND ${current}`).bind(target.id,registrationId,crew.id,input.version)),
          env.DB.prepare('UPDATE crews SET departure_id=?,version=version+1 WHERE id=? AND version=?').bind(target.id,crew.id,input.version),
          ...members.map(registrationId=>env.DB.prepare('INSERT INTO crew_members(registration_id,crew_id) SELECT ?,? WHERE EXISTS(SELECT 1 FROM crews WHERE id=? AND version=? AND departure_id=?)').bind(registrationId,crew.id,crew.id,input.version+1,target.id))
        ]);
        if (!results[1+members.length].meta.changes) fail(409,'Cet équipage a changé. Actualise avant de réessayer.');
        await notify(env,await crewPilots(env,crew.id),'crew_start',event,{departure:target,skip:[actor.user.id],crewName:crew.name,by:actor.user.name});
        return json({ok:true,departureId:target.id});
      }
      if (typeof input.locked==='boolean' && input.name===undefined && input.category===undefined && input.car===undefined) {
        const result=await env.DB.prepare('UPDATE crews SET locked=?,version=version+1 WHERE id=? AND version=?').bind(input.locked?1:0,crew.id,input.version).run();
        if (!result.meta.changes) fail(409,'Cet équipage a changé. Actualise avant de réessayer.');
        return json({ok:true,locked:input.locked});
      }
      const name=text(input.name,60,'Nom de l’équipage');
      if (!JSON.parse(event.categories).includes(input.category)) fail(400,'Choisis une catégorie de cet événement.');
      const car=crewCar(input,event);
      const result=await env.DB.prepare('UPDATE crews SET name=?,category=?,car=?,version=version+1 WHERE id=? AND version=?').bind(name,input.category,car,crew.id,input.version).run();
      if (!result.meta.changes) fail(409,'Cet équipage a changé. Actualise avant de réessayer.');
      // A new car: the crew's pilots are told (not a change of name or category alone).
      if ((crew.car||'')!==(car||'')) await notify(env,await crewPilots(env,crew.id),'crew_car',event,{departure,skip:[actor.user.id],crewName:name,car:car||'',by:actor.user.name});
      return json({id:crew.id});
    }
    const name=text(input.name,60,'Nom de l’équipage');
    if (!JSON.parse(event.categories).includes(input.category)) fail(400,'Choisis une catégorie de cet événement.');
    const car=crewCar(input,event);
    const crewId=id();
    // « Équipages »: a crew is created by whoever has that permission. Entered on this start and category, they
    // lead it and join it; otherwise (or as an administrator) the crew starts empty, to be composed.
    requirePermission(who,'crews','Tu n’as pas l’autorisation de créer un équipage dans cette communauté.');
    // An organiser composing a crew for others (« Équipages » page, input.join false) is not put in it.
    const ownRows=can(who,'manage_registrations')||input.join===false?[]:(await env.DB.prepare(registrationSelect+' WHERE r.event_id=? AND r.departure_id=? AND r.category=? AND r.status!=? AND r.community_id=?').bind(event.id,departure.id,input.category,'unavailable',here.id).all()).results;
    const selected=ownRows.find(reg=>personal(reg,actor));
    if (!selected) {
      const result=await env.DB.prepare('INSERT INTO crews(id,event_id,departure_id,name,category,car,created_at,community_id) VALUES(?,?,?,?,?,?,?,?)').bind(crewId,event.id,departure.id,name,input.category,car,now(),here.id).run();
      if (!result.meta.changes) fail(409,'Impossible de créer cet équipage. Actualise avant de réessayer.');
      return json({id:crewId,joined:false},201);
    }
    const results=await env.DB.batch([
      env.DB.prepare('INSERT INTO crews(id,event_id,departure_id,name,category,car,owner_user_id,created_at,community_id) VALUES(?,?,?,?,?,?,?,?,?)').bind(crewId,event.id,departure.id,name,input.category,car,actor.user.id,now(),here.id),
      env.DB.prepare('INSERT INTO crew_members(registration_id,crew_id) SELECT ?,? WHERE changes()=1').bind(selected.id,crewId),
      env.DB.prepare(leaveOtherStarts).bind(selected.id,selected.event_id,selected.participant_id,selected.departure_id,startsToLeave(event,departure,here))
    ]);
    if (!results[0].meta.changes) fail(409,'Impossible de créer cet équipage. Actualise avant de réessayer.');
    await acceptCrewRequests(env,here,selected.id,crewId,actor);
    return json({id:crewId,joined:true,removedRegistrations:results[2].meta.changes},201);
  }
  return null;
}
