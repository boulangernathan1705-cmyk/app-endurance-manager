from pathlib import Path

app=Path('app.js')
s=app.read_text()
s=s.replace('<span class="my-entry-kicker">ÉQUIPAGE FAIT</span>','<span class="my-entry-kicker">MON ÉQUIPAGE</span>',1)
old='''  app.innerHTML=`${button('home','← Retour aux événements','','secondary-button back-button')}
    <div class="event-header event-type-${event.eventType||'private'}"><div class="event-heading-line"><div><h1 class="event-title">${esc(event.name)}</h1><p class="event-subtitle">${eventTypeBadge(event.eventType)} · Course de ${event.durationHours||6} h · Horaires de Paris · ${event.departures.length} départ(s)</p></div>${circuitVisual(event.circuit)}</div>
    <div class="event-category-badges">${event.categories.map(category=>eventBadge(category,eventCategoryCount(event,category))).join('')}</div></div>
    <div class="toolbar">${button('refresh','Actualiser')}${canManage()?button('edit-event','Modifier l’événement',`data-id="${event.id}"`):''}${isAdmin()?button('delete-event','Supprimer l’événement',`data-id="${event.id}"`,'danger-button'):''}</div>
    ${message?`<p class="creation-success" role="status">${esc(message)}</p>`:''}${errorBox()}
    ${canManage()?`<nav class="event-section-tabs" aria-label="Sections de l’événement">${button('event-section','Course',`data-section="race" aria-pressed="${eventSection==='race'}"`,'event-section-tab')}${button('event-section','Équipages',`data-section="crews" aria-pressed="${eventSection==='crews'}"`,'event-section-tab')}</nav>`:''}
    <section class="race-recap" aria-label="Récapitulatif de la course">
      <div class="recap-intro"><p class="recap-kicker">${eventSection==='crews'?'GESTION DES ÉQUIPAGES':'RÉCAPITULATIF DE LA COURSE'}</p><span class="recap-countdown">${nextDeparture?.startsAt>Date.now()?`Prochain départ <strong data-countdown="${nextDeparture.startsAt}">${countdown(nextDeparture.startsAt)}</strong>`:'Tous les départs ont eu lieu'}</span></div>
      <div class="recap-stats"><div><strong>${event.durationHours||6} h</strong><span>durée</span></div><div><strong>${event.departures.length}</strong><span>départ${event.departures.length>1?'s':''}</span></div><div><strong>${totalPilots}</strong><span>pilote${totalPilots>1?'s':''}</span></div><div><strong>${totalCrews}</strong><span>équipage${totalCrews>1?'s':''}</span></div></div>
    </section>
'''
new='''  app.innerHTML=`${button('home','← Retour aux événements','','secondary-button back-button')}
    <div class="event-header event-header-compact event-type-${event.eventType||'private'}">
      <div class="event-heading-line"><div class="event-heading-copy"><h1 class="event-title">${esc(event.name)}</h1><p class="event-subtitle">${eventTypeBadge(event.eventType)} <span>· Horaires de Paris</span></p></div>${circuitVisual(event.circuit)}</div>
      <div class="event-header-summary">
        <div class="event-category-badges">${event.categories.map(category=>eventBadge(category,eventCategoryCount(event,category))).join('')}</div>
        <div class="event-header-stats" aria-label="Récapitulatif de la course"><span><strong>${event.durationHours||6} h</strong><small>durée</small></span><span><strong>${event.departures.length}</strong><small>départ${event.departures.length>1?'s':''}</small></span><span><strong>${totalPilots}</strong><small>pilote${totalPilots>1?'s':''}</small></span><span><strong>${totalCrews}</strong><small>équipage${totalCrews>1?'s':''}</small></span></div>
        <span class="event-header-countdown">${nextDeparture?.startsAt>Date.now()?`Prochain départ <strong data-countdown="${nextDeparture.startsAt}">${countdown(nextDeparture.startsAt)}</strong>`:'Tous les départs ont eu lieu'}</span>
      </div>
    </div>
    <div class="toolbar">${button('refresh','Actualiser')}${canManage()?button('edit-event','Modifier l’événement',`data-id="${event.id}"`):''}${isAdmin()?button('delete-event','Supprimer l’événement',`data-id="${event.id}"`,'danger-button'):''}</div>
    ${message?`<p class="creation-success" role="status">${esc(message)}</p>`:''}${errorBox()}
    ${canManage()?`<nav class="event-section-tabs" aria-label="Sections de l’événement">${button('event-section','Course',`data-section="race" aria-pressed="${eventSection==='race'}"`,'event-section-tab')}${button('event-section','Équipages',`data-section="crews" aria-pressed="${eventSection==='crews'}"`,'event-section-tab')}</nav>`:''}
'''
if old not in s:
    raise SystemExit('event header/recap target not found')
s=s.replace(old,new,1)
app.write_text(s)

css=Path('styles/application.css')
t=css.read_text()
t += r'''

/* Compact event header: title + recap in one block. */
.event-header-compact { display:grid; gap:12px; padding:16px 18px; }
.event-header-compact .event-heading-line { align-items:center; gap:16px; }
.event-header-compact .event-heading-copy { min-width:0; }
.event-header-compact .event-title { margin:0; font-size:clamp(24px,3vw,34px); line-height:1.05; }
.event-header-compact .event-subtitle { display:flex; align-items:center; flex-wrap:wrap; gap:6px; margin:7px 0 0; font-size:13px; }
.event-header-compact .circuit-visual img { width:120px; height:58px; }
.event-header-summary { display:grid; grid-template-columns:minmax(0,1fr) auto auto; align-items:center; gap:12px; padding-top:10px; border-top:1px solid var(--border); }
.event-header-summary .event-category-badges { margin-top:0; }
.event-header-stats { display:flex; align-items:stretch; gap:6px; }
.event-header-stats > span { display:grid; min-width:64px; padding:7px 9px; border:1px solid #334146; border-radius:8px; background:rgba(7,12,14,.34); text-align:center; }
.event-header-stats strong { color:#f5fbf8; font-size:16px; line-height:1.05; }
.event-header-stats small { margin-top:2px; color:#9eafb1; font-size:10px; }
.event-header-countdown { min-width:138px; padding:7px 10px; border:1px solid #42535a; border-radius:8px; color:#aebcbe; font-size:11px; text-align:right; }
.event-header-countdown strong { display:block; margin-top:2px; color:#f2f7f6; font-size:14px; }

@media (max-width:700px) {
  .event-header-compact { gap:9px; padding:11px 12px; }
  .event-header-compact .event-heading-line { gap:8px; align-items:flex-start; }
  .event-header-compact .event-title { font-size:22px; padding-left:9px; border-left-width:3px; }
  .event-header-compact .event-subtitle { margin-top:5px; font-size:11px; }
  .event-header-compact .event-subtitle > span { display:none; }
  .event-header-compact .circuit-visual img { width:76px; height:38px; }
  .event-header-summary { grid-template-columns:1fr; gap:8px; padding-top:8px; }
  .event-header-summary .event-category-badges { gap:5px; flex-wrap:nowrap; overflow-x:auto; scrollbar-width:none; }
  .event-header-summary .event-category-badges::-webkit-scrollbar { display:none; }
  .event-header-summary .event-category-badge { flex:0 0 auto; min-width:0; padding:5px 7px; gap:5px; }
  .event-header-summary .event-category-badge img { width:22px; height:22px; }
  .event-header-summary .event-category-copy strong { font-size:11px; }
  .event-header-summary .event-category-copy small { font-size:9px; }
  .event-header-stats { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:4px; }
  .event-header-stats > span { min-width:0; padding:6px 3px; }
  .event-header-stats strong { font-size:14px; }
  .event-header-stats small { font-size:9px; }
  .event-header-countdown { min-width:0; width:100%; padding:6px 8px; font-size:10px; text-align:left; }
  .event-header-countdown strong { display:inline; margin-left:5px; font-size:11px; }
}
'''
css.write_text(t)

idx=Path('index.html')
h=idx.read_text().replace('/styles.css?v=20-my-entries-status','/styles.css?v=21-compact-event-header').replace('/app.js?v=20-my-entries-status','/app.js?v=21-compact-event-header')
idx.write_text(h)
