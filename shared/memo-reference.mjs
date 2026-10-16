// Public reference, kept separate from measured contributor data.
export const REFERENCE_SOURCE = {name:'Ohne Speed', url:'https://www.youtube.com/@ohne_speed', csv:'https://docs.google.com/spreadsheets/d/e/2PACX-1vTN03UvJDm99byA6vQPZHKOCYVvfxLu1zkJAzdaKyROykzEKY2-Xl1rl1q5znZEf36m88dxMKsY2eaO/pub?gid=1766901750&single=true&output=csv'};
export const REFERENCE_COLUMNS = ['Alien','Competitive','Good — rapide','Good — lent','Midpack — rapide','Midpack — lent','Tail-ender','Offline'];
// Exact document family names, not approximate matches between layouts.
export const REFERENCE_CIRCUITS = {bahrain:'Bahrain',barcelona:'Barcelona','le-mans':'Circuit de la Sarthe',cota:'COTA',daytona:'Daytona',fuji:'Fuji',imola:'Imola',interlagos:'Interlagos','laguna-seca':'Laguna Seca','long-beach':'Long Beach',monza:'Monza','paul-ricard':'Paul Ricard',portimao:'Portimao',lusail:'Qatar','road-atlanta':'Road Atlanta',silverstone:'Silverstone',sebring:'Sebring',spa:'Spa'};
const CLASSES = {LMGT3:'GT3',LMH:'Hypercar',LMP3:'LMP3',LMP2elms:'LMP2 ELMS',LMP2wec:'LMP2 WEC',GTE:'GTE'};
export function parseReference(text) {
  const rows = []; let row = [], cell = '', quoted = false;
  for (const c of String(text).slice(0, 1_000_000).replace(/\r/g,'')) {
    if (c === '"') quoted = !quoted;
    else if (!quoted && (c === ',' || c === '\n')) { row.push(cell.trim()); cell = ''; if (c === '\n') { rows.push(row); row = []; } }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell.trim()); rows.push(row); }
  const clock = value => { const match = /^(\d{1,2}):(\d{2}(?:\.\d+)?)$/.exec(value || ''); return match && Number(match[2]) < 60 ? Number(match[1])*60+Number(match[2]) : null; };
  const entries = [];
  for (const cells of rows) {
    const [key,track,patch,qualifying,...rest] = cells;
    if (!track || !key?.startsWith(track)) continue;
    const carClass = CLASSES[key.slice(track.length)], pace = rest.slice(0,8).map(clock);
    if (!carClass || !clock(qualifying) || pace.length !== 8 || pace.some(value => !value || value > 3600)) continue;
    entries.push({track:track.slice(0,80),carClass,patch:String(patch||'').slice(0,30),qualifying:clock(qualifying),pace});
  }
  const updated = /Last updated:\s*(\d{4})\.(\d{2})\.(\d{2})/.exec(text);
  return {entries, updated:updated ? `${updated[1]}-${updated[2]}-${updated[3]}` : null};
}
