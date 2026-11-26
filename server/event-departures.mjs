import {crewOrganisers} from './access.mjs';
import {communityById} from './community.mjs';
import {id} from './core.mjs';
import {crewPilots, notify} from './notifications.mjs';

// Real starts were added next to the common "Horaire à définir" start: nobody is on it (no entry, no
// crew), so it is not needed any more and is left out.
export async function dropEmptyCommonStart(env, eventId, data) {
  const common = data.departures.find(departure => departure.tbd);
  if (!common || data.departures.length < 2) return;
  const used = eventId && await env.DB.prepare('SELECT 1 FROM registrations WHERE event_id=? AND departure_id=? UNION SELECT 1 FROM crews WHERE event_id=? AND departure_id=? LIMIT 1')
    .bind(eventId, common.id, eventId, common.id).first();
  if (!used) data.departures = data.departures.filter(departure => departure !== common);
}
// Real starts removed from a race while pilots are on them: their entries and crews go to the waiting start
// ("Horaire à définir", added when missing), where each pilot or crew picks a time again. A pilot still entered
// on another start keeps that one (the removed entry goes); a pilot can wait only once per category.
export async function waitingMoves(env, event, data) {
  const kept = new Set(data.departures.map(d => d.id));
  const removed = JSON.parse(event.departures || '[]').filter(d => !d.tbd && !kept.has(d.id));
  if (!removed.length) return null;
  const all = async (sql, ...params) => (await env.DB.prepare(sql).bind(...params).all()).results || [];
  const gone = JSON.stringify(removed.map(d => d.id));
  const regs = await all(`SELECT r.id, r.departure_id, r.participant_id, r.category, cm.crew_id FROM registrations r
    LEFT JOIN crew_members cm ON cm.registration_id=r.id WHERE r.event_id=? AND r.departure_id IN (SELECT value FROM json_each(?))`, event.id, gone);
  const crews = await all('SELECT id FROM crews WHERE event_id=? AND departure_id IN (SELECT value FROM json_each(?))', event.id, gone);
  if (!regs.length && !crews.length) return null;
  let waiting = data.departures.find(d => d.tbd), added = null;
  if (!waiting) {
    const first = [...data.departures, ...removed].sort((a, b) => a.startsAt - b.startsAt)[0];
    waiting = added = {id:id(), date:first.date, time:first.time, startsAt:first.startsAt, tbd:true};
    data.departures.unshift(added);
  }
  const others = await all(`SELECT r.id, r.departure_id, r.participant_id, r.category, cm.crew_id FROM registrations r
    LEFT JOIN crew_members cm ON cm.registration_id=r.id WHERE r.event_id=? AND r.departure_id NOT IN (SELECT value FROM json_each(?))`, event.id, gone);
  const key = reg => `${reg.participant_id}|${reg.category}`;
  const waitingByKey = new Map(others.filter(reg => reg.departure_id === waiting.id).map(reg => [key(reg), reg]));
  const elsewhere = new Set(others.filter(reg => reg.departure_id !== waiting.id && kept.has(reg.departure_id)).map(reg => reg.participant_id));
  const move = [], drop = [], taken = new Set(waitingByKey.keys());
  // Crew members first: their crew needs them. A plain waiting entry of the same pilot makes way.
  for (const reg of regs.filter(item => item.crew_id)) {
    const before = waitingByKey.get(key(reg));
    if (!taken.has(key(reg))) { taken.add(key(reg)); move.push(reg); }
    else if (before && !before.crew_id && !drop.includes(before.id)) { drop.push(before.id); move.push(reg); }
    else drop.push(reg.id);
  }
  for (const reg of regs.filter(item => !item.crew_id)) {
    if (taken.has(key(reg)) || elsewhere.has(reg.participant_id)) drop.push(reg.id);
    else { taken.add(key(reg)); move.push(reg); }
  }
  const members = move.filter(reg => reg.crew_id), crewIds = JSON.stringify(crews.map(crew => crew.id));
  const list = items => JSON.stringify(items);
  return {lossy:drop.length > 0, statements:version => {
    const same = 'EXISTS(SELECT 1 FROM events WHERE id=? AND version=?)', at = [event.id, version];
    return [
      ...(added ? [env.DB.prepare("UPDATE events SET departures=json_insert(departures,'$[#]',json(?)) WHERE id=? AND version=?").bind(JSON.stringify(added), ...at)] : []),
      env.DB.prepare(`DELETE FROM crew_members WHERE crew_id IN (SELECT value FROM json_each(?)) AND ${same}`).bind(crewIds, ...at),
      env.DB.prepare(`DELETE FROM registrations WHERE id IN (SELECT value FROM json_each(?)) AND ${same}`).bind(list(drop), ...at),
      env.DB.prepare(`UPDATE registrations SET departure_id=?,version=version+1 WHERE id IN (SELECT value FROM json_each(?)) AND ${same}`).bind(waiting.id, list(move.map(reg => reg.id)), ...at),
      env.DB.prepare(`UPDATE crews SET departure_id=?,version=version+1 WHERE id IN (SELECT value FROM json_each(?)) AND ${same}`).bind(waiting.id, crewIds, ...at),
      ...members.map(reg => env.DB.prepare(`INSERT INTO crew_members(registration_id,crew_id) SELECT ?,? WHERE ${same}`).bind(reg.id, reg.crew_id, ...at))
    ];
  }};
}
// Pilots on the waiting start, once real times exist: a crew's manager picks its time, its pilots are told,
// a pilot without a crew picks his own. Returns the players told.
export async function askToChooseStart(env, event, waitingId) {
  const all = async (sql, ...params) => (await env.DB.prepare(sql).bind(...params).all()).results || [];
  const crews = await all('SELECT id, name, owner_user_id, community_id FROM crews WHERE event_id=? AND departure_id=?', event.id, waitingId);
  const told = [], organisers = new Map();
  for (const crew of crews) {
    // Without a manager (made by an organiser for others), the organisers of its community choose.
    if (!crew.owner_user_id && !organisers.has(crew.community_id)) {
      const home = await communityById(env, crew.community_id).catch(() => null);
      organisers.set(crew.community_id, home ? (await crewOrganisers(env, home)).map(row => ({user_id:row.user_id, community_id:crew.community_id})) : []);
    }
    const manager = crew.owner_user_id ? [{user_id:crew.owner_user_id, community_id:crew.community_id}] : organisers.get(crew.community_id);
    await notify(env, manager, 'choose_departure', event, {crewName:crew.name, manage:true});
    await notify(env, await crewPilots(env, crew.id), 'choose_departure', event, {crewName:crew.name, skip:[crew.owner_user_id]});
    told.push(...(await crewPilots(env, crew.id)).map(row => row.user_id));
  }
  const alone = await all(`SELECT DISTINCT p.user_id, r.community_id FROM registrations r JOIN participants p ON p.id=r.participant_id
    WHERE r.event_id=? AND r.departure_id=? AND r.status!='unavailable' AND p.user_id IS NOT NULL
      AND NOT EXISTS(SELECT 1 FROM crew_members cm WHERE cm.registration_id=r.id)`, event.id, waitingId);
  await notify(env, alone, 'choose_departure', event, {skip:told});
  return [...told, ...alone.map(row => row.user_id)];
}
