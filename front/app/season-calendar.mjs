// EVENT TDZ calendar (Nathan, 2026-11-07): the season's months as tabs (with their number of events), then the month
// as a grid. Each event sits in its day: logo, name, time, entries, ✓ when you are in, the stream in violet. The frame
// colour follows the type (OPEN, SAFE, BOULOULES, Training, stream, Gridfest). On a phone a day shows its logos and its
// time; a touch opens the day under its week. Events without a date go to « Date à confirmer ». The organisers set the
// season (first month, length); seasons then follow each other on their own (shared/season.mjs).
import {state,esc,button} from './core.mjs';
import {mySituation} from '../race-filters.mjs';
import {normalizeTdzEventType} from '../../shared/catalog.mjs';
import {isGrindfest} from '../../shared/grindfest.mjs';
import {isStream,streamDetails,streamSpan,hourLabel} from '../../shared/stream.mjs';
import {eventAccessLogo,soloCounts,isSolo} from './solo.mjs';
import {gameForEvent} from '../../shared/catalog.mjs';
import {eventMinutes} from '../../shared/duration.mjs';
import {parisMonth,seasonMonths} from '../../shared/season.mjs';

const MONTHS = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
const SHORT = ['janv.','févr.','mars','avr.','mai','juin','juil.','août','sept.','oct.','nov.','déc.'];
const DAYS = ['Lun','Mar','Mer','Jeu','Ven','Sam','Dim'];
const LONG_DAYS = ['lundi','mardi','mercredi','jeudi','vendredi','samedi','dimanche'];
const monthNumber = month => Number(month.slice(5, 7)) - 1;
const monthName = (month, short = false) => (short ? SHORT : MONTHS)[monthNumber(month)];
const parisToday = () => new Intl.DateTimeFormat('en-CA', {timeZone:'Europe/Paris', year:'numeric', month:'2-digit', day:'2-digit'}).format(Date.now());
const pad = value => String(value).padStart(2, '0');

// The frame colour of an event.
export function calendarType(event) {
  if (event.streamedBy) return 'stream';
  if (!isSolo(event)) return event.eventType === 'special' ? 'special' : event.eventType === 'lmu' ? 'championnat' : 'prive';
  if (isStream(event)) return 'stream';
  if (isGrindfest(event)) return 'gridfest';
  const type = String(normalizeTdzEventType(event.details?.type) || '').toUpperCase();
  if (type === 'TONDEUZ TRAINING') return 'training';
  if (type === 'BOULOULES') return 'bouloules';
  return event.access === 'safe' || type === 'SAFE' ? 'safe' : 'open';
}
const undated = event => event.schedulePending || !(event.departures || []).some(departure => !departure.tbd && /^\d{4}-\d{2}-\d{2}$/.test(departure.date || ''));
// One entry per event and day (several starts the same day: the first one, « +1 »).
function entries(events) {
  const byDay = new Map();
  for (const event of events) {
    if (undated(event)) continue;
    const seen = new Map();
    for (const departure of (event.departures || []).filter(item => !item.tbd && item.date).sort((a, b) => a.startsAt - b.startsAt)) {
      if (seen.has(departure.date)) { seen.get(departure.date).more++; continue; }
      const entry = {event, departure, more:0};
      seen.set(departure.date, entry);
      if (!byDay.has(departure.date)) byDay.set(departure.date, []);
      byDay.get(departure.date).push(entry);
    }
  }
  for (const list of byDay.values()) list.sort((a, b) => a.departure.startsAt - b.departure.startsAt);
  return byDay;
}
function timeOf(departure) { const [hour, minute] = String(departure.time || '').split(':'); return /^\d{2}$/.test(hour || '') ? `${Number(hour)}h${minute && minute !== '00' ? minute : ''}` : ''; }
const TYPES = [['special', 'Événement spécial'], ['championnat', 'Championnat'], ['prive', 'Championnat privé'], ['open', 'OPEN'], ['safe', 'SAFE'], ['bouloules', 'BOULOULES'], ['training', 'Training'], ['stream', 'Stream']];
const typeLabel = type => TYPES.find(([key]) => key === type)?.[1] || '';
// An endurance start the community streams (« Je streame ce départ », Nathan 2026-11-08): the stream's time, then the
// start and the streamer's crew; it opens the endurance (on the other sim's site when it is there).
const streamed = event => event.streamedBy ? hourLabel(event.streamedBy.streamTime) : '';
function streamCrew({event, departure}) {
  const crew = (departure.crews || []).find(item => (item.registrationIds || []).includes(event.streamedBy.id));
  const pilots = crew ? (crew.registrationIds || []).map(id => (departure.availability || []).find(reg => reg.id === id)?.name).filter(Boolean) : [event.streamedBy.name];
  return [crew && (/^\d{1,3}$/.test(crew.name) ? `Équipage ${crew.name}` : crew.name), ...pilots].filter(Boolean).join(' · ');
}
const opener = (event, departure, cls, inner) => event.otherGame
  ? `<a class="${cls}" href="/${esc(event.otherGame)}/#event=${esc(event.id)}">${inner}</a>`
  : `<button type="button" class="${cls}" data-action="open" data-id="${esc(event.id)}" data-departure="${esc(departure.id)}">${inner}</button>`;
function entryHtml({event, departure, more}) {
  if (event.streamedBy) return opener(event, departure, 'cal-ev t-stream', `<img class="event-access-logo" src="/images/event-access/endurance-${esc(gameForEvent(event))}.png" alt="" width="300" height="300" loading="lazy" decoding="async"><b>📺 ${esc(event.name)}</b><small><strong>Stream ${esc(streamed(event))}</strong> · départ ${esc(timeOf(departure))} · ${esc(streamCrew({event, departure}))}${mySituation(event) ? ' <span class="cal-me" title="Tu es inscrit">✓</span>' : ''}</small><span class="cal-go" aria-hidden="true">›</span>`);
  const type = calendarType(event), stream = streamDetails(event);
  const {confirmed} = isStream(event) ? {confirmed:0} : soloCounts(event, departure);
  const training = type === 'training';
  const end = training && departure.endsAt ? new Date(departure.endsAt).toLocaleTimeString('fr-FR', {timeZone:'Europe/Paris', hour:'2-digit', minute:'2-digit'}).replace(':00', 'h').replace(':', 'h') : '';
  const endurance = !isSolo(event), hours = Math.round(eventMinutes(event) / 60);
  const info = endurance ? (hours ? ` · ${hours}h` : '') : isStream(event) ? 'Stream' : training ? (end ? `–${end}` : '') : ` · ${confirmed} inscrit${confirmed > 1 ? 's' : ''}`;
  const time = undated(event) ? 'Date à confirmer' : isStream(event) ? hourLabel(stream.streamTime || stream.raceTime || departure.time) : timeOf(departure);
  const live = !isStream(event) && event.details?.streamTime ? `<span class="cal-live">● Stream ${esc(streamSpan(event.details.streamTime, event.details.streamEnd))}</span>` : '';
  const logo = endurance ? `<img class="event-access-logo" src="/images/event-access/endurance-${esc(gameForEvent(event))}.png" alt="" width="300" height="300" loading="lazy" decoding="async">` : eventAccessLogo(event) || `<span class="cal-logo-text" aria-hidden="true">${isStream(event) ? '🎙️' : isGrindfest(event) ? '🎉' : '🏁'}</span>`;
  return `<button type="button" class="cal-ev t-${type}" data-action="open" data-id="${esc(event.id)}" data-departure="${esc(departure.id)}">${logo}<b><i class="cal-t">${esc(time)} </i>${esc(event.name)}</b><small><strong>${esc(time)}</strong>${esc(info)}${type && type !== 'stream' && type !== 'training' ? `<em class="cal-type"> · ${esc(typeLabel(type))}</em>` : ''}${more ? ` · +${more}` : ''}${mySituation(event) ? ' <span class="cal-me" title="Tu es inscrit">✓</span>' : ''}</small>${live}<span class="cal-go" aria-hidden="true">›</span></button>`;
}
// In a day of the month on a computer: the logo on a band tinted with the type's colour, the race's name, then its time,
// sim and length (Nathan 2026-11-07, mockup B: a bigger month, the colour visible, the event, the sim and the time).
function cellHtml({event, departure}) {
  const type = calendarType(event), endurance = !isSolo(event), hours = Math.round(eventMinutes(event) / 60);
  const time = event.streamedBy ? `Stream ${streamed(event)}` : isStream(event) ? hourLabel(streamDetails(event).streamTime || departure.time) : timeOf(departure);
  // The sim only where both can mix: endurances (Events are all LMU, Nathan 2026-11-07).
  const sim = !endurance ? '' : gameForEvent(event) === 'iracing' ? 'iRacing' : 'LMU';
  const confirmed = endurance || isStream(event) || type === 'training' ? 0 : soloCounts(event, departure).confirmed;
  const info = [sim, endurance && hours ? `${hours}h` : '', confirmed ? `${confirmed} inscrit${confirmed > 1 ? 's' : ''}` : ''].filter(Boolean).join(' · ');
  const logo = endurance ? `<img class="event-access-logo" src="/images/event-access/endurance-${esc(gameForEvent(event))}.png" alt="" width="300" height="300" loading="lazy" decoding="async">` : eventAccessLogo(event) || `<span class="cal-logo-text" aria-hidden="true">${isStream(event) ? '🎙️' : isGrindfest(event) ? '🎉' : '🏁'}</span>`;
  return opener(event, departure, `cal-cell t-${type}`, `${logo}<b>${event.streamedBy ? '📺 ' : ''}${esc(event.name)}</b><small><strong>${esc(time)}</strong>${info ? ` · ${esc(info)}` : ''}${mySituation(event) ? ' <span class="cal-me" title="Tu es inscrit">✓</span>' : ''}</small>`);
}
// On a phone every day is the same size: each race on one line, its time and the start of its name beside the type's
// colour (Nathan 2026-11-07, mockup B); one line and « +N » when a day has more than two.
const shortName = name => String(name || '').replace(/^(OPEN|SAFE|BOULOULES|Training|Stream)\s+/i, '');
function dots(list) {
  const line = ({event, departure}) => `<i class="cal-line t-${calendarType(event)}"><b>${esc(streamed(event) || timeOf(departure) || '?')}</b> ${event.streamedBy ? '📺 ' : ''}${esc(shortName(event.name))}</i>`;
  return `<span class="cal-dots" aria-hidden="true">${list.slice(0, list.length > 2 ? 1 : 2).map(line).join('')}${list.length > 2 ? `<em>+${list.length - 1}</em>` : ''}</span>`;
}

// The season shown (state.calendarShift: 0 the current one) and the month chosen in it. The arrows step one month
// (state.calendarStep), into the next or previous season when needed.
const stepMonth = (month, step) => { const value = Number(month.slice(0, 4)) * 12 + Number(month.slice(5, 7)) - 1 + step; return `${Math.floor(value / 12)}-${pad(value % 12 + 1)}`; };
export function calendarMonths(setting = state.tdzSeason) {
  if (state.calendarStep && state.calendarMonth) {
    const target = stepMonth(state.calendarMonth, state.calendarStep);
    let shift = state.calendarShift || 0;
    for (let tries = 0; tries < 24 && !seasonMonths(setting, parisMonth(), shift).includes(target); tries++) shift += Math.sign(state.calendarStep);
    state.calendarShift = shift; state.calendarMonth = target;
  }
  state.calendarStep = 0;
  const months = seasonMonths(setting, parisMonth(), state.calendarShift || 0);
  if (!months.includes(state.calendarMonth)) state.calendarMonth = months.includes(parisMonth()) ? parisMonth() : months[0];
  return months;
}
const dayTitle = date => { const [year, month, day] = date.split('-').map(Number), column = (new Date(Date.UTC(year, month - 1, day)).getUTCDay() + 6) % 7; return `${LONG_DAYS[column].replace(/^./, letter => letter.toUpperCase())} ${day} ${MONTHS[month - 1]}`; };
// The day shown beside the month (Nathan 2026-11-07: everything on one screen, like an app): the one chosen, else
// today when it has events, else the month's next day with events, else today, else its first day with events.
function chosenDay(month, byDay) {
  if (state.calendarDay?.startsWith(month)) return state.calendarDay;
  const today = parisToday(), dates = [...byDay.keys()].filter(date => date.startsWith(month)).sort();
  if (today.startsWith(month) && byDay.has(today)) return today;
  return dates.find(date => date >= today) || (today.startsWith(month) ? today : dates[0]) || `${month}-01`;
}
// The month: each day shows two events, or one and « +N » when it has more (the day opens beside the month). On a phone, the times
// as small chips coloured by type.
function grid(month, byDay, selected) {
  const [year, number] = month.split('-').map(Number);
  const first = new Date(Date.UTC(year, number - 1, 1)), lead = (first.getUTCDay() + 6) % 7;
  const days = new Date(Date.UTC(year, number, 0)).getUTCDate(), weeks = Math.ceil((lead + days) / 7), today = parisToday();
  let cells = DAYS.map(day => `<div class="cal-dow">${day}</div>`).join(''), rows = '';
  for (let week = 0; week < weeks; week++) {
    // A week without a race stays short, so the month needs less scrolling (Nathan 2026-11-07).
    const busy = Array.from({length:7}, (_, column) => week * 7 + column - lead + 1).some(day => day >= 1 && day <= days && byDay.get(`${month}-${pad(day)}`)?.length);
    rows += busy ? ' minmax(150px,auto)' : ' 76px';
    for (let column = 0; column < 7; column++) {
      const day = week * 7 + column - lead + 1;
      if (day < 1 || day > days) { cells += '<div class="cal-day out" aria-hidden="true"></div>'; continue; }
      const date = `${month}-${pad(day)}`, list = byDay.get(date) || [];
      const css = ['cal-day', date < today && 'past', date === today && 'today', list.length && 'has', date === selected && 'sel'].filter(Boolean).join(' ');
      const label = `${LONG_DAYS[column]} ${day} ${monthName(month)}${list.length ? ` · ${list.length} événement${list.length > 1 ? 's' : ''}` : ''}`;
      cells += `<div class="${css}"><button type="button" class="cal-num" data-action="cal-day" data-day="${date}" aria-label="${esc(label)}" aria-pressed="${date === selected}"><span>${day}</span></button>${list.slice(0, list.length > 3 ? 2 : 3).map(cellHtml).join('')}${list.length > 3 ? `<button type="button" class="cal-more" data-action="cal-day" data-day="${date}">+${list.length - 2} de plus</button>` : ''}<button type="button" class="cal-tap" data-action="cal-day" data-day="${date}" aria-label="${esc(label)}" tabindex="-1">${list.length ? dots(list) : ''}</button></div>`;
    }
  }
  return `<div class="cal-grid" role="grid" style="--weeks:${weeks};--rows:${rows.trim()}" aria-label="${esc(`${monthName(month)} ${year}`)}">${cells}</div>`;
}
function seasonPanel(months) {
  const start = state.tdzSeason?.start || months[0], length = state.tdzSeason?.months || months.length;
  const [year] = parisMonth().split('-').map(Number);
  const options = [year - 1, year, year + 1].flatMap(item => MONTHS.map((name, index) => `${item}-${pad(index + 1)}`))
    .map(month => `<option value="${month}"${month === start ? ' selected' : ''}>${monthName(month)} ${month.slice(0, 4)}</option>`).join('');
  const lengths = Array.from({length:12}, (_, index) => `<option value="${index + 1}"${index + 1 === length ? ' selected' : ''}>${index + 1} mois</option>`).join('');
  return `<form class="cal-season-panel" data-season-form><label>Début <select name="seasonStart">${options}</select></label><label>Durée <select name="seasonMonths">${lengths}</select></label><button type="submit" class="primary-button">Enregistrer</button>${button('cal-season-edit', 'Annuler', '', 'link-button')}<p>Les saisons suivantes s’enchaînent toutes seules.</p></form>`;
}

// The months for the page's head, and the body: grid, chosen day, undated events. events: the filtered events, upcoming and past.
// setting: the season (EVENT TDZ); without it, the calendar quarter (endurances).
export function seasonCalendar(events, {mineOnly = false, canEdit = false, setting = state.tdzSeason} = {}) {
  const months = calendarMonths(setting), list = mineOnly ? events.filter(event => mySituation(event, {includePast:true})) : events;
  const byDay = entries(list), count = month => [...byDay.entries()].filter(([date]) => date.startsWith(month)).reduce((sum, [, items]) => sum + items.length, 0);
  const tabs = months.map(month => `<button type="button" class="cal-month${month === state.calendarMonth ? ' on' : ''}" data-action="cal-month" data-month="${month}" aria-pressed="${month === state.calendarMonth}"><span class="cal-long">${monthName(month).replace(/^./, letter => letter.toUpperCase())}</span><span class="cal-short">${monthName(month, true).replace(/^./, letter => letter.toUpperCase())}</span> <small>${count(month) || '–'}</small></button>`).join('');
  const shift = (step, label) => `<button type="button" class="cal-shift" data-action="cal-step" data-step="${step}" aria-label="${label}">${step < 0 ? '‹' : '›'}</button>`;
  const later = list.filter(undated);
  const legend = TYPES
    .filter(([type]) => list.some(event => calendarType(event) === type || (type === 'stream' && event.details?.streamTime)))
    .map(([type, label]) => `<span class="t-${type}">${label}</span>`).join('');
  const selected = chosenDay(state.calendarMonth, byDay), day = byDay.get(selected) || [];
  const side = `<aside class="cal-side" aria-label="${esc(dayTitle(selected))}"><h3>${esc(dayTitle(selected))}</h3>${day.length ? day.map(entryHtml).join('') : '<p class="cal-none">Rien ce jour-là.</p>'}${later.length ? `<h3 class="cal-later-title">Date à confirmer <small>${later.length}</small></h3>${later.map(event => entryHtml({event, departure:event.departures?.[0] || {id:'', time:''}, more:0})).join('')}` : ''}</aside>`;
  // The months go up in the page's head, on the line of the other choices (Nathan 2026-11-07: more room for the month).
  const head = `<div class="cal-tabs" role="group" aria-label="Mois">${shift(-1, 'Mois précédent')}<div class="cal-months">${tabs}</div>${shift(1, 'Mois suivant')}${canEdit ? button('cal-season-edit', 'Saison', `aria-expanded="${Boolean(state.calendarSeasonOpen)}"`, 'link-button cal-season-button') : ''}</div>`;
  return {head, body:`<div class="cal">
${canEdit && state.calendarSeasonOpen ? seasonPanel(months) : ''}
<div class="cal-body"><div class="cal-main">${grid(state.calendarMonth, byDay, selected)}
${legend || list.some(mySituation) ? `<div class="cal-legend">${legend}${list.some(event => mySituation(event)) ? '<span class="cal-legend-me"><b>✓</b> Tu es inscrit</span>' : ''}</div>` : ''}</div>${side}</div>
</div>`};
}
