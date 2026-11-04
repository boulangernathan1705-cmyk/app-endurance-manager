// Four seasons per year, using the community's Paris calendar.
export const validSeason = value => typeof value === 'string' && /^(20\d{2}|2100)-(01|04|07|10)$/.test(value);
export function currentSeason(now=Date.now()) {
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit'}).formatToParts(now);
  const year=parts.find(p=>p.type==='year').value,month=Number(parts.find(p=>p.type==='month').value);
  return `${year}-${String(Math.floor((month-1)/3)*3+1).padStart(2,'0')}`;
}
