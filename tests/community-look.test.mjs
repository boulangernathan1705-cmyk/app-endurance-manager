import test from 'node:test';
import assert from 'node:assert/strict';
import {isCommunityPage, freshPageRequest, withCommunityLook} from '../server/community-look.mjs';

// Records the handlers and runs them on fake elements: enough to check what the page would get.
class FakeRewriter {
  constructor() { this.handlers = []; }
  on(selector, handler) { this.handlers.push([selector, handler]); return this; }
  transform(response) { response.handlers = this.handlers; return response; }
}
function element(attributes) {
  return {attributes, getAttribute(name) { return this.attributes[name] ?? null; }, setAttribute(name, value) { this.attributes[name] = value; }, removeAttribute(name) { delete this.attributes[name]; }};
}
const html = () => new Response('<html></html>', {headers:{'Content-Type':'text/html; charset=utf-8', ETag:'"file"'}});

test('a community page comes with its banner, logo and colour, never the site banner first', () => {
  globalThis.HTMLRewriter = FakeRewriter;
  try {
    const community = {slug:'tdz', appearance:{bannerVersion:12, accent:'#ff7b00', discordIcon:'abc'}, discordGuildId:'123456789012345678'};
    const page = withCommunityLook(html(), community);
    assert.equal(page.headers.get('ETag'), null);
    const on = selector => page.handlers.find(([name]) => name === selector)[1];
    const banner = element({src:'/images/endurance-manager-banner.webp', srcset:'x'});
    on('img.hero-banner').element(banner);
    assert.deepEqual(banner.attributes, {src:'/api/community/banner?v=12'});
    const preload = element({href:'/images/endurance-manager-banner.webp?v=39', type:'image/webp'});
    on('link[rel="preload"][as="image"]').element(preload);
    assert.deepEqual(preload.attributes, {href:'/api/community/banner?v=12'});
    const root = element({lang:'fr'});
    on('html').element(root);
    assert.equal(root.attributes['data-community'], 'tdz');
    assert.equal(root.attributes.style, '--community-accent:#ff7b00');
    // No banner of its own: the site banner stays.
    const plain = withCommunityLook(html(), {slug:'fmt', appearance:{accent:'#50d779'}});
    assert.equal(plain.handlers.some(([name]) => name === 'img.hero-banner'), false);
  } finally { delete globalThis.HTMLRewriter; }
});

test('only the pages of a community site are rewritten, asked again in full', () => {
  const page = new Request('https://tdz.example/lmu/', {headers:{Accept:'text/html', 'If-None-Match':'"file"'}});
  assert.equal(isCommunityPage(page, 'tdz'), true);
  assert.equal(isCommunityPage(page, ''), false);
  assert.equal(isCommunityPage(new Request('https://tdz.example/api/session', {headers:{Accept:'text/html'}}), 'tdz'), false);
  assert.equal(freshPageRequest(page).headers.get('If-None-Match'), null);
  assert.equal(withCommunityLook(new Response('{}', {headers:{'Content-Type':'application/json'}}), {slug:'tdz', appearance:{bannerVersion:1}}).headers.get('Content-Type'), 'application/json');
});
