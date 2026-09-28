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

export function changelogHtml(markdown) {
  const out = [];
  let list = false, section = false;
  const closeList = () => { if (list) { out.push('</ul>'); list = false; } };
  const closeSection = () => { closeList(); if (section) { out.push('</section>'); section = false; } };
  for (const raw of String(markdown).split('\n')) {
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
