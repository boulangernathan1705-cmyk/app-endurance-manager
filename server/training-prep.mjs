// The preparation of each LMU race (migration 0062, shared/training-prep.mjs): the pilot's status per step, proved by
// the sessions when they can tell, the notes and the setup file shared with the crew, the last race on the same
// circuit beside it. Only the pilots of the crew see each other's; a pilot without a crew sees his own.
import {fail, json, id, body} from './core.mjs';
import {PREP_STEPS, PREP_STATUSES, NOTE_LIMIT, SETUP_LIMIT, SETUP_FILE, prepStatus, nextStep} from '../shared/training-prep.mjs';

const all = async (env, sql, ...params) => (await env.DB.prepare(sql).bind(...params).all()).results || [];
const now = () => Date.now();

// Every LMU race the pilot is entered in, the next first; the past ones on a circuit for « la dernière fois ».
async function entries(env, userId) {
  const rows = await all(env, `SELECT r.departure_id,r.category,e.id,e.name,e.circuit,e.departures FROM registrations r JOIN participants p ON p.id=r.participant_id
    JOIN events e ON e.id=r.event_id WHERE p.user_id=? AND r.status!='unavailable' AND e.circuit NOT LIKE 'iracing-%'`, userId);
  return rows.map(row => {
    const departure = JSON.parse(row.departures || '[]').find(item => item.id === row.departure_id);
    return departure?.startsAt ? {eventId:row.id, departureId:row.departure_id, name:row.name, circuit:row.circuit, category:row.category, startsAt:departure.startsAt} : null;
  }).filter(Boolean);
}
export async function upcomingRaces(env, userId) {
  return (await entries(env, userId)).filter(race => race.startsAt >= now()).sort((a, b) => a.startsAt - b.startsAt);
}
async function lastRaceOn(env, userId, race) {
  return (await entries(env, userId)).filter(item => item.circuit === race.circuit && item.startsAt < now()).sort((a, b) => b.startsAt - a.startsAt)[0] || null;
}

// The pilots who share the race's preparation: the viewer's crew in this race, else the viewer alone.
export async function raceCrew(env, userId, communityId, race) {
  const crew = await env.DB.prepare(`SELECT c.id,c.name,c.car FROM crews c JOIN crew_members cm ON cm.crew_id=c.id
    JOIN registrations r ON r.id=cm.registration_id JOIN participants p ON p.id=r.participant_id
    WHERE p.user_id=? AND c.community_id=? AND c.event_id=? AND c.departure_id=? LIMIT 1`).bind(userId, communityId, race.eventId, race.departureId).first();
  const members = crew ? await all(env, `SELECT DISTINCT p.user_id,p.name FROM crew_members cm JOIN registrations r ON r.id=cm.registration_id
    JOIN participants p ON p.id=r.participant_id WHERE cm.crew_id=? AND p.user_id IS NOT NULL ORDER BY p.name`, crew.id) : [];
  if (!members.some(member => member.user_id === userId)) members.unshift({user_id:userId, name:''});
  return {crew, members};
}
const marks = (list, count) => list.map(() => '?').slice(0, count).join(',');

async function notesOf(env, race, users, viewer) {
  const rows = await all(env, `SELECT n.id,n.user_id,n.step,n.text,n.created_at FROM training_prep_notes n WHERE n.event_id=? AND n.departure_id=?
    AND n.user_id IN (${marks(users, users.length)}) ORDER BY n.created_at`, race.eventId, race.departureId, ...users.map(user => user.user_id));
  return rows.map(row => ({id:row.id, step:row.step, text:row.text, at:row.created_at, you:row.user_id === viewer,
    author:row.user_id === viewer ? 'Toi' : users.find(user => user.user_id === row.user_id)?.name || 'Pilote'}));
}

// proofs: user id -> the exercises their sessions prove (shared/training-checklist.mjs).
export async function racePrep(env, viewer, communityId, race, proofs = {}) {
  if (!race) return null;
  const {crew, members} = await raceCrew(env, viewer, communityId, race);
  const ids = members.map(member => member.user_id);
  const chosen = await all(env, `SELECT user_id,step,status FROM training_prep WHERE event_id=? AND departure_id=? AND user_id IN (${marks(ids, ids.length)})`,
    race.eventId, race.departureId, ...ids);
  const statusesOf = user => Object.fromEntries(PREP_STEPS.map(step => [step.key,
    prepStatus(step, chosen.find(row => row.user_id === user && row.step === step.key)?.status, proofs[user])]));
  const mine = statusesOf(viewer);
  const setup = await env.DB.prepare(`SELECT id,user_id,name,size,note,created_at FROM training_prep_setups WHERE event_id=? AND departure_id=?
    AND user_id IN (${marks(ids, ids.length)}) ORDER BY created_at DESC LIMIT 1`).bind(race.eventId, race.departureId, ...ids).first();
  const last = await lastRaceOn(env, viewer, race);
  let previous = null;
  if (last) {
    const before = await raceCrew(env, viewer, communityId, last);
    previous = {name:last.name, startsAt:last.startsAt, eventId:last.eventId, departureId:last.departureId, notes:await notesOf(env, last, before.members, viewer)};
  }
  return {race:{eventId:race.eventId, departureId:race.departureId},
    statuses:mine, proofs:Object.fromEntries(PREP_STEPS.filter(step => step.auto && proofs[viewer]?.[step.auto]).map(step => [step.key, proofs[viewer][step.auto]])),
    next:nextStep(mine)?.key || null,
    crew:crew ? {name:crew.name, pilots:members.map(member => ({name:member.user_id === viewer ? 'Toi' : member.name, you:member.user_id === viewer, statuses:statusesOf(member.user_id)}))} : null,
    notes:await notesOf(env, race, members, viewer),
    setup:setup ? {id:setup.id, name:setup.name, size:setup.size, note:setup.note, at:setup.created_at, you:setup.user_id === viewer,
      author:setup.user_id === viewer ? 'Toi' : members.find(member => member.user_id === setup.user_id)?.name || 'Pilote'} : null,
    last:previous};
}

// The race the request names, only if the pilot is entered in it.
async function enteredRace(env, user, eventId, departureId) {
  const race = (await entries(env, user)).find(item => item.eventId === eventId && item.departureId === departureId);
  if (!race) fail(404, 'Tu n’es pas inscrit à cette course.');
  return race;
}
const clean = (value, size) => String(value ?? '').replace(/[\u0000-\u0008\u000b-\u001f]/g, '').trim().slice(0, size);

export async function prepApi(path, method, request, env, user, community) {
  if (!path.startsWith('/api/training/prep')) return null;
  if (path === '/api/training/prep' && method === 'PUT') {
    const input = await body(request);
    const race = await enteredRace(env, user, input.eventId, input.departureId);
    if (!PREP_STEPS.some(step => step.key === input.step) || !PREP_STATUSES.includes(input.status)) fail(400, 'Étape ou statut inconnu.');
    await env.DB.prepare(`INSERT INTO training_prep(event_id,departure_id,user_id,step,status,updated_at) VALUES(?,?,?,?,?,?)
      ON CONFLICT(event_id,departure_id,user_id,step) DO UPDATE SET status=excluded.status,updated_at=excluded.updated_at`)
      .bind(race.eventId, race.departureId, user, input.step, input.status, now()).run();
    return json({ok:true});
  }
  if (path === '/api/training/prep/notes' && method === 'POST') {
    const input = await body(request);
    const race = await enteredRace(env, user, input.eventId, input.departureId);
    const text = clean(input.text, NOTE_LIMIT);
    if (!PREP_STEPS.some(step => step.key === input.step) || !text) fail(400, 'Écris une note.');
    const count = await env.DB.prepare('SELECT COUNT(*) AS n FROM training_prep_notes WHERE event_id=? AND departure_id=? AND user_id=?').bind(race.eventId, race.departureId, user).first();
    if (count.n >= 100) fail(400, 'Cent notes pour une course, c’est le maximum.');
    const note = {id:id(), at:now()};
    await env.DB.prepare('INSERT INTO training_prep_notes(id,event_id,departure_id,user_id,step,text,created_at) VALUES(?,?,?,?,?,?,?)')
      .bind(note.id, race.eventId, race.departureId, user, input.step, text, note.at).run();
    return json({ok:true, id:note.id});
  }
  // The notes of the last race on this circuit, copied into the next one (the viewer's own and the crew's then).
  if (path === '/api/training/prep/reuse' && method === 'POST') {
    const input = await body(request);
    const race = await enteredRace(env, user, input.eventId, input.departureId);
    const last = await lastRaceOn(env, user, race);
    if (!last) fail(404, 'Pas de course précédente sur ce circuit.');
    const {members} = await raceCrew(env, user, community.id, last);
    const notes = (await notesOf(env, last, members, user)).slice(0, 50);
    const existing = new Set((await all(env, 'SELECT step,text FROM training_prep_notes WHERE event_id=? AND departure_id=? AND user_id=?', race.eventId, race.departureId, user)).map(row => `${row.step}:${row.text}`));
    const copies = notes.map(note => ({...note, text:clean(note.you ? note.text : `${note.author} : ${note.text}`, NOTE_LIMIT)})).filter(note => !existing.has(`${note.step}:${note.text}`));
    if (copies.length) await env.DB.batch(copies.map((note, index) => env.DB.prepare('INSERT INTO training_prep_notes(id,event_id,departure_id,user_id,step,text,created_at) VALUES(?,?,?,?,?,?,?)')
      .bind(id(), race.eventId, race.departureId, user, note.step, note.text, now() + index)));
    return json({ok:true, added:copies.length});
  }
  const note = /^\/api\/training\/prep\/notes\/([\w-]+)$/.exec(path);
  if (note && method === 'DELETE') {
    const result = await env.DB.prepare('DELETE FROM training_prep_notes WHERE id=? AND user_id=?').bind(note[1], user).run();
    if (!result.meta?.changes) fail(404, 'Note introuvable.');
    return json({ok:true});
  }
  // The setup: a small text file from LMU's garage (.svm), sent as it is with its name in the query.
  if (path === '/api/training/prep/setup' && method === 'POST') {
    const url = new URL(request.url);
    const race = await enteredRace(env, user, url.searchParams.get('eventId'), url.searchParams.get('departureId'));
    const name = clean(url.searchParams.get('name'), 120).replace(/[\\/]/g, '');
    if (!SETUP_FILE.test(name)) fail(400, 'Choisis un fichier de setup LMU (.svm).');
    const declared = Number(request.headers.get('Content-Length') || 0);
    if (declared > SETUP_LIMIT) fail(413, 'Fichier trop lourd.');
    const bytes = new Uint8Array(await request.arrayBuffer());
    if (!bytes.length || bytes.length > SETUP_LIMIT) fail(bytes.length ? 413 : 400, bytes.length ? 'Fichier trop lourd.' : 'Fichier vide.');
    let binary = ''; for (const byte of bytes) binary += String.fromCharCode(byte);
    const setupId = id();
    await env.DB.batch([
      env.DB.prepare('DELETE FROM training_prep_setups WHERE event_id=? AND departure_id=? AND user_id=?').bind(race.eventId, race.departureId, user),
      env.DB.prepare('INSERT INTO training_prep_setups(id,event_id,departure_id,user_id,name,size,data,note,created_at) VALUES(?,?,?,?,?,?,?,?,?)')
        .bind(setupId, race.eventId, race.departureId, user, name, bytes.length, btoa(binary), clean(url.searchParams.get('note'), NOTE_LIMIT), now())]);
    return json({ok:true, id:setupId});
  }
  const setup = /^\/api\/training\/prep\/setup\/([\w-]+)$/.exec(path);
  if (setup && method === 'GET') {
    const row = await env.DB.prepare('SELECT * FROM training_prep_setups WHERE id=?').bind(setup[1]).first();
    if (!row) fail(404, 'Setup introuvable.');
    const race = await enteredRace(env, user, row.event_id, row.departure_id);
    const {members} = await raceCrew(env, user, community.id, race);
    if (!members.some(member => member.user_id === row.user_id)) fail(404, 'Setup introuvable.');
    const bytes = Uint8Array.from(atob(row.data), char => char.charCodeAt(0));
    return new Response(bytes, {headers:{'Content-Type':'application/octet-stream', 'Content-Disposition':`attachment; filename="${row.name.replace(/["\r\n]/g, '')}"`, 'Cache-Control':'private, no-store'}});
  }
  if (setup && method === 'DELETE') {
    await env.DB.prepare('DELETE FROM training_prep_setups WHERE id=? AND user_id=?').bind(setup[1], user).run();
    return json({ok:true});
  }
  return null;
}
