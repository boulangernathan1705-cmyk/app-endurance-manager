import {test, expect} from '@playwright/test';
import {cleanSnapshot, FIELD, ingest, publicFeed} from '../../shared/live.mjs';

const frames = [
  ['/mur.html', '.pw-map', true],
  ['/mur-des-stands.html', '.lw-mapbox', false]
];

function snapshot(at) {
  const me = {id:1, driver:'Pilote test', vehicle:'#17', cls:'Hypercar'};
  const car = {...me, place:1, num:'17', laps:10, pit:0, dist:1000, x:0, z:0};
  const field = [car, {...car, id:2, place:2, x:100, z:100}].map(row => FIELD.map(key => row[key]));
  return publicFeed(ingest({}, cleanSnapshot({
    v:1, track:'Spa', session:10, et:1000, end:4600, length:7004, me, field
  }), at));
}

for (const [url, svg, fast] of frames) {
  test(`the active map at ${url} skips redundant SVG writes`, async ({page}) => {
    await page.clock.install();
    await page.emulateMedia({reducedMotion:'no-preference'});
    await page.route('**/api/**', route => route.fulfill({json:{}}));
    let socket;
    await page.routeWebSocket('**/api/combos/live', route => { socket = route; });
    await page.goto(url);
    await expect.poll(() => Boolean(socket)).toBe(true);

    const now = await page.evaluate(() => Date.now());
    const feed = snapshot(now);
    const sendPosition = (x) => socket.send(JSON.stringify({
      type:'hello', now, feeds:[feed], pos:{[feed.key]:[[1,x,0],[2,100,100]]}
    }));
    sendPosition(0);
    const wide = await page.evaluate(() => matchMedia('(min-width: 1180px)').matches);
    if (fast || !wide) await page.locator('button[data-tab="map"]').click();
    const marker = page.locator(`${svg} [data-car="1"]`);
    await expect(marker).toBeVisible();
    const initial = await marker.getAttribute('transform');

    const writes = await marker.evaluateHandle(node => {
      let count = 0;
      new MutationObserver(records => { count += records.length; }).observe(node, {attributeFilter:['transform']});
      return () => count;
    });
    await page.clock.runFor(140);
    expect(await writes.evaluate(count => count())).toBe(0);

    if (fast) {
      socket.send(JSON.stringify({type:'fast', key:feed.key, et:1000.2, pos:[[1,20,0],[2,100,100]]}));
      await page.clock.runFor(460);
      await expect(marker).not.toHaveAttribute('transform', initial);
    } else {
      // Full messages recreate the SVG, so the next frame must use the new marker bindings.
      await marker.evaluate(node => node.setAttribute('data-old-marker', ''));
      sendPosition(20);
      await expect(marker).not.toHaveAttribute('data-old-marker');
      const resized = await marker.getAttribute('transform');
      await page.clock.runFor(100);
      await expect(marker).toHaveAttribute('transform', resized);
    }
  });
}

test('live updates refresh data without replacing the focused tab', async ({page}) => {
  await page.route('**/api/**', route => route.fulfill({json:{}}));
  let socket;
  await page.routeWebSocket('**/api/combos/live', route => { socket = route; });
  await page.goto('/mur.html');
  await expect.poll(() => Boolean(socket)).toBe(true);
  const now = await page.evaluate(() => Date.now());
  const feed = snapshot(now);
  const send = () => socket.send(JSON.stringify({type:'feed', now, feed}));
  send();

  const tab = page.locator('button[data-tab="board"]');
  await expect(tab).toBeVisible();
  await tab.focus();
  const original = await tab.elementHandle();

  feed.snap.me.driver = 'Relève test';
  send();
  await expect(page.locator('.pw-who b')).toHaveText('Relève test');
  expect(await original.evaluate(node => node.isConnected)).toBe(true);
  await expect(tab).toBeFocused();
});
