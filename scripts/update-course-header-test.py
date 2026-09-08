from pathlib import Path
p=Path('tests/interface.test.mjs')
s=p.read_text()
s=s.replace("test('course recap, foldable departures, read-only crews for pilots, escaped names',()=>{","test('compact course header, foldable departures, read-only crews for pilots, escaped names',()=>{",1)
s=s.replace("  assert(h.app.innerHTML.includes('RÉCAPITULATIF DE LA COURSE'));\n","  assert(h.app.innerHTML.includes('event-header-stats'));\n",2)
p.write_text(s)
