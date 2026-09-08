from pathlib import Path

app=Path('app.js')
s=app.read_text()
old='''    const pilotsBlock=`<section class="my-entry-section"><div class="my-entry-section-heading"><div><span class="my-entry-kicker">PILOTES SUR MON DÉPART</span><h3>${pilotCount(allAvailable)} pilote(s) inscrit(s)</h3></div><span class="my-entry-pill">${sameCategory.length} en ${esc(reg.category)}</span></div>\n      <div class="my-entry-pilot-list">${sameCategory.map(p=>`<article class="my-entry-pilot ${p.id===reg.id?'is-me':''}"><div class="my-entry-pilot-head"><strong>${esc(p.name)}${p.id===reg.id?' · Moi':''}</strong><span>${esc(registrationCarLabel(p))}</span></div>${pilotAvailability(p,departure,duration)}</article>`).join('')}</div>\n    </section>`;\n\n    return `<article class="my-entry-card event-type-${event.eventType||'private'}">\n      <header class="my-entry-header"><div class="my-entry-title"><span class="my-entry-kicker">${esc(dateLabel(departure))} · ${esc(departure.time)}</span><h2>${esc(event.name)}</h2><div class="my-entry-meta">${eventTypeBadge(event.eventType)} ${badge(reg.category)} <span>${esc(circuitLabel(event.circuit))}</span><span>· ${duration} h</span><span>· ${esc(startState)}</span></div></div>${circuitVisual(event.circuit,true)}</header>\n      <section class="my-entry-section my-entry-self"><div class="my-entry-section-heading"><div><span class="my-entry-kicker">MON INSCRIPTION</span><h3>${esc(reg.name)}</h3></div><span class="my-entry-pill">${esc(reg.category)}</span></div>\n        <div class="my-entry-preferences"><div><span>Voiture(s) souhaitée(s)</span><strong>${esc(registrationCarLabel(reg))}</strong></div><div><span>Coéquipier souhaité</span><strong>${esc(reg.preferredPilot||'Aucune préférence')}</strong></div></div>${mineTimeline}\n      </section>\n      ${crewBlock}\n      ${pilotsBlock}\n      <div class="my-entry-actions"><button type="button" class="primary-button" data-action="open" data-id="${event.id}" data-departure="${departure.id}" data-registration="${reg.id}">Voir l’événement complet</button></div>\n    </article>`;'''
new='''    const otherPilots=sameCategory.filter(p=>!crewRegs.some(c=>c.id===p.id));
    const pilotsBlock=`<section class="my-entry-section my-entry-pilots-summary"><div class="my-entry-section-heading"><div><span class="my-entry-kicker">PILOTES SUR MON DÉPART</span><h3>${pilotCount(allAvailable)} pilote(s) inscrit(s)</h3></div><span class="my-entry-pill">${sameCategory.length} en ${esc(reg.category)}</span></div>
      <div class="my-entry-compact-pilots">${otherPilots.map(p=>`<span class="my-entry-compact-pilot ${p.id===reg.id?'is-me':''}"><strong>${esc(p.name)}${p.id===reg.id?' · Moi':''}</strong><small>${esc(registrationCarLabel(p))}</small></span>`).join('')||'<p class="muted">Aucun autre pilote de ta catégorie hors de ton équipage.</p>'}</div>
    </section>`;

    return `<details class="my-entry-card my-entry-accordion event-type-${event.eventType||'private'}" open>
      <summary class="my-entry-header"><div class="my-entry-title"><span class="my-entry-kicker">${esc(dateLabel(departure))} · ${esc(departure.time)}</span><h2>${esc(event.name)}</h2><div class="my-entry-meta">${eventTypeBadge(event.eventType)} ${badge(reg.category)} <span>${esc(circuitLabel(event.circuit))}</span><span>· ${duration} h</span><span>· ${esc(startState)}</span></div></div><div class="my-entry-summary-side">${circuitVisual(event.circuit,true)}<span class="my-entry-chevron" aria-hidden="true">⌄</span></div></summary>
      <div class="my-entry-accordion-body">
        <section class="my-entry-section my-entry-self"><div class="my-entry-section-heading"><div><span class="my-entry-kicker">MON INSCRIPTION</span><h3>${esc(reg.name)}</h3></div><span class="my-entry-pill">${esc(reg.category)}</span></div>
          <div class="my-entry-preferences"><div><span>Voiture(s) souhaitée(s)</span><strong>${esc(registrationCarLabel(reg))}</strong></div><div><span>Coéquipier souhaité</span><strong>${esc(reg.preferredPilot||'Aucune préférence')}</strong></div></div>${mineTimeline}
        </section>
        ${crewBlock}
        ${pilotsBlock}
        <div class="my-entry-actions"><button type="button" class="primary-button" data-action="open" data-id="${event.id}" data-departure="${departure.id}" data-registration="${reg.id}">Voir l’événement complet</button></div>
      </div>
    </details>`;'''
if old not in s: raise SystemExit('target block not found')
s=s.replace(old,new,1)
app.write_text(s)

css=Path('styles/application.css')
t=css.read_text()
marker='/* My entries accordion refinement. */'
if marker not in t:
    t += r'''

/* My entries accordion refinement. */
.my-entry-accordion > summary { list-style:none; cursor:pointer; }
.my-entry-accordion > summary::-webkit-details-marker { display:none; }
.my-entry-accordion-body { min-width:0; }
.my-entry-summary-side { display:flex; align-items:center; gap:12px; flex:0 0 auto; }
.my-entry-chevron { display:grid; place-items:center; width:34px; height:34px; border:1px solid var(--border); border-radius:50%; background:var(--panel3); color:var(--muted); font-size:22px; font-weight:900; transition:transform .2s ease,color .2s ease,border-color .2s ease; }
.my-entry-accordion[open] .my-entry-chevron { transform:rotate(180deg); color:var(--accent); border-color:rgba(53,185,120,.55); }
.my-entry-compact-pilots { display:flex; flex-wrap:wrap; gap:8px; }
.my-entry-compact-pilot { display:inline-flex; align-items:center; gap:7px; min-height:34px; padding:7px 10px; border:1px solid var(--border); border-radius:999px; background:rgba(255,255,255,.02); }
.my-entry-compact-pilot strong { font-size:13px; }
.my-entry-compact-pilot small { color:var(--muted); font-size:11px; }
.my-entry-compact-pilot.is-me { border-color:rgba(53,185,120,.65); box-shadow:inset 2px 0 0 var(--accent); }
.my-entry-pilots-summary { padding-top:14px; padding-bottom:14px; }
@media (max-width:760px) {
  .my-entry-summary-side { width:100%; }
  .my-entry-summary-side .circuit-visual { flex:1 1 auto; }
  .my-entry-chevron { flex:0 0 34px; }
  .my-entry-compact-pilot { width:100%; justify-content:space-between; border-radius:8px; }
}
'''
css.write_text(t)

idx=Path('index.html')
h=idx.read_text().replace('/styles.css?v=16-my-entries','/styles.css?v=17-my-entries-accordion').replace('/app.js?v=16-my-entries','/app.js?v=17-my-entries-accordion')
idx.write_text(h)
