// Official iRacing endurances (team races with driver changes), created automatically in the iRacing space.
//
// Source: the season data of "iRacing Planner" (https://github.com/pmsoftwaredevs/iracing-schedule,
// BSD 3-Clause, © PMSoftwareDevs), built every day from iRacing's own public pages and schedule PDF.
// iRacing's Data API needs an OAuth client, whose creation iRacing has paused.
//
// Only races run in teams with driver changes are imported (TEAM_SERIES).
// - Endurance series: one race per series and per race week, with every official start of the week
//   (times published in GMT, converted to Paris time).
// - Special events (Petit Le Mans, Bathurst 1000…): their start times are not published in advance, so
//   the race is created on its first day with "Horaires à confirmer" for an organizer to complete.
// A race is imported once (table iracing_imports): editing or deleting it on the site is never undone.
import {validateEvent, parisTimestamp, id, now} from './core.mjs';

export const IRACING_FEED = 'https://raw.githubusercontent.com/pmsoftwaredevs/iracing-schedule/main/docs/data/';
export const IMPORT_AUTHOR = 'system:iracing';
const DAY_MS = 86_400_000;
// Official series raced in teams with driver changes ("Min 1/2 drivers, Max 16 drivers" in iRacing's
// season schedule PDF, members-assets.iracing.com/public/schedulepdf/SeasonSchedule.pdf, checked for
// 2026 S4). Long solo series (IMSA Michelin Pilot Challenge, IMSA Sportscar Endurance Challenge) are left out.
// A new team series must be added here after checking the PDF.
const TEAM_SERIES = /imsa endurance series|global endurance tour|gt endurance series|nurburgring endurance|creventic|production endurance challenge|britcar|petit le mans|road america|daytona 24|sebring 12|watkins glen 6|spa 24|bathurst|nurburgring 24|suzuka 1000|indianapolis|portimao 1000|thruxton/;
// More start times than this a day: the schedule says "see the event page" (special events), not real times.
const MAX_TIMES_PER_DAY = 8;
const MAX_DEPARTURES = 30;

const normalize = value => String(value || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const slug = value => normalize(value).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);

// Track names of the schedule → circuits of the site (first match wins).
const TRACKS = [
  [/nurburgring combined|nordschleife|gesamtstrecke/, 'iracing-nordschleife'],
  [/nurburgring/, 'iracing-nurburgring-gp'],
  [/road atlanta/, 'iracing-road-atlanta'],
  [/road america/, 'iracing-road-america'],
  [/watkins glen/, 'iracing-watkins-glen'],
  [/sebring/, 'iracing-sebring'],
  [/daytona/, 'iracing-daytona'],
  [/indianapolis/, 'iracing-indianapolis'],
  [/laguna seca/, 'iracing-laguna-seca'],
  [/sonoma/, 'iracing-sonoma'],
  [/virginia|\bvir\b/, 'iracing-vir'],
  [/circuit of the americas|\bcota\b/, 'iracing-cota'],
  [/long beach/, 'iracing-long-beach'],
  [/charlotte/, 'iracing-charlotte'],
  [/summit point/, 'iracing-summit-point'],
  [/gilles villeneuve|montreal/, 'iracing-montreal'],
  [/hermanos rodriguez|mexico/, 'iracing-mexico'],
  [/jose carlos pace|interlagos/, 'iracing-interlagos'],
  [/24 heures du mans|le mans/, 'iracing-le-mans'],
  [/spa-francorchamps|\bspa\b/, 'iracing-spa'],
  [/silverstone/, 'iracing-silverstone'],
  [/brands hatch/, 'iracing-brands-hatch'],
  [/snetterton/, 'iracing-snetterton'],
  [/oulton park/, 'iracing-oulton-park'],
  [/thruxton/, 'iracing-thruxton'],
  [/monza/, 'iracing-monza'],
  [/mugello/, 'iracing-mugello'],
  [/imola|enzo e dino ferrari/, 'iracing-imola'],
  [/misano/, 'iracing-misano'],
  [/barcelona|catalunya/, 'iracing-barcelona'],
  [/navarra/, 'iracing-navarra'],
  [/algarve|portimao/, 'iracing-portimao'],
  [/magny-cours|magny cours/, 'iracing-magny-cours'],
  [/hockenheim/, 'iracing-hockenheim'],
  [/oschersleben/, 'iracing-oschersleben'],
  [/red bull ring/, 'iracing-red-bull-ring'],
  [/zandvoort/, 'iracing-zandvoort'],
  [/zolder/, 'iracing-zolder'],
  [/fuji/, 'iracing-fuji'],
  [/suzuka/, 'iracing-suzuka'],
  [/motegi/, 'iracing-motegi'],
  [/mount panorama|bathurst/, 'iracing-bathurst'],
  [/the bend/, 'iracing-the-bend'],
  [/adelaide/, 'iracing-adelaide']
];
export function circuitFor(...texts) {
  const text = normalize(texts.filter(Boolean).join(' '));
  return TRACKS.find(([pattern]) => pattern.test(text))?.[1] || 'iracing-tbd';
}

// Car classes of each series (the schedule does not list them), then the classes named by special events.
const SERIES_CATEGORIES = [
  [/imsa endurance series|global endurance tour|petit le mans|road america|daytona 24|sebring|watkins glen/, ['GTP','LMP2 P217','GT3']],
  [/nurburgring endurance|nurburgring 24/, ['GT3','Porsche Cup','GT4','TCR','M2']],
  [/creventic/, ['GT3','Porsche Cup','GT4','TCR']],
  [/britcar/, ['GT3','GT4']],
  [/production/, ['Production']],
  [/gt endurance|bathurst 12|spa 24|suzuka|indianapolis|8 hours/, ['GT3']]
];
const CLASS_CATEGORIES = [
  [/nissan gtp/, 'GTP Classic'], [/audi 90/, 'GTO Classic'], [/\bgtp\b|\bhyp/, 'GTP'], [/lmp2/, 'LMP2 P217'], [/lmp3/, 'LMP3 P320'],
  [/\bgt3\b/, 'GT3'], [/\bgt4\b/, 'GT4'], [/tcr|touring/, 'TCR'], [/porsche cup|992/, 'Porsche Cup'], [/\bm2\b/, 'M2'],
  [/\bhpd\b/, 'Historic LMP2'], [/\bgt1\b/, 'GT1'], [/\bgt2\b/, 'GT2'], [/supercars/, 'Supercars'], [/production car/, 'Production']
];
export function categoriesFor(name, carClass = '') {
  const fromClass = [...new Set(CLASS_CATEGORIES.filter(([pattern]) => pattern.test(normalize(carClass))).map(([, category]) => category))];
  if (fromClass.length) return fromClass;
  return SERIES_CATEGORIES.find(([pattern]) => pattern.test(normalize(name)))?.[1] || ['GT3'];
}

// "Nurburgring Endurance Championship - 2026 Season" → "Nurburgring Endurance Championship"
export function cleanName(name) {
  return String(name).replace(/\s+-\s+\d{4}\s+Season.*$/i, '').replace(/^\d{4}\s+/, '').replace(/\s+Presented by .*$/i, '').trim().slice(0, 100);
}

const parisParts = new Intl.DateTimeFormat('en-GB', {timeZone:'Europe/Paris', year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', hourCycle:'h23'});
export function parisDateTime(timestamp) {
  const p = Object.fromEntries(parisParts.formatToParts(timestamp).map(part => [part.type, part.value]));
  return {date:`${p.year}-${p.month}-${p.day}`, time:`${p.hour}:${p.minute}`};
}

// A start the site can store: its Paris time exists and is not ambiguous (the night of the autumn clock
// change repeats 2:00–2:59; such a start is left out, the other starts of the week stay).
function representable(start) {
  const {date, time} = parisDateTime(start);
  try { return parisTimestamp(date, time) === start; } catch { return false; }
}

// Every start of a race week: the week runs from date_start to date_end, the times are given per weekday
// (0 = Monday … 6 = Sunday) in GMT.
export function weekStarts(week, timesByDay) {
  const starts = [];
  const first = Date.parse(`${week.date_start}T00:00:00Z`), last = Date.parse(`${week.date_end}T00:00:00Z`);
  for (let day = first; day <= last; day += DAY_MS) {
    const weekday = (new Date(day).getUTCDay() + 6) % 7;
    for (const time of timesByDay[String(weekday)] || []) {
      const [hours, minutes] = String(time).split(':').map(Number);
      if (Number.isFinite(hours) && Number.isFinite(minutes)) starts.push(day + (hours * 60 + minutes) * 60_000);
    }
  }
  return starts.sort((a, b) => a - b);
}

const hasRealTimes = timesByDay => Object.values(timesByDay || {}).every(times => times.length <= MAX_TIMES_PER_DAY) && Object.values(timesByDay || {}).some(times => times.length);
const isEnduranceClass = carClass => /gt3|gt4|gtp|hyp|lmp|tcr|touring|porsche|hpd|gt1|gt2|supercars|production car|audi 90/i.test(carClass || '');
const EXCLUDED_SPECIALS = /roar|festival|runoffs|showdown|nascar/i;
// Special events announced on iracing.com/special-events but missing from the schedule data, and durations
// the data does not give (name without "N Hours"). Checked on the official page on 2026-09-28.
const EXTRA_SPECIALS = [
  {slug:'992-endurance-cup', name:'992 Endurance Cup', date_start:'2026-11-27', date_end:'2026-11-29', track_name:null, car_class:'Porsche Cup'}
];
const SPECIAL_MINUTES = [[/992 endurance cup/, 720], [/production car challenge/, 240]];

// Special event slot when its times are not known yet: its first day, 20h in Paris (to be confirmed).
const PENDING_TIME = '20:00';

// Races to create from one season file of the schedule, from `now` on.
export function planIracingEvents(season, timestamp = Date.now()) {
  const plans = [];
  const listed = season?.special_events || [];
  const extras = EXTRA_SPECIALS.filter(extra => !listed.some(event => normalize(event.name) === normalize(extra.name)));
  const specials = [...listed, ...extras].filter(event => isEnduranceClass(event.car_class) && !EXCLUDED_SPECIALS.test(`${event.name} ${event.car_class}`));
  // "Petit Le Mans" ↔ "2026 Petit Le Mans Presented by VCO": every significant word of the event is in the series name.
  const words = name => normalize(name).split(/[^a-z0-9]+/).filter(word => word.length >= 4 && !/\d/.test(word) && !['hours','hour','presented'].includes(word));
  const specialFor = name => specials.find(event => words(event.name).length && words(event.name).every(word => normalize(name).includes(word)));
  const detailsFromSeries = new Map();

  for (const series of season?.championships || []) {
    const duration = Number(series.typical_session_duration_minutes) || 0;
    if (series.category !== 'SPORTS CAR' || !TEAM_SERIES.test(normalize(series.name))) continue;
    const special = specialFor(series.name);
    // A special event listed as a series: its times are placeholders, the special event list is used.
    if (!hasRealTimes(series.session_times_by_day)) {
      if (special) detailsFromSeries.set(special.slug, {track:series.weeks?.[0]?.track_name, duration:series.weeks?.[0]?.duration_minutes || duration});
      continue;
    }
    const name = cleanName(series.name);
    for (const week of series.weeks || []) {
      const starts = weekStarts(week, series.session_times_by_day).filter(start => start > timestamp && representable(start));
      if (!starts.length || starts.length > MAX_DEPARTURES) continue;
      plans.push({
        externalId:`series:${slug(name)}:${week.date_start}`,
        input:{name, format:'endurance', durationMinutes:Math.min(1440, Number(week.duration_minutes) || duration), eventType:'lmu', circuit:circuitFor(week.track_name),
          schedulePending:false, categories:categoriesFor(name), departures:starts.map(parisDateTime)}
      });
    }
  }

  for (const event of specials) {
    const firstDay = Date.parse(`${event.date_start}T00:00:00Z`);
    if (!Number.isFinite(firstDay) || Date.parse(`${event.date_end || event.date_start}T23:59:59Z`) <= timestamp) continue;
    const details = detailsFromSeries.get(event.slug) || {};
    const hours = /(\d+)\s*(?:h\b|hr\b|hours?\b)/i.exec(event.name)?.[1];
    const known = SPECIAL_MINUTES.find(([pattern]) => pattern.test(normalize(event.name)))?.[1];
    const durationMinutes = Math.min(1440, Number(details.duration) || known || (hours ? Number(hours) * 60 : 360));
    plans.push({
      externalId:`special:${slug(event.slug || event.name)}:${event.date_start}`,
      input:{name:cleanName(event.name), format:'endurance', durationMinutes, eventType:'special', circuit:circuitFor(details.track, event.track_name, event.name),
        schedulePending:true, categories:categoriesFor(event.name, event.car_class), departures:[{date:event.date_start, time:PENDING_TIME}]}
    });
  }
  return plans;
}

async function fetchJson(url, fetchImpl) {
  const response = await fetchImpl(url, {headers:{Accept:'application/json'}, cf:{cacheTtl:3600}});
  if (!response.ok) throw new Error(`iRacing schedule unavailable (${response.status})`);
  return response.json();
}

// Creates the races that are not imported yet. Returns the number of races created.
export async function syncIracingEvents(env, {timestamp = Date.now(), fetchImpl = fetch} = {}) {
  const manifest = await fetchJson(IRACING_FEED + 'manifest.json', fetchImpl);
  // The current season, and the next one as soon as the schedule publishes it.
  const codes = [manifest?.current, manifest?.next].map(String).filter(code => /^\d{4}S[1-4]$/.test(code));
  if (!codes.length) throw new Error('iRacing schedule: unknown season');
  const plans = [];
  for (const code of codes) plans.push(...planIracingEvents(await fetchJson(`${IRACING_FEED}${code.slice(0, 4)}_s${code.slice(5)}.json`, fetchImpl), timestamp));
  if (!plans.length) return 0;
  const known = new Set((await env.DB.prepare('SELECT external_id FROM iracing_imports').all()).results.map(row => row.external_id));
  let created = 0;
  for (const plan of plans) {
    if (known.has(plan.externalId)) continue;
    let data;
    // A start that does not exist in Paris time (clock change) or any invalid entry: that race is skipped.
    try { data = validateEvent(plan.input); } catch { continue; }
    const eventId = id();
    await env.DB.batch([
      env.DB.prepare('INSERT INTO events(id,name,duration_hours,duration_minutes,event_type,circuit,schedule_pending,format,access,capacity,rounds,categories,departures,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
        .bind(eventId, data.name, data.durationHours, data.durationMinutes, data.eventType, data.circuit, data.schedulePending ? 1 : 0, data.format, data.access, data.capacity, JSON.stringify(data.rounds), JSON.stringify(data.categories), JSON.stringify(data.departures), IMPORT_AUTHOR, now()),
      env.DB.prepare('INSERT OR IGNORE INTO iracing_imports(external_id,event_id,created_at) VALUES(?,?,?)').bind(plan.externalId, eventId, now())
    ]);
    created++;
  }
  return created;
}
