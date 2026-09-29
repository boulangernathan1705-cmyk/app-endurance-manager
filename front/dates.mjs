// One way to show dates and times everywhere on the site, always in Paris time:
// - a date block (weekday / day number / month) for the day of a race or a start;
// - "sam. 26 sept." when a date sits in a sentence;
// - hours as "22h" or "22h30" (English: "22:00").
import {getLocale,localeTag} from './i18n.mjs';

const PARIS = 'Europe/Paris';
const format = options => new Intl.DateTimeFormat(localeTag(), {timeZone:PARIS, ...options});
const weekdayFormat = format({weekday:'short'});
const dayFormat = format({day:'numeric'});
const monthFormat = format({month:'short'});
const shortDateFormat = format({weekday:'short', day:'numeric', month:'short'});
const fullDateFormat = format({dateStyle:'full'});
const clockFormat = new Intl.DateTimeFormat('en-GB', {timeZone:PARIS, hour:'2-digit', minute:'2-digit', hourCycle:'h23'});
const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

const validStamp = timestamp => {
  const date = new Date(Number(timestamp));
  return timestamp !== null && timestamp !== undefined && timestamp !== '' && Number.isFinite(date.getTime()) ? date : null;
};

// "22:00" → "22h", "08:30" → "8h30" (English keeps "22:00").
export function timeLabel(value) {
  const match = String(value || '').match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return String(value || '').trim();
  const hour = Number(match[1]);
  if (getLocale() === 'en') return `${String(hour).padStart(2,'0')}:${match[2]}`;
  return match[2] === '00' ? `${hour}h` : `${hour}h${match[2]}`;
}

// Hour of a timestamp, same format as timeLabel.
export function timeAt(timestamp) {
  const date = validStamp(timestamp);
  return date ? timeLabel(clockFormat.format(date)) : '';
}

// "sam. 26 sept."
export function shortDateLabel(timestamp) {
  const date = validStamp(timestamp);
  return date ? shortDateFormat.format(date) : '';
}

// "sam. 26" (the month is already given by the surrounding block).
export function dayLabel(timestamp) {
  const date = validStamp(timestamp);
  return date ? `${weekdayFormat.format(date)} ${dayFormat.format(date)}` : '';
}

// "samedi 26 septembre 2026", for tooltips and screen readers.
export function fullDateLabel(timestamp) {
  const date = validStamp(timestamp);
  return date ? fullDateFormat.format(date) : '';
}

const weekdayLongFormat = format({weekday:'long'});
const dayMonthLongFormat = format({day:'numeric', month:'long'});
const dayMonthFormat = format({day:'numeric', month:'short'});

// "sam." / "Samedi" / "17 octobre", for the days of a race over several days.
export function weekdayLabel(timestamp) {
  const date = validStamp(timestamp);
  return date ? weekdayFormat.format(date) : '';
}
export function weekdayLong(timestamp) {
  const date = validStamp(timestamp);
  if (!date) return '';
  const day = weekdayLongFormat.format(date);
  return day.charAt(0).toUpperCase() + day.slice(1);
}
export function dayMonthLong(timestamp) {
  const date = validStamp(timestamp);
  return date ? dayMonthLongFormat.format(date) : '';
}

export function dayMonthShort(timestamp) {
  const date = validStamp(timestamp);
  return date ? dayMonthFormat.format(date) : '';
}

// Date block of a race over several days: "ven. → dim." / "16–18" / "oct." (both months when they differ).
export function dateRangeBlock(first, last) {
  const start = validStamp(first), end = validStamp(last);
  if (!start || !end) return dateBlock(first);
  const months = monthFormat.format(start) === monthFormat.format(end) ? monthFormat.format(end) : `${monthFormat.format(start)}–${monthFormat.format(end)}`;
  return `<span class="race-date is-range" title="${escape(`${fullDateFormat.format(start)} – ${fullDateFormat.format(end)}`)}"><small>${escape(weekdayFormat.format(start))} → ${escape(weekdayFormat.format(end))}</small><strong>${escape(dayFormat.format(start))}–${escape(dayFormat.format(end))}</strong><small>${escape(months)}</small></span>`;
}

// Date block used by race cards, the race header, My entries, the home page and the starts of a race.
export function dateBlock(timestamp, {compact = false} = {}) {
  const date = validStamp(timestamp);
  const size = compact ? ' is-compact' : '';
  if (!date) return `<span class="race-date is-unknown${size}"><strong>?</strong><small>Date à confirmer</small></span>`;
  return `<span class="race-date${size}" title="${escape(fullDateFormat.format(date))}"><small>${escape(weekdayFormat.format(date))}</small><strong>${escape(dayFormat.format(date))}</strong><small>${escape(monthFormat.format(date))}</small></span>`;
}
