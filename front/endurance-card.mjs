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
export function enduranceArtworkClass(event, game) {
  return enduranceSim(event, game) === 'lmu' && LMU_ARTWORK.has(event?.circuit) ? ' endurance-track-'+event.circuit : '';
}
// Known LMU circuits only; no arbitrary class names from event input.
export function endurancePanoramaClass(event, game) {
  const track = enduranceArtworkClass(event, game);
  return track ? ' endurance-pano'+track : '';
}
// The compact cards share one interaction; the detail page retains its own hero.
export function endurancePreviewClass(event, game) {
  const sim = enduranceSim(event, game);
  const track = String(event?.circuit || '').replace(/^iracing-/, '');
  return ' endurance-preview' + (LMU_ARTWORK.has(track) ? ' endurance-preview-track-'+track : '') + ' endurance-preview-'+sim;
}
export function enduranceArtwork(event, game, previewMap = '', caption = '') {
  const sim = enduranceSim(event, game);
  return `<span class="endurance-card-head endurance-sim-${sim}${enduranceArtworkClass(event, game)}">${previewMap}${caption}</span>`;
}

export function enduranceCardIdentity(event, game) {
  const label = enduranceSim(event, game) === 'iracing' ? 'iRacing' : 'LMU';
  return `<span class="endurance-card-identity">${label} Endurance</span>`;
}

export function enduranceCardDuration(event) {
  const minutes = storedDuration(event);
  return Number.isFinite(minutes) && minutes > 0
    ? `<b class="endurance-card-duration endurance-card-duration-pill">${durationLabel(minutes)}</b>` : '';
}

export const enduranceStartIcon = '<svg class="endurance-start-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>';

export function enduranceHeader(event, game, previewMap = '', alwaysDuration = false) {
  const label = enduranceSim(event, game) === 'iracing' ? 'iRacing' : 'LMU';
  const duration = enduranceDuration(event, alwaysDuration);
  const caption = `<span class="endurance-card-caption"><span class="endurance-card-label"><span class="endurance-card-kind">Endurance</span><span class="endurance-card-brand">${label}</span></span>${duration ? `<span class="endurance-card-duration">${duration}</span>` : ''}</span>`;
  return enduranceArtwork(event, game, previewMap, caption);
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
