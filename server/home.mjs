// Home page ("/"): only newcomers see it. A pilot who already chose a simulator (cookie em_sim, set by
// that space) goes straight to it, from the address bar as from the logo of every page.
const SIMULATORS = ['lmu','iracing'];

export function homeRedirect(request) {
  const url = new URL(request.url);
  if (url.pathname !== '/' || url.searchParams.has('accueil')) return null;
  const sim = /(?:^|;\s*)em_sim=([a-z]+)(?:;|$)/.exec(request.headers.get('Cookie') || '')?.[1];
  if (!SIMULATORS.includes(sim)) return null;
  // 302, never 301: a permanent redirect would stay in the browser cache after a change of simulator.
  return new Response(null, {status:302, headers:{Location:`/${sim}/`, 'Cache-Control':'no-store', Vary:'Cookie'}});
}

// The answer depends on the cookie: the home page is never reused from a cache or as a 304, otherwise a
// pilot who has just chosen a simulator would see it again instead of being redirected.
export async function homePage(request, env) {
  const headers = new Headers(request.headers);
  headers.delete('If-None-Match');
  headers.delete('If-Modified-Since');
  const asset = await env.ASSETS.fetch(new Request(request.url, {method:request.method, headers}));
  const page = new Response(asset.body, asset);
  page.headers.delete('ETag');
  page.headers.delete('Last-Modified');
  page.headers.set('Cache-Control', 'no-store');
  page.headers.set('Vary', 'Cookie');
  return page;
}
