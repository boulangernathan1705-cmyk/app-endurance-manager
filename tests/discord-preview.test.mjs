import test from 'node:test';
import assert from 'node:assert/strict';
import {discordPayloadMarkup,discordPreviewText,discordExportPayload,discordPreviewsMarkup} from '../front/discord-preview.mjs';
import {buildAnnouncementDemo} from '../server/discord-weekly-format.mjs';
import {eveningDemo} from '../shared/discord-evening-demo.mjs';

test('daily proposals retain detailed sections in one message, with the banner last and disabled sample actions',()=>{
  const walk=items=>items.flatMap(item=>[item,...walk(item.components||[]),...(item.accessory?walk([item.accessory]):[])]);
  const rendered={};
  for(const scenario of ['solo','endurance','multi']){
    const payload=eveningDemo({url:'https://site.example'},Date.parse('2026-10-29T12:00:00Z'),scenario);
    const components=walk(payload.components),frame=payload.components[0];
    assert.equal(payload.flags,32768);assert.deepEqual(payload.allowed_mentions,{parse:[]});
    assert.equal(payload.components.length,1);assert.equal(frame.type,17);assert.ok(frame.components.length<=10);
    assert.equal(frame.components.at(-1).type,12);assert.equal(components.filter(item=>item.type===14).length,3);
    assert.ok(components.length<=40);assert.ok(components.filter(item=>item.type===10).reduce((n,item)=>n+item.content.length,0)<=4000);
    assert.ok(components.filter(item=>item.type===2).every(item=>item.disabled));
    rendered[scenario]=components.filter(item=>item.type===10).map(item=>item.content).join('\n');
    const markup=discordPayloadMarkup(payload);assert.match(markup,/LA SOIRÉE AVEC LA PRALINE/);assert.match(markup,/dc-heading-3/);
    assert.equal(payload.embeds,undefined);assert.equal(payload.content,undefined);
    if(scenario==='endurance')assert.match(frame.components[0].accessory.media.url,/LeMansUltimateLogo/);
  }
  for(const detail of ['MANCHE 01','MANCHE 02','Qualifications : 10 min','⛽ **Carburant** · ×1','13 pilotes inscrits sur 20']){
    assert.ok(rendered.solo.includes(detail));assert.ok(rendered.multi.includes(detail));
  }
  assert.doesNotMatch(rendered.endurance,/\d+\/\d+/);
  assert.match(rendered.endurance,/Ouvert/);assert.match(rendered.endurance,/Fermé/);
  for(const detail of ['Apex Racing','Ferrari 296 GT3','Léa · Hugo','Porsche 911 GT3 R','Sam · Noah · Alex']){
    assert.ok(rendered.endurance.includes(detail));assert.ok(rendered.multi.includes(detail));
  }
});

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
