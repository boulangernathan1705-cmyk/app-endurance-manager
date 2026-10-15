import {getLocale} from './i18n.mjs';
import {contextHelp} from './context-help-content.mjs';

const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

export function helpButton(topic, permissions = []) {
  const help = contextHelp(topic, permissions, getLocale());
  if (!help) return '';
  const label = getLocale() === 'en' ? 'Help' : 'Aide';
  return `<button type="button" class="context-help-button" data-context-help="${esc(topic)}" data-help-permissions="${esc(JSON.stringify(permissions))}" aria-haspopup="dialog" aria-label="${esc(label + ' : ' + help[0])}"><span aria-hidden="true">?</span> ${label}</button>`;
}

// Native modal: isolates keyboard/focus from the registration form underneath, which stays untouched.
export function openContextHelp(trigger) {
  if (document.querySelector('dialog.context-help-dialog')) return;
  let permissions = [];
  try { permissions = JSON.parse(trigger.dataset.helpPermissions || '[]'); } catch {}
  if (!Array.isArray(permissions)) permissions = [];
  const help = contextHelp(trigger.dataset.contextHelp, permissions, getLocale());
  if (!help) return;
  const closeLabel = getLocale() === 'en' ? 'Close help' : 'Fermer l’aide';
  const dialog = document.createElement('dialog');
  dialog.className = 'context-help-dialog';
  dialog.setAttribute('aria-labelledby', 'context-help-title');
  dialog.dataset.i18nIgnore = 'true';
  dialog.innerHTML = `<header><h2 id="context-help-title">${esc(help[0])}</h2><button type="button" class="context-help-close" aria-label="${closeLabel}" autofocus>×</button></header><div class="context-help-body">${help[1].map(([title, body]) => `<section><h3>${esc(title)}</h3><p>${esc(body)}</p></section>`).join('')}</div>`;
  const close = () => dialog.close();
  dialog.querySelector('button').addEventListener('click', close);
  dialog.addEventListener('click', event => {
    event.stopPropagation();
    if (event.target === dialog) {
      const box = dialog.getBoundingClientRect();
      if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) close();
    }
  });
  const onKey = event => {
    // The close button is the only control: keep Tab in the help, even on browsers
    // that move focus to browser chrome after the last control of a native dialog.
    if (event.key === 'Tab') {
      event.preventDefault(); event.stopImmediatePropagation(); dialog.querySelector('button').focus();
    }
    // The underlying application also closes forms with Escape. Only the help closes here.
    if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); close(); }
  };
  document.addEventListener('keydown', onKey, true);
  dialog.addEventListener('close', () => {
    document.removeEventListener('keydown', onKey, true);
    dialog.remove();
    if (trigger.isConnected) trigger.focus({preventScroll:true});
  }, {once:true});
  document.body.append(dialog);
  dialog.showModal();
}

if (globalThis.document) {
  document.addEventListener('click', event => {
    const trigger = event.target.closest?.('[data-context-help]');
    if (!trigger) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    openContextHelp(trigger);
  }, true);
}
