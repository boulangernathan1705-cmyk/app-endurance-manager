// Memo v2: factual measurements and arithmetic only. Unknown is never zero.
export const METRICS = {
  lapSeconds:{label:'Chrono moyen', unit:'s', max:3600},
  fuelLitres:{label:'Carburant en litres', unit:'L/tour', max:100},
  fuelPercent:{label:'Carburant en pourcentage', unit:'%/tour', max:100},
  energyPercent:{label:'Énergie virtuelle', unit:'%/tour', max:100},
  wearFL:{label:'Pneu avant gauche', unit:'%/tour', max:100},
  wearFR:{label:'Pneu avant droit', unit:'%/tour', max:100},
  wearRL:{label:'Pneu arrière gauche', unit:'%/tour', max:100},
  wearRR:{label:'Pneu arrière droit', unit:'%/tour', max:100},
  pitTransit:{label:'Traversée sans arrêt', unit:'s', max:1800},
  pitLoss:{label:'Perte de passage par rapport à la piste', unit:'s', max:1800}
};
export const SERVICES = {fuel:'Ravitaillement', tyres2:'Deux pneus', tyres4:'Quatre pneus', driver:'Changement de pilote', brakes:'Changement des freins', wing:'Remplacement de l’aileron', repair:'Autres réparations'};
export const SCOPE_FIELDS = ['circuit','layout','car','weather','compound','gameVersion'];
export const scopeKey = scope => JSON.stringify(SCOPE_FIELDS.map(key => scope[key]));
export const pitKey = scope => JSON.stringify(['circuit','layout','car','gameVersion'].map(key => scope[key]));
export const present = value => typeof value === 'number' && Number.isFinite(value);
const mean = values => values.reduce((sum, value) => sum + value, 0) / values.length;

// One session's observed mean per metric, with its own number of valid laps/observations.
// Values must already be measured by a connector; no claim that LMU exposes every one of them.
export function cleanMetrics(input) {
  const out = {};
  for (const [key, spec] of Object.entries(METRICS)) {
    const item = input?.[key];
    if (item == null) continue;
    if (!present(item.value) || item.value < 0 || item.value > spec.max || !Number.isInteger(item.count) || item.count < 1 || item.count > 2000 || (key === 'lapSeconds' && item.value < 10)) throw Error(`Mesure invalide : ${key}.`);
    out[key] = {value:item.value, count:item.count};
  }
  if (!Object.keys(out).length) throw Error('Aucune mesure exploitable.');
  return out;
}

export function pilotSummary(rows) {
  const values = {};
  for (const key of Object.keys(METRICS)) {
    const samples = rows.map(row => row.metrics[key]).filter(Boolean);
    const observations = samples.reduce((sum, item) => sum + item.count, 0);
    // Five valid laps for driving metrics; a complete pit passage is one observation.
    if (observations < (key.startsWith('pit') ? 1 : 5)) continue;
    values[key] = {value:samples.reduce((sum, item) => sum + item.value * item.count, 0) / observations, observations};
  }
  return values;
}

// Equal weight per pilot, not per uploaded lap. Last five sessions for each exact scope.
export function collective(rows, excludeUser = null, minimum = 3) {
  const pilots = new Map();
  for (const row of rows) {
    if (row.user_id === excludeUser) continue;
    const list = pilots.get(row.user_id) || [];
    if (list.length < 5) list.push(row);
    pilots.set(row.user_id, list);
  }
  const summaries = [...pilots.values()].map(pilotSummary), metrics = {};
  for (const key of Object.keys(METRICS)) {
    const samples = summaries.map(summary => summary[key]).filter(Boolean);
    if (samples.length < minimum) continue;
    const values = samples.map(item => item.value);
    metrics[key] = {value:mean(values), min:Math.min(...values), max:Math.max(...values), pilots:values.length, observations:samples.reduce((sum, item) => sum + item.observations, 0)};
  }
  return {metrics, pilots:pilots.size};
}

export function autonomy(metrics, {fuelLitres = null, energyPercent = null} = {}) {
  const fuel = metrics?.fuelLitres?.value, energy = metrics?.energyPercent?.value;
  const limits = [];
  if (present(fuelLitres) && fuelLitres >= 0 && fuel > 0) limits.push({kind:'fuel', tours:fuelLitres / fuel});
  if (present(energyPercent) && energyPercent >= 0 && energy > 0) limits.push({kind:'energy', tours:energyPercent / energy});
  if (!limits.length) return null;
  const limiting = limits.reduce((a,b) => a.tours < b.tours ? a : b);
  const laps = Math.floor(limiting.tours + 1e-9), lap = metrics?.lapSeconds?.value;
  return {laps, seconds:lap > 0 ? laps * lap : null, limiting:limiting.kind, basedOn:limits.map(item => item.kind)};
}

// Explicit verified dependencies, not a sum or a fixed sequence. A driver swap can
// overlap several successive services. No default pit rules are assumed.
export function cleanPitProfile(input) {
  if (!input || typeof input.source !== 'string' || input.source.trim().length < 3 || input.source.length > 200) throw Error('Précise la source de la mesure.');
  const out = {source:input.source.trim(), services:{}};
  for (const key of ['pitTransit','pitLoss']) {
    const value = input[key];
    if (value == null) continue;
    if (!present(value) || value < 0 || value > 1800) throw Error('Durée de passage invalide.');
    out[key] = value;
  }
  for (const [key, service] of Object.entries(input.services || {})) {
    if (!SERVICES[key] || !Array.isArray(service.after) || service.after.some(dep => !SERVICES[dep] || dep === key) || new Set(service.after).size !== service.after.length) throw Error('Ordre des services invalide.');
    if (key === 'fuel') {
      if (!['litres','energyPercent'].includes(service.basis) || !present(service.fixed) || !present(service.perUnit) || service.fixed < 0 || service.fixed > 300 || service.perUnit <= 0 || service.perUnit > 120) throw Error('Débit de ravitaillement invalide.');
      out.services[key] = {after:service.after, basis:service.basis, fixed:service.fixed, perUnit:service.perUnit};
    } else {
      if (!present(service.seconds) || service.seconds < 0 || service.seconds > 3600) throw Error('Durée de service invalide.');
      out.services[key] = {after:service.after, seconds:service.seconds};
    }
  }
  const visit = (key, stack = []) => {
    if (stack.includes(key)) throw Error('Ordre des services cyclique.');
    for (const dep of out.services[key]?.after || []) {
      if (!out.services[dep]) throw Error('Service dépendant non documenté.');
      visit(dep, [...stack, key]);
    }
  };
  Object.keys(out.services).forEach(key => visit(key));
  return out;
}

export function pitEstimate(profile, selected = [], quantity = null, repairSeconds = null) {
  const durations = new Map(), details = [], missing = [];
  for (const key of [...new Set(selected)]) {
    const service = profile?.services?.[key];
    if (!service) { missing.push(key); continue; }
    let seconds = key === 'fuel' ? present(quantity) && quantity >= 0 ? quantity === 0 ? 0 : service.fixed + quantity * service.perUnit : null : key === 'repair' ? repairSeconds : service.seconds;
    if (!present(seconds) || seconds < 0) { missing.push(key); continue; }
    durations.set(key, seconds);
  }
  if (selected.includes('tyres2') && selected.includes('tyres4')) missing.push('tyres');
  const ends = new Map();
  const finish = (key, stack = []) => {
    if (stack.includes(key)) throw Error('Ordre des services cyclique.');
    if (ends.has(key)) return ends.get(key);
    const after = profile?.services?.[key]?.after || [];
    // An unselected intermediate service still carries its dependencies.
    const start = Math.max(0, ...after.map(dep => finish(dep, [...stack,key])));
    const end = start + (durations.get(key) || 0);
    ends.set(key, end);
    return end;
  };
  for (const [key, seconds] of durations) { const end = finish(key); details.push({key, seconds, start:end-seconds, end}); }
  const stationary = missing.length ? null : Math.max(0, ...details.map(item => item.end));
  return {stationary, loss:stationary !== null && present(profile?.pitLoss) ? stationary + profile.pitLoss : null,
    passage:stationary !== null && present(profile?.pitTransit) ? stationary + profile.pitTransit : null, details, missing};
}
