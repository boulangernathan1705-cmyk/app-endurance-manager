// « Mon analyse » (server/combos.mjs, analysisList and analysisSession): one session wheel by wheel, and its best lap on
// the map and along the lap, against a teammate's. Raw measures only, no advice. The page keeps the state; these
// functions draw it and follow the pointer.

const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const known = value => value !== null && value !== undefined && Number.isFinite(Number(value));
const fr = (value, digits = 1) => known(value) ? Number(value).toLocaleString('fr-FR', {minimumFractionDigits:digits, maximumFractionDigits:digits}) : '—';
const lapTime = seconds => known(seconds) ? `${Math.floor(seconds / 60)}:${(seconds % 60).toFixed(3).padStart(6, '0').replace('.', ',')}` : '—';
const signed = (value, digits = 2) => known(value) ? `${value > 0 ? '+' : value < 0 ? '−' : ''}${fr(Math.abs(value), digits)}` : '—';

export const METRICS = {speed:'Vitesse', brake:'Freinage', throttle:'Accélérateur', gear:'Rapport', temp:'Temp. pneus', lock:'Blocages', ride:'Hauteur', delta:'Écart'};
const WHEEL_NAMES = ['Avant gauche', 'Avant droit', 'Arrière gauche', 'Arrière droit'];
const WHEEL_SHORT = ['AVG', 'AVD', 'ARG', 'ARD'];
// The lap in stretches of the same length (the last one shorter), 450 m unless chosen: short enough to show where a
// corner is won or lost. The right length depends on the track.
export const PORTIONS = [200, 300, 450, 600];
const zoneCount = (length, size) => Math.max(1, Math.ceil(length / size));
// A wheel turning 15 % slower than the ground under it is locking; 15 % faster, spinning.
const LOCK = -0.15, SPIN = 0.15;

// ---------- The trace along the lap ----------

// Distances from the line, never going back: the first samples can still read the end of the previous lap.
export function prepare(trace) {
  if (!trace?.time?.length || !trace.dist?.length) return null;
  const dist = trace.dist.slice(), end = Math.max(...dist);
  for (let i = 0; i < Math.min(dist.length, 50) && dist[i] > end * 0.5; i++) dist[i] = 0;
  for (let i = 1; i < dist.length; i++) if (dist[i] < dist[i - 1]) dist[i] = dist[i - 1];
  return {...trace, dist, length:dist[dist.length - 1]};
}

// The sample just before a distance, and how far towards the next one.
function at(trace, d) {
  const list = trace.dist;
  let low = 0, high = list.length - 1;
  if (d <= list[0]) return [0, 0];
  if (d >= list[high]) return [high, 0];
  while (high - low > 1) { const mid = (low + high) >> 1; list[mid] <= d ? low = mid : high = mid; }
  const span = list[high] - list[low];
  return [low, span > 0 ? (d - list[low]) / span : 0];
}
function valueAt(trace, series, d) {
  const [i, f] = at(trace, d);
  const next = series[Math.min(i + 1, series.length - 1)];
  return series[i] + (next - series[i]) * f;
}
const timeAt = (trace, d) => valueAt(trace, trace.time, d);

// The gap to the other lap at each distance (seconds, + = slower than the other).
function gapAt(a, b, d) { return timeAt(a, d) - timeAt(b, d); }

// The lap stretch by stretch: time in each for both, and the lowest speed.
export function zones(a, b, size = 450) {
  const length = b ? Math.min(a.length, b.length) : a.length;
  return Array.from({length:zoneCount(length, size)}, (_, k) => {
    const from = k * size, to = Math.min(length, (k + 1) * size);
    const lowest = trace => { let min = Infinity; for (let i = 0; i < trace.dist.length; i++) if (trace.dist[i] >= from && trace.dist[i] <= to) min = Math.min(min, trace.speed[i]); return Number.isFinite(min) ? min : null; };
    const timeA = timeAt(a, to) - timeAt(a, from), timeB = b ? timeAt(b, to) - timeAt(b, from) : null;
    return {n:k + 1, from, to, timeA, timeB, gap:b ? timeA - timeB : null, minA:lowest(a), minB:b ? lowest(b) : null};
  });
}

// ---------- Colours ----------

const RAMP = ['#2563eb', '#22d3ee', '#a3e635', '#facc15', '#f97316', '#ef4444'];
function ramp(t) {
  const x = Math.max(0, Math.min(1, t)) * (RAMP.length - 1), i = Math.min(RAMP.length - 2, Math.floor(x)), f = x - i;
  const rgb = hex => [1, 3, 5].map(k => parseInt(hex.slice(k, k + 2), 16));
  const [p, q] = [rgb(RAMP[i]), rgb(RAMP[i + 1])];
  return `rgb(${p.map((v, k) => Math.round(v + (q[k] - v) * f)).join(',')})`;
}
const BASE = 'rgba(160,170,168,.45)';
const GEARS = ['#64748b', '#2563eb', '#0891b2', '#16a34a', '#a3e635', '#facc15', '#f97316', '#ef4444', '#db2777'];
const range = list => { let min = Infinity, max = -Infinity; for (const v of list) if (Number.isFinite(v)) { if (v < min) min = v; if (v > max) max = v; } return min <= max ? [min, max] : [0, 1]; };

// Each point of lap A gets a colour key (16 steps on a scale, or a category) and the legend that goes with it.
function colouring(a, b, metric, pick) {
  const n = a.time.length;
  const scale = (series, unit, digits = 0) => {
    const [min, max] = range(series);
    return {keys:series.map(v => Math.round((v - min) / (max - min || 1) * 15)), colour:k => ramp(k / 15), legend:{kind:'ramp', from:`${fr(min, digits)} ${unit}`, to:`${fr(max, digits)} ${unit}`}};
  };
  if (metric === 'speed') return scale(a.speed, 'km/h');
  if (metric === 'temp') return scale(a.temp[pick] || a.temp[0], '°C');
  if (metric === 'ride') return scale(pick >= 2 ? a.rideR : a.rideF, 'mm');
  if (metric === 'brake') return {keys:a.brake.map(v => v > 0.02 ? Math.round(v * 10) : -1), colour:k => k < 0 ? BASE : `rgba(239,68,68,${0.35 + k * 0.065})`,
    legend:{kind:'items', items:[[BASE, 'pas de frein'], ['rgba(239,68,68,.5)', 'freinage léger'], ['rgb(239,68,68)', 'freinage fort']]}};
  if (metric === 'throttle') return {keys:a.throttle.map(v => v > 0.98 ? 10 : Math.round(v * 9)), colour:k => k === 10 ? '#22c55e' : `rgba(250,204,21,${0.2 + k * 0.08})`,
    legend:{kind:'items', items:[['rgba(250,204,21,.25)', 'levé'], ['rgba(250,204,21,.85)', 'partiel'], ['#22c55e', 'à fond']]}};
  if (metric === 'gear') {
    const top = Math.max(...a.gear);
    return {keys:a.gear.map(g => Math.max(0, Math.min(8, g))), colour:k => GEARS[k], legend:{kind:'items', items:Array.from({length:top}, (_, i) => [GEARS[i + 1], `${i + 1}`])}};
  }
  if (metric === 'lock') return {keys:Array.from({length:n}, (_, i) => {
      const slips = a.slip.map(list => list[i]);
      return slips.some(s => s <= LOCK) ? 2 : slips.some(s => s >= SPIN) ? 1 : 0;
    }), colour:k => [BASE, '#f59e0b', '#ef4444'][k], legend:{kind:'items', items:[[BASE, 'roues libres'], ['#f59e0b', 'patinage'], ['#ef4444', 'blocage']]}};
  if (metric === 'delta' && b) {
    // What lap A gains or loses over the 100 metres around each point: green faster, red slower.
    const length = Math.min(a.length, b.length);
    return {keys:a.dist.map(d => {
      if (d > length) return 8;
      const change = gapAt(a, b, Math.min(length, d + 50)) - gapAt(a, b, Math.max(0, d - 50));
      return Math.max(0, Math.min(16, Math.round(8 + change / 0.04 * 8)));
    }), colour:k => k === 8 ? BASE : k < 8 ? `rgba(34,197,94,${0.3 + (8 - k) * 0.0875})` : `rgba(239,68,68,${0.3 + (k - 8) * 0.0875})`,
    legend:{kind:'items', items:[['#22c55e', 'plus rapide'], [BASE, 'égal'], ['#ef4444', 'plus lent']]}};
  }
  return {keys:new Array(n).fill(0), colour:() => BASE, legend:null};
}

// ---------- Drawing ----------

// Seen from above, x to the right and z down, scaled into a 1000-wide box.
function frame(a) {
  const [minX, maxX] = range(a.x), [minZ, maxZ] = range(a.z);
  const size = Math.max(maxX - minX, maxZ - minZ) || 1, k = 940 / size;
  const width = (maxX - minX) * k + 60, height = (maxZ - minZ) * k + 60;
  return {width, height, x:v => 30 + (v - minX) * k, y:v => 30 + (v - minZ) * k};
}

function trackMap(a, b, metric, pick, legs) {
  const f = frame(a), {keys, colour, legend} = colouring(a, b, metric, pick);
  const point = i => `${f.x(a.x[i]).toFixed(1)},${f.y(a.z[i]).toFixed(1)}`;
  const lines = [];
  let start = 0;
  for (let i = 1; i <= keys.length; i++) {
    if (i < keys.length && keys[i] === keys[start]) continue;
    const pts = []; for (let j = start; j <= Math.min(i, keys.length - 1); j++) pts.push(point(j));
    lines.push(`<polyline points="${pts.join(' ')}" stroke="${colour(keys[start])}"/>`);
    start = i;
  }
  const marks = legs.map(zone => {
    const [i] = at(a, (zone.from + zone.to) / 2);
    const tone = zone.gap === null ? '' : zone.gap > 0.005 ? ' is-slow' : zone.gap < -0.005 ? ' is-fast' : '';
    return `<g class="an-zone${tone}" transform="translate(${point(i)})"><circle r="${legs.length > 15 ? 11 : 15}"/><text dy="4"${legs.length > 15 ? ' class="is-small"' : ''}>${zone.n}</text></g>`;
  }).join('');
  const [first] = at(a, 0);
  return {svg:`<svg class="an-map" viewBox="0 0 ${f.width.toFixed(0)} ${f.height.toFixed(0)}" role="img" aria-label="Tracé du tour : ${esc(METRICS[metric])}" data-map>
      <polyline class="an-shadow" points="${a.x.map((_, i) => point(i)).join(' ')}"/>
      <g class="an-lines">${lines.join('')}</g>
      <rect class="an-line" x="${(f.x(a.x[first]) - 3).toFixed(1)}" y="${(f.y(a.z[first]) - 14).toFixed(1)}" width="6" height="28" rx="2"/>
      ${marks}<circle class="an-cursor" r="11" data-cursor hidden/></svg>`, legend};
}

function legendHtml(legend) {
  if (!legend) return '';
  if (legend.kind === 'ramp') return `<div class="an-legend"><span>${esc(legend.from)}</span><i class="an-ramp" style="background:linear-gradient(90deg,${RAMP.join(',')})"></i><span>${esc(legend.to)}</span></div>`;
  return `<div class="an-legend">${legend.items.map(([color, label]) => `<span><i style="background:${color}"></i>${esc(label)}</span>`).join('')}</div>`;
}

// One chart along the lap: one line per pilot (or per series), a 1000 × height box stretched to the width.
function chart(title, unit, length, series, height, size, {min, max, zero} = {}) {
  const all = series.flatMap(s => s.values.filter(Number.isFinite));
  const low = min ?? Math.min(...all), high = max ?? Math.max(...all), span = high - low || 1;
  const y = v => (height - 4 - (v - low) / span * (height - 8)).toFixed(1);
  const lines = series.map(s => `<polyline points="${s.dist.map((d, i) => `${(d / length * 1000).toFixed(1)},${y(s.values[i])}`).join(' ')}" stroke="${s.color}"${s.dashed ? ' stroke-dasharray="6 4"' : ''}/>`).join('');
  const base = zero ? `<line class="an-zero" x1="0" x2="1000" y1="${y(0)}" y2="${y(0)}"/>` : '';
  const ticks = Array.from({length:zoneCount(length, size) - 1}, (_, k) => { const x = ((k + 1) * size / length * 1000).toFixed(1); return `<line class="an-tick" x1="${x}" x2="${x}" y1="0" y2="${height}"/>`; }).join('');
  return `<div class="an-chart"><div class="an-chart-head"><b>${esc(title)}</b><span>${esc(fr(high, unit === 's' ? 2 : 0))} ${esc(unit)} / ${esc(fr(low, unit === 's' ? 2 : 0))} ${esc(unit)}</span></div>
    <svg viewBox="0 0 1000 ${height}" preserveAspectRatio="none" data-chart="${length}">${ticks}${base}<g class="an-plot">${lines}</g><line class="an-cursor-line" x1="0" x2="0" y1="0" y2="${height}" data-cursor-line hidden/></svg></div>`;
}

function charts(a, b, colorA, colorB, size) {
  const length = b ? Math.min(a.length, b.length) : a.length;
  const both = (key, extra = {}) => [{dist:a.dist, values:a[key], color:colorA, ...extra}, ...(b ? [{dist:b.dist, values:b[key], color:colorB, dashed:true}] : [])];
  let gap = '';
  if (b) {
    const dist = [], values = [];
    for (let d = 0; d <= length; d += 10) { dist.push(d); values.push(gapAt(a, b, d)); }
    gap = chart('Écart cumulé', 's', length, [{dist, values, color:colorA}], 110, size, {zero:true});
  }
  return `${chart('Vitesse', 'km/h', length, both('speed'), 170, size)}${gap}
    ${chart('Accélérateur', '%', length, both('throttle').map(s => ({...s, values:s.values.map(v => v * 100)})), 70, size, {min:0, max:100})}
    ${chart('Frein', '%', length, both('brake').map(s => ({...s, values:s.values.map(v => v * 100)})), 70, size, {min:0, max:100})}
    <div class="an-axis">${Array.from({length:zoneCount(length, size)}, (_, k) => k % 5 === 0 ? `<span style="left:${((k + 0.5) * size / length * 100).toFixed(2)}%">${k + 1}</span>` : '').join('')}</div>`;
}

// ---------- The session in figures ----------

function summary(sides) {
  const cell = (label, value) => `<div><span>${esc(label)}</span><b>${value}</b></div>`;
  return `<div class="an-summary">${sides.map(side => {
    const l = side.data.laps;
    return `<div class="an-side" style="--dc:${esc(side.color)}"><div class="an-side-name"><i></i>${esc(side.label)}</div><div class="an-figures">
      ${cell('Tours propres', l.count)}${cell('Meilleur', lapTime(l.best))}${cell('Moyenne', lapTime(l.avg))}${cell('Écart', `${fr(l.spread, 3)} s`)}
      ${cell('Énergie / tour', `${fr(l.ve, 2)} %`)}${cell('Vitesse max', `${fr(l.top, 0)} km/h`)}${cell('Tour tracé', side.trace ? `n° ${side.data.trace.lap} · ${lapTime(side.data.trace.lapTime)}` : 'aucun')}</div></div>`;
  }).join('')}</div>`;
}

const EXPERT_ROWS = [['Temp. bande', 'tyreTemp', 'tyreTempMax', '°C', 1, 'max'], ['Pression', 'kpa', 'kpaMax', 'kPa', 1, 'max'],
  ['Écart int. − ext.', 'spread', 'spreadMin', '°C', 1, 'min'], ['Freins', 'brake', 'brakeMax', '°C', 0, 'max'],
  ['Hauteur', 'ride', 'rideMin', 'mm', 1, 'min'], ['Pneu restant', 'tyreLeft', null, '%', 1, '']];

function expert(sides) {
  const withData = sides.filter(side => side.data.expert);
  if (!withData.length) return `<section><div class="cb-head"><h2>Mode expert</h2></div><p class="cb-empty">Pas de mesures roue par roue pour cette séance : elles arrivent avec le plugin 1.2.</p></section>`;
  const head = `<tr><th>Mesure</th>${withData.map(side => `<th colspan="2" class="an-who" style="--dc:${esc(side.color)}"><i></i>${esc(side.short)}</th>`).join('')}</tr>`;
  const sub = `<tr class="an-sub"><th></th>${withData.map(() => '<th>moy.</th><th>extr.</th>').join('')}</tr>`;
  const wheel = index => `<div class="cb-tyre"><div class="cb-tyre-name">${WHEEL_NAMES[index]}</div><table><thead>${head}${sub}</thead><tbody>${EXPERT_ROWS.map(([label, mean, extreme, unit, digits, word]) =>
    `<tr><td>${esc(label)} <small>${esc(unit)}</small></td>${withData.map(side => `<td>${fr(side.data.expert[mean]?.[index], digits)}</td><td title="${esc(word)}">${extreme ? fr(side.data.expert[extreme]?.[index], digits) : ''}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  const engine = `<div class="cb-tyre"><div class="cb-tyre-name">Moteur</div><table><thead>${head}${sub}</thead><tbody>${[['Huile', 'oil', 'oilMax'], ['Eau', 'water', 'waterMax']].map(([label, mean, extreme]) =>
    `<tr><td>${label} <small>°C</small></td>${withData.map(side => `<td>${fr(side.data.expert[mean])}</td><td>${fr(side.data.expert[extreme])}</td>`).join('')}</tr>`).join('')}
    <tr><td>Temps mesuré</td>${withData.map(side => `<td colspan="2">${fr(side.data.expert.samples / 600, 0)} min</td>`).join('')}</tr></tbody></table></div>`;
  return `<section><div class="cb-head"><h2>Mode expert</h2><span class="cb-src">en piste au-dessus de 60 km/h · extrêmes sur une moyenne d'une seconde</span></div>
    <div class="an-wheels">${[0, 1, 2, 3].map(wheel).join('')}${engine}</div></section>`;
}

function zoneTable(legs, sides) {
  const [a, b] = sides;
  return `<div class="cb-wrap"><table class="an-zones"><thead><tr><th>Portion</th><th class="an-who" style="--dc:${esc(a.color)}"><i></i>${esc(a.short)}</th>${b ? `<th class="an-who" style="--dc:${esc(b.color)}"><i></i>${esc(b.short)}</th><th>Écart</th>` : ''}<th>V. mini</th></tr></thead>
    <tbody>${legs.map(zone => `<tr data-zone="${zone.from}"><td>${zone.n}</td><td>${fr(zone.timeA, 2)} s</td>${b ? `<td>${fr(zone.timeB, 2)} s</td><td class="${zone.gap > 0.005 ? 'an-slow' : zone.gap < -0.005 ? 'an-fast' : ''}">${signed(zone.gap)} s</td>` : ''}
      <td>${fr(zone.minA, 0)}${b ? ` / ${fr(zone.minB, 0)}` : ''}</td></tr>`).join('')}
    ${b ? `<tr class="cb-crew"><td>Tour</td><td>${lapTime(a.trace.lapTime)}</td><td>${lapTime(b.trace.lapTime)}</td><td class="${legs.reduce((s, z) => s + z.gap, 0) > 0 ? 'an-slow' : 'an-fast'}">${signed(legs.reduce((s, z) => s + z.gap, 0))} s</td><td></td></tr>` : ''}</tbody></table></div>`;
}

// Every lap of the session looked at and whether it counts: its pilot takes a test lap out, or puts it back.
const OUT = {'':'compté', slow:'trop lent', pit:'stand', invalid:'invalide', untimed:'sans chrono', ignored:'retiré', short:'relais court'};
function lapList(side) {
  const list = side.data.list || [];
  if (!list.length) return '';
  const mine = side.data.session.mine, counted = list.filter(lap => !lap.out).length;
  const action = lap => !mine ? '' : `<td><button type="button" class="cb-btn is-quiet an-ignore" data-ignore="${lap.n}" data-back="${lap.out === 'ignored' ? '1' : ''}">${lap.out === 'ignored' ? 'Remettre' : 'Retirer'}</button></td>`;
  const all = mine ? `<div class="cb-actions">${list.some(lap => lap.out !== 'ignored') ? '<button type="button" class="cb-btn is-quiet" data-ignore="all">Retirer toute la séance</button>' : ''}${list.some(lap => lap.out === 'ignored') ? '<button type="button" class="cb-btn is-quiet" data-ignore="all" data-back="1">Tout remettre</button>' : ''}</div>` : '';
  return `<details class="cb-card an-laps" data-fold="laps"${side.lapsOpen === false ? '' : ' open'}><summary>Tours de la séance<span>${counted} compté${counted > 1 ? 's' : ''} sur ${list.length}</span></summary>
    <p class="cb-src">${mine ? 'Un relais de moins de 3 tours chronométrés ne compte pas, sauf ton meilleur tour. Un autre tour de test ou pas roulé pour de vrai : retire-le, il reste enregistré mais ne compte plus dans les fiches ni dans l’analyse.' : 'Seul le pilote de la séance peut retirer ses tours.'}</p>
    <div class="cb-wrap"><table><thead><tr><th>Tour</th><th>Temps</th><th>S1</th><th>S2</th><th>S3</th><th>Énergie (%)</th><th>Carbu (L)</th><th>Gomme</th><th>État</th>${mine ? '<th></th>' : ''}</tr></thead>
    <tbody>${list.map(lap => `<tr class="${lap.out ? 'an-out' : ''}"><td>${lap.n}</td><td>${lapTime(lap.t)}</td><td>${fr(lap.s1, 3)}</td><td>${fr(lap.s2, 3)}</td><td>${fr(lap.s3, 3)}</td><td>${fr(lap.ve, 2)}</td><td>${fr(lap.fuel, 2)}</td><td>${esc(lap.compound || '')}</td><td>${OUT[lap.out] ?? esc(lap.out)}</td>${action(lap)}</tr>`).join('')}</tbody></table></div>${all}</details>`;
}

// The whole tab below its choices. sides: [mine, other?], each {data, trace (prepared), color, label, short}.
export function analysisBody(sides, metric, pick, size = 450) {
  const [a, b] = sides;
  const lap = a.trace ? (() => {
    const legs = zones(a.trace, b?.trace || null, size);
    const usable = metric === 'delta' && !b?.trace ? 'speed' : metric;
    const map = trackMap(a.trace, b?.trace || null, usable, pick, legs);
    const picks = usable === 'temp' ? WHEEL_SHORT.map((label, i) => [i, label]) : usable === 'ride' ? [[0, 'Avant'], [2, 'Arrière']] : [];
    return `<section><div class="cb-head"><h2>Analyse du tour</h2><label class="an-size">Portions de <select data-field="an-size">${PORTIONS.map(value => `<option value="${value}"${value === size ? ' selected' : ''}>${value} m</option>`).join('')}</select></label></div>
      <div class="an-metrics" role="group" aria-label="Couleur du tracé">${Object.entries(METRICS).filter(([key]) => key !== 'delta' || b?.trace).map(([key, label]) => `<button type="button" data-metric="${key}" aria-pressed="${key === usable}">${esc(label)}${key === 'delta' ? ` avec ${esc(b.short)}` : ''}</button>`).join('')}</div>
      ${picks.length ? `<div class="an-picks" role="group" aria-label="Roue">${picks.map(([value, label]) => `<button type="button" data-pick="${value}" aria-pressed="${value === pick || (usable === 'ride' && value === (pick >= 2 ? 2 : 0))}">${label}</button>`).join('')}</div>` : ''}
      <div class="an-lap"><div class="an-map-box">${map.svg}${legendHtml(map.legend)}<p class="an-readout" data-readout>Survole le tracé ou les courbes pour lire chaque point.</p></div>
      <div>${zoneTable(legs, b?.trace ? sides : [a])}</div></div>
      <div class="an-charts">${charts(a.trace, b?.trace || null, a.color, b?.color, size)}</div></section>`;
  })() : `<section><div class="cb-head"><h2>Analyse du tour</h2></div><p class="cb-empty">Pas de tracé pour cette séance : le plugin 1.2 enregistre le meilleur tour propre de chaque séance.</p></section>`;
  return `${summary(sides)}${lapList(a)}${lap}${expert(sides)}`;
}

// ---------- Following the pointer ----------

// The point at a distance into the lap, on the map, the charts and the readout.
export function showCursor(root, sides, d) {
  const [a, b] = sides;
  if (!a?.trace) return;
  const length = b?.trace ? Math.min(a.trace.length, b.trace.length) : a.trace.length;
  d = Math.max(0, Math.min(length, d));
  const map = root.querySelector('[data-map]');
  if (map) {
    const f = frame(a.trace), cursor = map.querySelector('[data-cursor]');
    cursor.setAttribute('cx', f.x(valueAt(a.trace, a.trace.x, d)).toFixed(1));
    cursor.setAttribute('cy', f.y(valueAt(a.trace, a.trace.z, d)).toFixed(1));
    cursor.removeAttribute('hidden');
  }
  for (const line of root.querySelectorAll('[data-cursor-line]')) { line.setAttribute('x1', d / length * 1000); line.setAttribute('x2', d / length * 1000); line.removeAttribute('hidden'); }
  const readout = root.querySelector('[data-readout]');
  if (!readout) return;
  const [i] = at(a.trace, d);
  const one = side => {
    const [j] = at(side.trace, d), t = side.trace;
    return `<span style="--dc:${esc(side.color)}"><i></i>${esc(side.short)} <b>${fr(valueAt(t, t.speed, d), 0)} km/h</b> · R${t.gear[j]} · gaz ${fr(t.throttle[j] * 100, 0)} % · frein ${fr(t.brake[j] * 100, 0)} %</span>`;
  };
  const temps = WHEEL_SHORT.map((label, w) => `${label} ${fr(a.trace.temp[w][i], 0)}`).join(' · ');
  readout.innerHTML = `<b>${fr(d, 0)} m</b>${one(a)}${b?.trace ? one(b) + `<span>écart <b>${signed(gapAt(a.trace, b.trace, d))} s</b></span>` : ''}<span class="an-temps">pneus ${esc(temps)} °C</span>`;
}

// The distance under the pointer: along a chart, or the closest point of lap A on the map.
export function distanceUnder(event, sides) {
  const a = sides[0]?.trace;
  if (!a) return null;
  const chartBox = event.target.closest('[data-chart]');
  if (chartBox) {
    const box = chartBox.getBoundingClientRect();
    return (event.clientX - box.left) / box.width * Number(chartBox.dataset.chart);
  }
  const map = event.target.closest('[data-map]');
  if (!map) return null;
  const matrix = map.getScreenCTM?.();
  if (!matrix) return null;
  const p = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
  const f = frame(a);
  let best = Infinity, index = 0;
  for (let i = 0; i < a.x.length; i += 2) {
    const dx = f.x(a.x[i]) - p.x, dy = f.y(a.z[i]) - p.y, s = dx * dx + dy * dy;
    if (s < best) { best = s; index = i; }
  }
  return best < 60 * 60 ? a.dist[index] : null;
}
