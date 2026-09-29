// Info bubbles: an element with data-tip="…" explains itself in a small bubble in the site's style. With a
// mouse it shows on hover (and on keyboard focus); with a finger, a tap on an element that does nothing else (a
// badge, a pill, a ⓘ) shows it, and the next tap anywhere hides it. One bubble at a time.
let bubble = null, target = null, lastTouch = 0;
const INTERACTIVE = 'a, button, summary, input, select, textarea, label';
// A touch is followed by emulated mouse events: they are ignored for a moment (touch screens, hybrid laptops).
const touching = () => Date.now() - lastTouch < 900;

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
  document.addEventListener('touchstart', () => { lastTouch = Date.now(); }, {capture:true, passive:true});
  document.addEventListener('mouseover', event => {
    if (touching()) return;
    const element = event.target.closest?.('[data-tip]');
    if (element && element !== target) show(element);
    else if (!element && target) hide();
  });
  document.addEventListener('mouseout', event => { if (!event.relatedTarget) hide(); });
  document.addEventListener('focusin', event => { if (touching()) return; const element = event.target.closest?.('[data-tip]'); element ? show(element) : hide(); });
  document.addEventListener('focusout', () => { if (!touching()) hide(); });
  document.addEventListener('click', event => {
    const element = event.target.closest?.('[data-tip]');
    // A ⓘ only explains: a click on it never reaches the field it sits in.
    if (element?.classList.contains('tip-info')) { event.preventDefault(); return element === target ? hide() : show(element); }
    if (!touching()) return;
    // Finger: a tap shows the bubble of a badge or pill; a tap on a button keeps doing what the button does.
    if (!element || element.closest(INTERACTIVE)) return hide();
    if (element === target) hide(); else show(element);
  });
  addEventListener('scroll', hide, {passive:true});
  addEventListener('resize', hide);
}
