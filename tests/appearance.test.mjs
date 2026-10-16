import test from 'node:test';
import assert from 'node:assert/strict';
import {PALETTES, appearanceInput, paletteFor} from '../shared/appearance.mjs';
const luminance = hex => {
  const rgb = hex.match(/[0-9a-f]{2}/gi).map(value => parseInt(value,16)/255).map(value => value <= .04045 ? value/12.92 : ((value+.055)/1.055)**2.4);
  return rgb[0]*.2126 + rgb[1]*.7152 + rgb[2]*.0722;
};
const contrast = (a,b) => (Math.max(luminance(a),luminance(b))+.05)/(Math.min(luminance(a),luminance(b))+.05);
test('all racing palettes support normal text and filled buttons in both modes', () => {
  assert.equal(PALETTES.length,11);
  assert.deepEqual(PALETTES.filter(p=>p.soft).map(p=>p.id),['endurance']);
  assert.equal(new Set(PALETTES.map(item=>item.id)).size,11);
  for (const palette of PALETTES) {
    for (const [mode,surfaces,ink] of [['light',['#ffffff','#eef2f6','#e4eaf1'],'#ffffff'],['dark',['#111820','#1b2530','#25323f'],'#101820']]) {
      for (const surface of surfaces) assert.ok(contrast(palette[mode],surface)>=4.5,`${palette.id} ${mode} text on ${surface}`);
      assert.ok(contrast(palette[mode],ink)>=4.5,`${palette.id} ${mode} legacy button text`);
      assert.ok(contrast(palette.fill,palette.ink)>=4.5,`${palette.id} brand button text`);
    }
  }
});
test('appearance updates retain the banner and Discord identity and accept only supported choices', () => {
  const current={bannerVersion:42,discordIcon:'abc'};
  assert.deepEqual(appearanceInput({palette:'bmw',defaultMode:'light'},current),{...current,palette:'bmw',accent:'#74b6ff',defaultMode:'light'});
  assert.throws(()=>appearanceInput({palette:'#123456',defaultMode:'dark'}));
  assert.throws(()=>appearanceInput({palette:'bmw',defaultMode:'custom'}));
  assert.equal(paletteFor({}).id,'endurance');
  assert.equal(paletteFor({palette:'cyan'}).id,'endurance');
  assert.equal(paletteFor({palette:'orange'}).id,'mclaren');
});
