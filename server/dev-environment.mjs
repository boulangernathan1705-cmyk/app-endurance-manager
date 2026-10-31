// The dev site (wrangler.jsonc sets SITE_ENV=development) is public: keep search engines away
// and tell visitors that registrations made here do not count. Production is never touched.
const BANNER=`<div class="dev-site-banner" role="note" style="position:relative;z-index:1000;padding:8px 16px;background:#f3b33d;color:#1a1204;font:700 14px/1.35 Barlow,system-ui,sans-serif;text-align:center">Version de test : les inscriptions faites ici ne comptent pas.</div>`;

export function isDevelopment(env) {
  return env?.SITE_ENV==='development';
}
// The production's session cookies are set for the whole domain (Domain=.endurance-manager.app, so that every
// community's address shares them): the browser sends them to dev.endurance-manager.app too. The dev site never
// needs them: they are taken off the request before anything reads, forwards or logs it.
// (A __Host- cookie never has a Domain: it never leaves its own address, and the local site uses it.)
const PRODUCTION_COOKIES = /^__Secure-em_(?:session|oauth|return)=/;
export function withoutProductionCookies(request) {
  const header = request.headers.get('Cookie');
  if (!header) return request;
  const kept = header.split(';').map(item => item.trim()).filter(item => item && !PRODUCTION_COOKIES.test(item));
  if (kept.length === header.split(';').filter(item => item.trim()).length) return request;
  const headers = new Headers(request.headers);
  if (kept.length) headers.set('Cookie', kept.join('; ')); else headers.delete('Cookie');
  return new Request(request, {headers});
}

export function devRobots() {
  return new Response('User-agent: *\nDisallow: /\n',{headers:{'Content-Type':'text/plain; charset=utf-8','X-Robots-Tag':'noindex, nofollow'}});
}

// TEST_BANNER=off: the development site (dev) keeps its own cookies and stays out of
// search engines, without the « Version de test » banner.
export function markDevelopmentResponse(response, env = {}) {
  const marked=new Response(response.body,response);
  marked.headers.set('X-Robots-Tag','noindex, nofollow');
  const type=marked.headers.get('Content-Type')||'';
  if (env?.TEST_BANNER==='off' || !type.includes('text/html') || typeof HTMLRewriter==='undefined') return marked;
  return new HTMLRewriter().on('body',{element(body){body.prepend(BANNER,{html:true});}}).transform(marked);
}
