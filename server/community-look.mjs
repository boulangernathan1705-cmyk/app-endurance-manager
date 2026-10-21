import {appearanceOf} from './community.mjs';

// Pages of a community's site come with its banner, logo and colour already in place: the browser never shows
// the site's own banner first, then swaps it once /api/session has answered (front/account-menu.mjs does it again).
export function isCommunityPage(request, label) {
  const url = new URL(request.url);
  return Boolean(label) && ['GET','HEAD'].includes(request.method) && !url.pathname.startsWith('/api/')
    && (request.headers.get('Accept') || '').includes('text/html');
}

// The page differs from the static file: asked again in full (no 304 from the file's ETag) and never kept as is.
export function freshPageRequest(request) {
  const headers = new Headers(request.headers);
  headers.delete('If-None-Match');
  headers.delete('If-Modified-Since');
  return new Request(request, {headers});
}

export function withCommunityLook(response, community) {
  const type = response.headers.get('Content-Type') || '';
  if (!community || response.status !== 200 || !type.includes('text/html') || typeof HTMLRewriter === 'undefined') return response;
  const {bannerUrl, logoUrl, accent} = appearanceOf(community);
  if (!bannerUrl && !logoUrl && !accent) return response;
  const page = new Response(response.body, response);
  page.headers.delete('ETag');
  page.headers.delete('Last-Modified');
  page.headers.set('Cache-Control', 'no-cache');
  let rewriter = new HTMLRewriter().on('html', {element(html) {
    html.setAttribute('data-community', community.slug);
    if (accent) { html.setAttribute('style', `--community-accent:${accent}`); html.setAttribute('data-community-accent', 'true'); }
  }});
  if (bannerUrl) rewriter = rewriter
    .on('img.hero-banner', {element(image) { image.removeAttribute('srcset'); image.setAttribute('src', bannerUrl); }})
    .on('link[rel="preload"][as="image"]', {element(link) { if ((link.getAttribute('href') || '').includes('-banner')) { link.setAttribute('href', bannerUrl); link.removeAttribute('type'); } }});
  if (logoUrl) rewriter = rewriter
    .on('img.brand-mark', {element(image) { image.setAttribute('src', logoUrl); }})
    .on('link[rel="icon"]', {element(link) { link.setAttribute('href', logoUrl); link.setAttribute('type', 'image/png'); }});
  return rewriter.transform(page);
}
