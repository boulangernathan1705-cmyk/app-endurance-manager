from pathlib import Path

app=Path('app.js')
s=app.read_text()
old='''      <div class="my-entry-accordion-body">\n        <section class="my-entry-section my-entry-self"><div class="my-entry-section-heading"><div><span class="my-entry-kicker">MON INSCRIPTION</span><h3>${esc(reg.name)}</h3></div><span class="my-entry-pill">${esc(reg.category)}</span></div>'''
new='''      <div class="my-entry-accordion-body">\n        <div class="my-entry-actions my-entry-actions-top"><button type="button" class="primary-button" data-action="open" data-id="${event.id}" data-departure="${departure.id}" data-registration="${reg.id}">Voir l’événement complet</button></div>\n        <section class="my-entry-section my-entry-self"><div class="my-entry-section-heading"><div><span class="my-entry-kicker">MON INSCRIPTION</span><h3>${esc(reg.name)}</h3></div><span class="my-entry-pill">${esc(reg.category)}</span></div>'''
if old not in s: raise SystemExit('top insertion target not found')
s=s.replace(old,new,1)
old2='''        ${crewBlock}\n        ${pilotsBlock}\n        <div class="my-entry-actions"><button type="button" class="primary-button" data-action="open" data-id="${event.id}" data-departure="${departure.id}" data-registration="${reg.id}">Voir l’événement complet</button></div>\n      </div>'''
new2='''        ${crewBlock}\n        ${pilotsBlock}\n      </div>'''
if old2 not in s: raise SystemExit('bottom button target not found')
s=s.replace(old2,new2,1)
app.write_text(s)

css=Path('styles/application.css')
t=css.read_text()
if '.my-entry-actions-top' not in t:
    t += '''\n.my-entry-actions-top { padding: 14px 18px; border-bottom: 1px solid var(--border); background: rgba(255,255,255,.015); }\n'''
css.write_text(t)

idx=Path('index.html')
h=idx.read_text().replace('/styles.css?v=17-my-entries-accordion','/styles.css?v=18-my-entries-button-top').replace('/app.js?v=17-my-entries-accordion','/app.js?v=18-my-entries-button-top')
idx.write_text(h)
