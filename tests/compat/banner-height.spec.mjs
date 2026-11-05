import {test,expect} from '@playwright/test';

// All header templates share one banner size, even without application scripts.
test.use({javaScriptEnabled:false});
const pages=['/','/lmu/','/iracing/','/events/','/members.html','/fiches-combo.html','/mur-des-stands.html','/help.html','/about.html','/privacy.html','/legal.html','/changelog.html','/circuit-credits.html','/diagnostics.html','/demande-communaute.html'];
for(const [width,height] of [[1280,720],[1920,1080],[820,1180],[390,844]])test(`all page banners share their height at ${width}×${height}`,async({page})=>{
  await page.setViewportSize({width,height});
  const expected=width<=760?64:Math.min(160,Math.max(120,height*.16));
  for(const path of pages){
    await page.goto(path,{waitUntil:'domcontentloaded'});
    const picture=page.locator('.hero-picture');
    await expect(picture,`${path}: banner visible`).toBeVisible();
    const bounds=await picture.boundingBox();
    expect(bounds.height,`${path}: shared height`).toBeCloseTo(expected,0);
    expect(bounds.width,`${path}: full available width`).toBeCloseTo(Math.min(width,2048),0);
    await expect(page.locator('.hero-banner')).toHaveCSS('object-fit','cover');
    await expect(page.locator('.hero-banner')).toHaveCSS('object-position','50% 40%');
  }
});
