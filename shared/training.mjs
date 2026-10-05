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

// One results file → the player's session, or an error the pilot can understand. Online, LMU marks every driver as
// the player: the pilot is then the one named as in LMU (names, from the sync program or the site account), on the
// car or in its driver swaps.
export function parseResults(xml, names = []) {
  const text = String(xml || '');
  if (!/<rFactorXML\b/.test(text) || !/<RaceResults>/.test(text)) throw Error('Ce fichier n’est pas un fichier de résultats LMU.');
  const kind = (text.match(SESSION_TAGS) || [])[1] || '';
  const drivers = text.split('<Driver>').slice(1).map(part => part.split('</Driver>')[0]);
  const players = drivers.filter(driver => /<isPlayer>\s*1\s*<\/isPlayer>/.test(driver));
  const wanted = names.map(normal).filter(Boolean);
  const named = driver => wanted.includes(normal(tag(driver, 'Name')));
  const swapped = driver => [...driver.matchAll(/<Swap\b[^>]*>([^<]*)<\/Swap>/g)].some(match => wanted.includes(normal(decode(match[1]))));
  const player = players.length === 1 ? players[0] : players.find(named) || players.find(swapped);
  if (!player && players.length > 1) throw Error('Séance en ligne : ton nom LMU n’apparaît pas parmi les pilotes de ce fichier.');
  if (!player) throw Error('Ton pilote n’apparaît pas dans ce fichier.');
  const laps = [];
  let previousFuel = null, previousEnergy = null;
  for (const match of player.matchAll(/<Lap\b([^>]*)>([^<]*)<\/Lap>/g)) {
    const attributes = Object.fromEntries([...match[1].matchAll(/([A-Za-z0-9]+)="([^"]*)"/g)].map(([, key, value]) => [key.toLowerCase(), value]));
    const pit = attributes.pit === '1';
    const fuel = percent(attributes.fuel), energy = percent(attributes.ve);
    // Used on the lap: written by LMU when it is, else what left the tank since the last lap (never across a stop).
    const fuelUsed = attributes.fuelused !== undefined ? percent(attributes.fuelused) : !pit && previousFuel !== null && fuel !== null && previousFuel >= fuel ? previousFuel - fuel : null;
    const energyUsed = attributes.veused !== undefined ? percent(attributes.veused) : !pit && previousEnergy !== null && energy !== null && previousEnergy >= energy ? previousEnergy - energy : null;
    previousFuel = fuel; previousEnergy = energy;
    laps.push({n:Number.parseInt(attributes.num, 10) || laps.length + 1, t:seconds(match[2]), s:[seconds(attributes.s1), seconds(attributes.s2), seconds(attributes.s3)],
      pit, fuel:round(fuelUsed, 2), ve:round(energyUsed, 2)});
  }
  if (!laps.length) throw Error('Aucun tour roulé dans ce fichier.');
  const at = Number.parseInt(tag(text, 'DateTime'), 10);
  return {at:Number.isFinite(at) ? at * 1000 : null, venue:tag(text, 'TrackVenue'), course:tag(text, 'TrackCourse'), kind,
    car:tag(player, 'CarType') || tag(player, 'VehName'), carClass:tag(player, 'CarClass'), laps};
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
    invalid:lap?.invalid === true, pit:lap?.pit === true, limits:finite(lap?.limits, 0, 255) ?? 0})).filter(lap => lap.t);
  if (!laps.length) throw Error('Aucun tour roulé dans cette séance.');
  const stops = input.stops.slice(0, 60).map(stop => ({lap:finite(stop?.lap, 0, 10000) ?? 0, lane:finite(stop?.lane, 0, 600), stopped:finite(stop?.stopped, 0, 600),
    fuel:finite(stop?.fuel, 0, 200) ?? 0, ve:finite(stop?.ve, 0, 100) ?? 0, tyres:finite(stop?.tyres, 0, 4) ?? 0, repair:stop?.repair === true})).filter(stop => stop.lane && stop.stopped !== null);
  return {at, track, car, carClass:label(input.class, 60), capacity:finite(input.capacity, 1, 300), laps, stops};
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
