import {test, expect} from '@playwright/test';

for (const [url, selector] of [['/mur.html','.pw-empty'], ['/mur-des-stands.html','.lw-empty']]) {
  test(`the empty pit wall at ${url} only redraws when the connection changes`, async ({page}) => {
    await page.clock.install();
    await page.route('**/api/**', route => route.fulfill({json:{}}));
    let socket;
    await page.routeWebSocket('**/api/combos/live', route => {
      socket = route;
      route.send(JSON.stringify({type:'hello', feeds:[]}));
    });
    await page.goto(url);
    const empty = page.locator(selector);
    await expect(empty).toBeAttached();
    await expect.poll(() => Boolean(socket)).toBe(true);
    await page.clock.runFor(50);
    const emptyNode = await empty.elementHandle();
    await page.clock.runFor(3100);
    expect(await emptyNode.evaluate(node => node.isConnected)).toBe(true);
    await socket.close();
    await expect.poll(() => emptyNode.evaluate(node => node.isConnected)).toBe(false);
    await expect(empty).toBeAttached();
  });
}
