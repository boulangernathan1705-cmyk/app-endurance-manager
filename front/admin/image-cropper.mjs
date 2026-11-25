// Banner: cropped to 2048 × 512 in the browser (centre) and compressed, WebP (JPEG where WebP is not available).
// Framing of a new banner by the admin: the image is dragged in a 2048 × 512 frame and zoomed with a slider
// (or the mouse wheel); it always covers the whole frame.
let cropper = null;

export const cropCanvas = () => cropper?.canvas;
export function resetCropper() { cropper = null; }
function drawCropper() {
  const {canvas, bitmap, zoom} = cropper, W = canvas.width, H = canvas.height;
  const scale = Math.max(W / bitmap.width, H / bitmap.height) * zoom, w = bitmap.width * scale, h = bitmap.height * scale;
  cropper.x = Math.min(0, Math.max(W - w, cropper.x ?? (W - w) / 2));
  cropper.y = Math.min(0, Math.max(H - h, cropper.y ?? (H - h) / 2));
  const context = canvas.getContext('2d');
  context.clearRect(0, 0, W, H);
  context.drawImage(bitmap, cropper.x, cropper.y, w, h);
}
export function setZoom(zoom) {
  const W = cropper.canvas.width, H = cropper.canvas.height;
  // Zoom around the centre of the frame.
  const ratio = zoom / cropper.zoom;
  cropper.x = W / 2 - (W / 2 - cropper.x) * ratio;
  cropper.y = H / 2 - (H / 2 - cropper.y) * ratio;
  cropper.zoom = zoom;
  drawCropper();
}
export async function openCropper(file, container) {
  const bitmap = await createImageBitmap(file);
  const bot = container.dataset.imageKind === 'bot';
  container.querySelector('.banner-cropper')?.remove();
  const box = document.createElement('div');
  box.className = `banner-cropper${bot ? ' bot-cropper' : ''}`;
  box.innerHTML = `<div class="banner-crop-frame"><canvas width="${bot ? 512 : 2048}" height="512" aria-label="${bot ? 'Cadrage du logo' : 'Cadrage de la bannière'}"></canvas></div>
    <label class="banner-crop-zoom">Zoom<input type="range" min="1" max="4" step="0.01" value="1" data-banner-zoom></label>
    <p class="members-help">Fais glisser l’image pour choisir la partie visible, et zoome si besoin.</p>
    <div class="settings-actions"><button type="button" class="primary-button" data-banner-save>${bot ? 'Enregistrer le logo' : 'Enregistrer la bannière'}</button><button type="button" class="secondary-button" data-banner-cancel>Annuler</button></div>`;
  const shown = container.querySelector('.settings-bot-current') || container.querySelector('.settings-banner-preview');
  shown.after(box);
  shown.hidden = true;
  const canvas = box.querySelector('canvas');
  cropper = {canvas, bitmap, zoom:1, x:null, y:null};
  drawCropper();
  let drag = null;
  canvas.addEventListener('pointerdown', event => { drag = {x:event.clientX, y:event.clientY}; canvas.setPointerCapture(event.pointerId); });
  canvas.addEventListener('pointermove', event => {
    if (!drag) return;
    const ratio = canvas.width / canvas.getBoundingClientRect().width;
    cropper.x += (event.clientX - drag.x) * ratio; cropper.y += (event.clientY - drag.y) * ratio;
    drag = {x:event.clientX, y:event.clientY};
    drawCropper();
  });
  canvas.addEventListener('pointerup', () => { drag = null; });
  canvas.addEventListener('wheel', event => {
    event.preventDefault();
    const slider = box.querySelector('[data-banner-zoom]');
    slider.value = Math.min(4, Math.max(1, cropper.zoom * (event.deltaY < 0 ? 1.08 : 1 / 1.08)));
    setZoom(Number(slider.value));
  }, {passive:false});
}
export function closeCropper(container) {
  container.querySelector('.banner-cropper')?.remove();
  const preview = container.querySelector('.settings-bot-current') || container.querySelector('.settings-banner-preview');
  if (preview) preview.hidden = false;
  cropper = null;
}
export async function bannerImage(canvas) {
  for (const quality of [.85, .75, .62, .5]) {
    let blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/webp', quality));
    if (blob?.type !== 'image/webp') blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', quality));
    if (blob && blob.size <= 600000) return blob;
  }
  throw new Error('Cette image reste trop lourde : essaie une image plus simple.');
}
// Logo of the bot: Discord takes PNG or JPEG only (PNG keeps the transparency).
export async function botImage(canvas) {
  for (const [type, quality] of [['image/png'], ['image/jpeg', .9], ['image/jpeg', .75]]) {
    const blob = await new Promise(resolve => canvas.toBlob(resolve, type, quality));
    if (blob && blob.size <= 1000000) return blob;
  }
  throw new Error('Cette image reste trop lourde : essaie une image plus simple.');
}
