import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {existsSync,readFileSync,readdirSync} from 'node:fs';
import {
  buildWeeklyDiscordPayload,
  CATEGORY_EMOJI_NAMES,
  categoryEmojiName,
  isInParisWeek,
  isWeeklyDiscordMutation,
  nextParisWeek,
  parisWeek
} from '../server/discord-weekly-format.mjs';
import {loadWeeklyDiscordSnapshot, syncWeeklyDiscord} from '../server/discord-weekly.mjs';

const uuid='11111111-1111-4111-8111-111111111111';
const departureUuid='22222222-2222-4222-8222-222222222222';
const futureEventUuid='33333333-3333-4333-8333-333333333333';
const futureDepartureUuid='44444444-4444-4444-8444-444444444444';
const secondDepartureUuid='55555555-5555-4555-8555-555555555555';
const registrationUuid='66666666-6666-4666-8666-666666666666';
const crewUuid='77777777-7777-4777-8777-777777777777';

const COMMUNITY={id:'e0a1c0de-0000-4000-8000-000000000001',slug:'commu-dev',modules:{discordWeekly:true}};
function request(path,method='POST'){return new Request(`https://endurance-manager.app${path}`,{method});}
function dbFixture({events=[],registrations=[],crews=[],absences=[]}){
  return{prepare(sql){
    // Events are read for one community (its id is the bound parameter).
    if(sql.includes('FROM events'))return{bind:communityId=>({all:async()=>({results:events.filter(item=>(item.community_id||COMMUNITY.id)===communityId)})})};
    if(sql.includes('FROM event_absences'))return{bind:(...values)=>({all:async()=>({results:absences.filter(item=>values.slice(0,-1).includes(item.event_id)&&(item.community_id||COMMUNITY.id)===values.at(-1))})})};
    if(sql.includes('FROM registrations'))return{bind:()=>({all:async()=>({results:registrations.filter(item=>item.status!=='unavailable')})})};
    if(sql.includes('FROM crews'))return{bind:()=>({all:async()=>({results:crews})})};
    throw new Error(`Requête D1 inattendue dans le test: ${sql}`);
  }};
}
function event(id,name,circuit,durationHours,departures){return{id,name,circuit,duration_hours:durationHours,departures:JSON.stringify(departures)};}
function singleDepartureEvent(id,name,circuit,durationHours,departureId,startsAt){return event(id,name,circuit,durationHours,[{id:departureId,startsAt}]);}
function registration({eventId=uuid,departureId=departureUuid,name='Nathan'}={}){return{id:registrationUuid,event_id:eventId,departure_id:departureId,participant_id:`pilot-${name.toLowerCase()}`,category:'Hypercar',status:'all',pilot_name:name};}
function crewRow({eventId=uuid,departureId=departureUuid,name='Équipe #1',pilot='Nathan'}={}){return{id:crewUuid,event_id:eventId,departure_id:departureId,name,category:'Hypercar',car:'Toyota GR010 Hybrid',locked:1,registration_id:pilot?registrationUuid:null,pilot_name:pilot||null};}

test('la semaine utilitaire suit lundi-dimanche en heure de Paris',()=>{
  const sunday=Date.parse('2026-09-13T19:00:00Z');
  const mondayAfterMidnightParis=Date.parse('2026-09-13T22:30:00Z');
  assert.equal(parisWeek(sunday).key,'2026-09-07');
  assert.equal(nextParisWeek(sunday).key,'2026-09-14');
  assert.equal(parisWeek(mondayAfterMidnightParis).key,'2026-09-14');
  assert.equal(isInParisWeek(Date.parse('2026-09-12T12:00:00Z'),parisWeek(sunday)),true);
  assert.equal(isInParisWeek(Date.parse('2026-09-14T12:00:00Z'),parisWeek(sunday)),false);
});

test('le récap garde tous les départs futurs de la semaine et retire ceux déjà passés',async()=>{
  const now=Date.parse('2026-09-18T10:00:00Z');
  const events=[event(uuid,'4h SILVERSTONE','silverstone',4,[
    {id:'10000000-0000-4000-8000-000000000001',startsAt:Date.parse('2026-09-18T08:00:00Z')},
    {id:departureUuid,startsAt:Date.parse('2026-09-18T12:00:00Z')},
    {id:secondDepartureUuid,startsAt:Date.parse('2026-09-18T16:00:00Z')},
    {id:futureDepartureUuid,startsAt:Date.parse('2026-09-19T08:00:00Z')}
  ])];
  const snapshot=await loadWeeklyDiscordSnapshot({DB:dbFixture({events})},now,COMMUNITY);
  assert.equal(snapshot.currentDepartures.length,0);
  assert.equal(snapshot.futureDepartures.length,3);
  assert.deepEqual(snapshot.futureDepartures.map(item=>item.departureId),[departureUuid,secondDepartureUuid,futureDepartureUuid]);
  assert.equal(snapshot.periodKey,'2026-09-14');
});

test('un départ déjà commencé sans équipage engagé disparaît même si un pilote était inscrit',async()=>{
  const now=Date.parse('2026-09-18T14:00:00Z');
  const startsAt=Date.parse('2026-09-18T13:00:00Z');
  const events=[singleDepartureEvent(uuid,'4h SILVERSTONE','silverstone',4,departureUuid,startsAt)];
  const snapshot=await loadWeeklyDiscordSnapshot({DB:dbFixture({events,registrations:[registration()]})},now,COMMUNITY);
  assert.equal(snapshot.currentDepartures.length,0);
  assert.equal(snapshot.futureDepartures.length,0);
});

test('un départ déjà commencé avec un équipage engagé reste affiché comme course en cours',async()=>{
  const now=Date.parse('2026-09-18T14:00:00Z');
  const startsAt=Date.parse('2026-09-18T13:00:00Z');
  const events=[singleDepartureEvent(uuid,'4h SILVERSTONE','silverstone',4,departureUuid,startsAt)];
  const snapshot=await loadWeeklyDiscordSnapshot({DB:dbFixture({events,registrations:[registration()],crews:[crewRow()]})},now,COMMUNITY);
  assert.equal(snapshot.currentDepartures.length,1);
  assert.equal(snapshot.currentDepartures[0].crews.length,1);
  assert.deepEqual(snapshot.currentDepartures[0].crews[0].pilots,['Nathan']);
  assert.equal(snapshot.futureDepartures.length,0);
});

test('quand la semaine est terminée le récap affiche tous les départs de la prochaine semaine disponible',async()=>{
  const now=Date.parse('2026-09-13T21:14:00Z');
  const events=[
    singleDepartureEvent(uuid,'6h de COTA','cota',6,departureUuid,Date.parse('2026-09-12T13:00:00Z')),
    event(futureEventUuid,'4h SILVERSTONE','silverstone',4,[
      {id:futureDepartureUuid,startsAt:Date.parse('2026-09-18T10:00:00Z')},
      {id:secondDepartureUuid,startsAt:Date.parse('2026-09-19T10:00:00Z')}
    ])
  ];
  const snapshot=await loadWeeklyDiscordSnapshot({DB:dbFixture({events})},now,COMMUNITY);
  assert.equal(snapshot.currentDepartures.length,0);
  assert.equal(snapshot.futureDepartures.length,2);
  assert.equal(snapshot.periodKey,'2026-09-14');
  assert.match(snapshot.periodLabel,/14 septembre/);
});

test('le message : un bloc par course, dont le nom mène à la course sur le site de la communauté',()=>{
  const timestamp=Date.parse('2026-09-18T10:00:00Z');
  const current={eventId:uuid,eventName:'8H Test en cours',eventType:'lmu',circuit:'spa',durationHours:8,departureId:departureUuid,startsAt:Date.parse('2026-09-18T09:00:00Z'),unassignedPilots:[],crews:[{id:crewUuid,name:'Équipe #1',category:'Hypercar',car:'Toyota GR010 Hybrid',locked:true,pilots:['Nathan']}]};
  const futureEmpty={eventId:futureEventUuid,eventName:'4h SILVERSTONE (horaires non définis par LMU)',eventType:'special',circuit:'silverstone',durationHours:4,departureId:futureDepartureUuid,startsAt:Date.parse('2026-09-18T12:00:00Z'),unassignedPilots:[],crews:[]};
  const futureWithCrew={...futureEmpty,departureId:secondDepartureUuid,startsAt:Date.parse('2026-09-18T16:00:00Z'),unassignedPilots:['Léo'],crews:[{id:'88888888-8888-4888-8888-888888888888',name:'Mrt blé',category:'LMP2 ELMS',car:'Oreca 07 Gibson ELMS',locked:false,pilots:['Etienne_48']}]};
  const iracing={eventId:'99999999-9999-4999-8999-999999999999',eventName:'IMSA Endurance',eventType:'lmu',circuit:'iracing-spa',durationHours:6,departureId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',startsAt:Date.parse('2026-09-19T12:00:00Z'),unassignedPilots:[],crews:[]};
  const site={url:'https://team-rookie.endurance-manager.app',name:'Team Rookie',logoUrl:'https://cdn.discordapp.com/icons/1/abc.png',bannerUrl:'https://team-rookie.endurance-manager.app/images/endurance-manager-banner.webp'};
  const payload=buildWeeklyDiscordPayload({currentDepartures:[current],futureDepartures:[futureEmpty,futureWithCrew,iracing],periodLabel:'semaine du 14 septembre au 20 septembre 2026'},site,timestamp,'all');
  assert.deepEqual(payload.allowed_mentions,{parse:[]});
  const [header,running,silverstone,imsa]=payload.embeds;
  assert.equal(payload.embeds.length,4,'a header, then one block per race');
  assert.match(header.title,/^📝 Semaine du 14 septembre au 20 septembre 2026$/);
  assert.equal(header.author.name,'Team Rookie');assert.equal(header.author.icon_url,site.logoUrl);
  assert.match(running.title,/En cours — 8H Test en cours/);
  // Each race name links to the race itself, on the community's site, in its simulator's space.
  assert.equal(running.url,`${site.url}/lmu/#event=${uuid}`);
  assert.equal(silverstone.url,`${site.url}/lmu/#event=${futureEventUuid}`);
  assert.equal(imsa.url,`${site.url}/iracing/#event=99999999-9999-4999-8999-999999999999`);
  assert.notEqual(silverstone.color,imsa.color,'the bar has the colour of the simulator');
  assert.equal((JSON.stringify(payload).match(/4h SILVERSTONE/g)||[]).length,1,'one block for the race and its two starts');
  assert.equal(silverstone.fields.length,2,'the start with a crew, then the pilots without a crew');
  // At the top: the days of the race and their start times (Paris time).
  assert.match(silverstone.description,/📅 \*\*ven\. 18 sept\.\*\* · 14h, 18h/);
  assert.match(silverstone.description,/Horaires non définis par LMU/);
  // Times in each reader's own time zone.
  assert.match(silverstone.fields[0].value,/<t:1789747200:F>/);
  assert.match(silverstone.fields[0].value,/Mrt blé/);assert.match(silverstone.fields[0].value,/👤 Etienne\\_48/);
  assert.equal(silverstone.fields[1].name,'📋 Sans équipage');assert.equal(silverstone.fields[1].value,'👤 Léo · ven. 18h');
  assert.doesNotMatch(JSON.stringify(silverstone),/autre départ|voir la course/,'no line for the empty starts');
  assert.doesNotMatch(JSON.stringify(silverstone),/Départ \d/,'no « Départ 1, Départ 2 » headings');
  const last=payload.embeds.at(-1);
  assert.equal(last.image.url,site.bannerUrl);assert.match(last.footer.text,/mise à jour à 12:00/);
  // Every link of the message goes to the community's own site.
  for(const url of JSON.stringify(payload).match(/https?:\/\/[^"\s)]+/g).filter(url=>!url.startsWith('https://cdn.discordapp.com/')))
    assert.ok(url.startsWith(site.url+'/'),url);
});

test('beaucoup de courses : 10 blocs au plus, les autres listées avec leur lien',()=>{
  const races=Array.from({length:12},(_,i)=>({eventId:`00000000-0000-4000-8000-${String(i).padStart(12,'0')}`,eventName:`Course ${i+1}`,circuit:'spa',durationHours:4,departureId:`10000000-0000-4000-8000-${String(i).padStart(12,'0')}`,startsAt:Date.parse('2026-09-19T12:00:00Z')+i*3600000,unassignedPilots:[],crews:[]}));
  const payload=buildWeeklyDiscordPayload({currentDepartures:[],futureDepartures:races,periodLabel:'semaine'},{url:'https://a.endurance-manager.app'},Date.now());
  assert.ok(payload.embeds.length<=10);
  const rest=payload.embeds.at(-1);
  assert.equal(rest.title,'Autres courses de la semaine');
  assert.match(rest.description,/\[Course 12\]\(https:\/\/a\.endurance-manager\.app\/lmu\/#event=00000000-0000-4000-8000-000000000011\)/);
});

test('les mutations qui changent le résumé déclenchent une synchronisation',()=>{
  assert.equal(isWeeklyDiscordMutation(request('/api/events')),true);
  assert.equal(isWeeklyDiscordMutation(request(`/api/events/${uuid}`,'PATCH')),true);
  assert.equal(isWeeklyDiscordMutation(request(`/api/events/${uuid}/departures/${departureUuid}/registrations`)),true);
  assert.equal(isWeeklyDiscordMutation(request(`/api/events/${uuid}/departures/${departureUuid}/crews`)),true);
  assert.equal(isWeeklyDiscordMutation(request('/api/races')),true);
  assert.equal(isWeeklyDiscordMutation(request(`/api/races/${uuid}/departures/${departureUuid}/registrations`)),true);
  assert.equal(isWeeklyDiscordMutation(request(`/api/registrations/${uuid}`,'DELETE')),true);
  assert.equal(isWeeklyDiscordMutation(request(`/api/crews/${uuid}/members/${departureUuid}`,'DELETE')),true);
  assert.equal(isWeeklyDiscordMutation(request(`/api/events/${uuid}/absence`,'PUT')),true);
  assert.equal(isWeeklyDiscordMutation(request(`/api/events/${uuid}/absence`,'DELETE')),true);
  assert.equal(isWeeklyDiscordMutation(request(`/api/races/${uuid}/absence`,'PUT')),true);
  assert.equal(isWeeklyDiscordMutation(request(`/api/events/${uuid}/absence`,'GET')),false);
  assert.equal(isWeeklyDiscordMutation(request('/api/auth/logout')),false);
  assert.equal(isWeeklyDiscordMutation(request('/api/events','GET')),false);
});

test('la synchronisation reste inactive tant que le webhook secret n’est pas configuré',async()=>{
  assert.deepEqual(await syncWeeklyDiscord({}),{ok:false,skipped:'not-configured'});
});

test('une course « Horaires à confirmer » n’est jamais annoncée en cours et son heure provisoire n’est pas publiée',async()=>{
  const now=Date.parse('2026-10-03T23:30:00Z');
  const pending={...event(uuid,'6h FUJI','fuji',6,[{id:departureUuid,startsAt:Date.parse('2026-10-03T22:00:00Z')},{id:secondDepartureUuid,startsAt:Date.parse('2026-10-04T22:00:00Z')}]),schedule_pending:1};
  const snapshot=await loadWeeklyDiscordSnapshot({DB:dbFixture({events:[pending],registrations:[registration()],crews:[crewRow()]})},now,COMMUNITY);
  assert.equal(snapshot.currentDepartures.length,0,'placeholder 0:00 start is not "en cours"');
  const payload=JSON.stringify(buildWeeklyDiscordPayload(snapshot,{url:'https://endurance-manager.app'},now));
  // Only the day is shown (in the reader's time zone), never the placeholder time.
  assert.match(payload,/<t:\d+:D> — horaire à confirmer/);
  assert.doesNotMatch(payload,/<t:\d+:F>/);
});

test('un événement spécial à 15 départs : seuls les départs avec des inscrits sont détaillés',()=>{
  const base={eventId:'12121212-1212-4121-8121-121212121212',eventName:'6h de Fuji',eventType:'special',circuit:'fuji',durationHours:6};
  const departures=Array.from({length:15},(_,i)=>({...base,departureId:`34343434-3434-4343-8343-${String(i).padStart(12,'0')}`,startsAt:Date.parse('2026-10-02T05:00:00Z')+i*5*3600000,unassignedPilots:[],crews:[]}));
  departures[7].crews=[{id:'56565656-5656-4565-8565-565656565656',name:'FMT 001',category:'GT3',car:'',locked:false,pilots:['Etienne_48']}];
  departures[7].unassignedPilots=['Nathan'];
  const [,fuji]=buildWeeklyDiscordPayload({currentDepartures:[],futureDepartures:departures,periodLabel:'semaine'},{url:'https://fmt.endurance-manager.app'},Date.parse('2026-09-29T10:00:00Z')).embeds;
  assert.equal(fuji.fields.length,2,'the start with a crew, then the pilots without a crew');
  assert.match(fuji.fields[0].value,/FMT 001/);assert.match(fuji.fields[0].value,/\n\u200b$/,'a blank line after each start');
  assert.equal(fuji.fields[1].value,'👤 Nathan · sam. 18h');
  // Every day of the event and its start times, at the top.
  assert.match(fuji.description,/📅 \*\*ven\. 2 oct\.\*\* · 7h, 12h, 17h, 22h/);
  assert.equal((fuji.description.match(/📅/g)||[]).length,4,'four days');
  assert.doesNotMatch(JSON.stringify(fuji),/autres départs|voir la course/);
  assert.doesNotMatch(JSON.stringify(fuji),/Personne d’inscrit/);
});

test('les absences du site figurent une fois en bas de chaque événement, uniquement pour sa communauté',async()=>{
  const db=new DatabaseSync(':memory:');
  try {
    db.exec('PRAGMA foreign_keys=ON;');
    for(const file of readdirSync(new URL('../migrations/',import.meta.url)).filter(name=>name.endsWith('.sql')).sort())db.exec(readFileSync(new URL(`../migrations/${file}`,import.meta.url),'utf8'));
    const now=Date.parse('2026-10-10T08:00:00Z');
    const startsAt=now+3600000;
    for(const [id,name] of [['one','Nathan'],['two','Etienne_48'],['three','Autre communauté']])db.prepare('INSERT INTO users(id,name,created_at) VALUES(?,?,0)').run(id,name);
    const departures=JSON.stringify([{id:departureUuid,startsAt},{id:secondDepartureUuid,startsAt:startsAt+3600000}]);
    // This official race has no registrations: an absence is enough to make it relevant for this community.
    db.prepare("INSERT INTO events(id,name,circuit,categories,departures,created_by,created_at,community_id,duration_hours) VALUES(?,'6h Fuji','fuji','[\"GT3\"]',?,'one',0,'official',6)").run(uuid,departures);
    const absence=db.prepare('INSERT INTO event_absences(event_id,user_id,community_id,created_at) VALUES(?,?,?,?)');
    absence.run(uuid,'one',COMMUNITY.id,1);absence.run(uuid,'two',COMMUNITY.id,2);absence.run(uuid,'three','other',3);
    const DB={prepare(sql){return{bind(...values){return{all:async()=>({results:db.prepare(sql).all(...values)})};}};}};
    let snapshot=await loadWeeklyDiscordSnapshot({DB},now,COMMUNITY);
    assert.equal(snapshot.futureDepartures.length,2);
    assert.deepEqual(snapshot.futureDepartures[0].absentPilots,['Nathan','Etienne_48']);
    let payload=buildWeeklyDiscordPayload(snapshot,{url:'https://fmt.endurance-manager.app'},now);
    const absent=payload.embeds[1].fields.at(-1);
    assert.equal(absent.name,'🚫 Pilotes absents');assert.equal(absent.value,'Nathan, Etienne\\_48');
    assert.equal(payload.embeds[1].fields.filter(field=>field.name==='🚫 Pilotes absents').length,1,'not repeated for every departure');
    assert.deepEqual(payload.allowed_mentions,{parse:[]});assert.doesNotMatch(JSON.stringify(payload),/Autre communauté/);
    db.prepare('DELETE FROM event_absences WHERE event_id=? AND community_id=?').run(uuid,COMMUNITY.id);
    snapshot=await loadWeeklyDiscordSnapshot({DB},now,COMMUNITY);
    assert.equal(snapshot.futureDepartures.length,0,'an absence in another community does not include the official event');
    // Private event without absences: its recap stays unchanged, with no empty absence heading.
    db.prepare("INSERT INTO events(id,name,circuit,categories,departures,created_by,created_at,community_id,duration_hours) VALUES(?,'Privée','fuji','[\"GT3\"]',?,'one',0,?,6)").run(futureEventUuid,departures,COMMUNITY.id);
    snapshot=await loadWeeklyDiscordSnapshot({DB},now,COMMUNITY);
    payload=buildWeeklyDiscordPayload(snapshot,{},now);
    assert.doesNotMatch(JSON.stringify(payload),/Pilotes absents|Nathan|Etienne/);
  } finally { db.close(); }
});

test('les absences restent affichées quand le récap est compact et respectent la limite des champs Discord',()=>{
  const departure={eventId:uuid,eventName:'6h Fuji',circuit:'fuji',durationHours:6,startsAt:Date.parse('2026-10-11T12:00:00Z'),crews:[],unassignedPilots:[],absentPilots:Array.from({length:150},(_,i)=>`Pilote ${i} très long`)};
  const departures=Array.from({length:8},(_,i)=>({...departure,eventId:`event-${i}`,eventName:`Course ${i}`}));
  const payload=buildWeeklyDiscordPayload({futureDepartures:departures},{});
  for(const embed of payload.embeds.slice(1)){
    const field=embed.fields.at(-1);assert.equal(field.name,'🚫 Pilotes absents');assert.match(field.value,/Pilote 0/);assert.ok(field.value.length<=300);
    assert.ok(embed.fields.length<=25);assert.ok(embed.fields.every(item=>item.value.length<=1024));
  }
  const total=payload.embeds.reduce((sum,embed)=>sum+(embed.title||'').length+(embed.description||'').length+(embed.footer?.text||'').length+(embed.fields||[]).reduce((sum,field)=>sum+field.name.length+field.value.length,0),0);
  assert.ok(total<=6000);
});

test('le récap aère les équipages : une ligne vide entre chacun, un pilote par ligne', () => {
  const at=Date.parse('2026-10-11T15:00:00Z');
  const departure={eventId:'atl',eventName:'10h de Road Atlanta',circuit:'road-atlanta',startsAt:at,durationMinutes:600,
    crews:[{name:'Les plots',category:'Hypercar',car:'Aston Martin Valkyrie AMR LMH',pilots:['Alice','Bob'],locked:false},
      {name:'DDE',category:'GT3',car:'Ferrari 296 LMGT3',pilots:[],locked:false}],unassignedPilots:['Nathan']};
  const [race]=buildWeeklyDiscordPayload({currentDepartures:[],futureDepartures:[departure],periodLabel:'semaine'},{},at-24*3600_000).embeds.slice(-1);
  const blocks=race.fields[0].value.split('\n\n');
  assert.equal(blocks.length,4,'start, two crews, pilots without a crew');
  assert.match(blocks[1],/\*\*Les plots\*\* · Hypercar 🔓\n🏎️ Aston Martin Valkyrie AMR LMH\n👤 Alice\n👤 Bob$/);
  assert.match(blocks[2],/\*\*DDE\*\* · GT3 🔓\n🏎️ Ferrari 296 LMGT3\n\*Aucun pilote\*$/);
  assert.equal(blocks[3],'📋 **Sans équipage** : Nathan');
});

test('les pilotes sans équipage ont les logos de leurs catégories (emojis du bot)', () => {
  const at=Date.parse('2026-10-11T15:00:00Z');
  const departure={eventId:'spa',eventName:'6h de Spa',circuit:'spa',startsAt:at,durationMinutes:360,
    crews:[{name:'Les plots',category:'Hypercar',car:'',pilots:['Alice'],locked:false}],
    unassignedPilots:[{name:'Paul',categories:['Hypercar','GT3']},{name:'Léo',categories:['GT3']}]};
  const snapshot={currentDepartures:[],futureDepartures:[departure],periodLabel:'semaine'};
  const emojis={em_hypercar:'111',em_gt3:'222'};
  const blocks=buildWeeklyDiscordPayload(snapshot,{},at-86400000,'lmu',emojis).embeds.at(-1).fields[0].value.split('\n\n');
  assert.match(blocks[1],/^<:em_hypercar:111> \*\*Les plots\*\*/);
  assert.equal(blocks[2],'📋 **Sans équipage**\n👤 Paul <:em_hypercar:111> <:em_gt3:222>\n👤 Léo <:em_gt3:222>');
  // Without the emojis (not uploaded yet), the colour and the name of the category.
  const plain=buildWeeklyDiscordPayload(snapshot,{},at-86400000,'lmu').embeds.at(-1).fields[0].value.split('\n\n');
  assert.equal(plain[2],'📋 **Sans équipage**\n👤 Paul 🟦 Hypercar 🟪 GT3\n👤 Léo 🟪 GT3');
});

test('chaque catégorie LMU et iRacing a son image d’emoji', () => {
  assert.ok(CATEGORY_EMOJI_NAMES.length>=15);
  for(const name of CATEGORY_EMOJI_NAMES){
    assert.match(name,/^em_[a-z0-9_]{2,29}$/);
    assert.ok(existsSync(new URL(`../images/discord-emojis/${name.slice(3)}.png`,import.meta.url)),name);
  }
  assert.equal(categoryEmojiName('iracing','GT3'),'em_ir_gt3');
  assert.equal(categoryEmojiName('lmu','LMP2 WEC'),'em_lmp2');
});

test('plusieurs départs : chaque pilote sans équipage une seule fois, avec ses départs', () => {
  const base={eventId:'por',eventName:'4h de Portimao',circuit:'portimao',durationHours:4,crews:[],absentPilots:[]};
  const starts=[0,4,9].map(hour=>({...base,departureId:'d'+hour,startsAt:Date.parse('2026-10-15T22:00:00Z')+hour*3600000,
    unassignedPilots:[{name:'Nathan',categories:['LMP2 ELMS']}]}));
  starts.push({...base,departureId:'d24',startsAt:Date.parse('2026-10-16T22:00:00Z'),unassignedPilots:[{name:'Léo',categories:['GT3']}]});
  const [,race]=buildWeeklyDiscordPayload({currentDepartures:[],futureDepartures:starts,periodLabel:'semaine'},{},Date.parse('2026-10-13T10:00:00Z'),'lmu',{em_lmp2:'1'}).embeds;
  assert.equal(race.fields.length,1);
  assert.equal(race.fields[0].value,'👤 Nathan <:em_lmp2:1> · ven. 0h, 4h, 9h\n👤 Léo 🟪 GT3 · sam. 0h');
  // Registered on every start: one word.
  starts[3].unassignedPilots.push({name:'Nathan',categories:['LMP2 ELMS']});
  const [,all]=buildWeeklyDiscordPayload({currentDepartures:[],futureDepartures:starts,periodLabel:'semaine'},{},Date.parse('2026-10-13T10:00:00Z'),'lmu',{em_lmp2:'1'}).embeds;
  assert.match(all.fields[0].value,/^👤 Nathan <:em_lmp2:1> · tous les départs$/m);
});

test('deux départs et beaucoup de pilotes : le récap choisit automatiquement la vue par créneau',()=>{
  const base={eventId:'mans',eventName:'24H du Mans',circuit:'lemans',durationHours:24,crews:[]};
  const etienne={name:'[FMT] Etienne',categories:['Hypercar']};
  const starts=[
    {...base,startsAt:Date.parse('2026-10-23T11:00:00Z'),unassignedPilots:[etienne]},
    {...base,startsAt:Date.parse('2026-10-24T13:30:00Z'),unassignedPilots:[etienne,...['[FMT] LoorZ','Rico Orus','[FMT] D-Joss','[FMT] McFly','Hyns','[FMT] Nathan'].map(name=>({name,categories:['GT3']}))]},
    {...base,startsAt:Date.parse('2026-10-25T13:30:00Z'),unassignedPilots:[]}
  ];
  const [,race]=buildWeeklyDiscordPayload({futureDepartures:starts},{},Date.parse('2026-10-14T07:00:00Z')).embeds;
  const value=race.fields[0].value;
  assert.match(value,/ven\. 23 oct\. · 13h\*\* — 1 pilote/);
  assert.match(value,/sam\. 24 oct\. · 15h30\*\* — 7 pilotes/);
  assert.equal(value.split('👤 [FMT] Etienne').length-1,2);
  assert.doesNotMatch(value,/dim\./);
});

test('quinze créneaux et un pilote : le récap conserve automatiquement la vue par pilote',()=>{
  const starts=Array.from({length:15},(_,i)=>({eventId:'por',eventName:'Portimao',circuit:'portimao',durationHours:4,crews:[],
    startsAt:Date.parse('2026-10-16T07:00:00Z')+i*3600000,
    unassignedPilots:i<4?[{name:'Nathan',categories:['LMP2 ELMS']}]:[]}));
  const [,race]=buildWeeklyDiscordPayload({futureDepartures:starts}).embeds;
  assert.match(race.fields[0].value,/^👤 Nathan/);
  assert.doesNotMatch(race.fields[0].value,/📅/);
  assert.equal(race.fields[0].value.split('👤').length-1,1);
});


test('Discord orders crews, unassigned pilots and their category logos by LMU class without duplicating pilots',()=>{
 const at=Date.parse('2026-10-11T15:00:00Z');
 const order=['Hypercar','LMP2 ELMS','LMP2 WEC','LMP3','GTE','GT3'];
 const pilots=order.map((category,index)=>({name:`Pilot-${index}`,categories:[category]})).reverse();
 pilots.push({name:'Multi',categories:['GT3','Hypercar','GTE']},{name:'Other',categories:['Unknown']},{name:'NoClass',categories:[]});
 const departure={eventId:'spa',eventName:'6h de Spa',circuit:'spa',startsAt:at,durationMinutes:360,
  crews:order.map((category,index)=>({name:`Crew-${index}`,category,pilots:['Driver'],locked:false})).reverse(),unassignedPilots:pilots};
 const render=departures=>buildWeeklyDiscordPayload({currentDepartures:[],futureDepartures:departures,periodLabel:'semaine'},{},at-86400000,'lmu').embeds.at(-1).fields.map(field=>field.value).join('\n');
 for(const departures of [[departure],[departure,{...departure,startsAt:at+86400000}]]){
  const text=render(departures);
  for(let index=1;index<order.length;index++){
   assert.ok(text.indexOf(`👤 Pilot-${index-1}`)<text.indexOf(`👤 Pilot-${index}`));
   assert.ok(text.indexOf(`**Crew-${index-1}**`)<text.indexOf(`**Crew-${index}**`));
  }
  assert.ok(text.indexOf('👤 Multi')<text.indexOf('👤 Pilot-1'));
  assert.ok(text.indexOf('👤 Pilot-5')<text.indexOf('👤 Other'));
  assert.equal(text.match(/👤 Multi/g).length,1);
  assert.match(text,/👤 Multi 🟦 Hypercar 🟥 GTE 🟪 GT3/);
 }
 assert.equal(pilots[0].name,'Pilot-5','formatting preserves the snapshot order');
});
