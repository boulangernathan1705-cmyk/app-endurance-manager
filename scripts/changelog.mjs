// Turns CHANGELOG.md into the content of the "Nouveautés" page (changelog.html).
// CHANGELOG.md stays the single source: its sections paste as-is into Discord, which reads Markdown.
// Only what the changelog uses is supported: # / ## / ### titles, "- " lists, paragraphs, **bold**,
// `code` and [links](https://…). Every other character is escaped.

const escape = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

function inline(text) {
  return escape(text)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/\[([^\]]+)\]\(((?:https:\/\/|\/)[^)\s]+)\)/g, '<a href="$2">$1</a>');
}

// Releases keep their version history in Markdown; the page combines their notes by day.
function dailyNotes(markdown) {
  const intro = [], groups = [], days = new Map();
  let current;
  for (const line of String(markdown).split('\n')) {
    if (line.startsWith('## ')) {
      const heading = line.slice(3).trim();
      const date = heading.match(/ — (\d{1,2} [^\d]+ \d{4})$/)?.[1];
      const key = date?.normalize('NFC').toLocaleLowerCase('fr-FR').replace(/^0(?=\d)/, '');
      current = key ? days.get(key) : null;
      if (!current) {
        current = {title: date || heading, lines: []};
        groups.push(current);
        if (key) days.set(key, current);
      }
    } else if (current) current.lines.push(line);
    else intro.push(line);
  }
  return [...intro, ...groups.flatMap(group => [`## ${group.title}`, ...group.lines])].join('\n');
}

export function changelogHtml(markdown) {
  const out = [];
  let list = false, section = false;
  const closeList = () => { if (list) { out.push('</ul>'); list = false; } };
  const closeSection = () => { closeList(); if (section) { out.push('</section>'); section = false; } };
  for (const raw of dailyNotes(markdown).split('\n')) {
    const line = raw.trimEnd();
    if (!line.trim()) { closeList(); continue; }
    if (line.startsWith('# ')) { closeSection(); out.push(`<h1>${inline(line.slice(2))}</h1>`); continue; }
    if (line.startsWith('## ')) { closeSection(); out.push(`<section class="changelog-version"><h2>${inline(line.slice(3))}</h2>`); section = true; continue; }
    if (line.startsWith('### ')) { closeList(); out.push(`<h3>${inline(line.slice(4))}</h3>`); continue; }
    if (line.startsWith('- ')) { if (!list) { out.push('<ul>'); list = true; } out.push(`<li>${inline(line.slice(2))}</li>`); continue; }
    closeList();
    out.push(`<p${section ? '' : ' class="updated"'}>${inline(line)}</p>`);
  }
  closeSection();
  return out.join('\n');
}
