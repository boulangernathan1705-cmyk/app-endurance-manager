// « À traiter » in the administration's overview (audit R27): what the organisation still has to do on the
// endurances of the next two weeks, read from the races the site already serves (no new table, no new API).
const DAY = 86400000;
const date = new Intl.DateTimeFormat('fr-FR', {timeZone:'Europe/Paris', weekday:'short', day:'numeric', month:'short'});
const clock = new Intl.DateTimeFormat('fr-FR', {timeZone:'Europe/Paris', hour:'2-digit', minute:'2-digit'});

// [{eventId, game, name, startsAt, text, tone}] sorted by start: pilots waiting for a crew, empty crews, times
// still to confirm.
export function todoItems(events, game, now = Date.now(), horizon = 14 * DAY) {
  const items = [];
  for (const event of events || []) {
    if (event.format === 'solo' || event.archived) continue;
    const starts = (event.departures || []).filter(item => Number(item.startsAt) > now && Number(item.startsAt) < now + horizon);
    if (!starts.length) continue;
    if (event.schedulePending) items.push({eventId:event.id, game, name:event.name, startsAt:Number(starts[0].startsAt), tone:'warn', text:'Horaires à confirmer'});
    for (const departure of starts) {
      const crews = departure.crews || [];
      const assigned = new Set(crews.flatMap(crew => (crew.registrationIds || []).map(String)));
      const waiting = new Set((departure.availability || []).filter(reg => reg.status !== 'unavailable' && !assigned.has(String(reg.id)))
        .map(reg => reg.participantId || reg.id)).size;
      const empty = crews.filter(crew => !(crew.registrationIds || []).length).length;
      const base = {eventId:event.id, game, name:event.name, startsAt:Number(departure.startsAt)};
      if (waiting) items.push({...base, tone:'bad', text:`${waiting} pilote${waiting > 1 ? 's' : ''} sans équipage`});
      if (empty) items.push({...base, tone:'warn', text:`${empty} équipage${empty > 1 ? 's' : ''} sans pilote`});
    }
  }
  return items.sort((a, b) => a.startsAt - b.startsAt || a.name.localeCompare(b.name, 'fr'));
}

// « sam. 7 nov. à 15h ».
export const todoWhen = item => `${date.format(item.startsAt)} à ${clock.format(item.startsAt).replace(':', 'h').replace(/h00$/, 'h').replace(/^0(?=\d)/, '')}`;
