import {validateEvent, id, now} from './core.mjs';
import {sourceSnapshot, synchronizeKnown} from './iracing-sync.mjs';
import {readIracingSource, runIracingSync, recordIracingConflict, conflictKey} from './iracing-supervision.mjs';

const OFFICIAL = 'official';

export const IRACING_FEED = 'https://raw.githubusercontent.com/pmsoftwaredevs/iracing-schedule/main/docs/data/';
export const IMPORT_AUTHOR = 'system:iracing';
const DAY_MS = 86_400_000;
// Official series raced in teams with driver changes ("Min 1/2 drivers, Max 16 drivers" in iRacing's
// season schedule PDF, members-assets.iracing.com/public/schedulepdf/SeasonSchedule.pdf, checked for
// 2026 S4). Solo series are kept in SOLO_SERIES below.
// A new team series must be added here after checking the PDF.
const TEAM_SERIES = /^(?:imsa endurance series|global endurance tour|gt endurance series|nurburgring endurance championship|creventic endurance series|production endurance challenge|britcar(?: endurance)?(?: series)?)(?:$|[ (])/;
// Only these verified sports-car solo endurance series; sprint series stay out.
export const SOLO_ENDURANCE_MINUTES=90;
const SOLO_SERIES = /imsa michelin pilot challenge|imsa sportscar endurance challenge/;
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
  [/gilles[\s-]+villeneuve|montreal/, 'iracing-montreal'],
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
  for (const value of texts.filter(Boolean)) {
    const match=TRACKS.find(([pattern]) => pattern.test(normalize(value)));
    if(match)return match[1];
  }
  return 'iracing-tbd';
}

// Car classes of each series (the schedule does not list them), then the classes named by special events.
const SERIES_CATEGORIES = [
  [/imsa michelin pilot challenge/, ['GT4','TCR']],
  [/imsa sportscar endurance challenge/, ['LMP3 P320','GT4']],
  [/imsa endurance series|global endurance tour|petit le mans|road america|daytona 24|sebring|watkins glen/, ['GTP','LMP2 P217','GT3']],
  [/nurburgring endurance|nurburgring 24/, ['GT3','Porsche Cup','GT4','TCR','M2']],
  [/creventic/, ['GT3','Porsche Cup','GT4']],
  [/britcar/, ['GT3','GT4']],
  [/production/, ['Production']],
  [/gt endurance|bathurst 12|spa 24|suzuka|indianapolis|8 hours/, ['GT3']]
];
const CLASS_CATEGORIES = [
  [/nissan gtp/, 'GTP Classic'], [/audi 90/, 'GTO Classic'], [/\bgtp\b|\bhyp/, 'GTP'], [/lmp2/, 'LMP2 P217'], [/lmp3/, 'LMP3 P320'],
  [/\bgt3\b/, 'GT3'], [/\bgt4\b/, 'GT4'], [/tcr|touring/, 'TCR'], [/porsche cup|992/, 'Porsche Cup'], [/\bm2\b/, 'M2'],
  [/\bhpd\b/, 'Historic LMP2'], [/\bgt1\b/, 'GT1'], [/\bgt2\b/, 'GT2'], [/supercars/, 'Supercars'], [/production car/, 'Production']
];
function knownCategories(name, carClass = '') {
  const fromClass = [...new Set(CLASS_CATEGORIES.filter(([pattern]) => pattern.test(normalize(carClass))).map(([, category]) => category))];
  if (carClass) return fromClass;
  return SERIES_CATEGORIES.find(([pattern]) => pattern.test(normalize(name)))?.[1] || [];
}
export function categoriesFor(name, carClass) {
  const known = knownCategories(name, carClass);
  return known.length ? known : ['GT3'];
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

// Keep the source UTC instant: Paris repeats 02:00–02:59 at the autumn clock change.
const importDeparture = start => ({...parisDateTime(start),startsAt:start});

// Every start of a race week: the week runs from date_start to date_end, the times are given per weekday
// (0 = Monday … 6 = Sunday) in GMT.
export function weekStarts(week, timesByDay) {
  if (!validWindow(week.date_start, week.date_end)) return [];
  const starts = [];
  const first = Date.parse(`${week.date_start}T00:00:00Z`), last = Date.parse(`${week.date_end}T00:00:00Z`);
  for (let day = first; day <= last; day += DAY_MS) {
    const weekday = (new Date(day).getUTCDay() + 6) % 7;
    for (const time of timesByDay[String(weekday)] || []) {
      if(!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(String(time)))continue;
      const [hours, minutes] = String(time).split(':').map(Number);
      if (Number.isFinite(hours) && Number.isFinite(minutes)) starts.push(day + (hours * 60 + minutes) * 60_000);
    }
  }
  return [...new Set(starts)].sort((a, b) => a - b);
}

const hasRealTimes = timesByDay => Object.values(timesByDay || {}).every(times => times.length <= MAX_TIMES_PER_DAY) && Object.values(timesByDay || {}).some(times => times.length);
const isEnduranceClass = carClass => /gt3|gt4|gtp|hyp|lmp|tcr|touring|porsche|hpd|gt1|gt2|supercars|production car|audi 90/i.test(carClass || '');
const EXCLUDED_SPECIALS = /roar|festival|runoffs|showdown|nascar/i;
const compactName = value => normalize(value).replace(/\b(\d+)\s*(?:hours?|hrs?|h)\b/g, '$1 hour').replace(/[^a-z0-9]+/g, ' ').trim();
const includesName = (text, name) => Boolean(name) && ` ${compactName(text)} `.includes(` ${compactName(name)} `);
const validDate = value => /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
const validWindow = (first, last) => validDate(first) && validDate(last) && Date.parse(last) - Date.parse(first) >= 0 && Date.parse(last) - Date.parse(first) <= 30 * DAY_MS;
const isClock = value => typeof value === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
const sourceStatus = value => /^(?:cancelled|canceled)$/i.test(value) ? 'cancelled' : /^postponed$/i.test(value) ? 'postponed' : /^(?:scheduled|confirmed|rescheduled)$/i.test(value) ? 'confirmed' : null;
const minutesFor = value => {
  const minutes = Number(value);
  return Number.isInteger(minutes) && minutes >= 60 && minutes <= 1440 && minutes % 5 === 0 ? minutes : null;
};
const seriesId = series => /^\d+$/.test(String(series.series_id ?? '')) ? String(series.series_id)
  : /(?:^|\/)series-list\/(\d+)(?:\/|$)/.exec(series.link_url || '')?.[1];

// Special event slot when its times are not known yet: its first day, 20h in Paris (to be confirmed).
const PENDING_TIME = '20:00';

// Races to create from one season file of the schedule, from `now` on.
export function planIracingEvents(season, timestamp = Date.now(), {code = season?.season?.code, review = []} = {}) {
  const plans = [];
  const specials = (season?.special_events || []).filter(event =>
    isEnduranceClass(event.car_class) && !EXCLUDED_SPECIALS.test(`${event.name} ${event.car_class}`) &&
    validWindow(event.date_start, event.date_end || event.date_start));
  const detailsFromSeries = new Map();

  for (const series of season?.championships || []) {
    if (series.category !== 'SPORTS CAR') continue;
    const name = cleanName(series.name), seriesName = normalize(name);
    const duration = minutesFor(series.typical_session_duration_minutes);
    const onlyWeek = series.weeks?.length === 1 ? series.weeks[0] : null;
    const matchingSpecials = onlyWeek ? specials.filter(event =>
      (includesName(name, cleanName(event.name)) || includesName(name, event.slug)) &&
      Math.abs(Date.parse(onlyWeek.date_start) - Date.parse(event.date_start)) <= 7 * DAY_MS) : [];
    if (matchingSpecials.length === 1) {
      const special = matchingSpecials[0];
      const info = {track:onlyWeek.track_name, duration:minutesFor(onlyWeek.duration_minutes) || duration};
      const previous = detailsFromSeries.get(special.slug);
      if (!previous) detailsFromSeries.set(special.slug, info);
      else if (previous.track !== info.track || previous.duration !== info.duration) detailsFromSeries.set(special.slug, {});
      continue;
    }
    const minDrivers = Number(series.min_drivers), maxDrivers = Number(series.max_drivers);
    const explicitTeam = series.team_racing === true && minDrivers >= 1 && maxDrivers >= minDrivers && maxDrivers > 1;
    const solo = series.team_racing === false || (series.team_racing !== true && (SOLO_SERIES.test(seriesName) || series.previousFormat === 'solo'));
    const identified = knownCategories(name, series.car_class);
    const categories = identified.length || series.car_class ? identified : series.previousCategories || [];
    const verifiedTeam = explicitTeam || (series.team_racing !== false && (TEAM_SERIES.test(seriesName) || series.previousFormat === 'endurance'));
    const liveWeeks = (series.weeks || []).filter(week => Date.parse(week.date_end) + DAY_MS > timestamp);
    if (!liveWeeks.length) continue;
    const key = `review:${code || 'season'}:${seriesId(series) || slug(name)}`;
    if (!(solo || verifiedTeam) || !categories.length) {
      if (/endurance|creventic/i.test(name) || explicitTeam || (series.team_racing === false && duration >= SOLO_ENDURANCE_MINUTES))
        review.push({externalId:key, name, finding:categories.length ? 'series' : 'categories', value:series.car_class || name});
      continue;
    }
    const times = series.session_times_by_day;
    const safeTimes = times && Object.entries(times).every(([day, hours]) =>
      /^[0-6]$/.test(day) && Array.isArray(hours) && hours.every(isClock)) && hasRealTimes(times);
    for (const week of liveWeeks) {
      if (!validWindow(week.date_start, week.date_end)) continue;
      const durationMinutes = minutesFor(week.duration_minutes) || duration;
      if (solo && durationMinutes < SOLO_ENDURANCE_MINUTES) continue;
      const status = sourceStatus(week.status || series.status);
      const starts = safeTimes ? weekStarts(week, times).filter(start => start > timestamp) : [];
      if ((!starts.length || starts.length > MAX_DEPARTURES) && !status) {
        if (!safeTimes) review.push({externalId:key, name, finding:'starts', value:week.date_start});
        continue;
      }
      const circuit = circuitFor(week.track_name);
      const id = seriesId(series);
      plans.push({
        externalId:`${solo?'solo-series':'series'}:${slug(name)}:${week.date_start}`,
        identity:id && code && Number.isInteger(week.week_number) ? `series:${code}:${id}:${week.week_number}` : null,
        metadata:{code, dateStart:week.date_start, dateEnd:week.date_end, layout:week.track_name || null,
          cars:series.cars ?? null, minDrivers:minDrivers || null, maxDrivers:maxDrivers || null, status},
        input:{name, format:solo?'solo':'endurance', ...(solo?{sim:'iracing',access:'open',rounds:[{circuit,durationMinutes,categories}]}:{}),
          durationMinutes, eventType:'lmu', circuit, schedulePending:false, categories, departures:starts.map(importDeparture),
          driverChangeRequired:explicitTeam && typeof series.driver_change_required === 'boolean' ? series.driver_change_required : undefined}
      });
    }
  }

  for (const event of specials) {
    const dateStart = event.date_start, dateEnd = event.date_end || dateStart;
    if (Date.parse(dateEnd) + DAY_MS <= timestamp) continue;
    const details = detailsFromSeries.get(event.slug) || {};
    const hours = /\b(\d+)\s*(?:h\b|hr\b|hours?\b)/i.exec(event.name)?.[1];
    const eventSlug = slug(event.slug || cleanName(event.name));
    const thread = /^https:\/\/forums\.iracing\.com\/discussion\/(\d+)(?:\/|$)/i.exec(event.link_url || '')?.[1];
    const special = {name:event.name, slug:eventSlug, dateStart, dateEnd, thread};
    plans.push({
      externalId:`special:${eventSlug}:${dateStart}`,
      identity:`special:${dateStart.slice(0, 4)}:${eventSlug}`,
      special, metadata:{...special, layout:details.track || event.track_name || null,
        status:sourceStatus(event.status), carClass:event.car_class},
      input:{name:cleanName(event.name), format:'endurance',
        durationMinutes:minutesFor(event.duration_minutes) || details.duration || minutesFor(Number(hours) * 60),
        eventType:'special', circuit:circuitFor(details.track, event.track_name, event.name),
        schedulePending:true, categories:knownCategories(event.name, event.car_class), departures:[{date:dateStart, time:PENDING_TIME, tbd:true}]}
    });
  }
  return plans;
}

const seasonCode = value => typeof value === 'string' && /^\d{4}S[1-4]$/.test(value);
function validateManifest(data) {
  if (!seasonCode(data?.current) || (data.next != null && !seasonCode(data.next))) throw new Error('saison invalide');
  return {current:data.current, next:data.next === data.current ? null : data.next ?? null};
}
function seasonValidator(code) {
  return (data, previous) => {
    if ((!data?.counts && data?.season?.code && data.season.code !== code) || !Array.isArray(data?.championships) ||
        !Array.isArray(data.special_events) || !data.championships.length) throw new Error('calendrier incomplet');
    const countSeries = data.championships.length;
    const countSpecials = data.special_events.length;
    if (previous && (countSeries < previous.counts.series * 0.8 || countSpecials < previous.counts.specials * 0.8))
      throw new Error('baisse inhabituelle de la couverture');
    if (data.championships.some(series => !series?.name || !Array.isArray(series.weeks)) ||
        data.special_events.some(event => !event?.name || !validWindow(event.date_start, event.date_end || event.date_start)))
      throw new Error('course mal formée');
    const previousById = new Map((previous?.championships || []).filter(item => item.series_id).map(item => [item.series_id,item]));
    const championships = data.championships.filter(series => series.category === 'SPORTS CAR').map(series => {
      const id = seriesId(series), old = previousById.get(id), name = cleanName(series.name);
      const inferred = SOLO_SERIES.test(normalize(name)) ? 'solo' : TEAM_SERIES.test(normalize(name)) ? 'endurance' : undefined;
      const categories = knownCategories(name, series.car_class);
      return {
        name:series.name, category:series.category, series_id:id,
        typical_session_duration_minutes:series.typical_session_duration_minutes, session_times_by_day:series.session_times_by_day,
        team_racing:series.team_racing, min_drivers:series.min_drivers, max_drivers:series.max_drivers,
        driver_change_required:series.driver_change_required, car_class:series.car_class, cars:series.cars, status:series.status,
        previousFormat:inferred || old?.previousFormat,
        previousCategories:categories.length ? categories : old?.previousCategories,
        weeks:series.weeks.map(week => ({week_number:week.week_number, date_start:week.date_start, date_end:week.date_end,
          track_name:week.track_name, duration_minutes:week.duration_minutes, status:week.status}))
      };
    });
    return {counts:{series:countSeries,specials:countSpecials}, championships, special_events:data.special_events};
  };
}

export const IRACING_NEWS = 'https://www.iracing.com/wp-json/wp/v2/posts?search=THIS%20WEEK&per_page=20&_fields=id,date,modified,title,content';
const WEEKDAYS = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
const decode = value => String(value || '').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
  .replace(/<[^>]+>/g, ' ').replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code))).replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
const slotLabel = /time\s*slot\s*#?\s*(\d+)\s*:/gi;

function articleSlots(text, dateStart, dateEnd) {
  if (!validWindow(dateStart, dateEnd)) return {starts:[], complete:false};
  const first = Date.parse(dateStart), last = Date.parse(dateEnd);
  const content = decode(text), labels = [...content.matchAll(slotLabel)];
  const numbered = new Map();
  let ambiguous = false;
  labels.forEach((label, index) => {
    const part = content.slice(label.index + label[0].length, labels[index + 1]?.index);
    const match = /^\s*(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\s+at\s+(\d{1,2}):(\d{2})\s*(?:gmt|utc)\b/i.exec(part);
    if (!match) return;
    const [, weekday, hour, minute] = match;
    if (Number(hour) > 23 || Number(minute) > 59) return;
    const dates = [];
    for (let day = first; day <= last; day += DAY_MS) {
      if (WEEKDAYS[new Date(day).getUTCDay()] === weekday.toLowerCase()) dates.push(day);
    }
    if (dates.length !== 1) return;
    const number = Number(label[1]), start = dates[0] + (Number(hour) * 60 + Number(minute)) * 60_000;
    if (numbered.has(number) && numbered.get(number) !== start) ambiguous = true;
    else numbered.set(number, start);
  });
  if (ambiguous) return {starts:[], complete:false};
  const starts = [...new Set(numbered.values())].sort((a,b) => a-b);
  const complete = starts.length > 0 && starts.length === labels.length && starts.every((_, index) => numbered.has(index + 1));
  return {starts, complete};
}

export function specialStarts(text, dateStart, dateEnd) {
  return articleSlots(text, dateStart, dateEnd).starts;
}

export function articleFor(posts, special) {
  const first = Date.parse(special.dateStart), last = Date.parse(special.dateEnd || special.dateStart);
  const aliases = [cleanName(special.name), String(special.slug || '').replace(/-/g,' ')];
  const matches = posts.filter(post => {
    const title = decode(post?.title?.rendered);
    const published = Date.parse(post?.date + (post?.date?.endsWith('Z') ? '' : 'Z'));
    if (!/\bspecial event\b/i.test(title) || published < first - 10 * DAY_MS || published >= last + DAY_MS || !Number.isFinite(published)) return false;
    const content = post?.content?.rendered || '';
    if (special.thread && new RegExp(`forums\\.iracing\\.com/discussion/${special.thread}(?:/|["'])`).test(content)) return true;
    return aliases.some(alias => compactName(alias).includes(' ') && includesName(title, alias));
  });
  return matches.length === 1 ? matches[0] : null;
}

function articleDetails(article, special) {
  const text = decode(article.content?.rendered);
  const title = decode(article.title?.rendered);
  const time = /\b(\d{1,2})[- ]hours?\s+(?:endurance\s+)?(?:race|event)\b|\b(\d{1,2})\s+hours? of team racing\b/i.exec(text);
  const layout = /\bTRACK:\s*([^<\n]+)</i.exec(article.content?.rendered || '')?.[1]?.trim();
  const status = /\b(?:cancelled|canceled)\b/i.test(title) ? 'cancelled' : /\bpostponed\b/i.test(title) ? 'postponed' : null;
  return {...articleSlots(text, special.dateStart, special.dateEnd), status,
    durationMinutes:minutesFor(Number(time?.[1] || time?.[2]) * 60), layout};
}

function addArticleToPlan(plan, article, timestamp, stale) {
  if (!article) return;
  const details = articleDetails(article, plan.special);
  const {input, metadata} = plan;
  if (details.status) metadata.status = details.status;
  if (details.durationMinutes) input.durationMinutes = details.durationMinutes;
  if (details.layout && circuitFor(details.layout) !== 'iracing-tbd') {
    input.circuit = circuitFor(details.layout);
    metadata.layout = details.layout;
  }
  const starts = details.starts.filter(start => start > timestamp);
  if (!starts.length || starts.length > MAX_DEPARTURES || stale) return;
  plan.articleStarts = starts;
  plan.articleComplete = details.complete;
  plan.articleCount = details.starts.length;
  input.schedulePending = !details.complete;
  input.departures = starts.map(importDeparture);
  if (!details.complete) {
    const {date,time,startsAt} = input.departures[0];
    input.departures.unshift({date,time,startsAt,tbd:true});
  }
}

function validateNews(data) {
  if (!Array.isArray(data) || data.some(post => typeof post?.date !== 'string' || typeof post.title?.rendered !== 'string'))
    throw new Error('liste d’articles invalide');
  return data.filter(post => /special event/i.test(post.title.rendered)).map(post => ({
    id:post.id, date:post.date, modified:post.modified, title:post.title,
    content:{rendered:(post.content?.rendered || '').slice(0, 65_000)}
  }));
}

async function importOfficial(env, plans, review, timestamp) {
  const keys = JSON.stringify(plans.map(plan => plan.externalId));
  const identities = JSON.stringify(plans.map(plan => plan.identity).filter(Boolean));
  const rows = (await env.DB.prepare(`SELECT i.external_id,i.source_snapshot,i.source_identity,i.source_metadata,e.*,c.details AS sync_conflict,c.resolved_at AS sync_conflict_resolved
    FROM iracing_imports i LEFT JOIN events e ON e.id=i.event_id
    LEFT JOIN iracing_sync_conflicts c ON c.source_key=COALESCE(i.source_identity,i.external_id)
    WHERE i.community_id=? AND (i.external_id IN (SELECT value FROM json_each(?)) OR i.source_identity IN (SELECT value FROM json_each(?)))`)
    .bind(OFFICIAL, keys, identities).all()).results;
  const known = new Map(rows.flatMap(row => [[row.external_id,row], ...(row.source_identity ? [[row.source_identity,row]] : [])]));
  const current = new Set();
  const summary = {created:0, completed:0, updated:0, conflicts:0, initialized:0, skipped:0};
  const pending = [];
  async function flush() {
    if (!pending.length) return;
    const results = await env.DB.batch(pending.splice(0));
    summary.created += results.filter((_, i) => i%2===0).reduce((total, result) => total + (Number(result.meta.changes)||0), 0);
  }
  for (const plan of plans) {
    const key = conflictKey(plan);
    if (current.has(key)) continue;
    current.add(key);
    const saved = known.get(plan.identity) || known.get(plan.externalId);
    if (saved && (saved.created_by !== IMPORT_AUTHOR || saved.community_id !== OFFICIAL)) continue;
    if (['cancelled','postponed'].includes(plan.metadata.status) && !saved) {
      await recordIracingConflict(env, plan, null, {reason:plan.metadata.status, incoming:plan.metadata}, timestamp);
      continue;
    }
    if ((!plan.input.durationMinutes && !saved) || !plan.input.categories.length) {
      await recordIracingConflict(env, plan, saved, {reason:plan.input.categories.length ? 'duration' : 'categories', incoming:plan.metadata}, timestamp);
      summary.skipped++;
      continue;
    }
    const rawInput = {...plan.input};
    if (saved && !rawInput.durationMinutes) rawInput.durationMinutes = Number(saved.duration_minutes) || Number(saved.duration_hours) * 60;
    let data;
    try {
      data = rawInput.departures.length ? validateEvent(rawInput, null, {officialImport:true}) : null;
    } catch (error) {
      await recordIracingConflict(env, plan, saved, {reason:'invalid', message:error.message, incoming:plan.metadata}, timestamp);
      summary.skipped++;
      continue;
    }
    if (saved) {
      const result = await synchronizeKnown(env, saved, data, plan, timestamp);
      if (result.repaired) summary.repaired = (summary.repaired || 0) + result.repaired;
      for (const field of ['updated','completed','conflicts','initialized']) summary[field] += result[field] || 0;
      continue;
    }
    const eventId = id();
    pending.push(
      env.DB.prepare(`INSERT INTO events(id,name,duration_hours,duration_minutes,event_type,circuit,schedule_pending,driver_change_required,format,access,capacity,rounds,categories,departures,created_by,created_at,community_id,sim,details)
        SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,? WHERE NOT EXISTS (SELECT 1 FROM iracing_imports WHERE community_id=? AND (external_id=? OR source_identity=?))`)
        .bind(eventId, data.name, data.durationHours, data.durationMinutes, data.eventType, data.circuit, data.schedulePending?1:0,
          data.driverChangeRequired==null?null:Number(data.driverChangeRequired), data.format, data.access, data.capacity, JSON.stringify(data.rounds),
          JSON.stringify(data.categories), JSON.stringify(data.departures), IMPORT_AUTHOR, now(), OFFICIAL, data.sim, JSON.stringify(data.details),
          OFFICIAL, plan.externalId, plan.identity),
      env.DB.prepare(`INSERT INTO iracing_imports(community_id,external_id,event_id,created_at,source_snapshot,source_identity,source_metadata)
        SELECT ?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM events WHERE id=?)`)
        .bind(OFFICIAL, plan.externalId, eventId, now(), JSON.stringify(sourceSnapshot(data)), plan.identity, JSON.stringify({...plan.metadata,...(plan.articleCount?{articleCount:plan.articleCount}:{})}), eventId)
    );
    if (data.circuit === 'iracing-tbd') {
      await flush();
      await recordIracingConflict(env, plan, {id:eventId}, {reason:'circuit', incoming:plan.metadata}, timestamp);
      summary.conflicts++;
    } else if (pending.length >= 20) await flush();
  }
  await flush();
  for (const finding of new Map(review.map(item => [item.externalId,item])).values()) {
    await recordIracingConflict(env, finding, null, {reason:finding.finding, incoming:finding.value}, timestamp);
    summary.conflicts++;
  }
  return summary;
}

export function syncIracingEvents(env, {timestamp = Date.now(), fetchImpl = fetch, scheduled = false, specialOnly = false} = {}) {
  return runIracingSync(env, specialOnly ? 'special' : 'calendar', timestamp, scheduled, async () => {
    const sources = {}, errors = [], review = [];
    const observe = (key, result) => {
      const {data, ...state} = result;
      sources[key] = state;
      if (state.error) errors.push(`${key}: ${state.error}`);
      return data;
    };
    const specialCutoff = timestamp + 10 * DAY_MS;
    const plans = [], validSeasons = [];
    if (specialOnly) {
      const {results} = await env.DB.prepare(`SELECT payload FROM iracing_sync_sources WHERE name IN (
        'season:' || (SELECT json_extract(payload,'$.current') FROM iracing_sync_sources WHERE name='manifest'),
        'season:' || (SELECT json_extract(payload,'$.next') FROM iracing_sync_sources WHERE name='manifest'))`).all();
      for (const row of results) plans.push(...planIracingEvents(JSON.parse(row.payload), timestamp)
        .filter(plan => plan.special && Date.parse(plan.special.dateStart) <= specialCutoff));
      if (!plans.length) return {idle:true};
    } else {
      const manifestResult = await readIracingSource(env, 'manifest', IRACING_FEED+'manifest.json', fetchImpl, validateManifest, timestamp);
      const manifest = observe('manifest', manifestResult);
      if (!manifest || manifestResult.error) throw Object.assign(new Error(errors.join(' · ')), {sources});
      for (const code of [manifest.current, manifest.next].filter(Boolean)) {
        const key = `season:${code}`;
        const result = await readIracingSource(env, key, `${IRACING_FEED}${code.slice(0,4)}_s${code.slice(5)}.json`, fetchImpl, seasonValidator(code), timestamp);
        if (observe(key, result) && !result.error) {
          validSeasons.push(code);
          plans.push(...planIracingEvents(result.data, timestamp, {code, review}));
        }
      }
    }
    if (!specialOnly && !plans.length && Object.entries(sources).some(([key, state]) => key.startsWith('season:') && state.error))
      throw Object.assign(new Error(errors.join(' · ')), {sources});
    const specials = plans.filter(plan => plan.special && (!scheduled || Date.parse(plan.special.dateStart) <= specialCutoff));
    if (specials.length) {
      const news = await readIracingSource(env, 'articles', IRACING_NEWS, fetchImpl, validateNews, timestamp);
      const posts = observe('articles', news) || [];
      for (const plan of specials) addArticleToPlan(plan, articleFor(posts, plan.special), timestamp, Boolean(news.error));
      if (specialOnly && news.error) return {sources, errors};
    }
    const result = await importOfficial(env, plans, review, timestamp);
    if (!specialOnly && validSeasons.length) {
      const present = JSON.stringify(plans.map(plan => plan.identity).filter(Boolean));
      const prefixes = JSON.stringify(validSeasons.map(code => `series:${code}:`));
      const {results} = await env.DB.prepare(`SELECT i.source_identity AS identity,i.source_metadata,e.id,e.name
        FROM iracing_imports i JOIN events e ON e.id=i.event_id WHERE i.community_id='official' AND e.last_start>?
        AND EXISTS (SELECT 1 FROM json_each(?) p WHERE substr(i.source_identity,1,length(p.value))=p.value)
        AND i.source_identity NOT IN (SELECT value FROM json_each(?)) LIMIT 40`).bind(timestamp,prefixes,present).all();
      for (const row of results) {
        await recordIracingConflict(env,row,row,{reason:'absent',previous:JSON.parse(row.source_metadata || '{}')},timestamp);
        result.conflicts++;
      }
    }
    return {...result, sources, errors};
  });
}

export function importNextCommunity(env, at = new Date(), {fetchImpl = fetch} = {}) {
  return syncIracingEvents(env, {timestamp:at.getTime(), fetchImpl, scheduled:true});
}
