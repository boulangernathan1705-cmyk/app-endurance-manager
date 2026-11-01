// The morning announcement as a poster (Nathan, 2026-11-01): one picture per message, made once at 7h30 by Cloudflare's
// browser (Browser Rendering, free 10 min/day; a poster takes a few seconds), sent as the message's image. Same facts as
// the text, which stays the fallback when no picture can be made (not set up, quota, outage).
// - The stream's message: the community's banner, « STREAM 13H45 » in big (both times when two streams), the streamer,
//   then each streamed race. The banner only goes with a stream: it shows the streamer, who may not race otherwise.
// - The other message: « AU PROGRAMME AUJOURD'HUI » (« ENDURANCES DU JOUR » with endurances only), no banner.
// - Per race: its sim, OPEN / SAFE / type, its logo (EVENT TDZ), circuit, start, entries (places, waiting list); an
//   endurance gets one line per crew with its pilots (6 at most, then « + N autres »), a Gridfest its streamers.
import {catalogForGame, normalizeTdzEventType} from '../shared/catalog.mjs';
import {durationLabel} from '../shared/duration.mjs';
import {streamPlatform} from '../shared/stream.mjs';

const TIME_ZONE = 'Europe/Paris';
const SIMS = {lmu:['LMU', '#d8322c'], iracing:['iRacing', '#2f6fd6'], ams2:['AMS2', '#f08a24'], ace:['AC EVO', '#2fae5b'], acrally:['AC Rally', '#8b5cf6'], stream:['Stream', '#9146ff']};
const GRIDFEST = '#ff7b00';
const MAX_LINES = 6, MAX_BLOCKS = 6;
const circuitNames = new Map([...catalogForGame('lmu').circuits, ...catalogForGame('iracing').circuits].map(item => [item.id, item.name]));
const clock = new Intl.DateTimeFormat('fr-FR', {timeZone:TIME_ZONE, hour:'2-digit', minute:'2-digit', hourCycle:'h23'});
const longDay = new Intl.DateTimeFormat('fr-FR', {timeZone:TIME_ZONE, weekday:'long', day:'numeric', month:'long'});
const shortDay = new Intl.DateTimeFormat('fr-FR', {timeZone:TIME_ZONE, weekday:'short', day:'numeric', month:'short'});
const weekday = new Intl.DateTimeFormat('fr-FR', {timeZone:TIME_ZONE, weekday:'short'});
const hhmm = timestamp => clock.format(timestamp).replace(':', 'h');
const plural = (count, word) => `${count} ${word}${count > 1 ? 's' : ''}`;
const text = value => String(value ?? '').replace(/[\u0000-\u001f]/g, ' ').trim();
const html = value => text(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
// Discord markdown: a name typed on the site must not become a mention, a link or a title.
const md = value => text(value).replace(/[\\*_~`|[\]<>@#]/g, match => `\\${match}`);
const isGridfest = type => ['Gridfest', 'Grindfest'].includes(type);
const crewLabel = name => /^\d{1,3}$/.test(text(name)) ? `Équipage ${text(name)}` : text(name);
const timeOf = value => /^([01]\d|2[0-3]):[0-5]\d$/.test(String(value || '')) ? String(value).replace(':', 'h') : '';

// A fact is [label, strong]: « 📍 » + « Portimão » in bold.
const roundCircuit = round => text(circuitNames.get(round.circuit) || round.circuit);
function eventBlock(event, url) {
  const sim = SIMS[event.sim] ? event.sim : 'lmu', rounds = Array.isArray(event.rounds) ? event.rounds : [];
  const type = isGridfest(event.type) ? 'Gridfest' : normalizeTdzEventType(event.type);
  const chips = [];
  if (event.tdz && event.access && type !== 'Gridfest') chips.push([event.access.toUpperCase(), 'outline']);
  if (event.tdz && type && !['OPEN', 'SAFE', 'Gridfest'].includes(type)) chips.push([type.toUpperCase(), 'outline']);
  const facts = [], lines = [];
  const random = rounds.some(round => round.randomCategory || ['random', 'iracing-random'].includes(round.circuit));
  const circuits = [...new Set(rounds.map(roundCircuit).filter(Boolean))];
  if (event.rally) {
    const stages = (event.rally.stages || []).map(text).filter(Boolean);
    if (stages.length) facts.push(['🏔️', plural(stages.length, 'spéciale'), stages.join(', ')]);
    const car = event.rally.carMode === 'car' && rounds[0]?.car ? rounds[0].car : event.rally.carMode === 'category' && rounds[0]?.category ? rounds[0].category : '';
    if (car) facts.push(['🚗', text(car), 'imposée']);
    if (event.rally.host) facts.push(['🏠 Hôte', text(event.rally.host)]);
  } else if (random) facts.push(['🎲', 'Circuit et catégorie surprise']);
  else if (circuits.length === 1) facts.push(['📍', circuits[0]]);
  const cars = [...new Set(rounds.map(round => [round.category, round.car].filter(Boolean).map(text).join(' · ')).filter(Boolean))];
  if (!event.rally && !random && cars.length === 1) facts.push(['🚗', cars[0]]);
  facts.push(['🕑 Départ', event.timePending ? 'à confirmer' : hhmm(event.startsAt)]);
  if (type === 'Gridfest') facts.push(['🎙️', plural(event.streamers?.length || 0, 'streamer')]);
  else if (event.capacity) {
    const full = event.entered >= event.capacity, waiting = Math.max(0, event.entered - event.capacity);
    facts.push(['👥', `${Math.min(event.entered, event.capacity)} / ${event.capacity}`, waiting ? `· ${waiting} en attente` : '']);
    if (full) chips.push(['COMPLET', 'red']);
  } else facts.push(['👥', String(event.entered || 0), event.entered > 1 ? 'inscrits' : 'inscrit']);
  // Rounds one after the other: each after the previous one's practice, qualifying and race.
  if (rounds.length > 1 && !event.rally) {
    let at = Number(event.startsAt);
    rounds.forEach((round, index) => {
      lines.push({time:event.timePending ? '' : hhmm(at), label:`Manche ${index + 1}`,
        text:[circuits.length > 1 && roundCircuit(round), round.durationMinutes && `Course de ${durationLabel(round.durationMinutes)}`,
          [round.practice && `essais ${round.practice} min`, round.qualifying && `qualif ${round.qualifying} min`].filter(Boolean).join(' + ')].filter(Boolean).join(' · ')});
      at += ((Number(round.practice) || 0) + (Number(round.qualifying) || 0) + (Number(round.durationMinutes) || 0)) * 60000;
    });
  }
  return {sim, name:event.name, url, logo:event.logoUrl || '', chips, facts, lines,
    streamers:type === 'Gridfest' ? (event.streamers || []).map(item => ({name:item.name, logo:item.logoUrl || '', entered:item.entered, capacity:item.capacity})) : null};
}
function streamBlock(event, url, streamer) {
  const stream = event.stream || {}, facts = [], lines = [];
  if (stream.activity) facts.push(['🎮', text(stream.activity)]);
  if (stream.raceTime) facts.push(['🏁 Course à', timeOf(stream.raceTime)]);
  if (stream.crew) lines.push({time:timeOf(stream.raceTime) || timeOf(stream.streamTime), label:crewLabel(stream.crew.crew), text:[text(stream.crew.eventName), ...(stream.crew.pilots || []).map(text)].filter(Boolean).join(' · '), star:streamer});
  if (!stream.crew && !stream.raceTime) facts.push(['', 'Pas d’inscription : viens regarder !']);
  return {sim:'stream', icon:'🎙️', name:event.name, url, logo:stream.logoUrl || '', chips:[], facts, lines, note:stream.description ? text(stream.description).slice(0, 140) : ''};
}
function raceBlock(race, url) {
  const sim = String(race.circuit || '').startsWith('iracing-') ? 'iracing' : 'lmu';
  const kind = race.eventType === 'lmu' ? 'CHAMPIONNAT' : race.official ? (sim === 'iracing' ? 'SPÉCIALE' : 'OFFICIELLE') : race.eventType === 'private' ? 'PRIVÉE' : '';
  const facts = [['📍', text(circuitNames.get(race.circuit) || race.circuit || 'Circuit à préciser')]];
  if (race.durationMinutes) facts.push(['⏱️', durationLabel(race.durationMinutes)]);
  const departures = race.departures || [];
  const last = departures.at(-1);
  // A race that ends another day (24 h): when.
  if (last?.endsAt && !last.timePending && shortDay.format(last.endsAt) !== shortDay.format(last.startsAt)) facts.push(['🏁 fin', `${weekday.format(last.endsAt)} ${hhmm(last.endsAt)}`]);
  const lines = departures.flatMap(departure => (departure.crews || []).filter(crew => crew.pilots?.length)
    .map(crew => ({time:departure.timePending ? '' : hhmm(departure.startsAt), label:crewLabel(crew.name), text:crew.pilots.map(text).join(' · ')})));
  return {sim, name:race.name, url, chips:kind ? [[kind, 'grey']] : [], facts, lines};
}

// The poster of one message. items: [{kind:'event'|'stream'|'race', data, url}]. site: {name, url, bannerUrl, streamUrl,
// streamName, streams:[{item, time}]}. live: the stream's message.
export function posterModel(items, site, {live = false, timestamp = Date.now()} = {}) {
  const streamUrl = items.find(item => item.kind === 'stream' && item.data.stream?.streamUrl)?.data.stream.streamUrl || site.streamUrl || '';
  const channel = URL.canParse(streamUrl) ? new URL(streamUrl).pathname.split('/').filter(Boolean)[0] || '' : '';
  const streamer = text(items.find(item => item.kind === 'stream' && item.data.stream?.streamerName)?.data.stream.streamerName || site.streamName || channel);
  const blocks = items.slice(0, MAX_BLOCKS).map(item => item.kind === 'race' ? raceBlock(item.data, item.url)
    : item.kind === 'stream' ? streamBlock(item.data, item.url, streamer) : eventBlock(item.data, item.url));
  const model = {day:longDay.format(timestamp).toUpperCase(), blocks, more:Math.max(0, items.length - MAX_BLOCKS), live};
  if (!live) {
    model.head = items.every(item => item.kind === 'race') ? '🏁 ENDURANCES DU JOUR' : '📅 AU PROGRAMME AUJOURD’HUI';
    return model;
  }
  const times = [...new Set(items.map(item => item.kind === 'stream' ? item.data.stream?.streamTime || item.data.stream?.raceTime
    : (site.streams || []).find(stream => stream.item === item.data.id)?.time).map(timeOf).filter(Boolean))].sort();
  const gridfest = items.length === 1 && blocks[0].streamers;
  Object.assign(model, {banner:site.bannerUrl || '', platform:streamPlatform(streamUrl), streamUrl, streamer,
    driving:items.some(item => item.data.stream?.crew)});
  if (gridfest) Object.assign(model, {gridfest:true, big:`GRIDFEST ${hhmm(items[0].data.startsAt).toUpperCase()}`,
    who:`${times[0] ? `stream dès <b>${html(times[0])}</b> · ` : ''}pilote pour ton streamer`});
  else Object.assign(model, {big:times.length ? `STREAM${times.length > 1 ? 'S' : ''} ${times.join(' & ').toUpperCase()}` : 'STREAM',
    who:streamer ? `avec <b>${html(streamer)}</b>${model.driving ? ' au volant' : ''}` : ''});
  return model;
}

const CSS = `*{box-sizing:border-box;margin:0}body{width:1200px;font-family:"Noto Sans","DejaVu Sans","Segoe UI",Arial,sans-serif;color:#fff;background:#0b0d12}
.card{width:1200px;background:linear-gradient(180deg,#141821,#0b0d12);border-left:14px solid var(--c)}
.ban{display:block;width:1186px;height:296px;object-fit:cover}.in{padding:34px 56px 44px;position:relative}
.top{display:flex;align-items:center;gap:14px;font-weight:800;letter-spacing:3px;font-size:22px;color:var(--t)}
.dot{width:16px;height:16px;border-radius:50%;background:#ff4d6d;box-shadow:0 0 18px #ff4d6d}.day{color:#9aa0b0;font-weight:600}
.big{font-size:88px;font-weight:900;line-height:1.05;margin-top:12px;letter-spacing:-1px;max-width:820px}
.gf .big{font-size:80px;background:linear-gradient(90deg,#ffcf4d,#ff7b00);-webkit-background-clip:text;color:transparent}
.who{font-size:32px;font-weight:600;color:#d7d9e0}.who b{color:#b78bff}.gf .who b{color:#ffcf4d}
.logo{position:absolute;right:52px;top:26px;width:190px;height:190px;object-fit:contain}
.blk{margin-top:26px;background:rgba(255,255,255,.04);border-radius:14px;padding:22px 26px;border-left:6px solid var(--rc);position:relative}
.blk .lg{position:absolute;right:20px;top:14px;width:96px;height:96px;object-fit:contain}
.name{font-size:34px;font-weight:800;padding-right:110px;overflow-wrap:anywhere}
.row{display:flex;gap:14px;margin-top:12px;align-items:center;flex-wrap:wrap}
.chip{background:var(--rc);padding:5px 14px;border-radius:8px;font-weight:800;font-size:20px;letter-spacing:1px}
.chip.outline{background:transparent;border:2px solid var(--rc)}.chip.grey{background:#3a3f4b}.chip.red{background:#b91c1c}
.fact{font-size:24px;color:#c9ccd6}.fact b{color:#fff}.note{margin-top:10px;font-size:22px;color:#c9ccd6;font-style:italic}
.line{display:flex;align-items:center;gap:18px;margin-top:14px}
.time{background:#fff;color:#0b0d12;font-weight:900;font-size:24px;border-radius:8px;padding:4px 12px;min-width:104px;text-align:center;flex:none}
.time.tbd{background:#3a3f4b;color:#fff;font-size:16px;line-height:1.1}
.cn{font-size:26px;font-weight:800;min-width:150px;flex:none}.pi{font-size:22px;color:#c9ccd6}.pi b{color:#b78bff}
.more{margin-top:14px;font-size:22px;color:#9aa0b0;font-weight:700}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:18px}
.st{display:flex;align-items:center;justify-content:space-between;background:rgba(255,123,0,.12);border:2px solid #ff7b00;border-radius:12px;padding:8px 20px 8px 10px}
.st.full{border-color:#555}.st span{display:flex;align-items:center;gap:16px;font-size:28px;font-weight:800}.st img{width:80px;height:80px}
.st em{font-style:normal;font-size:24px;font-weight:800;color:#ffcf4d}.st.full em{color:#9aa0b0}`;
const factHtml = ([label, strong, after]) => `<span class=fact>${html(label)} <b>${html(strong)}</b>${after ? ` ${html(after)}` : ''}</span>`;
function blockHtml(block) {
  const [simLabel, color] = SIMS[block.sim] || SIMS.lmu;
  const color2 = block.streamers ? GRIDFEST : color;
  const lines = block.lines.slice(0, MAX_LINES).map(line => `<div class=line><span class="time${line.time ? '' : ' tbd'}">${line.time ? html(line.time.toUpperCase()) : 'HORAIRE<br>À CONFIRMER'}</span>
<span class=cn>${html(line.label)}</span><span class=pi>${line.star ? `<b>📺 ${html(line.star)}</b>${line.text ? ' · ' : ''}` : ''}${html(line.text)}</span></div>`).join('');
  const more = block.lines.length > MAX_LINES ? `<div class=more>+ ${block.lines.length - MAX_LINES} autres équipages sur le site</div>` : '';
  const streamers = block.streamers ? `<div class=grid>${block.streamers.map(item => {
    const full = item.capacity && item.entered >= item.capacity;
    return `<div class="st${full ? ' full' : ''}"><span>${/^(https:|data:image\/)/.test(item.logo) ? `<img src="${html(item.logo)}">` : '🎙️'}${html(item.name)}</span><em>${full ? 'COMPLET' : `${Math.min(item.entered, item.capacity)} / ${item.capacity}`}</em></div>`;
  }).join('')}</div>` : '';
  return `<div class=blk style="--rc:${color2}">${/^(https:|data:image\/)/.test(block.logo || '') ? `<img class=lg src="${html(block.logo)}" onerror="this.remove()">` : ''}
<div class=name>${block.icon || '🏁'} ${html(block.name)}</div>
<div class=row><span class=chip>${html(block.sim === 'stream' ? 'STREAM' : simLabel.toUpperCase())}</span>${block.chips.map(([label, kind]) => `<span class="chip ${kind}">${html(label)}</span>`).join('')}${block.facts.map(factHtml).join('')}</div>
${block.note ? `<div class=note>${html(block.note)}</div>` : ''}${lines}${more}${streamers}</div>`;
}
// The poster's page, for the browser. Pictures: https addresses (the site's) or inline ones only.
export function posterHtml(model) {
  const accent = model.gridfest ? GRIDFEST : model.live ? '#9146ff' : '#e8792b';
  const top = model.live ? (model.gridfest ? '🎉 C’EST LE GRIDFEST' : `<span class=dot></span>EN DIRECT SUR ${html(model.platform).toUpperCase()}`) : html(model.head);
  const logo = model.gridfest && model.blocks[0]?.logo ? `<img class=logo src="${html(model.blocks[0].logo)}" onerror="this.remove()">` : '';
  const blocks = model.gridfest ? model.blocks.map(block => ({...block, logo:''})) : model.blocks;
  return `<!doctype html><html lang=fr><meta charset=utf-8><style>${CSS}</style><body><div class="card${model.gridfest ? ' gf' : ''}" style="--c:${accent};--t:${model.live ? (model.gridfest ? '#ffcf4d' : '#ff4d6d') : '#ffb35c'}">
${model.live && /^https:/.test(model.banner) ? `<img class=ban src="${html(model.banner)}" onerror="this.remove()">` : ''}<div class=in>${logo}
<div class=top>${top}<span class=day>· ${html(model.day)}</span></div>
${model.big ? `<div class=big>${html(model.big)}</div>` : ''}${model.who ? `<div class=who>${model.who}</div>` : ''}
${blocks.map(blockHtml).join('')}${model.more ? `<div class=more>+ ${plural(model.more, 'autre rendez-vous')} sur le site</div>` : ''}</div></div></body></html>`;
}

// The same poster as text (the fallback): Discord titles, the sim and type as `étiquettes`, the pilots in small.
export function posterText(model) {
  const block = item => {
    const [simLabel] = SIMS[item.sim] || SIMS.lmu;
    const title = item.url ? `[${md(item.name)}](${item.url})` : md(item.name);
    const tags = [item.sim === 'stream' ? 'Stream' : simLabel, ...item.chips.map(([label]) => label)].map(label => `\`${text(label).replace(/`/g, '')}\``).join(' ');
    const facts = item.facts.map(([label, strong, after]) => [label, `**${md(strong)}**`, after && md(after)].filter(Boolean).join(' ')).join(' · ');
    const lines = item.lines.slice(0, MAX_LINES).map(line => `**${line.time || 'Horaire à confirmer'}** · ${md(line.label)}${line.star || line.text ? `\n-# ${[line.star && `📺 ${md(line.star)}`, md(line.text)].filter(Boolean).join(' · ')}` : ''}`);
    if (item.lines.length > MAX_LINES) lines.push(`-# + ${item.lines.length - MAX_LINES} autres équipages sur le site`);
    const streamers = (item.streamers || []).map(s => `🎙️ **${md(s.name)}** · ${s.capacity && s.entered >= s.capacity ? 'complet' : `${Math.min(s.entered, s.capacity)} / ${s.capacity}`}`);
    return [`### ${item.icon || '🏁'} ${title}`, [tags, facts].filter(Boolean).join(' · '), item.note && `*${md(item.note)}*`, ...lines, ...streamers].filter(Boolean).join('\n');
  };
  const head = model.live
    ? [`# ${model.gridfest ? '🎉' : '📺'} ${model.gridfest ? model.big.replace('GRIDFEST', 'Gridfest') : model.big.replace(/^STREAMS?/, match => match === 'STREAMS' ? 'Streams à' : 'Stream à').replace(' & ', ' et ').toLowerCase().replace(/^streams? à/, match => match[0].toUpperCase() + match.slice(1))}`,
      model.streamer && !model.gridfest ? `**avec ${model.streamUrl ? `[${md(model.streamer)}](${model.streamUrl})` : md(model.streamer)}${model.driving ? ' au volant' : ''}**` : model.gridfest ? '**Pilote pour ton streamer**' : ''].filter(Boolean).join('\n')
    : `## ${model.head.replace(/^(\S+) (.+)$/, (all, icon, words) => `${icon} ${words.charAt(0)}${words.slice(1).toLowerCase()}`)}`;
  return [head, ...model.blocks.map(block), model.more ? `-# + ${plural(model.more, 'autre rendez-vous')} sur le site` : ''].filter(Boolean).join('\n\n').slice(0, 4000);
}

// The picture of a poster from Cloudflare's browser (REST API: CF_ACCOUNT_ID + BROWSER_RENDERING_TOKEN), or null.
export async function renderPoster(env, page) {
  const account = String(env.CF_ACCOUNT_ID || '').trim(), token = String(env.BROWSER_RENDERING_TOKEN || '').trim();
  if (!account || !token) return null;
  try {
    const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/browser-rendering/screenshot`, {method:'POST', signal:AbortSignal.timeout(45000),
      headers:{Authorization:`Bearer ${token}`, 'Content-Type':'application/json'},
      body:JSON.stringify({html:page, viewport:{width:1200, height:600}, gotoOptions:{waitUntil:'networkidle0', timeout:20000}, screenshotOptions:{fullPage:true, type:'png'}})});
    if (!response.ok || !String(response.headers.get('content-type') || '').startsWith('image/')) return null;
    const bytes = await response.arrayBuffer();
    return bytes.byteLength > 1000 ? bytes : null;
  } catch { return null; }
}
