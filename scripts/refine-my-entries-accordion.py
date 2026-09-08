from pathlib import Path

app=Path('app.js')
s=app.read_text()
s=s.replace('''    const crewBlock=crew?`<section class="my-entry-section my-entry-crew">''','''    const crewBlock=crew?`<section class="my-entry-section my-entry-crew">''',1)
# Build richer no-crew recap.
old="""    const eventCrewCount=(departure.crews||[]).length;
    const mineTimeline=pilotAvailability(reg,departure,duration);
"""
new="""    const eventCrewCount=(departure.crews||[]).length;
    const assignedIds=new Set((departure.crews||[]).flatMap(c=>c.registrationIds||[]));
    const unassignedSameCategory=sameCategory.filter(p=>!assignedIds.has(p.id));
    const existingCrews=(departure.crews||[]).filter(c=>c.category===reg.category);
    const mineTimeline=pilotAvailability(reg,departure,duration);
"""
if old not in s: raise SystemExit('vars target not found')
s=s.replace(old,new,1)
old_start="""    const crewBlock=crew?`<section class=\"my-entry-section my-entry-crew\">"""
# Replace entire no-crew ternary tail only.
old_tail="""</section>`:`<section class=\"my-entry-section my-entry-waiting\"><span class=\"my-entry-kicker\">ÉQUIPAGE</span><h3>${eventCrewCount?'En attente d’affectation':'Aucun équipage créé pour le moment'}</h3><p>${eventCrewCount?`${eventCrewCount} équipage${eventCrewCount>1?'s':''} existe${eventCrewCount>1?'nt':''} déjà sur ce départ, mais tu n’es pas encore affecté.`:'Ton inscription est bien enregistrée. Les organisateurs pourront former les équipages plus tard.'}</p></section>`;"""
new_tail="""</section>`:`<section class=\"my-entry-section my-entry-waiting\"><span class=\"my-entry-kicker\">ÉQUIPAGE</span><h3>${eventCrewCount?'En attente d’affectation':'Aucun équipage créé pour le moment'}</h3><p>${eventCrewCount?`${eventCrewCount} équipage${eventCrewCount>1?'s':''} existe${eventCrewCount>1?'nt':''} déjà sur ce départ, mais tu n’es pas encore affecté.`:'Ton inscription est bien enregistrée. Les organisateurs pourront former les équipages plus tard.'}</p>
      <div class=\"my-entry-waiting-grid\">
        <div><h4>Pilotes sans équipage · ${esc(reg.category)}</h4><div class=\"my-entry-compact-pilots\">${unassignedSameCategory.map(p=>`<span class=\"my-entry-compact-pilot ${p.id===reg.id?'is-me':''}\"><strong>${esc(p.name)}${p.id===reg.id?' · Moi':''}</strong><small>${esc(registrationCarLabel(p))}${p.preferredPilot?` · souhaite ${esc(p.preferredPilot)}`:''}</small></span>`).join('')||'<p class=\"muted\">Aucun pilote sans équipage dans ta catégorie.</p>'}</div></div>
        <div><h4>Équipages existants · ${esc(reg.category)}</h4><div class=\"my-entry-existing-crews\">${existingCrews.map(c=>{const names=(c.registrationIds||[]).map(id=>departure.availability.find(p=>p.id===id)?.name).filter(Boolean);return `<div class=\"my-entry-existing-crew\"><strong>${esc(c.name)}</strong><span>${esc(c.car||'Voiture à définir')}</span><small>${names.length?esc(names.join(' · ')):'Aucun pilote affecté'}</small></div>`;}).join('')||'<p class=\"muted\">Aucun équipage créé dans ta catégorie.</p>'}</div></div>
      </div><p class=\"coverage-note\">Ouvre l’événement complet pour consulter les disponibilités détaillées des autres pilotes et équipages.</p></section>`;"""
if old_tail not in s: raise SystemExit('crew waiting target not found')
s=s.replace(old_tail,new_tail,1)
# Closed by default.
s=s.replace('''return `<details class="my-entry-card my-entry-accordion event-type-${event.eventType||'private'}" open>''','''return `<details class="my-entry-card my-entry-accordion event-type-${event.eventType||'private'}">''',1)
# Plus on the left like course accordion; remove right chevron.
old_summary='''<summary class="my-entry-header"><div class="my-entry-title"><span class="my-entry-kicker">${esc(dateLabel(departure))} · ${esc(departure.time)}</span><h2>${esc(event.name)}</h2><div class="my-entry-meta">${eventTypeBadge(event.eventType)} ${badge(reg.category)} <span>${esc(circuitLabel(event.circuit))}</span><span>· ${duration} h</span><span>· ${esc(startState)}</span></div></div><div class="my-entry-summary-side">${circuitVisual(event.circuit,true)}<span class="my-entry-chevron" aria-hidden="true">⌄</span></div></summary>'''
new_summary='''<summary class="my-entry-header"><span class="my-entry-toggle" aria-hidden="true">+</span><div class="my-entry-title"><span class="my-entry-kicker">${esc(dateLabel(departure))} · ${esc(departure.time)}</span><h2>${esc(event.name)}</h2><div class="my-entry-meta">${eventTypeBadge(event.eventType)} ${badge(reg.category)} <span>${esc(circuitLabel(event.circuit))}</span><span>· ${duration} h</span><span>· ${esc(startState)}</span></div></div><div class="my-entry-summary-side">${circuitVisual(event.circuit,true)}</div></summary>'''
if old_summary not in s: raise SystemExit('summary target not found')
s=s.replace(old_summary,new_summary,1)
app.write_text(s)

css=Path('styles/application.css')
t=css.read_text()
t += r'''

/* My entries: align accordion interaction with Course. */
.my-entry-header { position: relative; }
.my-entry-toggle { display:grid; place-items:center; flex:0 0 34px; width:34px; height:34px; margin-top:2px; border:1px solid var(--border); border-radius:5px; background:var(--panel3); color:var(--text); font-size:24px; font-weight:800; line-height:1; transition:transform .18s ease,border-color .18s ease,color .18s ease; }
.my-entry-accordion[open] .my-entry-toggle { transform:rotate(45deg); color:var(--accent); border-color:rgba(53,185,120,.6); }
.my-entry-chevron { display:none !important; }
.my-entry-waiting-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:14px; margin-top:14px; }
.my-entry-waiting-grid h4 { margin:0 0 8px; font-size:13px; text-transform:uppercase; letter-spacing:.5px; color:var(--muted); }
.my-entry-existing-crews { display:grid; gap:8px; }
.my-entry-existing-crew { display:grid; grid-template-columns:minmax(0,1fr) auto; gap:3px 10px; padding:9px 11px; border:1px solid var(--border); border-radius:8px; background:rgba(255,255,255,.02); }
.my-entry-existing-crew > span { color:var(--text); font-size:12px; font-weight:800; }
.my-entry-existing-crew > small { grid-column:1/-1; color:var(--muted); }
@media (max-width:760px) {
  .my-entry-toggle { flex-basis:32px; width:32px; height:32px; }
  .my-entry-waiting-grid { grid-template-columns:1fr; }
}
'''
css.write_text(t)

idx=Path('index.html')
h=idx.read_text().replace('/styles.css?v=18-my-entries-button-top','/styles.css?v=19-my-entries-course-accordion').replace('/app.js?v=18-my-entries-button-top','/app.js?v=19-my-entries-course-accordion')
idx.write_text(h)
