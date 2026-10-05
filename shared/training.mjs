// Individual training (module « Entraînement », server/training.mjs, front/training-page.mjs): what the browser and
// the server share. The LMU results files (UserData/Log/Results/*.xml, one per session) are read here, then the laps
// are turned into a program, a session for today and advice. Nothing here guesses: missing data stays missing.

const SESSION_TAGS = /<(Practice\d?|Qualify\d?|Warmup|Race)>/;
const decode = text => String(text || '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&').trim();
const tag = (xml, name) => { const match = xml.match(new RegExp(`<${name}>([^<]*)</${name}>`)); return match ? decode(match[1]) : ''; };
const number = value => { const parsed = Number.parseFloat(value); return Number.isFinite(parsed) ? parsed : null; };
// LMU writes fuel and virtual energy as a fraction of the tank (0.957), older files as a percentage.
const percent = value => { const parsed = number(value); return parsed === null || parsed < 0 ? null : parsed <= 1 ? parsed * 100 : parsed; };
const seconds = value => { const parsed = number(value); return parsed && parsed > 0 ? parsed : null; };
const round = (value, digits = 1) => value === null ? null : Math.round(value * 10 ** digits) / 10 ** digits;

export const normal = value => String(value || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
export const trackKey = session => `${normal(session.venue)}|${normal(session.course || session.venue)}`;

// The tyre's compound as LMU writes it ("0,Medium"), without its index.
const compoundOf = value => String(value || '').split(',').slice(1).join(',').trim().replace(/^N\/A$/, '');
const sameName = (a, b) => normal(a) && normal(a) === normal(b);

// One results file → the pilot's session, or an error the pilot can understand. Offline, the pilot is the one driver
// marked isPlayer; online every driver is, so the pilot is found by name (his name in LMU, or on the site), and when
// a car is shared, only the laps he drove are his (the <Swap> lines of the car).
export function parseResults(xml, names = []) {
  const text = String(xml || '');
  if (!/<rFactorXML\b/.test(text) || !/<RaceResults>/.test(text)) throw Error('Ce fichier n’est pas un fichier de résultats LMU.');
  const kind = (text.match(SESSION_TAGS) || [])[1] || '';
  const drivers = text.split('<Driver>').slice(1).map(part => part.split('</Driver>')[0]);
  const players = drivers.filter(driver => /<isPlayer>\s*1\s*<\/isPlayer>/.test(driver));
  const swapsOf = driver => [...driver.matchAll(/<Swap startLap="(\d+)" endLap="(\d+)">([^<]*)<\/Swap>/g)].map(([, from, to, name]) => ({from:Number(from), to:Number(to), name:decode(name)}));
  const mine = name => names.some(candidate => sameName(candidate, name));
  let player = players.length === 1 ? players[0] : null;
  if (!player && players.length > 1) {
    player = players.find(driver => mine(tag(driver, 'Name'))) || players.find(driver => swapsOf(driver).some(swap => mine(swap.name))) || null;
    if (!player) throw Object.assign(Error(names.length
      ? 'Ce fichier contient plusieurs pilotes et ton nom LMU n’y est pas. Vérifie ton nom dans LMU sur la page Mon entraînement.'
      : 'Ce fichier contient plusieurs pilotes. Indique ton nom dans LMU sur la page Mon entraînement pour qu’on y retrouve tes tours.'), {code:'driver', drivers:players.map(driver => tag(driver, 'Name')).filter(Boolean).slice(0, 40)});
  }
  if (!player) throw Error('Ton pilote n’apparaît pas dans ce fichier.');
  // A shared car: keep the laps of the pilot's turns at the wheel only.
  const swaps = swapsOf(player);
  const turns = players.length > 1 && swaps.some(swap => mine(swap.name)) && !swaps.every(swap => mine(swap.name)) ? swaps.filter(swap => mine(swap.name)) : null;
  const laps = [];
  let previousFuel = null, previousEnergy = null, previousWear = null;
  for (const match of player.matchAll(/<Lap\b([^>]*)>([^<]*)<\/Lap>/g)) {
    const attributes = Object.fromEntries([...match[1].matchAll(/([A-Za-z0-9]+)="([^"]*)"/g)].map(([, key, value]) => [key.toLowerCase(), value]));
    const pit = attributes.pit === '1';
    const fuel = percent(attributes.fuel), energy = percent(attributes.ve);
    // Used on the lap: written by LMU when it is, else what left the tank since the last lap (never across a stop).
    const fuelUsed = attributes.fuelused !== undefined ? percent(attributes.fuelused) : !pit && previousFuel !== null && fuel !== null && previousFuel >= fuel ? previousFuel - fuel : null;
    const energyUsed = attributes.veused !== undefined ? percent(attributes.veused) : !pit && previousEnergy !== null && energy !== null && previousEnergy >= energy ? previousEnergy - energy : null;
    // Tyres: what is left of each (1 = new); the lap wore what went away, nothing when they were changed.
    const wear = ['twfl', 'twfr', 'twrl', 'twrr'].map(key => number(attributes[key]));
    const worn = wear.map((value, index) => value !== null && previousWear?.[index] !== null && previousWear?.[index] !== undefined && previousWear[index] >= value ? round((previousWear[index] - value) * 100, 2) : null);
    previousFuel = fuel; previousEnergy = energy; previousWear = wear;
    const n = Number.parseInt(attributes.num, 10) || laps.length + 1;
    if (turns && !turns.some(turn => n >= turn.from && n <= turn.to)) continue;
    const front = compoundOf(attributes.fcompound), rear = compoundOf(attributes.rcompound);
    laps.push({n, t:seconds(match[2]), s:[seconds(attributes.s1), seconds(attributes.s2), seconds(attributes.s3)],
      pit, fuel:round(fuelUsed, 2), ve:round(energyUsed, 2), top:seconds(attributes.topspeed) ? round(Number(attributes.topspeed), 1) : null,
      wear:worn.some(value => value !== null) ? worn : null, compound:rear && rear !== front ? `${front} / ${rear}` : front || null});
  }
  if (!laps.length) throw Error('Aucun tour roulé dans ce fichier.');
  const at = Number.parseInt(tag(text, 'DateTime'), 10);
  return {at:Number.isFinite(at) ? at * 1000 : null, venue:tag(text, 'TrackVenue'), course:tag(text, 'TrackCourse'), kind,
    car:tag(player, 'CarType') || tag(player, 'VehName'), carClass:tag(player, 'CarClass'), driver:tag(player, 'Name'), laps};
}

const median = values => { const list = values.filter(value => value !== null && value !== undefined).sort((a, b) => a - b); return list.length ? (list[Math.floor((list.length - 1) / 2)] + list[Math.ceil((list.length - 1) / 2)]) / 2 : null; };
const spread = values => { const middle = median(values); return middle === null ? null : median(values.map(value => Math.abs(value - middle))); };

// A clean lap: timed, no stop, not the first lap nor the lap out of the pits, and not a spin (over 107 % of the median).
export function cleanLaps(session) {
  const timed = session.laps.filter(lap => lap.t);
  const limit = (median(timed.map(lap => lap.t)) || Infinity) * 1.07;
  return session.laps.map((lap, index) => ({...lap, clean:Boolean(lap.t && !lap.pit && index > 0 && !session.laps[index - 1].pit && lap.t <= limit)}));
}

// Everything the guide needs about the pilot on one track (and one car class), over his sessions.
export function analyse(sessions) {
  const list = [...sessions].sort((a, b) => (a.at || 0) - (b.at || 0));
  let totalLaps = 0, longest = [], pitDone = false;
  const clean = [];
  for (const session of list) {
    const laps = cleanLaps(session);
    totalLaps += laps.filter(lap => lap.t).length;
    if (laps.some((lap, index) => lap.pit && laps.slice(index + 1).some(next => next.t))) pitDone = true;
    let run = [];
    for (const lap of laps) {
      if (lap.clean) { clean.push(lap); run.push(lap); if (run.length > longest.length) longest = [...run]; }
      else run = [];
    }
  }
  const times = clean.map(lap => lap.t);
  const fuel = median(clean.map(lap => lap.fuel).filter(value => value > 0 && value < 25));
  const energy = median(clean.map(lap => lap.ve).filter(value => value > 0 && value < 25));
  const perLap = Math.max(fuel || 0, energy || 0);
  const sectors = [0, 1, 2].map(index => {
    const values = clean.map(lap => lap.s[index]).filter(Boolean);
    return values.length ? {best:Math.min(...values), median:median(values)} : null;
  });
  // End of a long run against its start: tyres or concentration.
  const third = Math.floor(longest.length / 3);
  const fade = longest.length >= 9 ? median(longest.slice(-third).map(lap => lap.t)) - median(longest.slice(0, third).map(lap => lap.t)) : null;
  const last = list.at(-1);
  return {sessions:list.length, totalLaps, cleanLaps:clean.length, best:times.length ? Math.min(...times) : null, median:median(times),
    regularity:spread(longest.length >= 5 ? longest.map(lap => lap.t) : times), longestRun:longest.length, pitDone,
    fuelPerLap:round(fuel, 2), energyPerLap:round(energy, 2), tankLaps:perLap ? Math.floor(100 / perLap) : null,
    sectors, fade:round(fade, 3), slowShare:totalLaps ? 1 - clean.length / totalLaps : null,
    last:last ? {at:last.at, car:last.car, kind:last.kind, laps:cleanLaps(last).map(lap => ({n:lap.n, t:lap.t, pit:lap.pit, clean:lap.clean}))} : null};
}

// The program: five steps, checked by the laps when the file tells, by the pilot otherwise.
export const STEPS = [
  {key:'discover', title:'Découvrir le circuit', advice:'Roule 4 tours tranquilles. Repère les points de freinage, les cordes et les vibreurs à éviter. Oublie le chrono.'},
  {key:'pace', title:'Trouver son rythme', advice:'Enchaîne 10 tours propres d’affilée. Vise la régularité : moins d’une seconde d’écart d’un tour à l’autre.'},
  {key:'stint', title:'Relais complet', advice:'Roule un plein entier sans t’arrêter, comme en course. Garde un œil sur la conso et l’usure des pneus.'},
  {key:'pit', title:'Arrêt aux stands', advice:'Rentre aux stands, fais le plein et repars. Respecte la limitation de vitesse dans la voie des stands.'},
  {key:'conditions', title:'Nuit et pluie', advice:'Si la course passe la nuit ou sous la pluie, fais quelques tours dans ces conditions avant le départ.'}
];
const fmt = value => value === null || value === undefined ? '' : String(round(value, 1)).replace('.', ',');
export function programSteps(a, marks = []) {
  const stintTarget = a.tankLaps ? Math.max(5, Math.floor(a.tankLaps * 0.9)) : null;
  const checks = {
    discover:[a.totalLaps >= 4, a.totalLaps ? `${a.totalLaps} tour${a.totalLaps > 1 ? 's' : ''} roulé${a.totalLaps > 1 ? 's' : ''}` : ''],
    pace:[a.longestRun >= 10, a.longestRun ? `${a.longestRun} tours propres d’affilée${a.regularity !== null ? `, écart moyen ± ${fmt(a.regularity)} s` : ''}` : ''],
    stint:[Boolean(stintTarget && a.longestRun >= stintTarget), stintTarget ? `Ton plus long relais : ${a.longestRun} tours sur ${a.tankLaps} avec un plein` : a.totalLaps ? 'La conso de tes tours dira la longueur d’un plein' : ''],
    pit:[a.pitDone, a.pitDone ? 'Arrêt aux stands roulé' : ''],
    conditions:[false, '']
  };
  return STEPS.map(step => {
    const [auto, proof] = checks[step.key];
    const manual = marks.includes(step.key);
    return {...step, done:auto || manual, auto, manual, proof:manual && !auto ? 'Coché par toi' : proof};
  });
}

// Advice from the laps: only what the data shows, the most useful first.
export function adviceFor(a, comparison = null) {
  const items = [];
  if (!a.totalLaps) return [{key:'none', title:'Ajoute une séance', text:'Dès qu’une séance LMU arrive, le guide te dit où tu perds du temps et quoi travailler.'}];
  const losses = a.sectors.map((sector, index) => sector ? {index, loss:sector.median - sector.best} : null).filter(Boolean).sort((x, y) => y.loss - x.loss);
  if (losses[0] && losses[0].loss >= 0.25) items.push({key:'sector', title:`Secteur ${losses[0].index + 1} : ${fmt(losses[0].loss)} s à gagner`,
    text:`Ton secteur ${losses[0].index + 1} est en moyenne ${fmt(losses[0].loss)} s plus lent que ton meilleur passage. Refais ce secteur avec les mêmes repères que ce jour-là : même point de freinage, même rapport, même sortie.`});
  if (a.regularity !== null && a.regularity > 0.8) items.push({key:'regularity', title:`Régularité : ± ${fmt(a.regularity)} s`,
    text:'Avant d’aller plus vite, cherche à refaire le même tour. En endurance, un tour régulier vaut mieux qu’un tour rapide suivi d’une erreur.'});
  if (a.fade !== null && a.fade > 0.5) items.push({key:'fade', title:`Fin de relais : + ${fmt(a.fade)} s par tour`,
    text:'Tu ralentis en fin de relais : pneus ou concentration. Évite les glisses en sortie de virage pour garder les pneus, et relâche les mains dans les lignes droites.'});
  if (a.slowShare !== null && a.slowShare > 0.2 && a.totalLaps >= 8) items.push({key:'mistakes', title:`${Math.round(a.slowShare * 100)} % de tours perdus`,
    text:'Beaucoup de tours sont lents, interrompus ou passés aux stands. Roule à 98 % : moins d’erreurs, plus de tours utiles.'});
  if (comparison?.fuelGap > 5) items.push({key:'fuel', title:`Conso : + ${Math.round(comparison.fuelGap)} % que les autres`,
    text:'Tu consommes plus que les autres pilotes du site sur ce circuit. Lève le pied un peu avant le point de freinage dans les grandes lignes droites.'});
  if (!items.length) items.push({key:'good', title:'Rien à signaler', text:'Tes tours sont réguliers et sans perte nette. Continue à rouler des relais complets pour garder le rythme.'});
  return items;
}

// The session for today: built around the first step still to do, for the time the pilot has.
export function todaySession(a, steps, {minutes = 30, daysLeft = null} = {}) {
  const lap = a.median || 120;
  const fit = Math.max(3, Math.floor(minutes * 60 / lap));
  const next = steps.find(step => !step.done);
  const block = (laps, title, tip) => ({laps:Math.max(1, Math.min(laps, fit)), title, tip});
  if (daysLeft !== null && daysLeft <= 1) return {focus:'Veille de course', blocks:[
    block(3, 'Mise en route', 'Tours calmes pour retrouver tes repères.'),
    block(Math.min(8, fit - 3), 'Série régulière', 'Rythme de course, sans chercher le chrono. Pas de nouveau réglage aujourd’hui.')]};
  if (!next || next.key === 'conditions') {
    const sector = a.sectors.map((s, i) => s ? {i, loss:s.median - s.best} : null).filter(Boolean).sort((x, y) => y.loss - x.loss)[0];
    return {focus:next ? 'Nuit et pluie' : 'Entretenir le rythme', blocks:next ? [
      block(3, 'Mise en route', 'Tours calmes, dans les conditions de la course.'),
      block(fit - 3, 'Série dans les conditions', 'Repère les nouveaux points de freinage de nuit ou sous la pluie.')] : [
      block(3, 'Mise en route', 'Tours calmes pour chauffer les pneus.'),
      block(Math.floor((fit - 3) / 2), sector ? `Travail du secteur ${sector.i + 1}` : 'Série rapide', sector ? `Concentre-toi sur le secteur ${sector.i + 1}, où tu perds le plus.` : 'Cherche ton meilleur tour sans erreur.'),
      block(Math.ceil((fit - 3) / 2), 'Série régulière', 'Rythme de course, écart de moins d’une demi-seconde.')]};
  }
  if (next.key === 'discover') return {focus:next.title, blocks:[
    block(4, 'Découverte', 'Lentement : apprends le tracé et les points de freinage.'),
    block(fit - 4, 'Montée en rythme', 'Accélère petit à petit, un virage à la fois.')]};
  if (next.key === 'pace') return {focus:next.title, blocks:[
    block(2, 'Mise en route', 'Deux tours pour chauffer les pneus.'),
    block(10, 'Série de 10 tours', 'Vise le même chrono à une demi-seconde près.'),
    ...(fit >= 24 ? [block(10, 'Deuxième série', 'Même objectif, avec les repères de la première série.')] : [])]};
  if (next.key === 'stint') {
    const target = a.tankLaps || 25;
    return {focus:next.title, blocks:[block(target, fit >= target ? 'Un plein entier' : `Relais le plus long possible`,
      fit >= target ? 'Sans arrêt, au rythme de course. Note où tu perds du temps en fin de relais.' : `Il faut environ ${Math.ceil(target * lap / 60)} min pour un plein : garde du temps un autre jour.`)]};
  }
  return {focus:next.title, blocks:[
    block(5, 'Série avant l’arrêt', 'Au rythme de course.'),
    block(1, 'Arrêt aux stands', 'Plein et réglages de l’arrêt. Respecte la limitation de vitesse.'),
    block(5, 'Série après l’arrêt', 'Remets les pneus en température sans erreur.')]};
}

// Lap time as LMU shows it: 2:05.400.
export function lapLabel(value) {
  if (!value) return '—';
  const minutes = Math.floor(value / 60), rest = value - minutes * 60;
  return `${minutes}:${rest.toFixed(3).padStart(6, '0')}`;
}

// The site's circuits and the names LMU writes in its files.
const VENUES = {bahrain:/bahrain|sakhir/, barcelona:/barcelon|catalun/, cota:/americas|cota/, daytona:/daytona/, fuji:/fuji/,
  imola:/imola|enzo e dino/, interlagos:/interlagos|carlos pace/, 'laguna-seca':/laguna/, 'le-mans':/sarthe|le mans/, 'long-beach':/long beach/,
  lusail:/lusail|qatar|losail/, monza:/monza/, 'paul-ricard':/ricard/, portimao:/algarve|portimao/, 'road-atlanta':/atlanta/, sebring:/sebring/,
  silverstone:/silverstone/, spa:/spa/};
export const circuitOf = venue => Object.entries(VENUES).find(([, pattern]) => pattern.test(normal(venue)))?.[0] || null;

// Live data: what the sync program reads from LMU while the pilot drives (connectors/lmu-sync/live.go), one session
// at a time. Checked here before it is kept: bounded numbers, short texts, nothing else.
const finite = (value, min, max) => { const parsed = Number(value); return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : null; };
const four = (value, min, max) => Array.isArray(value) && value.length === 4 ? value.map(item => finite(item, min, max)) : [null, null, null, null];
const label = (value, size) => String(value ?? '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, size);

export function cleanLive(input) {
  if (!input || typeof input !== 'object' || !Array.isArray(input.laps) || !Array.isArray(input.stops)) throw Error('Séance en direct illisible.');
  const at = finite(input.at, 1_500_000_000_000, 4_000_000_000_000);
  const track = label(input.track, 120), car = label(input.car, 120);
  if (!at || !track || !car) throw Error('Séance en direct incomplète.');
  const laps = input.laps.slice(0, 600).map(lap => ({n:finite(lap?.n, 0, 10000) ?? 0, t:finite(lap?.t, 1, 3600), top:finite(lap?.top, 0, 500),
    fuel:finite(lap?.fuel, 0, 200), ve:finite(lap?.ve, 0, 100), wear:four(lap?.wear, 0, 100), temp:four(lap?.temp, -50, 250), brake:four(lap?.brake, -50, 1500),
    kpa:four(lap?.kpa, 0, 1000), compound:label(lap?.compound, 40), track:finite(lap?.track, -30, 80), air:finite(lap?.air, -30, 60), rain:finite(lap?.rain, 0, 1),
    invalid:lap?.invalid === true, pit:lap?.pit === true, limits:finite(lap?.limits, 0, 255) ?? 0}))
    // A lap LMU counted without a time still tells its fuel and tyres.
    .filter(lap => lap.t || lap.fuel || lap.ve || lap.wear.some(value => value > 0));
  if (!laps.length) throw Error('Aucun tour roulé dans cette séance.');
  const stops = input.stops.slice(0, 60).map(stop => ({lap:finite(stop?.lap, 0, 10000) ?? 0, lane:finite(stop?.lane, 0, 600), stopped:finite(stop?.stopped, 0, 600),
    fuel:finite(stop?.fuel, 0, 200) ?? 0, ve:finite(stop?.ve, 0, 100) ?? 0, tyres:finite(stop?.tyres, 0, 4) ?? 0, repair:stop?.repair === true})).filter(stop => stop.lane && stop.stopped !== null);
  return {at, track, car, carClass:label(input.class, 60), driver:label(input.driver, 60), capacity:finite(input.capacity, 1, 300), laps, stops,
    service:cleanService(input.service), game:cleanGame(input.game)};
}

// The stops broken down: the pit lane without the stop, then each service on its own (a stop with one service only
// tells its time; stops mixing services are kept in the list but not in these times).
export function pitTimes(stops) {
  if (!stops.length) return null;
  const stationary = filter => round(median(stops.filter(filter).map(stop => stop.stopped)), 1);
  const refuels = stops.filter(stop => stop.fuel > 1 && !stop.tyres && !stop.repair && stop.stopped > 0);
  return {stops:stops.length, through:round(median(stops.map(stop => stop.lane - stop.stopped)), 1), lane:round(median(stops.map(stop => stop.lane)), 1),
    tyres4:stationary(stop => stop.tyres === 4 && stop.fuel <= 1 && !stop.repair), tyres2:stationary(stop => stop.tyres === 2 && stop.fuel <= 1 && !stop.repair),
    fuelRate:refuels.length ? round(median(refuels.map(stop => stop.fuel / stop.stopped)), 2) : null, repair:stationary(stop => stop.repair),
    last:stops.slice(-8).reverse()};
}

// Everything the page shows from the live sessions on one track and class: litres, the fuel ratio, tyres, speed, stops.
export function analyseLive(sessions) {
  const list = [...sessions].sort((a, b) => a.at - b.at);
  const laps = list.flatMap(session => session.laps.map(lap => ({...lap, capacity:session.capacity})));
  // A lap that tells the truth about fuel and tyres: on track all the way, no stop.
  const clean = laps.filter(lap => !lap.pit && !lap.invalid);
  const fuel = median(clean.map(lap => lap.fuel).filter(value => value > 0));
  const energy = median(clean.map(lap => lap.ve).filter(value => value > 0));
  const capacity = list.map(session => session.capacity).filter(Boolean).at(-1) || null;
  // LMU's fuel ratio: the share of the tank against the share of energy one lap takes. Set at the stop, the fuel and
  // the energy run out on the same lap, and no fuel is carried for nothing.
  const ratio = fuel && energy && capacity ? fuel / capacity * 100 / energy : null;
  const compounds = [];
  for (const lap of clean) {
    if (!lap.compound) continue;
    let item = compounds.find(entry => entry.name === lap.compound);
    if (!item) compounds.push(item = {name:lap.compound, laps:[]});
    item.laps.push(lap);
  }
  const wheels = (group, field, digits) => [0, 1, 2, 3].map(index => round(median(group.map(lap => lap[field][index]).filter(value => value !== null && value >= 0)), digits));
  return {sessions:list.length, laps:laps.length, fuelPerLap:round(fuel, 2), energyPerLap:round(energy, 2), capacity, ratio:round(ratio, 2),
    tankLaps:fuel && capacity ? Math.floor(capacity / fuel) : null, energyLaps:energy ? Math.floor(100 / energy) : null,
    top:laps.length ? round(Math.max(...laps.map(lap => lap.top || 0)), 1) || null : null, topMedian:round(median(clean.map(lap => lap.top).filter(Boolean)), 1),
    trackTemp:round(median(laps.map(lap => lap.track).filter(value => value !== null)), 1), airTemp:round(median(laps.map(lap => lap.air).filter(value => value !== null)), 1),
    compounds:compounds.map(item => {
      const wear = wheels(item.laps, 'wear', 2), worst = Math.max(...wear.filter(value => value !== null), 0);
      return {name:item.name, laps:item.laps.length, wear, temp:wheels(item.laps, 'temp', 0), brake:wheels(item.laps, 'brake', 0), kpa:wheels(item.laps, 'kpa', 0),
        track:round(median(item.laps.map(lap => lap.track).filter(value => value !== null)), 1), lapsTo50:worst > 0 ? Math.floor(50 / worst) : null};
    }),
    pit:pitTimes(list.flatMap(session => session.stops)),
    last:list.length ? {at:list.at(-1).at, car:list.at(-1).car, laps:list.at(-1).laps.slice(-60)} : null};
}

// Without live data, the results files still tell the tyre wear, the compound and the top speed of each lap.
const NONE = [null, null, null, null];
export function resultsAsLive(sessions) {
  const list = sessions.map(session => ({at:session.at, car:session.car, capacity:null, stops:[],
    laps:session.laps.filter(lap => lap.t && (lap.wear || lap.top)).map(lap => ({n:lap.n, t:lap.t, top:lap.top ?? null, fuel:null, ve:lap.ve ?? null,
      wear:lap.wear || NONE, temp:NONE, brake:NONE, kpa:NONE, compound:lap.compound || '', track:null, air:null, rain:null, invalid:false, pit:lap.pit, limits:0}))}))
    .filter(session => session.laps.length);
  return list.length ? {...analyseLive(list), source:'results'} : null;
}

// What the game says about a car (read by the plugin in LMU's own API): its service times, fixed for everyone who
// drives it, and its forecast for one lap on this track. Bounded numbers only; anything missing stays null.
const SERVICE = {fuelRate:[0.1, 20], energyRate:[0.1, 20], connect:[0, 30], tyres4:[0, 120], tyres2:[0, 120], wing:[0, 300],
  ductFront:[0, 120], ductRear:[0, 120], brakes:[0, 600], driver:[0, 120], repair:[0, 600]};
export function cleanService(input) {
  if (!input || typeof input !== 'object') return null;
  const service = Object.fromEntries(Object.entries(SERVICE).map(([key, [min, max]]) => [key, finite(input[key], min, max)]));
  return service.fuelRate || service.energyRate || service.tyres4 ? service : null;
}
export function cleanGame(input) {
  if (!input || typeof input !== 'object') return null;
  const game = {fuel:finite(input.fuel, 0.01, 50), ve:finite(input.ve, 0.01, 50), ideal:finite(input.ideal, 0, 200)};
  return game.fuel || game.ve || game.ideal ? game : null;
}

// The time stopped, by the game's own rule (checked on real stops): tyres, brakes and brake ducts one after the
// other, plus the longest of fuel, energy, rear wing and driver swap, which are done at the same time.
export function stopTime(service, {fuel = 0, energy = 0, tyres = 0, wing = false, driver = false, ductFront = false, ductRear = false, brakes = false}) {
  const s = service || {};
  const fill = fuel > 0 && s.fuelRate ? (s.connect ?? 2) + fuel / s.fuelRate : 0;
  const charge = energy > 0 && s.energyRate ? energy / s.energyRate : 0;
  const along = Math.max(fill, charge, wing ? s.wing || 0 : 0, driver ? s.driver || 0 : 0);
  const after = (tyres === 4 ? s.tyres4 || 0 : tyres === 2 ? s.tyres2 || 0 : 0) + (ductFront ? s.ductFront || 0 : 0) + (ductRear ? s.ductRear || 0 : 0) + (brakes ? s.brakes || 0 : 0);
  return round(along + after, 1);
}

// The circuit sheet (« mémo », stands.html), the same for everyone: the pit lane of the circuit, the service times of
// the car, and what one lap takes. Fuel, energy and tyres depend on the pilot: each pilot counts once (his median),
// and the sheet shows the median of the pilots with the middle half of them; below the threshold only the viewer's
// own figure and the game's forecast are shown, so that no pilot can be singled out.
const quantile = (list, q) => { if (!list.length) return null; const sorted = [...list].sort((a, b) => a - b), at = (sorted.length - 1) * q, low = Math.floor(at); return sorted[low] + (sorted[Math.ceil(at)] - sorted[low]) * (at - low); };
export const MEMO_MIN = {pilots:3, laps:30};
export function memoSheet({laneStops = [], carStops = [], sessions = [], viewer = null, service = null, game = null, reference = null, min = MEMO_MIN}) {
  const through = laneStops.map(stop => stop.lane - stop.stopped).filter(value => value > 0);
  // Laps that tell the truth: on track, valid, close to the pilot's own pace.
  const byPilot = new Map();
  for (const session of sessions) {
    const entry = byPilot.get(session.user) || {laps:[], capacity:null};
    entry.laps.push(...session.laps.filter(lap => !lap.pit && !lap.invalid));
    entry.capacity = session.capacity || entry.capacity;
    byPilot.set(session.user, entry);
  }
  const pilots = [...byPilot].map(([user, entry]) => {
    const pace = median(entry.laps.map(lap => lap.t).filter(Boolean));
    const laps = entry.laps.filter(lap => !lap.t || !pace || lap.t <= pace * 1.07);
    const compounds = {};
    for (const lap of laps.filter(lap => lap.compound && lap.wear.some(value => value > 0))) (compounds[lap.compound] ||= []).push(lap);
    return {user, laps:laps.length, capacity:entry.capacity, fuel:median(laps.map(lap => lap.fuel).filter(value => value > 0)), ve:median(laps.map(lap => lap.ve).filter(value => value > 0)),
      tyres:Object.fromEntries(Object.entries(compounds).map(([name, list]) => [name, {laps:list.length,
        wear:median(list.map(lap => Math.max(...lap.wear.map(value => value ?? 0)))),
        worst:[0, 1, 2, 3].map(index => median(list.map(lap => lap.wear[index]).filter(value => value !== null)) ?? 0),
        temp:median(list.map(lap => median(lap.temp.filter(value => value !== null))).filter(value => value !== null)),
        track:median(list.map(lap => lap.track).filter(value => value !== null))}]))};
  });
  const mine = pilots.find(pilot => pilot.user === viewer) || null;
  const spread = (values, laps, you, digits) => {
    const list = values.filter(value => value > 0), open = list.length >= min.pilots && laps >= min.laps;
    return {pilots:list.length, laps, you:round(you ?? null, digits), median:open ? round(quantile(list, 0.5), digits) : null,
      low:open ? round(quantile(list, 0.25), digits) : null, high:open ? round(quantile(list, 0.75), digits) : null};
  };
  const lapCount = key => pilots.filter(pilot => pilot[key] > 0).reduce((sum, pilot) => sum + pilot.laps, 0);
  const energy = {...spread(pilots.map(pilot => pilot.ve), lapCount('ve'), mine?.ve, 2), game:game?.ve ?? null};
  const fuel = {...spread(pilots.map(pilot => pilot.fuel), lapCount('fuel'), mine?.fuel, 2), game:game?.fuel ?? null};
  const capacity = median(pilots.map(pilot => pilot.capacity).filter(Boolean));
  const names = [...new Set(pilots.flatMap(pilot => Object.keys(pilot.tyres)))];
  const tyres = names.map(name => {
    const rows = pilots.filter(pilot => pilot.tyres[name]).map(pilot => pilot.tyres[name]);
    const laps = rows.reduce((sum, row) => sum + row.laps, 0), you = mine?.tyres[name] || null;
    const wear = spread(rows.map(row => row.wear), laps, you?.wear, 2), open = wear.median !== null;
    const worst = open ? [0, 1, 2, 3].map(index => median(rows.map(row => row.worst[index]))) : you?.worst;
    return {name, ...wear, worst:worst ? worst.indexOf(Math.max(...worst)) : null, temp:open ? round(median(rows.map(row => row.temp).filter(Boolean)), 0) : null,
      youTemp:round(you?.temp ?? null, 0), track:round(median(rows.map(row => row.track).filter(value => value !== null)), 1), ideal:game?.ideal ?? null};
  }).sort((a, b) => b.laps - a.laps);
  // The figures a stint is planned with: the pilots' median, else the viewer's own, else the game's forecast.
  const pick = item => item.median ?? item.you ?? item.game;
  const ve = pick(energy), litres = pick(fuel), wear = tyres[0] ? tyres[0].median ?? tyres[0].you : null;
  const measured = pitTimes(carStops);
  // Where the viewer's race pace (his median clean lap) stands among the reference levels, and the next one up.
  let levels = null;
  if (reference) {
    const own = byPilot.get(viewer)?.laps.map(lap => lap.t).filter(Boolean) || [];
    const pace = median(own), level = levelOf(pace, reference), index = LEVELS.findIndex(item => item.name === level);
    levels = {track:reference.track, patch:reference.patch, q:reference.q, fastest:reference.fastest || null, bands:levelBands(reference),
      you:pace ? {pace:round(pace, 3), best:round(Math.min(...own), 3), level, next:index > 0 ? {name:LEVELS[index - 1].name, time:reference.pace[LEVELS[index - 1].to]} : null} : null};
  }
  return {levels, lane:through.length ? {through:round(median(through), 1), stops:through.length} : null,
    service:service ? {source:'game', ...service} : measured && (measured.tyres4 || measured.fuelRate) ? {source:'stops', tyres4:measured.tyres4, tyres2:measured.tyres2, fuelRate:measured.fuelRate, repair:measured.repair} : null,
    energy, fuel:{...fuel, ratio:litres && ve && capacity ? round(litres / capacity * 100 / ve, 2) : null}, capacity, tyres,
    stint:{energyLaps:ve ? Math.floor(100 / ve) : null, tankLaps:litres && capacity ? Math.floor(capacity / litres) : null, lapsTo50:wear ? Math.floor(50 / wear) : null},
    min};
}

// Reference lap times (Ohne Speed's « LMU laptimes spreadsheet », shared with credit at the foot of the page): per
// track and class, the qualifying time and the race pace of each level. Its columns go from the alien's race pace to
// the offline driver's; the levels are named, never given in percent.
export const LAPTIME_SOURCE = {name:'Ohne Speed', title:'LMU laptimes spreadsheet', url:'https://www.youtube.com/@ohne_speed',
  csv:'https://docs.google.com/spreadsheets/d/e/2PACX-1vTN03UvJDm99byA6vQPZHKOCYVvfxLu1zkJAzdaKyROykzEKY2-Xl1rl1q5znZEf36m88dxMKsY2eaO/pub?gid=253434982&single=true&output=csv'};
export const LEVELS = [{name:'Alien', from:0, to:0}, {name:'Competitive', from:1, to:1}, {name:'Good', from:2, to:3}, {name:'Midpack', from:4, to:5}, {name:'Tail-ender', from:6, to:6}, {name:'Offline', from:7, to:null}];
const LAPTIME_CLASSES = {LMGT3:'GT3', LMH:'Hypercar', LMP3:'LMP3', LMP2elms:'LMP2 ELMS', LMP2wec:'LMP2', GTE:'GTE'};
const csvRows = text => {
  const rows = []; let row = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) { if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') quoted = false; else cell += c; }
    else if (c === '"') quoted = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
};
const clock = value => { const match = String(value || '').trim().match(/^(?:(\d+):)?(\d{1,2}(?:\.\d+)?)$/); return match ? Number(match[1] || 0) * 60 + Number(match[2]) : null; };
export function parseLaptimes(text) {
  const out = [];
  for (const cells of csvRows(String(text || '').slice(0, 2_000_000))) {
    const [key, track, patch, q, ...rest] = cells.map(cell => cell.trim());
    const suffix = track && key?.startsWith(track) ? key.slice(track.length) : '';
    const carClass = LAPTIME_CLASSES[suffix], pace = rest.slice(0, 8).map(clock);
    if (!carClass || !clock(q) || pace.some(value => !value || value < clock(q) * 0.95 || value > 3600)) continue;
    // The fastest car of the class and its hotlap, when the row gives them (its name ends with the game version).
    const fastest = clock(rest[9]) ? {car:String(rest[8] || '').replace(/\s*\(v[\d.]+\)\s*$/, '').slice(0, 60), time:clock(rest[9])} : null;
    out.push({track:track.slice(0, 80), carClass, patch:patch.slice(0, 20), q:clock(q), pace, fastest, circuit:circuitOf(track)});
  }
  return out;
}
const UPDATED = /Last updated:\s*(\d{4})\.(\d{2})\.(\d{2})/;
export const laptimesUpdated = text => { const match = String(text || '').match(UPDATED); return match ? `${match[1]}-${match[2]}-${match[3]}` : null; };
// The level a race pace belongs to: alien up to the first column, then each level up to its last column.
export function levelOf(pace, reference) {
  if (!pace || !reference) return null;
  return LEVELS.find(level => level.to === null || pace <= reference.pace[level.to])?.name ?? null;
}
// The levels shown on the sheet, end to end like levelOf: each from the previous level's last column to its own.
export function levelBands(reference) {
  return LEVELS.map((level, index) => ({name:level.name, from:index ? reference.pace[LEVELS[index - 1].to] : null, to:level.to === null ? null : reference.pace[level.to]}));
}
// Of a circuit's layouts, the main one: no variant in brackets, else the WEC one.
export function mainLayout(rows) {
  return rows.find(row => !/\(/.test(row.track)) || rows.find(row => /\(wec\)/i.test(row.track)) || rows[0] || null;
}
