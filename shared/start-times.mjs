// Several starts at once in the event form (special events: often 3 days with 5 or 6 starts each): the days
// ticked in a week, times the hours ticked in a grid, all at the same minute.

// "YYYY-MM-DD" n days after a date (calendar days, no time zone involved).
export function addDays(date, days) {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}
// The seven days (Monday to Sunday) of the week of a date.
export function weekDates(date) {
  const [y, m, d] = date.split('-').map(Number);
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  const monday = addDays(date, weekday === 0 ? -6 : 1 - weekday);
  return Array.from({length:7}, (_, index) => addDays(monday, index));
}
// Every start of the ticked days and hours, sorted: [{date, time:"HH:MM"}].
export function bulkStarts(days, hours, minute = '00') {
  const times = [...new Set(hours.map(Number))].filter(hour => hour >= 0 && hour <= 23).sort((a, b) => a - b)
    .map(hour => `${String(hour).padStart(2, '0')}:${/^[0-5]\d$/.test(minute) ? minute : '00'}`);
  return [...new Set(days)].sort().flatMap(date => times.map(time => ({date, time})));
}

// Race page: the starts of a race over several days, grouped by day in Paris time, [{key:"YYYY-MM-DD", items:
// [{departure, index}]}] sorted. [] when the race is on a single day, or has a start still to define (the list
// of starts stays then).
const parisDay = new Intl.DateTimeFormat('en-CA', {timeZone:'Europe/Paris', year:'numeric', month:'2-digit', day:'2-digit'});
export const parisDayKey = timestamp => parisDay.format(new Date(Number(timestamp)));
export function raceDays(departures = []) {
  if (!departures.length || departures.some(departure => departure.tbd || !Number.isFinite(Number(departure.startsAt)))) return [];
  const days = new Map();
  departures.forEach((departure, index) => {
    const key = parisDayKey(departure.startsAt);
    if (!days.has(key)) days.set(key, []);
    days.get(key).push({departure, index});
  });
  if (days.size < 2) return [];
  return [...days.entries()].sort(([a], [b]) => a.localeCompare(b))
    .map(([key, items]) => ({key, items: items.sort((a, b) => Number(a.departure.startsAt) - Number(b.departure.startsAt))}));
}
