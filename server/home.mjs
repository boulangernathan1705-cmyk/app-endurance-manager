// Home page ("/"): a returning pilot goes straight to the simulator space they last visited (cookie
// em_sim set by that space); "/?accueil" always shows the home. For the others, the upcoming races are
// embedded in the page so it shows them at once, without a "Chargement…" step.
const SIMULATORS = ['lmu','iracing'];

export function homeRedirect(request) {
  const url = new URL(request.url);
  if (url.pathname !== '/' || url.searchParams.has('accueil')) return null;
  const sim = /(?:^|;\s*)em_sim=([a-z]+)(?:;|$)/.exec(request.headers.get('Cookie') || '')?.[1];
  if (!SIMULATORS.includes(sim)) return null;
  // 302, never 301: a permanent redirect would stay in the browser cache after a change of simulator.
  return new Response(null, {status:302, headers:{Location:`/${sim}/`, 'Cache-Control':'no-store', Vary:'Cookie'}});
}

// The embedded data changes with every entry: the page is never served from a cache or as a 304.
export async function homeWithRaces(request, env, loadRaces) {
  const headers = new Headers(request.headers);
  headers.delete('If-None-Match');
  headers.delete('If-Modified-Since');
  const asset = await env.ASSETS.fetch(new Request(request.url, {method:request.method, headers}));
  const page = new Response(asset.body, asset);
  page.headers.delete('ETag');
  page.headers.delete('Last-Modified');
  page.headers.set('Cache-Control', 'no-store');
  page.headers.set('Vary', 'Cookie');
  if (!asset.ok || typeof HTMLRewriter === 'undefined' || !(page.headers.get('Content-Type') || '').includes('text/html')) return page;
  let races;
  try { races = await loadRaces(); } catch { return page; }
  // JSON in a data block (not executed, allowed by the Content Security Policy); "<" escaped so the
  // data can never close the tag.
  const data = JSON.stringify(races).replace(/</g, '\\u003c');
  return new HTMLRewriter().on('body', {element(body) { body.append(`<script type="application/json" id="hub-races">${data}</script>`, {html:true}); }}).transform(page);
}
