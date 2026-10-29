import test from 'node:test';
import assert from 'node:assert/strict';
import {rallyComparison} from '../server/discord-rally-preview.mjs';
import {tdzRallyCapture} from '../shared/discord-tdz-rally-capture.mjs';
import {discordPreviewsMarkup} from '../front/discord-preview.mjs';

test('TDZ comparison uses the capture facts, marks fixed counts and never invents missing rally settings',()=>{
  const event=tdzRallyCapture(),before=JSON.stringify(event);
  assert.equal(new Intl.DateTimeFormat('fr-FR',{timeZone:'Europe/Paris',hour:'2-digit',minute:'2-digit'}).format(event.startsAt),'21:00');
  const previews=rallyComparison(event,{url:'https://tdz.endurance-manager.app',bannerUrl:'https://site.example/banner.webp'},event.startsAt);
  assert.equal(previews.length,2);assert.ok(previews[0].payload.embeds.length);
  const proposed=previews[1].payload,frame=proposed.components[0];
  const walk=items=>items.flatMap(item=>[item,...walk(item.components||[]),...(item.accessory?walk([item.accessory]):[])]);
  const components=walk(proposed.components),content=components.filter(item=>item.type===10).map(item=>item.content).join('\n');
  for(const value of ['BOUBOULES AC RALLY','La Praline','toutes les voitures','Aléatoire','13 inscrits sur 16','3 places disponibles','8 absents','choisies pendant la soirée'])assert.ok(content.includes(value),value);
  assert.doesNotMatch(content,/Carburant|Pneus|Ginetta|GT4|Durée estimée|Prise d’antenne/);
  assert.equal(proposed.components.length,1);assert.equal(frame.components.at(-1).type,12);
  assert.ok(components.length<=40);assert.ok(content.length<=4000);
  assert.ok(components.filter(item=>item.type===2).every(item=>item.disabled));
  assert.deepEqual(proposed.allowed_mentions,{parse:[]});assert.equal(JSON.stringify(event),before);
  const html=discordPreviewsMarkup(previews);assert.match(html,/capture TDZ/);assert.match(html,/compteurs sont figés/);assert.doesNotMatch(html,/données d’exemple/);
});
