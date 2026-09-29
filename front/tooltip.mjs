// Info bubbles: an element with data-tip="…" explains itself in a small bubble in the site's style. On a
// computer it shows on hover (and on keyboard focus); on a phone, a tap on an element that does nothing else (a
// badge, a pill, a ⓘ) shows it, and the next tap anywhere hides it. One bubble at a time.
let bubble = null, target = null;
const INTERACTIVE = 'a, button, summary, input, select, textarea, label';

function place() {
  if (!bubble || !target?.isConnected) return hide();
  const box = target.getBoundingClientRect(), width = bubble.offsetWidth, height = bubble.offsetHeight;
  const left = Math.min(Math.max(8, box.left + box.width / 2 - width / 2), innerWidth - width - 8);
  const above = box.top - height - 8;
  bubble.style.left = `${Math.round(left)}px`;
  bubble.style.top = `${Math.round(above >= 8 ? above : box.bottom + 8)}px`;
}
function show(element) {
  const text = element?.dataset?.tip;
  if (!text) return;
  if (!bubble) {
    bubble = document.createElement('div');
    bubble.className = 'em-tip';
    bubble.setAttribute('role', 'tooltip');
    document.body.append(bubble);
  }
  target = element;
  bubble.textContent = text;
  bubble.hidden = false;
  place();
}
function hide() {
  target = null;
  if (bubble) bubble.hidden = true;
}

if (globalThis.document) {
  document.addEventListener('pointerover', event => {
    if (event.pointerType !== 'mouse') return;
    const element = event.target.closest?.('[data-tip]');
    if (element && element !== target) show(element);
    else if (!element && target) hide();
  });
  document.addEventListener('pointerleave', hide);
  document.addEventListener('focusin', event => { const element = event.target.closest?.('[data-tip]'); element ? show(element) : hide(); });
  document.addEventListener('focusout', hide);
  // Phone: a tap shows the bubble of a badge or pill; a tap on a button keeps doing what the button does.
  document.addEventListener('click', event => {
    const element = event.target.closest?.('[data-tip]');
    // A ⓘ only explains: a click on it never reaches the field it sits in.
    if (element?.classList.contains('tip-info')) { event.preventDefault(); return element === target ? hide() : show(element); }
    if (matchMedia('(hover: hover)').matches) return;
    if (!element || element.closest(INTERACTIVE)) return hide();
    if (element === target) hide(); else show(element);
  });
  addEventListener('scroll', hide, true);
  addEventListener('resize', hide);
}
