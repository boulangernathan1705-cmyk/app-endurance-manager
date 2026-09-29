// Several starts at once in the event form (special events: often 3 days with 5 or 6 starts each).
// Times typed in one go (« 10h 14h 18h30 », « 10:00, 13:30 »): each "HH:MM", sorted, impossible ones ignored.
export function parseStartTimes(text){
  const times=new Set();
  for(const match of String(text||'').matchAll(/(\d{1,2})(?:\s*[h:.](\d{2})?)?(?!\d)/gi)){
    const hour=Number(match[1]),minute=Number(match[2]||0);
    if(hour<=23&&minute<=59)times.add(`${String(hour).padStart(2,'0')}:${String(minute).padStart(2,'0')}`);
  }
  return [...times].sort();
}
export function bulkStartDays(first,count){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(first||''))return [];
  const [y,m,d]=first.split('-').map(Number);
  return Array.from({length:Math.max(1,Math.min(7,Number(count)||1))},(_,index)=>new Date(Date.UTC(y,m-1,d+index)).toISOString().slice(0,10));
}
