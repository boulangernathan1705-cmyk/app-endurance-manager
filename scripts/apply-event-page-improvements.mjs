import {readFile, writeFile, rm} from 'node:fs/promises';

let app = await readFile('app.js','utf8');
const replaceOnce = (source, from, to, label) => {
  if (!source.includes(from)) throw new Error(`Missing marker: ${label}`);
  return source.replace(from,to);
};

app = replaceOnce(app,
`function renderEventCard({event,next,running,archived,end}) {\n  return \`<button class="event-card event-type-\${event.eventType||'private'} \${archived?'archived':''}" data-action="open" data-id="\${event.id}">\n    <span class="event-card-body"><span class="event-card-title-row"><span class="event-name">\${esc(event.name)}</span><span class="event-info">\${eventTypeBadge(event.eventType)} <span>· \${event.durationHours||6} h · \${event.departures.length} départ\${event.departures.length>1?'s':''}</span></span></span>\n    \${circuitVisual(event.circuit,true)}\n    <span class="event-category-badges">\${event.categories.map(category=>eventBadge(category,eventCategoryCount(event,category))).join('')}</span>\n    <span class="event-card-status">\${running?'<span class="event-countdown">Course en cours</span>':''}\n    <span class="event-countdown \${archived?'finished':''}">\${next?\`Prochain départ : \${esc(dateLabel(next))} à \${esc(next.time)} · <span data-countdown="\${next.startsAt}">\${countdown(next.startsAt)}</span>\`:archived?\`Terminé le \${esc(dateLabel({startsAt:end}))}\`:running?'Le dernier départ est encore en course.':'Dates à confirmer'}</span></span></span>\n  </button>\`;\n}`,
`function renderEventCard({event,next,running,archived,end}) {\n  const untilNext=next?next.startsAt-Date.now():Infinity;\n  const statusClass=archived?'finished':running?'running':next&&untilNext<=3600000?'soon':'upcoming';\n  return \`<button class="event-card event-type-\${event.eventType||'private'} \${archived?'archived':''}" data-action="open" data-id="\${event.id}">\n    <span class="event-card-body"><span class="event-card-title-row"><span class="event-name">\${esc(event.name)}</span><span class="event-info">\${eventTypeBadge(event.eventType)} <span>· \${event.durationHours||6} h · \${event.departures.length} départ\${event.departures.length>1?'s':''}</span></span></span>\n    \${circuitVisual(event.circuit,true)}\n    <span class="event-category-badges">\${event.categories.map(category=>eventBadge(category,eventCategoryCount(event,category))).join('')}</span>\n    <span class="event-card-status">\${running?'<span class="event-countdown event-countdown-primary running">COURSE EN COURS</span>':''}\n    <span class="event-countdown \${statusClass}" \${next&&!archived?\`data-status-time="\${next.startsAt}"\`:''}>\${next?\`Prochain départ : \${esc(dateLabel(next))} à \${esc(next.time)} · <span data-countdown="\${next.startsAt}">\${countdown(next.startsAt)}</span>\`:archived?\`Terminé le \${esc(dateLabel({startsAt:end}))}\`:running?'Le dernier est encore en course.':'Dates à confirmer'}</span></span></span>\n  </button>\`;\n}`,'event card status');

app = replaceOnce(app,
`function phaseClass(index,duration) { return \`phase-\${duration>1?Math.round(index*23/(duration-1)):0}\`; }`,
`function phaseClass(index,duration) { return \`phase-\${duration>1?Math.round(index*23/(duration-1)):0}\`; }\nconst raceTimeFormatter=new Intl.DateTimeFormat('fr-FR',{timeZone:'Europe/Paris',hour:'2-digit',minute:'2-digit',hour12:false});\nfunction raceHourLabel(departure,index) {\n  const label=raceTimeFormatter.format(new Date(departure.startsAt+index*3600000)).replace(':','h');\n  return label.endsWith('h00')?label.slice(0,-2):label;\n}`,'race hour helper');

app = replaceOnce(app,
`function renderRegistration(reg,departure,duration) {`,
`function renderRegistration(reg,departure,duration,showCarPreference=true) {`,'registration option');
app = replaceOnce(app,
`<span class="pilot-category-logo">\${reg.category?logo(reg.category):'—'}</span><span class="pilot-car">\${esc(registrationCarLabel(reg))}</span><span class="registration-status">`,
`<span class="pilot-category-logo">\${reg.category?logo(reg.category):'—'}</span>\${showCarPreference?\`<span class="pilot-car">\${esc(registrationCarLabel(reg))}</span>\`:''}<span class="registration-status">`,'hide assigned car preference');
app = replaceOnce(app,
`title="Heure \${i+1}">\${i+1}</span>`,
`title="\${raceHourLabel(departure,i)}">\${raceHourLabel(departure,i)}</span>`,'readonly real hours');
app = replaceOnce(app,
`return button('availability',\`<span class="hour-card-number">\${index+1}</span><span class="hour-card-state">\${active?'✓':''}</span>\`,\`data-departure="\${departure.id}" data-value="\${part}" aria-pressed="\${active}" aria-label="Heure \${index+1} : \${active?'présent':'disponible ?'}" title="Heure \${index+1} · \${active?'Présent':'Disponible ?'}"\`,\`hour-card \${phaseClass(index,duration)} \${active?'active':''}\`);`,
`const hourLabel=raceHourLabel(departure,index);return button('availability',\`<span class="hour-card-number">\${hourLabel}</span><span class="hour-card-state">\${active?'✓':''}</span>\`,\`data-departure="\${departure.id}" data-value="\${part}" aria-pressed="\${active}" aria-label="\${hourLabel} : \${active?'présent':'disponible ?'}" title="\${hourLabel} · \${active?'Présent':'Disponible ?'}"\`,\`hour-card \${phaseClass(index,duration)} \${active?'active':''}\`);`,'form real hours');
app = replaceOnce(app,
`crewRegs.map(reg=>renderRegistration(reg,departure,event.durationHours||6)).join('')`,
`crewRegs.map(reg=>renderRegistration(reg,departure,event.durationHours||6,false)).join('')`,'assigned crew preference');
app = replaceOnce(app,
`title="Heure \${i+1} : \${n?\`\${n} pilote(s)\`:'aucun pilote'}">\${i+1}</span>`,
`title="\${raceHourLabel(departure,i)} : \${n?\`\${n} pilote(s)\`:'aucun pilote'}">\${raceHourLabel(departure,i)}</span>`,'crew real hours');

await writeFile('app.js',app);

let css = await readFile('styles/foundation.css','utf8');
css = replaceOnce(css,
`.event-countdown {\n  margin-top: 10px;\n\n  color: var(--green);\n\n  font-size: 12px;\n  font-weight: 800;\n}\n\n.event-countdown.finished {\n  color: var(--muted);\n}`,
`.event-countdown {\n  margin-top: 10px;\n  color: var(--green);\n  font-size: 12px;\n  font-weight: 800;\n}\n\n.event-countdown.upcoming { color: var(--green); }\n.event-countdown.soon { color: #f0a23a; }\n.event-countdown.running { color: var(--red); }\n.event-countdown.finished { color: var(--muted); }\n.event-countdown-primary {\n  margin-top: 12px;\n  font-size: clamp(22px, 3vw, 32px);\n  line-height: 1;\n  font-weight: 950;\n  letter-spacing: .8px;\n}\n.event-countdown-primary.running {\n  color: var(--red);\n  text-shadow: 0 0 18px rgba(227,76,76,.18);\n}`,'countdown colors');
await writeFile('styles/foundation.css',css);

let tests = await readFile('tests/interface.test.mjs','utf8');
tests = replaceOnce(tests,
`  assert(h.app.innerHTML.includes('Ferrari 499P'));\n  assert(h.app.innerHTML.includes('id="departure-first"'));`,
`  assert(h.app.innerHTML.includes('Ferrari 499P'));\n  assert(h.app.innerHTML.includes('01h'));\n  assert(!h.app.innerHTML.includes('class="pilot-car"'));\n  assert(h.app.innerHTML.includes('id="departure-first"'));`,'interface assertions');
await writeFile('tests/interface.test.mjs',tests);

await rm('scripts/apply-event-page-improvements.mjs',{force:true});
await rm('.github/workflows/apply-event-page-improvements.yml',{force:true});
console.log('Event page improvements applied.');
