// Race durations are stored in minutes: "6 h", "2 h 30", "45 min".
export function durationLabel(minutes) {
  const total = Math.max(0, Math.round(Number(minutes) || 0));
  if (total < 60) return `${total} min`;
  const hours = Math.floor(total / 60), rest = total % 60;
  return rest ? `${hours} h ${String(rest).padStart(2, '0')}` : `${hours} h`;
}

// Duration of an event in minutes (events saved before minutes existed only have whole hours).
export const eventMinutes = event => Number(event?.durationMinutes) || (Number(event?.durationHours) || 6) * 60;
