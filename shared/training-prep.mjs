// The preparation of each LMU race (server/training-prep.mjs, entrainement.html): a few steps in four parts, each
// with a status the pilot gives (or the sessions prove), and notes shared with the crew. One preparation per race:
// it starts again for the next one, and the last race on the same circuit is shown beside it. The crew plans who
// drives each relay in the last step, the number of relays estimated from the laps and the consumption.
export const PREP_STATUSES = ['done', 'rework', 'todo', 'skip'];
export const PREP_LABELS = {done:'Fait', rework:'À retravailler', todo:'À faire', skip:'Pas besoin'};

// auto: the checklist exercise (shared/training-checklist.mjs) that proves the step from the sessions.
// hints: the beginnings of a note, one click away.
export const PREP_PHASES = [
  {key:'circuit', title:'Le circuit', steps:[
    {key:'discover', title:'Repérer le circuit', tip:'Freinages, trajectoires, zones à risque.', auto:'discover', turns:true, hints:['Freinage :', 'Attention :', 'Point de repère :', 'Pas de souci']},
    {key:'limits', title:'Connaître les limites de piste', tip:'Les vibreurs qui coûtent un avertissement.', turns:true, hints:['Track limit :', 'Vibreur à éviter :', 'Pas de souci']},
    {key:'pit', title:'Entrée et sortie des stands', tip:'Ligne de limitation, emplacement, sortie.', auto:'pit', hints:['Entrée :', 'Sortie :', 'Limiteur :']}]},
  {key:'pace', title:'Rythme et relais', steps:[
    {key:'pace', title:'Tenir un rythme régulier', tip:'10 tours propres, écart moyen sous 1 s.', auto:'pace', hints:['Rythme visé :', 'Difficile en fin de relais']},
    {key:'stint', title:'Faire un relais complet', tip:'Presque un plein sans s’arrêter.', auto:'stint', hints:['Pneus en fin de relais :', 'Fatigue :']},
    {key:'consumption', title:'Connaître ma conso', tip:'Carburant et énergie par tour à mon rythme.', auto:'consumption', hints:['Conso :', 'Économie possible :']},
    {key:'stop', title:'Faire un arrêt complet', tip:'Plein et 4 pneus, puis repartir.', auto:'refuel', memo:true, hints:['Menu de stand :', 'Temps à l’arrêt :']}]},
  {key:'conditions', title:'Conditions de course', steps:[
    {key:'rain', title:'Rouler sous la pluie', tip:'Repères de freinage sur piste mouillée.', auto:'rain', turns:true, hints:['Pneus pluie :', 'Freinage :']},
    {key:'night', title:'Rouler de nuit', tip:'Repères et luminosité, si la course a de la nuit.', turns:true, hints:['Repère de nuit :']},
    {key:'traffic', title:'Gérer le trafic multiclasse', tip:'Laisser passer les plus rapides sans perdre de temps.', turns:true, hints:['Laisser passer :', 'Éviter de doubler :']},
    {key:'start', title:'Préparer le départ', tip:'Pneus froids, premier tour, départ lancé.', turns:true, hints:['Premier virage :']}]},
  {key:'race', title:'Avant la course', steps:[
    {key:'stints', title:'Planifier les relais', tip:'Une estimation pour s’organiser : la course décidera.', auto:'plan', plan:true}]}
];
export const PREP_STEPS = PREP_PHASES.flatMap(phase => phase.steps);
export const NOTE_LIMIT = 280;

// A registration's hours: « whole », or the hours ticked (« h1,h3 », the first hour being h1).
export const availableAt = (status, hour) => status === 'whole' || String(status || '').split(',').includes('h' + (hour + 1));

// How many relays the race takes: a full tank (or energy) of laps at the pilot's pace, with no data a relay of
// 50 minutes. An estimate to share the race between the pilots, the race will change it.
export const RELAY_DEFAULT_MINUTES = 50;
export function estimateRelays({minutes, lap, stintLaps}) {
  const stint = lap > 0 && stintLaps > 0 ? lap * stintLaps / 60 : null;
  const length = stint || RELAY_DEFAULT_MINUTES;
  return {count:Math.max(1, Math.min(60, Math.ceil(minutes / length - 0.15))), laps:stint ? stintLaps : null, lap:stint ? lap : null,
    minutes:Math.round(length)};
}
// The hour of the race (0 = first) a relay mostly falls in, to read the pilots' ticked hours.
export const relayHour = (index, count, minutes) => Math.floor((index + 0.5) * minutes / count / 60);

// A first plan from the hours each pilot ticked: everyone drives about as much, the pilot with fewest relays left
// to give goes first, a relay is doubled when it costs nobody, never tripled, and a relay nobody can drive goes to
// the pilot who drives least. pilots: [{id, status}]; hourOf: relay -> hour of the race.
export function proposeStints(pilots, count, hourOf = index => index) {
  const counts = pilots.map(() => 0), plan = [];
  let previous = -1, run = 0;
  for (let relay = 0; relay < count; relay++) {
    const free = pilots.map((pilot, index) => index).filter(index => availableAt(pilots[index].status, hourOf(relay)));
    const pool = free.length ? free : pilots.map((pilot, index) => index);
    const left = index => Array.from({length:count - relay}, (_, i) => availableAt(pilots[index].status, hourOf(relay + i))).filter(Boolean).length;
    const score = index => index === previous && run >= 2 && pool.length > 1 ? Infinity : counts[index] * 10 + left(index) - (index === previous ? 5 : 0);
    const pick = pool.reduce((best, index) => best < 0 || score(index) < score(best) ? index : best, -1);
    if (pick < 0) { plan.push(null); continue; }
    run = pick === previous ? run + 1 : 1; previous = pick; counts[pick]++;
    plan.push(pilots[pick].id);
  }
  return plan;
}

// A step's status: the pilot's word first, then the sessions' proof, else still to do.
export function prepStatus(step, chosen, proof) {
  if (PREP_STATUSES.includes(chosen)) return chosen;
  return step.auto && proof?.[step.auto] ? 'done' : 'todo';
}

// The next step: what is to rework first, then the first one still to do.
export function nextStep(statuses) {
  return PREP_STEPS.find(step => statuses[step.key] === 'rework') || PREP_STEPS.find(step => statuses[step.key] === 'todo') || null;
}

// The race's class against LMU's: « Hypercar » is « Hyper » in the game, « LMP2 WEC » is « LMP2 » or « LMP2_WEC ».
const CLASS_KEYS = {hyper:'hypercar', hypercar:'hypercar', lmh:'hypercar', lmdh:'hypercar', lmp2:'lmp2wec', lmp2wec:'lmp2wec', lmp2elms:'lmp2elms',
  lmp3:'lmp3', gt3:'gt3', lmgt3:'gt3', gte:'gte', lmgte:'gte'};
export const classKey = value => { const key = String(value || '').toLowerCase().replace(/[^a-z0-9]/g, ''); return CLASS_KEYS[key] || key; };
export const sameClass = (a, b) => !!a && !!b && classKey(a) === classKey(b);

// « 1:42.3 », « 1:42,318 » or « 102.3 » -> seconds; a lap the pilot types when the game is not linked.
export function parseLap(value) {
  const text = String(value ?? '').trim().replace(',', '.');
  const match = /^(?:(\d{1,2}):)?(\d{1,3}(?:\.\d{1,3})?)$/.exec(text);
  if (!match) return null;
  const seconds = Number(match[1] || 0) * 60 + Number(match[2]);
  return seconds >= 20 && seconds <= 900 ? Math.round(seconds * 1000) / 1000 : null;
}
