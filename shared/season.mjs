// EVENT TDZ seasons (Nathan, 2026-11-07): the organisers choose the first month and the length (1 to 12 months);
// seasons then follow each other on their own. Without a choice: the calendar quarter. Months in Paris time.
const index = value => { const [year, month] = String(value).split('-').map(Number); return year * 12 + month - 1; };
const monthOf = value => `${Math.floor(value / 12)}-${String(value % 12 + 1).padStart(2, '0')}`;
export const validStart = value => typeof value === 'string' && /^(20\d{2})-(0[1-9]|1[0-2])$/.test(value);
export const validMonths = value => Number.isInteger(value) && value >= 1 && value <= 12;
export function parisMonth(now = Date.now()) {
  const parts = new Intl.DateTimeFormat('en-CA', {timeZone:'Europe/Paris', year:'numeric', month:'2-digit'}).formatToParts(now);
  return `${parts.find(part => part.type === 'year').value}-${parts.find(part => part.type === 'month').value}`;
}
export function defaultSeason(now = Date.now()) {
  const current = index(parisMonth(now));
  return {start:monthOf(current - current % 3), months:3};
}
// The season holding a month (shift: -1 the previous one, 1 the next one): its months, 'YYYY-MM'.
export function seasonMonths(setting, month = parisMonth(), shift = 0) {
  const months = validMonths(setting?.months) ? setting.months : 3, anchor = validStart(setting?.start) ? index(setting.start) : index(defaultSeason().start);
  const first = anchor + (Math.floor((index(month) - anchor) / months) + shift) * months;
  return Array.from({length:months}, (_, offset) => monthOf(first + offset));
}
