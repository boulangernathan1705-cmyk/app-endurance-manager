// Discord Components V2: keep each race and its existing actions together.
// https://docs.discord.com/developers/components/reference
export const COMPONENTS_V2 = 1 << 15;
const text = content => ({type:10, content});
const clip = (value, length) => String(value || '').length > length ? String(value).slice(0, length - 1) + '…' : String(value || '');
const count = component => 1 + (component.components || []).reduce((n, child) => n + count(child), 0) + (component.accessory ? count(component.accessory) : 0);

export function buildAnnouncementV2(intro, items, site = {}) {
  const components = [], cards = items.filter(item => item.payload.embeds?.length);
  // Reserve room for the mention, overflow notice, live link and banner. The
  // character budget is shared across every Text Display in the message.
  let remaining = 3400, used = 0, shown = 0;
  if (intro.content) { components.push(text(clip(intro.content, 100))); used++; }
  const cardBudget = Math.min(1400, Math.floor(remaining / Math.min(cards.length || 1, 5)));
  for (const item of cards) {
    const embed = item.payload.embeds[0];
    const title = clip(embed.title, 180);
    const heading = text(`### ${title}`);
    const children = embed.thumbnail?.url
      ? [{type:9, components:[heading], accessory:{type:11, media:{url:embed.thumbnail.url}, description:title}}]
      : [heading];
    const details = [embed.description, ...(embed.fields || []).map(field =>
      [String(field.name || '').replace(/\u200b/g, '').trim(), field.value].filter(Boolean).join('\n'))].filter(Boolean).join('\n\n');
    const body = clip(details, Math.max(1, Math.min(cardBudget, remaining) - heading.content.length));
    if (body) children.push({type:14, divider:true, spacing:1}, text(body));
    // Keep the bot's custom_id: the existing absence handler remains in charge.
    const buttons = item.payload.components?.flatMap(row => row.components || []).filter(button => button.type === 2).slice(0, 5);
    if (buttons?.length) children.push({type:1, components:structuredClone(buttons)});
    const container = {type:17, accent_color:embed.color || 0x5865f2, components:children};
    const size = count(container), chars = heading.content.length + body.length;
    if (used + size > 33 || chars > remaining) break;
    components.push(container); used += size; remaining -= chars; shown++;
  }
  const omitted = items.length - shown;
  if (omitted > 0) components.push(text(clip(`… ${omitted} autre${omitted > 1 ? 's' : ''} rendez-vous. ${site.url ? `[Programme complet](${site.url}/events/)` : 'Consulte le programme sur le site.'}`, 220)));
  const stream = String(site.streamUrl || '');
  if (/^https:\/\//.test(stream)) {
    const times = [...new Set((site.streams || []).map(item => item.time).filter(time => /^([01]\d|2[0-3]):[0-5]\d$/.test(time)))].sort();
    components.push(text(clip(`📺 **${site.streamName || 'La soirée en direct'}**${times.length ? ` · ${times.map(time => time.replace(':','h')).join(' · ')}` : ''}`, 250)),
      {type:1,components:[{type:2,style:5,label:'Rejoindre le stream',url:stream}]});
  }
  if (site.bannerUrl) components.push({type:12, items:[{media:{url:site.bannerUrl}, description:'Bannière de la communauté'}]});
  if (!components.length) components.push(text('Aucun rendez-vous à afficher.'));
  return {flags:COMPONENTS_V2, components, allowed_mentions:structuredClone(intro.allowed_mentions || {parse:[]})};
}
