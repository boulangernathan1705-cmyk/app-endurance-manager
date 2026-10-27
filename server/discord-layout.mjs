// The « Discord » setting asked question by question (Administration → Modules), and what it means on the server.
// layout: the admins' answers (community_recap_settings.layout, JSON). cats: the categories the bot made for it.
//   mode: 'events' (une catégorie par course) or 'general' (récap de la semaine + pit talk)
//   sims: 'all', 'lmu' or 'iracing'; split: LMU and iRacing apart (only with both)
//   under: where the bot's categories go ('top' or a category)
//   events mode: showWeek / showEvents, the channels of the bot's category (« Endurance Manager », or « LMU » and « iRacing »)
//   general mode: week.all (together) or week.lmu / week.iracing (apart), events: where each goes, a place being
//     '' (not shown), 'bot' (in the bot's category) or a channel / category of the server (the bot's channel goes just below);
//     events may also be 'same' (with the endurances)
//   voices, pit ('bot': the bot makes « Pit talk » just below pitAt, 'existing': in the category pitAt), reminders
export const CATEGORY_NAMES = {main:'Endurance Manager', lmu:'LMU', iracing:'iRacing', pit:'🎙️ Pit talk'};
const SIMS = {all:['lmu','iracing'], lmu:['lmu'], iracing:['iracing']};
const ID = /^\d{15,22}$/;
const bad = message => Object.assign(new Error(message), {status:400});

export function parseLayout(value) {
  try { const layout = typeof value === 'string' ? (value ? JSON.parse(value) : null) : value; return layout && typeof layout === 'object' ? layout : null; }
  catch { return null; }
}
export function parseCategories(value) {
  try { const cats = JSON.parse(value || '{}'); return cats && typeof cats === 'object' ? cats : {}; } catch { return {}; }
}

// The answers as sent by the page: checked and normalised (an unknown place is refused, not ignored).
export function layoutInput(input) {
  const mode = input?.mode;
  if (!['events','general'].includes(mode)) throw bad('Choisis comment ranger les courses.');
  const sims = SIMS[input.sims] ? input.sims : null;
  if (!sims) throw bad('Choisis les simus à afficher.');
  const category = (value, label) => {
    if (value === 'top') return 'top';
    if (!ID.test(String(value || ''))) throw bad(`Choisis ${label}.`);
    return String(value);
  };
  const place = (value, extra = []) => {
    const text = String(value ?? '').trim();
    if (!text || text === 'bot' || extra.includes(text) || ID.test(text)) return text;
    throw bad('Choisis un endroit sur le serveur Discord de cette communauté.');
  };
  const split = sims === 'all' && input.split === true;
  const layout = {v:1, mode, sims, split, voices:input.voices === true, reminders:input.reminders === true};
  if (mode === 'events') Object.assign(layout, {showWeek:input.showWeek === true, showEvents:input.showEvents === true});
  else {
    layout.week = split ? {lmu:place(input.week?.lmu), iracing:place(input.week?.iracing)} : {all:place(input.week?.all)};
    layout.events = place(input.events, ['same']);
    if (layout.voices) {
      layout.pit = input.pit === 'existing' ? 'existing' : 'bot';
      layout.pitAt = category(input.pitAt, layout.pit === 'bot' ? 'sous quelle catégorie créer « Pit talk »' : 'la catégorie des vocaux');
    }
  }
  if (wantedCategories(layout).some(key => key !== 'pit')) layout.under = category(input.under, 'où placer la catégorie du bot');
  return layout;
}

const usesBot = layout => [...Object.values(layout.week || {}), layout.events].includes('bot');
// The categories the bot makes for these answers.
export function wantedCategories(layout) {
  if (!layout) return [];
  const keys = layout.mode === 'events' ? (layout.split ? [...SIMS.all] : ['main']) : usesBot(layout) ? ['main'] : [];
  if (layout.mode === 'general' && layout.voices && layout.pit === 'bot') keys.push('pit');
  return keys;
}

// What goes where: the week's messages (kind, the channel's place and name), the category each sim's races go under,
// and the category of the voices. eventChannel: the name of the events' channel (after the community's module).
export function layoutPlan(layout, cats, {eventChannel = 'event-solo-de-la-semaine', calendar = true} = {}) {
  const sims = SIMS[layout.sims] || SIMS.all, filter = layout.sims === 'all' ? null : layout.sims;
  const week = [], anchors = {lmu:'', iracing:''};
  const add = (kind, destination, channel, sim = null) => { if (destination && (calendar || !kind.startsWith('calendar'))) week.push({kind, destination, channel, sim, topic:channel}); };
  if (layout.mode === 'events') {
    const groups = layout.split ? sims.map(sim => ({cat:cats[sim], sims:[sim]})) : [{cat:cats.main, sims}];
    for (const group of groups) {
      if (!group.cat) continue;
      for (const sim of group.sims) anchors[sim] = group.cat;
      if (layout.showWeek) for (const sim of group.sims) add(sim, group.cat, 'endurances-de-la-semaine');
      if (layout.showEvents) layout.split ? add(`calendar:${group.sims[0]}`, group.cat, eventChannel, group.sims[0]) : add('calendar', group.cat, eventChannel, filter);
    }
  } else {
    const at = value => value === 'bot' ? cats.main || '' : value || '';
    const races = layout.split ? sims.map(sim => ({sims:[sim], at:at(layout.week?.[sim]), channel:`${sim}-de-la-semaine`}))
      : [{sims, at:at(layout.week?.all), channel:'endurances-de-la-semaine'}];
    for (const group of races) for (const sim of group.sims) add(sim, group.at, group.channel);
    if (layout.events === 'same') for (const group of races) layout.split ? add(`calendar:${group.sims[0]}`, group.at, group.channel, group.sims[0]) : add('calendar', group.at, group.channel, filter);
    else add('calendar', at(layout.events), eventChannel, filter);
  }
  const voiceCategory = layout.mode === 'events' ? cats.main || cats.lmu || cats.iracing || null
    : !layout.voices ? null : layout.pit === 'bot' ? cats.pit || null : layout.pitAt === 'top' ? null : layout.pitAt || null;
  return {week, anchors, voiceCategory};
}

// The places the admins chose on their server (to check the bot's rights there).
export function chosenPlaces(layout) {
  const ids = [layout.under, layout.pitAt, ...Object.values(layout.week || {}), layout.events].filter(value => ID.test(String(value || '')));
  return [...new Set(ids)];
}
