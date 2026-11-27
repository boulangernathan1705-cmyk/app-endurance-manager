// List-card totals are unique pilots, not the number of bookings across starts.
export function soloEventCounts(event, {archived = false, now = Date.now()} = {}) {
  const departures = (event.departures || []).filter(departure => {
    const dated = departure.startsAt != null && Number.isFinite(Number(departure.startsAt));
    return archived ? dated : dated ? Number(departure.startsAt) > now : Boolean(event.schedulePending);
  });
  const confirmed = new Set(), waiting = new Set();
  for (const departure of departures) {
    for (const reg of departure.availability || []) {
      if (reg.status === 'unavailable') continue;
      const id = reg.participantId || reg.id;
      (reg.waitlistPosition ? waiting : confirmed).add(id);
    }
  }
  for (const id of confirmed) waiting.delete(id);
  // Capacity belongs to a start, not to a unique-pilot total across several starts.
  return {confirmed: confirmed.size, waiting: waiting.size,
    capacity: departures.length === 1 ? Number(event.capacity) || null : null};
}
