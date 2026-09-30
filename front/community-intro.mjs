// How communities work, explained to the pilots of several communities only: the first time one of them opens an
// entry or a crew, a window he closes with « J'ai compris ». He finds it again in his account menu (« Les communautés »).
const SEEN_KEY = 'em_community_intro_seen_v1';
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

function seen() { try { return localStorage.getItem(SEEN_KEY) === '1'; } catch { return false; } }
function markSeen() { try { localStorage.setItem(SEEN_KEY, '1'); } catch {} }

// `forced`: the first time, only « J'ai compris » closes it; reopened from the menu, Escape and a click outside too.
export function showCommunityIntro({forced = false, communityName = ''} = {}) {
  document.querySelector('[data-community-intro]')?.remove();
  const here = communityName ? `<strong>${esc(communityName)}</strong>` : 'ta communauté';
  const overlay = document.createElement('div');
  overlay.className = 'community-intro-overlay';
  overlay.dataset.communityIntro = 'true';
  overlay.innerHTML = `<section class="community-intro" role="dialog" aria-modal="true" aria-labelledby="community-intro-title">
    <h2 id="community-intro-title">Comment fonctionnent les communautés</h2>
    <ul>
      <li><span aria-hidden="true">🔒</span><p><strong>Chaque communauté est privée.</strong> Les courses, les inscriptions et les équipages de ${here} ne sont vus que par ses membres : les autres communautés n’en voient rien.</p></li>
      <li><span aria-hidden="true">🏁</span><p><strong>Les courses officielles sont communes</strong> (endurances iRacing, courses LMU officielles). Tu t’y inscris avec l’une de tes communautés, et tu n’y vois que les pilotes des communautés dont tu fais partie.</p></li>
      <li><span aria-hidden="true">👥</span><p><strong>Un équipage réunit les pilotes d’une seule communauté.</strong> Le logo devant chaque pilote et chaque équipage indique la sienne.</p></li>
      <li><span aria-hidden="true">↔</span><p><strong>Tu es dans plusieurs communautés :</strong> passe de l’une à l’autre depuis ton menu, rubrique « Mes communautés ».</p></li>
    </ul>
    <p class="community-intro-foot">Tu retrouves ce message à tout moment dans ton menu (clic sur ton nom), « Les communautés ».</p>
    <button type="button" class="primary-button" data-community-intro-ok>J’ai compris</button>
  </section>`;
  const close = () => { markSeen(); overlay.remove(); document.removeEventListener('keydown', onKey, true); };
  const onKey = event => { if (event.key === 'Escape' && !forced) close(); if (event.key === 'Escape' && forced) event.stopPropagation(); };
  overlay.addEventListener('click', event => { if (event.target.closest('[data-community-intro-ok]') || (!forced && event.target === overlay)) close(); });
  document.addEventListener('keydown', onKey, true);
  document.body.append(overlay);
  overlay.querySelector('[data-community-intro-ok]').focus();
}

// The first entry or crew of this browser, for a pilot of several communities: the explanation first.
export function introduceCommunitiesOnce(communityName = '', communityCount = 0) {
  if (communityCount < 2 || seen()) return;
  showCommunityIntro({forced:true, communityName});
}
