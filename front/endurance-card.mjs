import {durationLabel} from '../shared/duration.mjs';
import {gameForEvent} from '../shared/catalog.mjs';

const storedDuration = event => Number(event?.durationMinutes) || Number(event?.durationHours) * 60;

// Use the stored race duration, not the schedule (which includes practice/qualifying).
// Hide it only when the title actually contains the same duration.
export function enduranceDuration(event, always = false) {
  const minutes = storedDuration(event);
  if (!Number.isFinite(minutes) || minutes <= 0) return '';
  const title = String(event?.name || '').normalize('NFKC').toLowerCase();
  const hours = /(?:^|[^\p{L}\p{N}])(\d{1,3})\s*(?:heures?|hours?|hrs?|h)(?:\s*(\d{1,2})(?:\s*(?:minutes?|mins?|m))?)?(?![\p{L}\p{N}])/gu;
  const mins = /(?:^|[^\p{L}\p{N}])(\d{1,4})\s*(?:minutes?|mins?|m)(?![\p{L}\p{N}])/gu;
  const shown = [...title.matchAll(hours)].some(m => Number(m[1])*60 + Number(m[2] || 0) === minutes)
    || (minutes < 60 && [...title.matchAll(mins)].some(m => Number(m[1]) === minutes));
  return shown && !always ? '' : durationLabel(minutes).toUpperCase().replace(/\s+/g,'');
}

export const enduranceSim = (event, game = event?.otherGame || gameForEvent(event)) => game === 'iracing' ? 'iracing' : 'lmu';
const LMU_ARTWORK = new Set(['bahrain','barcelona','cota','daytona','fuji','imola','interlagos','laguna-seca','le-mans','long-beach','lusail','monza','paul-ricard','portimao','road-atlanta','sebring','silverstone','spa']);
// Only add local iRacing assets with documented permission (see docs/IRACING_ARTWORK.md).
// The keys are complete iRacing circuit IDs; values identify the permission record.
export const IRACING_ARTWORK = Object.freeze({
  'iracing-spa':'Wikimedia Commons — ContextCreator, CC0 1.0',
  'iracing-bathurst':'Wikimedia Commons — Mountain Ash, CC BY-SA 3.0',
  'iracing-laguna-seca':'Wikimedia Commons — 菅野崇, CC BY-SA 3.0',
  "iracing-adelaide":"Wikimedia Commons — John Dalton, CC BY-SA 3.0",
  "iracing-portimao":"Wikimedia Commons — Pascal Richier pascoual, CC0 1.0",
  "iracing-mexico":"Wikimedia Commons — ProtoplasmaKid, CC BY-SA 4.0",
  "iracing-interlagos":"Wikimedia Commons — Morio, CC BY-SA 3.0",
  "iracing-imola":"Wikimedia Commons — Monia Mascagni, CC BY-SA 4.0",
  "iracing-monza":"Wikimedia Commons — Sitomon, CC BY-SA 2.0",
  "iracing-mugello":"Wikimedia Commons — Anna.Massini, CC BY-SA 4.0",
  "iracing-barcelona":"Wikimedia Commons — Tony Hisgett from Birmingham, UK, CC BY 2.0",
  "iracing-magny-cours":"Wikimedia Commons — Cjp24, CC BY-SA 3.0",
  "iracing-misano":"Wikimedia Commons — Enrico Siboni, CC BY-SA 3.0",
  "iracing-le-mans":"Wikimedia Commons — OldLion, CC BY-SA 4.0",
  "iracing-cota":"Wikimedia Commons — Uppsalo, CC BY-SA 3.0",
  "iracing-daytona":"Wikimedia Commons — ImperialAssassin, Public domain",
  "iracing-fuji":"Wikimedia Commons — United Autosports/James Roberts, CC BY-SA 2.0",
  "iracing-hockenheim":"Wikimedia Commons — Matti Blume, CC BY-SA 4.0",
  "iracing-indianapolis":"Wikimedia Commons — Not specified (public domain), Public domain",
  "iracing-road-atlanta":"Wikimedia Commons — Paradigm Shift Driver Development, CC BY-SA 4.0",
  "iracing-nurburgring-gp":"Wikimedia Commons — No machine-readable author provided. AndyMcG assumed (based on copyright claims)., CC BY-SA 3.0",
  "iracing-nordschleife":"Wikimedia Commons — VLN-Fanclub.de, CC BY-SA 4.0",
  "iracing-red-bull-ring":"Wikimedia Commons — Vanessa Machelett, CC BY-SA 4.0",
  "iracing-road-america":"Wikimedia Commons — Royal Broil, CC BY-SA 2.0",
  "iracing-sebring":"Wikimedia Commons — United Autosports, CC BY-SA 2.0",
  "iracing-silverstone":"Wikimedia Commons — Harvey Milligan, CC BY-SA 4.0",
  "iracing-sonoma":"Wikimedia Commons — Kkern19, CC BY-SA 4.0",
  "iracing-suzuka":"Wikimedia Commons — Tokumeigakarinoaoshima, CC BY-SA 4.0",
  "iracing-thruxton":"Wikimedia Commons — Barrie Cann, CC BY-SA 2.0",
  "iracing-vir":"Wikimedia Commons — Freewheeling Daredevil, CC BY 2.0",
  "iracing-watkins-glen":"Wikimedia Commons — United Autosports, CC BY-SA 2.0",
  "iracing-zandvoort":"Wikimedia Commons — dronepicr, CC BY 2.0",
  "iracing-brands-hatch":"Wikimedia Commons — Whiters, Public domain",
  "iracing-charlotte":"Wikimedia Commons — Nascar1996, CC BY-SA 3.0",
  "iracing-montreal":"Wikimedia Commons — Jmex, CC BY-SA 4.0",
  "iracing-navarra":"Wikimedia Commons — Juanje 2712, CC BY-SA 3.0",
  "iracing-zolder":"Wikimedia Commons — Paul Hermans, CC BY-SA 3.0",
  "iracing-long-beach":"Wikimedia Commons — formulanone from Huntsville, United States, CC BY-SA 2.0",
  "iracing-motegi":"Wikimedia Commons — ranpie, CC BY-SA 2.0",
  "iracing-oschersleben":"Wikimedia Commons — Carsten Steger, CC BY-SA 4.0",
  "iracing-oulton-park":"Wikimedia Commons — Oulton Park race track by TCExplorer, CC BY-SA 2.0",
  "iracing-snetterton":"Wikimedia Commons — Bentley Straight, Snetterton by TCExplorer, CC BY-SA 2.0",
  "iracing-summit-point":"Wikimedia Commons — SmackJam, CC BY-SA 4.0",
  "iracing-the-bend":"Wikimedia Commons — SchueyFan, CC BY-SA 4.0"
});
function artworkTrack(event, game) {
  const id = event?.circuit;
  if (enduranceSim(event, game) === 'iracing') {
    return typeof id === 'string' && /^iracing-[a-z0-9-]+$/.test(id) && Object.hasOwn(IRACING_ARTWORK,id) ? id : '';
  }
  return LMU_ARTWORK.has(id) ? id : '';
}
export function enduranceArtworkClass(event, game) {
  const track = artworkTrack(event, game);
  return track ? ' endurance-track-'+track : '';
}
// Known artwork only; no arbitrary class names from event input.
export function endurancePanoramaClass(event, game) {
  const track = enduranceArtworkClass(event, game);
  return track ? ' endurance-pano'+track : '';
}
// The compact cards share one interaction; the detail page retains its own hero.
export function endurancePreviewClass(event, game) {
  const sim = enduranceSim(event, game);
  // Keep simulator artwork isolated, even when the real-world track is shared.
  const track = artworkTrack(event,sim);
  return ' endurance-preview' + (track ? ' endurance-preview-track-'+track : '') + ' endurance-preview-'+sim;
}
export function enduranceArtwork(event, game, caption = '') {
  const sim = enduranceSim(event, game);
  return `<span class="endurance-card-head endurance-sim-${sim}${enduranceArtworkClass(event, game)}">${caption}</span>`;
}

export function enduranceCardIdentity(event, game) {
  const label = enduranceSim(event, game) === 'iracing' ? 'iRacing' : 'LMU';
  return `<span class="endurance-card-identity"><b>${label}</b> <span>Endurance</span></span>`;
}

export function enduranceCardDuration(event) {
  const minutes = storedDuration(event);
  return Number.isFinite(minutes) && minutes > 0
    ? `<b class="endurance-card-duration endurance-card-duration-pill">${durationLabel(minutes)}</b>` : '';
}

export const enduranceStartIcon = '<svg class="endurance-start-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>';

export function enduranceHeader(event, game) {
  const label = enduranceSim(event, game) === 'iracing' ? 'iRacing' : 'LMU';
  const duration = enduranceDuration(event);
  const caption = `<span class="endurance-card-caption"><span class="endurance-card-label"><span class="endurance-card-kind">Endurance</span><span class="endurance-card-brand">${label}</span></span>${duration ? `<span class="endurance-card-duration">${duration}</span>` : ''}</span>`;
  return enduranceArtwork(event, game, caption);
}

/* Touch: first tap previews, second tap opens the normal link/button.
   A keyboard activation or mouse click still opens immediately. */
if (typeof document !== 'undefined') {
  const selector = '.week-block.is-endurance.endurance-preview, button.race-card.is-endurance.endurance-preview';
  let touchCard = null;
  const cardOf = target => target?.closest?.(selector) || null;
  const clear = except => document.querySelectorAll(selector.split(', ').map(s=>s+'.is-panorama-preview').join(', ')).forEach(card=>{
    if(card!==except) card.classList.remove('is-panorama-preview');
  });
  document.addEventListener('pointerdown', event=>{
    touchCard = event.pointerType === 'touch' || event.pointerType === 'pen' ? cardOf(event.target) : null;
  }, true);
  document.addEventListener('pointercancel', ()=>{touchCard=null;}, true);
  document.addEventListener('click', event=>{
    const card = cardOf(event.target);
    const touch = event.detail !== 0 && (event.pointerType === 'touch' || event.pointerType === 'pen' || (card && card===touchCard));
    touchCard=null;
    if(!card || !touch) { clear(null); return; }
    if(card.classList.contains('is-panorama-preview')) { clear(null); return; }
    clear(card);
    card.classList.add('is-panorama-preview');
    event.preventDefault();
    event.stopImmediatePropagation();
  }, true);
  document.addEventListener('keydown',event=>{if(event.key==='Escape')clear(null);},true);
}
