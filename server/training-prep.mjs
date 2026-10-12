// The preparation of each LMU race (migration 0062, shared/training-prep.mjs): the pilot's status per step, proved by
// the sessions when they can tell, the notes and the relay plan shared with the crew, the last race on the same
// circuit beside it. Only the pilots of the crew see each other's; a pilot without a crew sees his own.
import {fail, json, id, body} from './core.mjs';
import {PREP_STEPS, PREP_STATUSES, NOTE_LIMIT, prepStatus, nextStep} from '../shared/training-prep.mjs';

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

// The crew's relay plan: one pilot per hour of the race, among the crew's entries (a pilot who left is forgotten).
async function stintsOf(env, crew, race, viewer) {
  const event = await env.DB.prepare('SELECT duration_hours,duration_minutes FROM events WHERE id=?').bind(race.eventId).first();
  const hours = Number(event?.duration_hours) || 3, minutes = Number(event?.duration_minutes) || hours * 60;
  const pilots = await all(env, `SELECT r.id,r.status,p.user_id,p.name FROM crew_members cm JOIN registrations r ON r.id=cm.registration_id
    JOIN participants p ON p.id=r.participant_id WHERE cm.crew_id=? ORDER BY p.name`, crew.id);
  const plan = Array(hours).fill(null);
  for (const row of await all(env, 'SELECT hour,registration_id FROM training_stints WHERE crew_id=?', crew.id))
    if (row.hour >= 0 && row.hour < hours && pilots.some(pilot => pilot.id === row.registration_id)) plan[row.hour] = row.registration_id;
  return {startsAt:race.startsAt, endsAt:race.startsAt + minutes * 60000, hours, plan,
    pilots:pilots.map(pilot => ({id:pilot.id, name:pilot.user_id === viewer ? 'Toi' : pilot.name, you:pilot.user_id === viewer, status:pilot.status}))
      .sort((a, b) => b.you - a.you)};
}

// proofs: user id -> the exercises their sessions prove (shared/training-checklist.mjs).
export async function racePrep(env, viewer, communityId, race, proofs = {}) {
  if (!race) return null;
  const {crew, members} = await raceCrew(env, viewer, communityId, race);
  const ids = members.map(member => member.user_id);
  // A full relay plan ticks the step for the whole crew.
  const stints = crew ? await stintsOf(env, crew, race, viewer) : null;
  if (stints?.plan.every(Boolean)) proofs = Object.fromEntries(ids.map(user => [user, {...proofs[user], plan:'Planning complet'}]));
  const chosen = await all(env, `SELECT user_id,step,status FROM training_prep WHERE event_id=? AND departure_id=? AND user_id IN (${marks(ids, ids.length)})`,
    race.eventId, race.departureId, ...ids);
  const statusesOf = user => Object.fromEntries(PREP_STEPS.map(step => [step.key,
    prepStatus(step, chosen.find(row => row.user_id === user && row.step === step.key)?.status, proofs[user])]));
  const mine = statusesOf(viewer);
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
    stints,
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
  // The relay plan: hour -> the crew entry driving it (null clears the hour). Any pilot of the crew changes it.
  if (path === '/api/training/prep/stints' && method === 'PUT') {
    const input = await body(request);
    const race = await enteredRace(env, user, input.eventId, input.departureId);
    const {crew} = await raceCrew(env, user, community.id, race);
    if (!crew) fail(400, 'Rejoins un équipage pour planifier les relais.');
    const stints = await stintsOf(env, crew, race, user);
    const changes = Object.entries(input.hours && typeof input.hours === 'object' ? input.hours : {});
    if (!changes.length || changes.length > stints.hours) fail(400, 'Aucune heure à changer.');
    const statements = changes.map(([key, pilot]) => {
      const hour = Number(key);
      if (!Number.isInteger(hour) || hour < 0 || hour >= stints.hours) fail(400, 'Heure inconnue.');
      if (pilot === null) return env.DB.prepare('DELETE FROM training_stints WHERE crew_id=? AND hour=?').bind(crew.id, hour);
      if (!stints.pilots.some(item => item.id === pilot)) fail(400, 'Ce pilote n’est pas dans l’équipage.');
      return env.DB.prepare(`INSERT INTO training_stints(crew_id,hour,registration_id,updated_by,updated_at) VALUES(?,?,?,?,?)
        ON CONFLICT(crew_id,hour) DO UPDATE SET registration_id=excluded.registration_id,updated_by=excluded.updated_by,updated_at=excluded.updated_at`)
        .bind(crew.id, hour, pilot, user, now());
    });
    await env.DB.batch(statements);
    return json({ok:true});
  }
  return null;
}
