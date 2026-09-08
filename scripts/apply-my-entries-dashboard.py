from pathlib import Path

app = Path('app.js')
s = app.read_text()
start = s.index('function renderMyEntries() {')
end = s.index('\nasync function submitRegistration', start)
new = r'''function renderMyEntries() {
  page='my-entries';
  const entries=events.flatMap(event=>event.departures.flatMap(departure=>departure.availability.filter(r=>r.mine||r.managed).map(reg=>({event,departure,reg}))));

  function entryCard({event,departure,reg}) {
    const duration=event.durationHours||6;
    const sameCategory=departure.availability.filter(r=>r.category===reg.category&&r.status!=='unavailable');
    const allAvailable=departure.availability.filter(r=>r.status!=='unavailable');
    const crew=(departure.crews||[]).find(c=>c.registrationIds.includes(reg.id));
    const crewRegs=crew?crew.registrationIds.map(id=>departure.availability.find(r=>r.id===id)).filter(Boolean):[];
    const crewCounts=crew?Array.from({length:duration},(_,i)=>crewRegs.filter(r=>coversHour(r,i)).length):[];
    const crewCovered=crewCounts.filter(n=>n>0).length;
    const eventCrewCount=(departure.crews||[]).length;
    const mineTimeline=pilotAvailability(reg,departure,duration);
    const startState=departure.startsAt<=Date.now()?'Départ passé':countdown(departure.startsAt);

    const crewBlock=crew?`<section class="my-entry-section my-entry-crew"><div class="my-entry-section-heading"><div><span class="my-entry-kicker">MON ÉQUIPAGE</span><h3>${esc(crew.name)}</h3></div><span class="my-entry-pill">${esc(crew.car||'Voiture à définir')}</span></div>
      <div class="my-entry-crew-roster">${crewRegs.map(p=>`<article class="my-entry-pilot ${p.id===reg.id?'is-me':''}"><div class="my-entry-pilot-head"><strong>${esc(p.name)}${p.id===reg.id?' · Moi':''}</strong><span>${esc(statusLabel(p.status))}</span></div>${pilotAvailability(p,departure,duration)}</article>`).join('')}</div>
      <div class="crew-availability-line duration-${duration}" aria-label="Couverture de mon équipage">${crewCounts.map((n,i)=>`<span class="crew-availability-hour ${phaseClass(i,duration)} ${n?'covered':'gap'}" title="${raceHourLabel(departure,i)} : ${n?`${n} pilote(s)`:'aucun pilote'}">${raceHourLabel(departure,i)}</span>`).join('')}</div>
      <p class="coverage-note">${crewCovered===duration?'Toutes les heures sont couvertes par ton équipage.':`${duration-crewCovered} heure(s) restent sans présence dans ton équipage.`}</p>
    </section>`:`<section class="my-entry-section my-entry-waiting"><span class="my-entry-kicker">ÉQUIPAGE</span><h3>${eventCrewCount?'En attente d’affectation':'Aucun équipage créé pour le moment'}</h3><p>${eventCrewCount?`${eventCrewCount} équipage${eventCrewCount>1?'s':''} existe${eventCrewCount>1?'nt':''} déjà sur ce départ, mais tu n’es pas encore affecté.`:'Ton inscription est bien enregistrée. Les organisateurs pourront former les équipages plus tard.'}</p></section>`;

    const pilotsBlock=`<section class="my-entry-section"><div class="my-entry-section-heading"><div><span class="my-entry-kicker">PILOTES SUR MON DÉPART</span><h3>${pilotCount(allAvailable)} pilote(s) inscrit(s)</h3></div><span class="my-entry-pill">${sameCategory.length} en ${esc(reg.category)}</span></div>
      <div class="my-entry-pilot-list">${sameCategory.map(p=>`<article class="my-entry-pilot ${p.id===reg.id?'is-me':''}"><div class="my-entry-pilot-head"><strong>${esc(p.name)}${p.id===reg.id?' · Moi':''}</strong><span>${esc(registrationCarLabel(p))}</span></div>${pilotAvailability(p,departure,duration)}</article>`).join('')}</div>
    </section>`;

    return `<article class="my-entry-card event-type-${event.eventType||'private'}">
      <header class="my-entry-header"><div class="my-entry-title"><span class="my-entry-kicker">${esc(dateLabel(departure))} · ${esc(departure.time)}</span><h2>${esc(event.name)}</h2><div class="my-entry-meta">${eventTypeBadge(event.eventType)} ${badge(reg.category)} <span>${esc(circuitLabel(event.circuit))}</span><span>· ${duration} h</span><span>· ${esc(startState)}</span></div></div>${circuitVisual(event.circuit,true)}</header>
      <section class="my-entry-section my-entry-self"><div class="my-entry-section-heading"><div><span class="my-entry-kicker">MON INSCRIPTION</span><h3>${esc(reg.name)}</h3></div><span class="my-entry-pill">${esc(reg.category)}</span></div>
        <div class="my-entry-preferences"><div><span>Voiture(s) souhaitée(s)</span><strong>${esc(registrationCarLabel(reg))}</strong></div><div><span>Coéquipier souhaité</span><strong>${esc(reg.preferredPilot||'Aucune préférence')}</strong></div></div>${mineTimeline}
      </section>
      ${crewBlock}
      ${pilotsBlock}
      <div class="my-entry-actions"><button type="button" class="primary-button" data-action="open" data-id="${event.id}" data-departure="${departure.id}" data-registration="${reg.id}">Voir l’événement complet</button></div>
    </article>`;
  }

  const section=(title,list)=>`<section class="my-entries-group"><div class="my-entries-group-heading"><h2>${title}</h2><span>${list.length} inscription${list.length>1?'s':''}</span></div>${list.length?`<div class="my-entry-dashboard">${list.map(entryCard).join('')}</div>`:'<p class="empty">Aucune inscription.</p>'}</section>`;

  app.innerHTML=`${button('home','← Retour','','secondary-button back-button')}<div class="my-entries-heading"><div><span class="creation-kicker">ESPACE PILOTE</span><h1 class="page-title">MES INSCRIPTIONS</h1><p>Retrouve ici tes courses, ton équipage et les pilotes inscrits sur le même départ.</p></div></div>${errorBox()}
    ${!user?'<p class="creation-help">Les inscriptions de cet appareil ou de ton lien personnel sont affichées ici.</p>':''}
    ${section('Mes inscriptions personnelles',entries.filter(x=>x.reg.mine))}${entries.some(x=>x.reg.managed)?section('Inscriptions que je gère',entries.filter(x=>x.reg.managed)):''}`;
}
'''
s = s[:start] + new + s[end:]
app.write_text(s)

css = Path('styles/application.css')
text = css.read_text()
marker = '/* My entries pilot dashboard. */'
if marker not in text:
    text += r'''

/* My entries pilot dashboard. */
.my-entries-heading { margin: 8px 0 22px; }
.my-entries-heading .page-title { margin-bottom: 8px; }
.my-entries-heading p { margin: 0; color: var(--muted); }
.my-entries-group { margin-top: 24px; }
.my-entries-group-heading { display:flex; align-items:end; justify-content:space-between; gap:16px; margin-bottom:12px; }
.my-entries-group-heading h2 { margin:0; }
.my-entries-group-heading span { color:var(--muted); font-size:13px; font-weight:800; }
.my-entry-dashboard { display:grid; gap:18px; }
.my-entry-card { overflow:hidden; border:1px solid var(--border); border-radius:14px; background:linear-gradient(180deg,var(--panel2),var(--panel)); box-shadow:0 12px 30px rgba(0,0,0,.18); }
.my-entry-header { display:flex; align-items:stretch; justify-content:space-between; gap:18px; padding:18px; background:linear-gradient(180deg,rgba(255,255,255,.025),transparent); border-bottom:1px solid var(--border); }
.my-entry-title { min-width:0; }
.my-entry-title h2 { margin:4px 0 10px; font-size:clamp(22px,3vw,34px); }
.my-entry-kicker { display:block; color:var(--accent); font-size:11px; font-weight:900; letter-spacing:1.3px; text-transform:uppercase; }
.my-entry-meta { display:flex; align-items:center; flex-wrap:wrap; gap:8px; color:var(--muted); }
.my-entry-header .circuit-visual { flex:0 0 220px; width:220px; height:120px; }
.my-entry-section { padding:16px 18px; border-bottom:1px solid var(--border); }
.my-entry-section-heading { display:flex; align-items:flex-start; justify-content:space-between; gap:12px; margin-bottom:12px; }
.my-entry-section h3 { margin:3px 0 0; font-size:20px; }
.my-entry-pill { display:inline-flex; align-items:center; min-height:30px; padding:6px 10px; border:1px solid var(--border); border-radius:999px; background:var(--panel3); color:var(--text); font-size:12px; font-weight:800; }
.my-entry-preferences { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:10px; margin:12px 0; }
.my-entry-preferences > div { padding:10px 12px; border:1px solid var(--border); border-radius:9px; background:rgba(255,255,255,.02); }
.my-entry-preferences span { display:block; margin-bottom:4px; color:var(--muted); font-size:11px; font-weight:800; text-transform:uppercase; letter-spacing:.6px; }
.my-entry-preferences strong { font-size:14px; }
.my-entry-crew { background:rgba(31,143,90,.045); }
.my-entry-waiting { background:rgba(255,170,0,.035); }
.my-entry-waiting p { margin:8px 0 0; color:var(--muted); }
.my-entry-crew-roster,.my-entry-pilot-list { display:grid; gap:8px; margin:10px 0 12px; }
.my-entry-pilot { padding:10px 12px; border:1px solid var(--border); border-radius:9px; background:rgba(255,255,255,.018); }
.my-entry-pilot.is-me { border-color:rgba(53,185,120,.7); box-shadow:inset 3px 0 0 var(--accent); }
.my-entry-pilot-head { display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:6px; }
.my-entry-pilot-head span { color:var(--muted); font-size:12px; text-align:right; }
.my-entry-actions { display:flex; justify-content:flex-end; padding:14px 18px 18px; }
.my-entry-actions .primary-button { min-width:190px; }
@media (max-width:760px) {
  .my-entry-header { flex-direction:column; }
  .my-entry-header .circuit-visual { width:100%; height:150px; flex-basis:auto; }
  .my-entry-preferences { grid-template-columns:1fr; }
  .my-entry-section-heading,.my-entry-pilot-head { align-items:flex-start; flex-direction:column; }
  .my-entry-pilot-head span { text-align:left; }
  .my-entry-actions { justify-content:stretch; }
  .my-entry-actions .primary-button { width:100%; }
}
'''
css.write_text(text)

index = Path('index.html')
html = index.read_text().replace('/styles.css?v=15-logo-header','/styles.css?v=16-my-entries').replace('/app.js?v=14-logo-availability','/app.js?v=16-my-entries')
index.write_text(html)
