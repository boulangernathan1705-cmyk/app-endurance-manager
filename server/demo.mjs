// Showcase of the main address (endurance-manager.app): no Discord server, no real person, only fictional
// races, crews and pilots that show what the site can do. A platform manager resets it from the
// « Plateforme » tab: the data of the main community is replaced by a fresh set, dated from today.
import {id, now, parisTimestamp, baseDomain} from './core.mjs';
import {currentCommunity} from './community.mjs';

const DEMO_USER = 'system:demo';
const DAY = 86_400_000;
const PILOTS = ['Alex Moreau', 'Léa Fontaine', 'Tom Weber', 'Sara Lopes', 'Nico Varga', 'Jules Martin', 'Eva Kowal', 'Rafa Ortiz',
  'Hugo Leclair', 'Maya Chen', 'Ben Carter', 'Yann Duret', 'Inès Roy', 'Paul Novak'];

// "YYYY-MM-DD" in Paris, `days` after today.
function parisDay(days) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {timeZone:'Europe/Paris', year:'numeric', month:'2-digit', day:'2-digit'})
    .formatToParts(Date.now() + days * DAY).map(part => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}
// Days until the next given weekday (0 = Sunday … 6 = Saturday), at least `min` days from today.
function daysUntil(weekday, min = 1) {
  const today = new Date(`${parisDay(0)}T12:00:00Z`).getUTCDay();
  let days = (weekday - today + 7) % 7;
  while (days < min) days += 7;
  return days;
}
// A start as the site stores it: its date and time in Paris (shown on the cards) and its timestamp.
const start = (days, time) => ({date:parisDay(days), time, startsAt:parisTimestamp(parisDay(days), time)});

// The fictional content: endurances with crews, a race with its times to confirm, a solo race, a past race.
function races() {
  const saturday = daysUntil(6), sunday = daysUntil(0, 2);
  return [
    {name:'6h de Spa', circuit:'spa', hours:6, type:'lmu', categories:['Hypercar', 'LMP2 ELMS', 'GT3'], starts:[[saturday, '15:00'], [saturday, '21:00']],
      crews:[
        {start:0, name:'Apex Racing #7', category:'Hypercar', car:'Alpine A424', locked:true, pilots:[['Alex Moreau', 'whole'], ['Léa Fontaine', 'whole'], ['Tom Weber', 'h1,h2,h3']]},
        {start:0, name:'Team Dune #92', category:'GT3', car:'BMW M4 LMGT3', pilots:[['Sara Lopes', 'whole'], ['Nico Varga', 'h4,h5,h6']]},
        {start:1, name:'Nova Motorsport #22', category:'LMP2 ELMS', car:'Oreca 07 Gibson ELMS', pilots:[['Rafa Ortiz', 'whole'], ['Hugo Leclair', 'whole']]}],
      alone:[[0, 'Jules Martin', 'GT3', 'h1,h2'], [1, 'Maya Chen', 'LMP2 ELMS', 'whole']]},
    {name:'8h de Bahreïn', circuit:'bahrain', hours:8, type:'special', categories:['Hypercar', 'LMP3', 'GT3'], starts:[[saturday + 7, '14:00']],
      crews:[
        {start:0, name:'Vortex #50', category:'Hypercar', car:'BMW M Hybrid V8', pilots:[['Ben Carter', 'whole'], ['Yann Duret', 'h1,h2,h3,h4'], ['Inès Roy', 'h5,h6,h7,h8']]},
        {start:0, name:'Ligier Squad #33', category:'LMP3', car:'Ligier JS P325', pilots:[['Paul Novak', 'whole'], ['Eva Kowal', 'whole']]}],
      alone:[[0, 'Alex Moreau', 'GT3', 'h1,h2,h3']]},
    {name:'4h de Monza', circuit:'monza', hours:4, type:'private', categories:['GT3', 'LMP2 ELMS'], starts:[[sunday + 7, '18:00']],
      crews:[{start:0, name:'Scuderia Lago #11', category:'GT3', car:'BMW M4 LMGT3', pilots:[['Léa Fontaine', 'whole'], ['Hugo Leclair', 'whole']]}],
      alone:[[0, 'Sara Lopes', 'GT3', 'whole'], [0, 'Tom Weber', 'LMP2 ELMS', 'h1,h2']]},
    // Official times not known yet: one common start "à définir" where everyone enters.
    {name:'24h du Mans', circuit:'le-mans', hours:24, type:'special', pending:true, categories:['Hypercar', 'LMP2 WEC', 'GT3'], starts:[[saturday + 28, '16:00']],
      crews:[], alone:[[0, 'Alex Moreau', 'Hypercar', 'whole'], [0, 'Maya Chen', 'Hypercar', 'whole'], [0, 'Nico Varga', 'GT3', 'whole']]},
    // Already run: shown in the archive.
    {name:'6h de Fuji', circuit:'fuji', hours:6, type:'lmu', categories:['Hypercar', 'GT3'], starts:[[-6, '20:00']],
      crews:[{start:0, name:'Apex Racing #7', category:'Hypercar', car:'Alpine A424', locked:true, pilots:[['Alex Moreau', 'whole'], ['Léa Fontaine', 'whole']]}], alone:[]}
  ];
}

// SQL literal of a value of the showcase (our own constants, ids and JSON: never a visitor's input).
const literal = value => value === null ? 'NULL' : typeof value === 'number' ? String(value) : `'${String(value).replaceAll("'", "''")}'`;

// Scheduled task: every Monday morning (Paris), the showcase starts again with fresh dates. Only where the main
// address is the platform's own (production) and its community is the showcase (no Discord server): never on
// the development site, whose main community is a real team.
export async function refreshShowcaseIfDue(env, at = new Date()) {
  const domain = baseDomain(env);
  let host = '';
  try { host = new URL(env.APP_ORIGIN).hostname; } catch { return false; }
  if (!domain || host !== domain || at.getUTCDay() !== 1 || at.getUTCHours() !== 3) return false;
  const community = await currentCommunity(env, new Request(`https://${domain}/`));
  if (community.discordGuildId) return false;
  await resetShowcase(env, community);
  return true;
}

// Everything of a community goes (races with their entries and crews, pilots, members, settings).
function clearCommunity(env, cid) {
  return ['DELETE FROM crew_members WHERE crew_id IN (SELECT id FROM crews WHERE community_id=?)',
    ...['crews', 'registrations', 'events', 'participants', 'iracing_imports', 'memberships', 'community_role_permissions', 'community_recaps',
      'discord_weekly_state', 'community_banners'].map(table => `DELETE FROM ${table} WHERE community_id=?`)].map(sql => env.DB.prepare(sql).bind(cid));
}

// The main address becomes the official community of Endurance Manager: the fictional data goes and the
// official Discord server is linked (the showcase ends: it only exists while no server is linked).
export async function makeOfficial(env, community, guildId) {
  await env.DB.batch([...clearCommunity(env, community.id),
    env.DB.prepare(`UPDATE communities SET name='Endurance Manager', short_name='EM', discord_guild_id=?, discord_invite_url=NULL, appearance='{}',
      modules='{"iracingImport":true}' WHERE id=?`).bind(guildId, community.id)]);
}

// Replaces the data of the main community by the showcase, in a few statements (D1 counts every statement
// of a request: 50 at most on the free plan). Returns what was created.
export async function resetShowcase(env, community) {
  const cid = community.id, time = now(), statements = [];
  const run = (sql, ...values) => statements.push(env.DB.prepare(sql).bind(...values));
  // Rows of each table, inserted together at the end (one statement per table).
  const rows = {participants:[], events:[], crews:[], registrations:[], crew_members:[]};
  const add = (table, ...values) => rows[table].push(`(${values.map(literal).join(',')})`);
  statements.push(...clearCommunity(env, cid));
  // No Discord server, no recap; iRacing's official calendar and solo races show what the site offers.
  run(`UPDATE communities SET name='Endurance Manager', short_name='EM', discord_guild_id=NULL, discord_invite_url=NULL, appearance='{}',
    modules='{"iracingImport":true,"soloRaces":true}' WHERE id=?`, cid);
  run("INSERT OR IGNORE INTO users(id,name,role,created_at) VALUES(?, 'Démo', 'organizer', 0)", DEMO_USER);

  const pilotIds = new Map(PILOTS.map(name => [name, id()]));
  for (const [name, pilotId] of pilotIds) add('participants', pilotId, name, `demo-${pilotId}`, time, cid);
  const entry = (eventId, departureId, name, category, status, car = '', roundChoices = []) => {
    const regId = id(), pilotId = pilotIds.get(name);
    add('registrations', regId, eventId, departureId, `demo-${regId}`, name, name.toLocaleLowerCase('fr-FR'), category, car,
      JSON.stringify(car ? [car] : []), car ? 0 : 1, status, time, pilotId, JSON.stringify(roundChoices), cid);
    return regId;
  };

  let count = 0;
  for (const race of races()) {
    const eventId = id(), departures = race.starts.map(([days, clock]) => ({id:id(), ...start(days, clock), ...(race.pending ? {tbd:true} : {})}));
    add('events', eventId, race.name, race.hours, race.hours * 60, race.type, race.circuit, race.pending ? 1 : 0, 'endurance', 'open', null, '[]',
      JSON.stringify(race.categories), JSON.stringify(departures), DEMO_USER, time + count++, cid);
    for (const crew of race.crews) {
      const crewId = id(), departureId = departures[crew.start].id;
      add('crews', crewId, eventId, departureId, crew.name, crew.category, crew.car, crew.locked ? 1 : 0, time, cid);
      for (const [name, status] of crew.pilots) add('crew_members', entry(eventId, departureId, name, crew.category, status, crew.car), crewId);
    }
    for (const [index, name, category, status] of race.alone) entry(eventId, departures[index].id, name, category, status);
  }
  // A solo race (module "Courses solo"): two rounds, places limited, entries in order of arrival.
  const soloId = id(), soloStart = {id:id(), ...start(daysUntil(4), '21:00')};
  add('events', soloId, 'Sprint GT3 du jeudi', 1, 50, 'private', 'imola', 0, 'solo', 'open', 20,
    JSON.stringify([{circuit:'imola', durationMinutes:25, categories:['GT3']}, {circuit:'random', durationMinutes:25, categories:['GT3']}]),
    JSON.stringify(['GT3']), JSON.stringify([soloStart]), DEMO_USER, time + count++, cid);
  for (const [name, car] of [['Sara Lopes', 'BMW M4 LMGT3'], ['Nico Varga', ''], ['Jules Martin', 'Aston Martin Vantage AMR LMGT3'], ['Paul Novak', ''], ['Eva Kowal', 'BMW M4 LMGT3']]) {
    const choice = car ? {category:'GT3', cars:[car], carAny:false} : {category:'GT3', cars:[], carAny:true};
    entry(soloId, soloStart.id, name, 'GT3', 'whole', car, [choice, {category:'GT3', cars:[], carAny:true}]);
  }
  // Parents before children (the database checks each row's community and crew).
  const columns = {participants:'id,name,guest_hash,created_at,community_id',
    events:'id,name,duration_hours,duration_minutes,event_type,circuit,schedule_pending,format,access,capacity,rounds,categories,departures,created_by,created_at,community_id',
    crews:'id,event_id,departure_id,name,category,car,locked,created_at,community_id',
    registrations:'id,event_id,departure_id,guest_hash,name,name_key,category,car,car_preferences,car_any,status,created_at,participant_id,round_choices,community_id',
    crew_members:'registration_id,crew_id'};
  for (const table of ['participants', 'events', 'crews', 'registrations', 'crew_members'])
    statements.push(env.DB.prepare(`INSERT INTO ${table}(${columns[table]}) VALUES ${rows[table].join(',')}`));
  await env.DB.batch(statements);
  return {races:count, pilots:PILOTS.length};
}
