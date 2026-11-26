export const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

export const tip = text => `<span class="tip-info" data-tip="${esc(text)}" tabindex="0" role="note" aria-label="${esc(text)}">ⓘ</span>`;

export const row = (tone, title, sub = '', action = '') => `<li class="adm-row is-${tone}"><span><strong>${title}</strong>${sub ? `<small>${sub}</small>` : ''}</span>${action}</li>`;
