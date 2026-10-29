import test from 'node:test';
import assert from 'node:assert/strict';
import {discordPayloadMarkup,discordPreviewText,discordExportPayload,discordPreviewsMarkup} from '../front/discord-preview.mjs';
import {buildAnnouncementDemo} from '../server/discord-weekly-format.mjs';

test('the comparison shows both named formats together with separate exports',()=>{
  const previews=['embed','v2'].map(format=>({format,name:format==='embed'?'Embed classique':'Carte avec sections · Components V2',payload:buildAnnouncementDemo({announceFormat:format})}));
  const html=discordPreviewsMarkup(previews);
  assert.match(html,/is-comparison/);assert.match(html,/Embed classique/);assert.match(html,/Components V2/);
  assert.match(html,/data-discord-export="0"/);assert.match(html,/data-discord-export="1"/);
  assert.equal((html.match(/<figure/g)||[]).length,2);
  assert.match(html,/dc-embed/);assert.match(html,/dc-container/);
});

test('preview renders both formats and exports the payload without credentials or notifications',()=>{
  for(const announceFormat of ['embed','v2']){
    const payload=buildAnnouncementDemo({announceFormat,bannerUrl:'https://site.example/banner.webp',streamUrl:'https://twitch.tv/test'});
    const markup=discordPayloadMarkup(payload);
    assert.match(markup,/SAFE’S RACE/);assert.match(markup,/Manche 1/);assert.match(markup,/banner.webp/);
    assert.match(markup,/disabled/);assert.match(markup,/dc-style-4/);assert.match(markup,/S’inscrire/);
    const exported=discordExportPayload({...payload,token:'secret',webhook_url:'secret'});
    assert.deepEqual(exported.allowed_mentions,{parse:[]});assert.equal(exported.token,undefined);assert.equal(exported.webhook_url,undefined);
    assert.deepEqual(exported.components,payload.components);
  }
});
test('untrusted names, markdown and URLs never become executable HTML in the preview',()=>{
  const html=discordPayloadMarkup({embeds:[{title:'<script>alert(1)</script>',description:'**Gras** [Lien](https://example.com) [Piège](javascript:alert(1)) <img src=x onerror=alert(1)>',thumbnail:{url:'javascript:alert(1)'},image:{url:'data:text/html,evil'},color:'red" onclick="evil'}]});
  assert.match(html,/<strong>Gras<\/strong>/);assert.match(html,/href="https:\/\/example.com"/);
  assert.ok(!/<script|<img|href="javascript:|onclick="/.test(html));
  assert.match(html,/&lt;script&gt;/);
  assert.match(discordPreviewText('<t:99999999999999999999999:F>'),/&lt;t:/);
});
