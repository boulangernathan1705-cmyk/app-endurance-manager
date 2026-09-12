import {
  LEGACY_CAR_ALIASES, COOKIE_SESSION, COOKIE_GUEST, COOKIE_STATE, DAY, HttpError, fail, now, id, token, hash, cookie,
  setCookie, json, redirect, origin, requireDiscord, administrators, publicUser, requireRole, identity, owned, personal,
  registrationSelect, registrationParticipant, body, rateLimit, cleanup, text, validateEvent, validateRegistration
} from './core.mjs';
import {ingestClientError, clientErrorsApi} from './telemetry.mjs';
async function eventById(env, eventId) {
  const row = await env.DB.prepare('SELECT * FROM events WHERE id=?').bind(eventId).first();
  if (!row) fail(404, 'Événement introuvable.'); return row;
}
function departureById(event, departureId) {
  const departure = JSON.parse(event.departures).find(d => d.id === departureId);
  if (!departure) fail(404, 'Départ introuvable.');
  return departure;
}
function isRegistrationManager(actor) {
  return ['admin','organizer'].includes(actor.user?.role);
}
function canManageRegistration(reg, actor) {
  return owned(reg, actor) || isRegistrationManager(actor);
}
function canManageCrew(crew, actor) {
  return isRegistrationManager(actor) || Boolean(actor.user && crew?.owner_user_id === actor.user.id);
}
function publicRegistration(reg, actor, userNames = new Map()) {
  let cars = [];
  try { cars = JSON.parse(reg.car_preferences || '[]'); } catch {}
  if (!Array.isArray(cars) || !cars.length) cars = reg.car ? [reg.car] : [];
  cars = cars.map(car => LEGACY_CAR_ALIASES.get(car) || car);
  const participantUserId = reg.participant_user_id || reg.user_id || '';
  const creatorId = reg.owner_user_id || '';
  const createdForOther = Boolean(creatorId && creatorId !== participantUserId);
  const canSeeCreator = createdForOther && Boolean(actor.user) && (
    actor.user.id === creatorId || actor.user.id === participantUserId || isRegistrationManager(actor)
  );
  return {
    id:reg.id,
    participantId:reg.participant_id,
    name:reg.participant_name||reg.name,
    category:reg.category,
    car:cars[0] || reg.car || '',
    cars,
    carAny:Boolean(reg.car_any),
    status:reg.status,
    preferredPilot:reg.preferred_pilot || '',
    version:reg.version,
    discordLinked:Boolean(reg.participant_user_id),
    mine:personal(reg, actor),
    managed:owned(reg,actor)&&!personal(reg,actor),
    canEdit:canManageRegistration(reg, actor),
    addedByName:canSeeCreator ? (userNames.get(creatorId) || '') : ''
  };
}
async function listEvents(env, actor, game='') {
  const where=game==='iracing' ? " WHERE circuit LIKE 'iracing-%'" : game==='lmu' ? " WHERE circuit NOT LIKE 'iracing-%'" : '';
  const rows = (await env.DB.prepare(`SELECT * FROM events${where} ORDER BY created_at DESC, id DESC`).all()).results;
  if (!rows.length) return [];
  const eventIds=rows.map(row=>row.id);
  const marks=eventIds.map(()=>'?').join(',');
  const registrations = (await env.DB.prepare(registrationSelect+` WHERE r.event_id IN (${marks}) ORDER BY r.created_at,r.id`).bind(...eventIds).all()).results;
  const crews = (await env.DB.prepare(`SELECT * FROM crews WHERE event_id IN (${marks}) ORDER BY created_at,id`).bind(...eventIds).all()).results;
  const memberships = (await env.DB.prepare(`SELECT cm.crew_id,cm.registration_id FROM crew_members cm JOIN crews c ON c.id=cm.crew_id WHERE c.event_id IN (${marks})`).bind(...eventIds).all()).results;
  const relevantUserIds=[...new Set(registrations.flatMap(reg=>[reg.owner_user_id,reg.participant_user_id,reg.user_id]).filter(Boolean))];
  let users=[];
  if (relevantUserIds.length) {
    const userMarks=relevantUserIds.map(()=>'?').join(',');
    users=(await env.DB.prepare(`SELECT id,name FROM users WHERE id IN (${userMarks})`).bind(...relevantUserIds).all()).results;
  }
  const userNames = new Map(users.map(item => [item.id,item.name]));
  const grouped = new Map();
  for (const reg of registrations) { const key = `${reg.event_id}:${reg.departure_id}`; if (!grouped.has(key)) grouped.set(key, []); grouped.get(key).push(publicRegistration(reg, actor, userNames)); }
  const membersByCrew = new Map();
  for (const member of memberships) {
    if (!membersByCrew.has(member.crew_id)) membersByCrew.set(member.crew_id, []);
    membersByCrew.get(member.crew_id).push(member.registration_id);
  }
  const crewsByDeparture = new Map();
  for (const crew of crews) {
    const key = `${crew.event_id}:${crew.departure_id}`;
    if (!crewsByDeparture.has(key)) crewsByDeparture.set(key, []);
    crewsByDeparture.get(key).push({
      id:crew.id,
      name:crew.name,
      category:crew.category,
      car:crew.car,
      locked:Boolean(crew.locked),
      version:crew.version,
      registrationIds:membersByCrew.get(crew.id) || [],
      canManage:canManageCrew(crew,actor),
      ownedByMe:Boolean(actor.user && crew.owner_user_id===actor.user.id),
      hasOwner:Boolean(crew.owner_user_id)
    });
  }
  return rows.map(row => ({id:row.id, name:row.name, circuit:row.circuit||'', durationHours:Number(row.duration_hours)||3, eventType:row.event_type||'private', categories:JSON.parse(row.categories), version:row.version, departures:JSON.parse(row.departures).map(d => ({...d, availability:grouped.get(`${row.id}:${d.id}`) || [], crews:crewsByDeparture.get(`${row.id}:${d.id}`) || []}))}));
}
async function oauthStart(request, env) {
  requireDiscord(env); await rateLimit(request, env, 'oauth', 20); await cleanup(env);
  const state = token();
  await env.DB.prepare('INSERT INTO oauth_states(state_hash,expires_at) VALUES(?,?)').bind(await hash(state), now() + 600).run();
  const auth = new URL('https://discord.com/oauth2/authorize');
  auth.search = new URLSearchParams({client_id:env.DISCORD_CLIENT_ID, response_type:'code', redirect_uri:origin(env) + '/api/auth/discord/callback', scope:'identify', state}).toString();
  return redirect(auth.href, [setCookie(COOKIE_STATE, state, 600)]);
}
async function oauthCallback(request, env) {
  requireDiscord(env);
  const url = new URL(request.url), state = url.searchParams.get('state');
  const clear = setCookie(COOKIE_STATE, '', 0);
  if (!state || !/^[a-f0-9]{64}$/.test(state) || state !== cookie(request, COOKIE_STATE)) return redirect(origin(env) + '/?auth=error', [clear]);
  const row = await env.DB.prepare('DELETE FROM oauth_states WHERE state_hash=? AND expires_at>? RETURNING state_hash').bind(await hash(state), now()).first();
  if (!row || !url.searchParams.get('code') || url.searchParams.has('error')) return redirect(origin(env) + '/?auth=error', [clear]);
  try {
    const response = await fetch('https://discord.com/api/oauth2/token', {method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded'}, body:new URLSearchParams({client_id:env.DISCORD_CLIENT_ID, client_secret:env.DISCORD_CLIENT_SECRET, grant_type:'authorization_code', code:url.searchParams.get('code'), redirect_uri:origin(env) + '/api/auth/discord/callback'}), signal:AbortSignal.timeout(10000)});
    if (!response.ok) throw Error('token');
    const auth = await response.json();
    const profileResponse = await fetch('https://discord.com/api/v10/users/@me', {headers:{Authorization:`Bearer ${auth.access_token}`}, signal:AbortSignal.timeout(10000)});
    if (!profileResponse.ok) throw Error('profile');
    const profile = await profileResponse.json();
    if (!/^\d{15,22}$/.test(profile.id)) throw Error('identity');
    const display = String(profile.global_name || profile.username || 'Pilote').slice(0, 80);
    const avatarHash = typeof profile.avatar === 'string' && /^[A-Za-z0-9_]{1,128}$/.test(profile.avatar) ? profile.avatar : '';
    const session = token();
    const guestRaw = cookie(request, COOKIE_GUEST);
    const guestHash = /^[a-f0-9]{64}$/.test(guestRaw) ? await hash(guestRaw) : null;
    await env.DB.batch([
      env.DB.prepare('INSERT INTO users(id,name,created_at) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name').bind(profile.id, display, now()),
      ...(guestHash ? [env.DB.prepare('UPDATE registrations SET owner_user_id=? WHERE guest_hash=? AND owner_user_id IS NULL').bind(profile.id, guestHash)] : []),
      ...(guestHash ? [env.DB.prepare(`UPDATE participants SET user_id=? WHERE guest_hash=? AND user_id IS NULL AND created_by IS NULL
        AND NOT EXISTS(SELECT 1 FROM participants WHERE user_id=?)`).bind(profile.id,guestHash,profile.id)] : []),
      env.DB.prepare('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)').bind(await hash(session), profile.id, now() + 7 * DAY)
    ]);
    const old = cookie(request, COOKIE_SESSION);
    if (old) await env.DB.prepare('DELETE FROM sessions WHERE token_hash=?').bind(await hash(old)).run();
    const avatarCookie = avatarHash
      ? `fmt_discord_avatar=${encodeURIComponent(`${profile.id}:${avatarHash}`)}; Path=/; Secure; SameSite=Lax; Max-Age=${7 * DAY}`
      : 'fmt_discord_avatar=; Path=/; Secure; SameSite=Lax; Max-Age=0';
    return redirect(origin(env) + '/', [clear, setCookie(COOKIE_SESSION, session, 7 * DAY), avatarCookie]);
  } catch {
    return redirect(origin(env) + '/?auth=error', [clear]);
  }
}
async function api(request, env) {
  if (!env.DB) fail(503, 'La base partagée n’est pas encore configurée.');
  const url = new URL(request.url), path = url.pathname, method = request.method;
  const canonical = origin(env);
  if (url.origin !== canonical) fail(403, 'Utilise l’adresse principale du site pour cette action.');
  if (!['GET','HEAD'].includes(method)) {
    if (request.headers.get('Origin') !== canonical) fail(403, 'Origine de la requête refusée.');
    await rateLimit(request, env, 'write', 80);
  }
  if (path === '/api/auth/discord' && method === 'GET') return oauthStart(request, env);
  if (path === '/api/auth/discord/callback' && method === 'GET') return oauthCallback(request, env);
  const actor = await identity(request, env);
  const diagnostics = await clientErrorsApi(path,method,env,actor);
  if (diagnostics) return diagnostics;
  if (path === '/api/session' && method === 'GET') return json({user:actor.user, discordReady:!!(env.DISCORD_CLIENT_ID && env.DISCORD_CLIENT_SECRET), adminConfigured:administrators(env).length > 0});
  if (path === '/api/auth/logout' && method === 'POST') {
    const raw = cookie(request, COOKIE_SESSION);
    if (raw) await env.DB.prepare('DELETE FROM sessions WHERE token_hash=?').bind(await hash(raw)).run();
    return json({ok:true}, 200, [setCookie(COOKIE_SESSION, '', 0), 'fmt_discord_avatar=; Path=/; Secure; SameSite=Lax; Max-Age=0']);
  }
  if (path === '/api/guest/recover' && method === 'POST') {
    const input = await body(request);
    if (!/^[a-f0-9]{64}$/.test(input.token || '')) fail(400, 'Lien personnel invalide.');
    const reg = await env.DB.prepare('SELECT id FROM registrations WHERE guest_hash=? LIMIT 1').bind(await hash(input.token)).first();
    if (!reg) fail(404, 'Ce lien ne correspond plus à une inscription.');
    return json({ok:true}, 200, [setCookie(COOKIE_GUEST, input.token, 365 * DAY)]);
  }
  if (path === '/api/guest/link' && method === 'POST') {
    if (!actor.guestToken || !(await env.DB.prepare('SELECT id FROM registrations WHERE guest_hash=? LIMIT 1').bind(actor.guestHash).first())) fail(404, 'Aucune inscription invitée sur cet appareil.');
    return json({link:canonical + '/#access=' + actor.guestToken});
  }
  if (path === '/api/events' && method === 'GET') {
    const requestedGame=url.searchParams.get('game');
    const game=requestedGame==='lmu'||requestedGame==='iracing'?requestedGame:'';
    const events=await listEvents(env,actor,game);
    const payload={events};
    const response=json(payload);
    response.headers.set('X-Endurance-Game',game||'all');
    response.headers.set('X-Endurance-Events',String(events.length));
    response.headers.set('X-Endurance-Approx-Bytes',String(new TextEncoder().encode(JSON.stringify(payload)).length));
    return response;
  }
  if (path === '/api/participants' && method === 'GET') {
    if (!actor.user) fail(401,'Connecte-toi avec Discord pour choisir un pilote.');
    return json({participants:(await env.DB.prepare(`SELECT u.id,u.name,p.id AS participantId
      FROM users u LEFT JOIN participants p ON p.user_id=u.id
      ORDER BY lower(u.name),u.id`).all()).results});
  }
  const crewCreate = path.match(/^\/api\/events\/([a-f0-9-]{36})\/departures\/([a-f0-9-]{36})\/crews$/);
  const crewRoute = path.match(/^\/api\/crews\/([a-f0-9-]{36})(?:\/members(?:\/([a-f0-9-]{36}))?)?$/);
  if ((crewCreate && method==='POST') || (crewRoute && ['POST','PATCH','DELETE'].includes(method))) {
    if (!actor.user) fail(401,'Connecte-toi avec Discord pour gérer un équipage.');
    const input=await body(request);
    const crew=crewRoute ? await env.DB.prepare('SELECT * FROM crews WHERE id=?').bind(crewRoute[1]).first() : null;
    if (crewRoute && !crew) fail(404,'Équipage introuvable.');
    const event=await eventById(env,crew?.event_id || crewCreate[1]);
    const departure=departureById(event,crew?.departure_id || crewCreate[2]);
    if (departure.startsAt<=Date.now()) fail(409,'Ce départ est passé. Les équipages sont verrouillés.');
    if (crew && input.version!==crew.version) fail(409,'Cet équipage a changé. Actualise avant de réessayer.');
    const membership=crewRoute && path.includes('/members');
    if (membership) {
      if (method==='POST' && !crewRoute[2]) {
        if (crew.locked) fail(409,'Cet équipage est complet. Son responsable doit le rouvrir avant de pouvoir le rejoindre.');
        if (!/^[a-f0-9-]{36}$/.test(input.registrationId || '')) fail(400,'Sélectionne un pilote inscrit.');
        const selected=await env.DB.prepare(registrationSelect+' WHERE r.id=?').bind(input.registrationId).first();
        if (!selected || selected.event_id!==crew.event_id || selected.departure_id!==crew.departure_id) fail(409,'Ce pilote n’est pas inscrit sur ce départ. Actualise la page.');
        if (selected.category!==crew.category || selected.status==='unavailable') fail(409,'Cette inscription ne correspond pas à la catégorie de l’équipage.');
        const selfJoin=input.selfJoin===true && personal(selected,actor);
        if (!canManageCrew(crew,actor) && !selfJoin) fail(403,'Tu peux uniquement rejoindre un équipage avec ta propre inscription.');
        const claimOwner=selfJoin && !crew.owner_user_id ? actor.user.id : null;
        const crewUpdate=claimOwner
          ? env.DB.prepare('UPDATE crews SET version=version+1,owner_user_id=COALESCE(owner_user_id,?) WHERE id=? AND version=?').bind(claimOwner,crew.id,input.version)
          : env.DB.prepare('UPDATE crews SET version=version+1 WHERE id=? AND version=?').bind(crew.id,input.version);
        const results=await env.DB.batch([
          crewUpdate,
          env.DB.prepare('INSERT INTO crew_members(registration_id,crew_id) SELECT ?,? WHERE changes()=1').bind(input.registrationId,crew.id),
          env.DB.prepare(`DELETE FROM registrations WHERE changes()=1 AND id!=? AND event_id=? AND departure_id=? AND participant_id=?`).bind(selected.id,selected.event_id,selected.departure_id,selected.participant_id)
        ]);
        if (!results[0].meta.changes) fail(409,'Cet équipage a changé. Actualise la page.');
        return json({ok:true,removedRegistrations:results[2].meta.changes,claimedOwnership:Boolean(claimOwner)});
      }
      if (method==='DELETE' && crewRoute[2]) {
        const selected=await env.DB.prepare(registrationSelect+' WHERE r.id=?').bind(crewRoute[2]).first();
        if (!selected) fail(404,'Inscription introuvable.');
        const member=await env.DB.prepare('SELECT registration_id FROM crew_members WHERE crew_id=? AND registration_id=?').bind(crew.id,selected.id).first();
        if (!member) fail(409,'Ce pilote ne fait plus partie de cet équipage. Actualise la page.');
        const selfLeave=personal(selected,actor);
        if (!canManageCrew(crew,actor) && !selfLeave) fail(403,'Tu peux uniquement quitter toi-même un équipage.');
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
        const results=await env.DB.batch([
          env.DB.prepare('UPDATE crews SET version=version+1,locked=0,owner_user_id=? WHERE id=? AND version=?').bind(nextOwner,crew.id,input.version),
          env.DB.prepare('DELETE FROM crew_members WHERE crew_id=? AND registration_id=? AND changes()=1').bind(crew.id,selected.id)
        ]);
        if (!results[0].meta.changes) fail(409,'Cet équipage a changé. Actualise la page.');
        return json({ok:true,unlocked:Boolean(crew.locked)});
      }
      fail(404,'Action introuvable.');
    }
    if (crew) {
      if (!canManageCrew(crew,actor)) fail(403,'Seul le responsable de cet équipage ou un organisateur peut le modifier.');
      if (method==='DELETE') {
        const result = await env.DB.prepare('DELETE FROM crews WHERE id=? AND version=?').bind(crew.id,input.version).run();
        if (!result.meta.changes) fail(409,'Cet équipage a changé. Actualise avant de réessayer.');
        return json({ok:true});
      }
      if (method!=='PATCH') fail(404,'Action introuvable.');
      if (typeof input.locked==='boolean' && input.name===undefined && input.category===undefined && input.car===undefined) {
        const result=await env.DB.prepare('UPDATE crews SET locked=?,version=version+1 WHERE id=? AND version=?').bind(input.locked?1:0,crew.id,input.version).run();
        if (!result.meta.changes) fail(409,'Cet équipage a changé. Actualise avant de réessayer.');
        return json({ok:true,locked:input.locked});
      }
      const name=text(input.name,60,'Nom de l’équipage');
      if (!JSON.parse(event.categories).includes(input.category)) fail(400,'Choisis une catégorie de cet événement.');
      const car=input.car==null || input.car==='' ? '' : text(input.car,100,'Voiture');
      const result=await env.DB.prepare('UPDATE crews SET name=?,category=?,car=?,version=version+1 WHERE id=? AND version=?').bind(name,input.category,car,crew.id,input.version).run();
      if (!result.meta.changes) fail(409,'Cet équipage a changé. Actualise avant de réessayer.');
      return json({id:crew.id});
    }
    const name=text(input.name,60,'Nom de l’équipage');
    if (!JSON.parse(event.categories).includes(input.category)) fail(400,'Choisis une catégorie de cet événement.');
    const car=input.car==null || input.car==='' ? '' : text(input.car,100,'Voiture');
    const crewId=id();
    if (isRegistrationManager(actor)) {
      const result=await env.DB.prepare('INSERT INTO crews(id,event_id,departure_id,name,category,car,created_at) VALUES(?,?,?,?,?,?,?)').bind(crewId,event.id,departure.id,name,input.category,car,now()).run();
      if (!result.meta.changes) fail(409,'Impossible de créer cet équipage. Actualise avant de réessayer.');
      return json({id:crewId,joined:false},201);
    }
    const ownRows=(await env.DB.prepare(registrationSelect+' WHERE r.event_id=? AND r.departure_id=? AND r.category=? AND r.status!=?').bind(event.id,departure.id,input.category,'unavailable').all()).results;
    const selected=ownRows.find(reg=>personal(reg,actor));
    if (!selected) fail(403,'Inscris-toi d’abord sur ce départ dans cette catégorie avant de créer ton équipage.');
    const results=await env.DB.batch([
      env.DB.prepare('INSERT INTO crews(id,event_id,departure_id,name,category,car,owner_user_id,created_at) VALUES(?,?,?,?,?,?,?,?)').bind(crewId,event.id,departure.id,name,input.category,car,actor.user.id,now()),
      env.DB.prepare('INSERT INTO crew_members(registration_id,crew_id) SELECT ?,? WHERE changes()=1').bind(selected.id,crewId),
      env.DB.prepare(`DELETE FROM registrations WHERE changes()=1 AND id!=? AND event_id=? AND departure_id=? AND participant_id=?`).bind(selected.id,selected.event_id,selected.departure_id,selected.participant_id)
    ]);
    if (!results[0].meta.changes) fail(409,'Impossible de créer cet équipage. Actualise avant de réessayer.');
    return json({id:crewId,joined:true,removedRegistrations:results[2].meta.changes},201);
  }
  if (path === '/api/events' && method === 'POST') {
    requireRole(actor.user);
    const data = validateEvent(await body(request)), eventId = id();
    await env.DB.prepare('INSERT INTO events(id,name,duration_hours,event_type,circuit,categories,departures,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?)').bind(eventId, data.name, data.durationHours, data.eventType, data.circuit, JSON.stringify(data.categories), JSON.stringify(data.departures), actor.user.id, now()).run();
    return json({id:eventId}, 201);
  }
  const eventMatch = path.match(/^\/api\/events\/([a-f0-9-]{36})$/);
  if (eventMatch && ['PATCH','DELETE'].includes(method)) {
    requireRole(actor.user, method === 'DELETE');
    const event = await eventById(env, eventMatch[1]), input = await body(request);
    if (input.version !== event.version) fail(409, 'Cet événement a changé. Actualise avant de réessayer.');
    if (method === 'DELETE') {
      const result = await env.DB.prepare('DELETE FROM events WHERE id=? AND version=?').bind(event.id, input.version).run();
      if (!result.meta.changes) fail(409, 'Cet événement a changé. Actualise avant de réessayer.');
      return json({ok:true});
    }
    const data = validateEvent(input, event), cats = JSON.stringify(data.categories), deps = JSON.stringify(data.departures);
    const result = await env.DB.prepare(`UPDATE events SET name=?,duration_hours=?,event_type=?,circuit=?,categories=?,departures=?,version=version+1 WHERE id=? AND version=?
      AND NOT EXISTS (SELECT 1 FROM registrations r WHERE r.event_id=events.id AND
        (NOT EXISTS (SELECT 1 FROM json_each(?) d WHERE json_extract(d.value,'$.id')=r.departure_id)
      OR (r.category!='' AND NOT EXISTS (SELECT 1 FROM json_each(?) c WHERE c.value=r.category))
      OR EXISTS (SELECT 1 FROM json_each(?) h WHERE instr(',' || r.status || ',', ',' || h.value || ',') > 0)))`).bind(data.name, data.durationHours, data.eventType, data.circuit, cats, deps, event.id, input.version, deps, cats, JSON.stringify(Array.from({length:24-data.durationHours},(_,i)=>`h${data.durationHours+i+1}`))).run();
    if (!result.meta.changes) fail(409, 'Modification impossible : événement modifié ailleurs, départ supprimé avec des inscrits, catégorie encore utilisée, ou disponibilités au-delà de la nouvelle durée. Ajuste les disponibilités concernées avant de raccourcir la course.');
    return json({ok:true});
  }
  const departureMatch = path.match(/^\/api\/events\/([a-f0-9-]{36})\/departures\/([a-f0-9-]{36})\/registrations$/);
  if (departureMatch && method === 'POST') {
    const event = await eventById(env, departureMatch[1]);
    const departure = departureById(event, departureMatch[2]);
    if (departure.startsAt <= Date.now()) fail(409, 'Ce départ est passé. Les inscriptions sont fermées.');
    const input = await body(request), data = validateRegistration(input, event);
    const guestToken = actor.user ? null : actor.guestToken || token();
    if (guestToken) { actor.guestToken=guestToken;actor.guestHash=await hash(guestToken); }
    const participant=await registrationParticipant(env,actor,input,data);
    const userId=participant.user_id;
    const guestHash=userId?null:participant.guest_hash||await hash(token());
    const ownerUserId = actor.user?.id || null;
    const regId = id();
    if (input.participantId) { data.name=participant.name;data.nameKey=data.name.normalize('NFKC').toLocaleLowerCase('fr-FR'); }
    const result = await env.DB.prepare(`INSERT INTO registrations(id,event_id,departure_id,user_id,owner_user_id,guest_hash,name,name_key,category,car,car_preferences,car_any,status,preferred_pilot,created_at,participant_id)
      SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,? FROM events WHERE id=? AND version=?`).bind(regId,event.id,departure.id,userId,ownerUserId,guestHash,data.name,data.nameKey,data.category,data.car,JSON.stringify(data.cars),data.carAny?1:0,data.status,data.preferredPilot,now(),participant.id,event.id,event.version).run();
    if (!result.meta.changes) fail(409, 'Cet événement a changé. Actualise avant de t’inscrire.');
    return json({id:regId, recoveryLink:guestToken ? canonical + '/#access=' + guestToken : null}, 201, guestToken ? [setCookie(COOKIE_GUEST, guestToken, 365 * DAY)] : []);
  }
  const regMatch = path.match(/^\/api\/registrations\/([a-f0-9-]{36})$/);
  if (regMatch && ['PATCH','DELETE'].includes(method)) {
    const reg = await env.DB.prepare(registrationSelect+' WHERE r.id=?').bind(regMatch[1]).first();
    if (!reg) fail(404, 'Inscription introuvable.');
    if (!canManageRegistration(reg,actor)) fail(403, 'Tu n’as pas l’autorisation de modifier cette inscription.');
    const event = await eventById(env, reg.event_id), departure = departureById(event,reg.departure_id);
    if (departure.startsAt <= Date.now()) fail(409, 'Ce départ est passé. Les inscriptions sont verrouillées.');
    const input = await body(request);
    if (input.version !== reg.version) fail(409, 'Cette inscription a changé. Actualise la page.');
    let result;
    if (method === 'DELETE') result = await env.DB.prepare('DELETE FROM registrations WHERE id=? AND version=?').bind(reg.id,input.version).run();
    else {
      const data = validateRegistration(input,event);
      const results=await env.DB.batch([
        env.DB.prepare(`UPDATE registrations SET name=?,name_key=?,category=?,car=?,car_preferences=?,car_any=?,status=?,preferred_pilot=?,version=version+1 WHERE id=? AND version=? AND EXISTS(SELECT 1 FROM events WHERE id=? AND version=?)`).bind(data.name,data.nameKey,data.category,data.car,JSON.stringify(data.cars),data.carAny?1:0,data.status,data.preferredPilot,reg.id,input.version,event.id,event.version),
        env.DB.prepare('UPDATE participants SET name=? WHERE id=? AND changes()=1').bind(data.name,reg.participant_id)
      ]);
      result=results[0];
    }
    if (!result.meta.changes) fail(409, 'Les données ont changé. Actualise avant de réessayer.');
    return json({ok:true});
  }
  if (path === '/api/members' && method === 'GET') {
    requireRole(actor.user,true);
    const rows = (await env.DB.prepare('SELECT * FROM users ORDER BY name LIMIT 200').all()).results;
    return json({members:rows.map(u => publicUser(u,env))});
  }
  const memberMatch = path.match(/^\/api\/members\/(\d{15,22})$/);
  if (memberMatch && method === 'PATCH') {
    requireRole(actor.user,true);
    if (administrators(env).includes(memberMatch[1])) fail(403, 'Les administrateurs principaux sont définis dans la configuration du site.');
    const input = await body(request);
    if (!['pilot','organizer'].includes(input.role)) fail(400, 'Rôle invalide.');
    const result = await env.DB.prepare('UPDATE users SET role=? WHERE id=?').bind(input.role,memberMatch[1]).run();
    if (!result.meta.changes) fail(404, 'Ce pilote doit d’abord se connecter avec Discord.');
    return json({ok:true});
  }
  fail(404, 'Action introuvable.');
}
export default {
  async fetch(request, env) {
    const pathname=new URL(request.url).pathname;
    if (pathname === '/telemetry/client-error') {
      try { return await ingestClientError(request,env); }
      catch { return new Response(null,{status:204}); }
    }
    if (!pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    try { return await api(request, env); }
    catch (error) {
      if (error instanceof HttpError) return json({error:error.message},error.status);
      const message=String(error.message);
      if (message.includes('participant_already_assigned')) return json({error:'Ce pilote est déjà affecté à un équipage sur ce départ. Modifie son inscription existante, ou retire-le de l’équipage avant de changer de catégorie ou de le déclarer indisponible.'},409);
      if (message.includes('participant_required') || message.includes('participant_fixed')) return json({error:'Recharge le site pour retrouver la fiche du pilote.'},409);
      if (message.includes('no such table: participants') || message.includes('no such column: r.participant_id')) return json({error:'La mise à jour de la base attend la migration 0012_participants.sql.'},503);
      if (message.includes('no such column: locked')) return json({error:'La mise à jour de la base attend la migration 0015_crew_lock.sql.'},503);
      if (message.includes('no such column: owner_user_id')) return json({error:'La mise à jour de la base attend la migration 0016_crew_ownership.sql.'},503);
      if (message.includes('UNIQUE constraint failed: crew_members.')) return json({error:'Ce pilote appartient déjà à un équipage sur ce départ. Actualise la page.'},409);
      if (message.includes('crew_category_in_use')) return json({error:'Ce pilote est affecté à un équipage de cette catégorie. Retire d’abord son affectation pour changer de catégorie.'},409);
      if (message.includes('crew_event_in_use')) return json({error:'Un équipage utilise encore ce départ ou cette catégorie. Supprime ou modifie cet équipage avant de continuer.'},409);
      if (message.includes('crew_membership_invalid') || message.includes('crew_invalid')) return json({error:'Affectation impossible : vérifie le départ, la catégorie et la disponibilité du pilote, puis actualise.'},409);
      if (message.includes('UNIQUE constraint failed: registrations.')) return json({error:'Ce pilote ou ce pseudo est déjà inscrit dans cette catégorie pour ce départ. Modifie l’inscription existante ou choisis une autre catégorie.'},409);
      console.error('FMT API failure', error instanceof Error ? error.message.replace(/[a-f0-9]{64}/g,'[redacted]') : 'unknown');
      return json({error:'Le service est momentanément indisponible. Tes changements ne sont pas confirmés ; réessaie dans un instant.'},503);
    }
  }
};
