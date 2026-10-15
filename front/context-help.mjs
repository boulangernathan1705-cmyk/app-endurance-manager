import {getLocale} from './i18n.mjs';
import {contextHelp} from './context-help-content.mjs';

const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

export function helpContext(topic, permissions = []) {
  return `<span hidden data-help-topic="${esc(topic)}" data-help-permissions="${esc(JSON.stringify(permissions))}"></span>`;
}

let launcher = null, observer = null, scheduled = false, sessionPermissions = [];

function currentContext() {
  const markers = [...document.querySelectorAll('[data-help-topic]')].filter(marker =>
    !marker.parentElement.closest('[hidden]') && marker.parentElement.getClientRects().length);
  const marker = markers.filter(marker => marker.closest('[role="dialog"]')).at(-1) || markers.at(-1);
  let topic = marker?.dataset.helpTopic || 'general';
  const workspace = marker?.closest('[role="dialog"]');
  const form = workspace?.querySelector('form');
  const step = form?.dataset.step;
  if (form?.dataset.kind === 'event') topic = `create-race-${step}`;
  if (form?.dataset.kind === 'solo-event') {
    const grid = /gridfest|grindfest/i.test(form.querySelector('[name="eventType"]:checked')?.value || '');
    topic = grid && step === '4' ? 'create-gridfest-4' : `create-event-${step}`;
  }
  if (form?.dataset.kind === 'rally-event') topic = `create-rally-${step}`;
  if (form?.hasAttribute('data-crew-builder-form')) topic = `crew-${step}`;
  if (form?.dataset.kind === 'registration') {
    if (step === '0') topic = 'entry-community';
    else if (['solo', 'rally', 'grindfest'].includes(topic)) {
      topic = step === form.dataset.lastStep ? 'entry-summary' : topic === 'grindfest' && step === '1' ? 'gridfest-entry' : 'solo-entry';
    }
  }
  let permissions = sessionPermissions;
  try { if (marker) permissions = JSON.parse(marker.dataset.helpPermissions); } catch {}
  return {topic, permissions, workspace};
}

function syncLauncher() {
  if (!launcher || document.querySelector('dialog.context-help-dialog')) return;
  const {topic, permissions, workspace} = currentContext();
  const label = getLocale() === 'en' ? 'Help' : 'Aide';
  const help = contextHelp(topic, permissions, getLocale()) || contextHelp('general', permissions, getLocale());
  launcher.dataset.contextHelp = topic;
  launcher.dataset.helpPermissions = JSON.stringify(permissions);
  launcher.setAttribute('aria-label', `${label} : ${help[0]}`);
  launcher.title = label;
  // One DOM button, next to the bell on every page. In a full-screen workspace it
  // moves into its header, so it remains reachable without closing the form.
  const actions = workspace?.querySelector('.registration-workspace-actions');
  if (actions) {
    if (launcher.nextElementSibling !== actions) actions.before(launcher);
  } else {
    const anchor = document.querySelector('.notif-wrap') || document.getElementById('account-menu-root');
    if (anchor && launcher.nextElementSibling !== anchor) anchor.before(launcher);
  }
}

export function installContextHelp(session = null) {
  if (session) sessionPermissions = session.permissions || [];
  if (!launcher) {
    launcher = document.createElement('button');
    launcher.type = 'button';
    launcher.className = 'context-help-button';
    launcher.setAttribute('aria-haspopup', 'dialog');
    launcher.innerHTML = '<span aria-hidden="true">?</span>';
  }
  if (!observer) {
    observer = new MutationObserver(() => {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(() => { scheduled = false; syncLauncher(); });
    });
    observer.observe(document.body, {subtree:true, childList:true, attributes:true, attributeFilter:['hidden', 'data-step']});
  }
  syncLauncher();
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
  dialog.innerHTML = `<header><h2 id="context-help-title">${esc(help[0])}</h2><button type="button" class="context-help-close" aria-label="${closeLabel}" autofocus>×</button></header><div class="context-help-body">${help[1].map(([title, body]) => `<section><h3>${esc(title)}</h3>${Array.isArray(body) ? `<ol>${body.map(text => `<li>${esc(text)}</li>`).join('')}</ol>` : `<p>${esc(body)}</p>`}</section>`).join('')}</div>`;
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
    syncLauncher();
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
    syncLauncher();
    openContextHelp(trigger);
  }, true);
}
