// Read-only rendering of the same payload sent to Discord. No bot action is run.
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const url = value => {
  const raw = String(value || '');
  return /^https?:\/\/[^\s]+$/i.test(raw) || /^\/(?!\/)[^\s]+$/.test(raw) ? esc(raw) : '';
};
const color = value => Number.isInteger(value) && value >= 0 && value <= 0xffffff ? `#${value.toString(16).padStart(6,'0')}` : '#5865f2';
const image = (source, alt = '', cls = '') => url(source) ? `<img class="${cls}" src="${url(source)}" alt="${esc(alt)}" loading="lazy" referrerpolicy="no-referrer">` : '';

export function discordPreviewText(value, depth = 0) {
  const raw = String(value || '');
  if (depth > 3) return esc(raw);
  const pattern = /\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)|\*\*([^\n]+?)\*\*|`([^`\n]+)`|\*([^*\n]+)\*|<t:(\d+)(?::([A-Za-z]))?>|<:em_([a-z0-9_]+):\d+>|<(@[!&]?|#)(\d+)>/g;
  let html = '', end = 0;
  for (const match of raw.matchAll(pattern)) {
    html += esc(raw.slice(end, match.index)); end = match.index + match[0].length;
    if (match[1]) html += `<a href="${url(match[2])}" target="_blank" rel="noopener noreferrer">${discordPreviewText(match[1],depth+1)}</a>`;
    else if (match[3]) html += `<strong>${discordPreviewText(match[3],depth+1)}</strong>`;
    else if (match[4]) html += `<code>${esc(match[4])}</code>`;
    else if (match[5]) html += `<i>${esc(match[5])}</i>`;
    else if (match[6]) {
      const date = new Date(Number(match[6]) * 1000), style = match[7];
      const options = ['t','T'].includes(style) ? {timeStyle:style === 'T' ? 'medium' : 'short'}
        : ['d','D'].includes(style) ? {dateStyle:style === 'D' ? 'long' : 'short'} : {dateStyle:'medium',timeStyle:'short'};
      html += `<span class="dc-date">${Number.isFinite(date.getTime()) ? esc(date.toLocaleString('fr-FR',options)) : esc(match[0])}</span>`;
    } else if (match[8]) html += image(`/images/discord-emojis/${match[8]}.png`,'','dc-emoji');
    else html += `<span class="dc-mention">${match[9] === '#' ? '#salon' : '@membre'}</span>`;
  }
  return html + esc(raw.slice(end));
}

function buttons(items = []) {
  return `<div class="dc-buttons">${items.filter(item=>item.type===2).map(item => `<button type="button" class="dc-button dc-style-${Number(item.style)||2}" disabled>${item.emoji?.name ? esc(item.emoji.name)+' ' : ''}${esc(item.label || 'Bouton')}${item.style===5 ? ' ↗' : ''}</button>`).join('')}</div>`;
}
function embedMarkup(embed) {
  const author = embed.author;
  return `<article class="dc-embed" style="--dc-accent:${color(embed.color)}">
    ${embed.thumbnail ? image(embed.thumbnail.url,'Miniature','dc-thumbnail') : ''}
    ${author ? `<div class="dc-author">${image(author.icon_url,'','dc-author-icon')}${esc(author.name)}</div>` : ''}
    ${embed.title ? `<div class="dc-title">${embed.url && url(embed.url) ? `<a href="${url(embed.url)}" target="_blank" rel="noopener noreferrer">${esc(embed.title)}</a>` : esc(embed.title)}</div>` : ''}
    ${embed.description ? `<div class="dc-text">${discordPreviewText(embed.description)}</div>` : ''}
    <div class="dc-fields">${(embed.fields || []).map(field=>`<div class="dc-field${field.inline ? ' is-inline' : ''}"><div class="dc-field-name">${discordPreviewText(field.name)}</div><div class="dc-text">${discordPreviewText(field.value)}</div></div>`).join('')}</div>
    ${embed.image ? image(embed.image.url,'Image du message','dc-image') : ''}
    ${embed.footer || embed.timestamp ? `<div class="dc-footer">${image(embed.footer?.icon_url,'','dc-author-icon')}${esc(embed.footer?.text)}${embed.timestamp && Number.isFinite(Date.parse(embed.timestamp)) ? ` · ${esc(new Date(embed.timestamp).toLocaleString('fr-FR'))}` : ''}</div>` : ''}
  </article>`;
}
function componentMarkup(component, depth = 0) {
  if (!component || depth > 5) return '';
  const children = () => (component.components || []).map(child=>componentMarkup(child,depth+1)).join('');
  switch (component.type) {
    case 1: return buttons(component.components);
    case 9: return `<div class="dc-section"><div>${children()}</div>${component.accessory?.type===2 ? buttons([component.accessory]) : image(component.accessory?.media?.url,component.accessory?.description,'dc-section-image')}</div>`;
    case 10: return `<div class="dc-text">${String(component.content || '').split('\n').map(line=>/^#{1,3} /.test(line) ? `<div class="dc-title">${discordPreviewText(line.replace(/^#{1,3} /,''))}</div>` : discordPreviewText(line)).join('\n')}</div>`;
    case 12: return `<div class="dc-gallery">${(component.items || []).map(item=>image(item.media?.url,item.description,'dc-image')).join('')}</div>`;
    case 14: return `<div class="dc-separator${component.divider===false ? ' no-line' : ''}${component.spacing===2 ? ' is-large' : ''}"></div>`;
    case 17: return `<article class="dc-container" style="--dc-accent:${color(component.accent_color)}">${children()}</article>`;
    default: return '';
  }
}
export function discordPayloadMarkup(payload = {}) {
  return `<div class="dc-message"><div class="dc-bot"><span class="dc-avatar">EM</span><strong>Endurance Manager</strong><span class="dc-bot-tag">APP</span></div><div class="dc-message-body">${payload.content ? `<div class="dc-text">${discordPreviewText(payload.content)}</div>` : ''}${(payload.embeds || []).map(embedMarkup).join('')}${(payload.components || []).map(item=>componentMarkup(item)).join('')}</div></div>`;
}
export function discordPreviewsMarkup(previews) {
  if (!previews?.length) return '<p>Rien à publier pour le moment. Les prochaines courses apparaîtront toutes seules.</p>';
  const comparison=previews.every(item=>['embed','v2'].includes(item.format));
  const cards=previews.map((item,index)=>`<figure class="recap-preview"><figcaption><span>${item.format?'':'# '}${esc(item.name)}</span><button type="button" class="secondary-button" data-discord-export="${index}">Exporter le JSON</button></figcaption>${discordPayloadMarkup(item.payload)}</figure>`).join('');
  return `<div class="dc-preview-toolbar"><span>${comparison?'Comparer les deux versions':'Aperçu de présentation'}</span><div role="group" aria-label="Largeur de l’aperçu"><button type="button" class="secondary-button" data-discord-preview-size="desktop" aria-pressed="true">Ordinateur</button><button type="button" class="secondary-button" data-discord-preview-size="mobile" aria-pressed="false">Mobile</button></div></div><p class="members-help">${comparison?'Les deux cartes utilisent les mêmes données d’exemple. Le format enregistré ne change pas. ':''}Les boutons sont inactifs ici. Le rendu peut varier dans Discord ; les dates suivent le fuseau de ton appareil.</p><div class="dc-preview-cards${comparison?' is-comparison':''}">${cards}</div>`;
}
// A raw Discord payload, without webhook credentials or mentions that can ping.
export function discordExportPayload(payload) {
  const result = {};
  for (const key of ['content','embeds','components','flags']) if (payload[key] != null) result[key] = structuredClone(payload[key]);
  result.allowed_mentions = {parse:[]};
  return result;
}
