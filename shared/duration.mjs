// Race durations are stored in minutes: "6 h", "2 h 30", "45 min".
export function durationLabel(minutes) {
  const total = Math.max(0, Math.round(Number(minutes) || 0));
  if (total < 60) return `${total} min`;
  const hours = Math.floor(total / 60), rest = total % 60;
  return rest ? `${hours} h ${String(rest).padStart(2, '0')}` : `${hours} h`;
}

// Duration of an event in minutes (events saved before minutes existed only have whole hours).
export const eventMinutes = event => Number(event?.durationMinutes) || (Number(event?.durationHours) || 6) * 60;

// Races where a single driver does not count in the classification: always on LMU; on iRacing, the
// organizer's choice, by default races over 4 h (iRacing's official series ask for 2 drivers from 6 h,
// "Min 2 drivers" in the season schedule; up to 4 h one driver is allowed).
export const SOLO_DRIVER_LIMIT_MINUTES = 240;
export function driverChangeRequired(event) {
  if (!String(event?.circuit || '').startsWith('iracing-')) return true;
  if (typeof event?.driverChangeRequired === 'boolean') return event.driverChangeRequired;
  return eventMinutes(event) > SOLO_DRIVER_LIMIT_MINUTES;
}
