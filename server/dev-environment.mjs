// The dev site (wrangler.jsonc sets SITE_ENV=development) is public: keep search engines away
// and tell visitors that registrations made here do not count. Production is never touched.
const PRODUCTION_URL='https://endurance-manager.app';
const BANNER=`<div class="dev-site-banner" role="note" style="position:relative;z-index:1000;padding:8px 16px;background:#f3b33d;color:#1a1204;font:700 14px/1.35 Barlow,system-ui,sans-serif;text-align:center">Version de test : les inscriptions faites ici ne comptent pas. <a href="${PRODUCTION_URL}" style="color:inherit;text-decoration:underline">Aller sur le site officiel</a></div>`;

export function isDevelopment(env) {
  return env?.SITE_ENV==='development';
}

export function devRobots() {
  return new Response('User-agent: *\nDisallow: /\n',{headers:{'Content-Type':'text/plain; charset=utf-8','X-Robots-Tag':'noindex, nofollow'}});
}

export function markDevelopmentResponse(response) {
  const marked=new Response(response.body,response);
  marked.headers.set('X-Robots-Tag','noindex, nofollow');
  const type=marked.headers.get('Content-Type')||'';
  if (!type.includes('text/html') || typeof HTMLRewriter==='undefined') return marked;
  return new HTMLRewriter().on('body',{element(body){body.prepend(BANNER,{html:true});}}).transform(marked);
}
