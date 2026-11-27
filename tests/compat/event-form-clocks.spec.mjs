import {test, expect} from '@playwright/test';

test('training defaults use the departure time selected in the same change event', async ({page}) => {
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname;
    return route.fulfill({json:path === '/api/session' ? {
      access:'member', user:{id:'100000000000000001', name:'Pilote test', communityIntroSeen:true},
      permissions:['access','create_race'], community:{id:'test', name:'Test', modules:{soloRaces:true}}
    } : {events:[]}});
  });
  await page.goto('/lmu/');
  await page.waitForFunction(async () => (await import('/front/app/core.mjs')).state.user?.name === 'Pilote test');
  const times = await page.evaluate(async () => {
    const {state} = await import('/front/app/core.mjs');
    const {renderSoloEventForm} = await import('/front/app/solo-form.mjs');
    state.eventTypes = ['TONDEUZ TRAINING'];
    renderSoloEventForm();
    const form = document.querySelector('form[data-kind="solo-event"]');
    form.elements.eventType.checked = true;
    form.elements.eventEnd.value = '';
    form.elements.timeHour.value = '18';
    form.elements.timeHour.dispatchEvent(new Event('change', {bubbles:true}));
    return [form.elements.time.value, form.elements.eventEnd.value];
  });
  expect(times).toEqual(['18:00', '20:00']);
});

for (const game of ['lmu', 'iracing']) {
  test(`${game}: pending endurance date remains usable on mobile`, async ({page}) => {
    test.skip((page.viewportSize()?.width ?? 1280) > 760, 'Mobile layout');
    await page.route('**/api/**', route => {
      const path = new URL(route.request().url()).pathname;
      return route.fulfill({json:path === '/api/session' ? {
        access:'member', user:{id:'100000000000000001', name:'Pilote test', communityIntroSeen:true},
        permissions:['access','create_race'], community:{id:'test', name:'Test', modules:{soloRaces:true}}
      } : {events:[]}});
    });
    await page.goto(`/${game}/`);
    await page.waitForFunction(async () => (await import('/front/app/core.mjs')).state.user?.name === 'Pilote test');
    await page.evaluate(async () => {
      const {state} = await import('/front/app/core.mjs');
      const {renderEventForm} = await import('/front/app/event-form.mjs');
      state.listFormat = 'endurance';
      renderEventForm();
    });
    const form = page.locator('form[data-kind="event"]');
    await form.locator('[name="eventName"]').fill('Endurance test');
    await form.locator('[name="eventCircuit"]').selectOption({index:1});
    await form.locator('[name="eventSchedulePending"]').check();
    await form.locator('[data-step="next"]').click();
    await form.locator('.event-category-option').first().click();
    await form.locator('[data-step="next"]').click();

    const row = form.locator('.departure-field.is-tbd');
    const date = row.locator('[name="date"]');
    const note = row.locator('.departure-tbd-note');
    await expect(row).toBeVisible();
    await expect(date).toBeVisible();
    await expect(note).toContainText('À définir');
    await expect(row.locator('.remove-departure')).toBeHidden();
    const bounds = await row.evaluate(el => {
      const rect = selector => el.querySelector(selector).getBoundingClientRect().toJSON();
      return {row:el.getBoundingClientRect().toJSON(), date:rect('[name="date"]'), label:rect('label'), note:rect('.departure-tbd-note'), overflow:el.scrollWidth-el.clientWidth};
    });
    expect(bounds.date.width).toBeGreaterThan(bounds.row.width * 0.9);
    expect(bounds.label.bottom).toBeLessThanOrEqual(bounds.date.top + 1);
    expect(bounds.date.bottom).toBeLessThanOrEqual(bounds.note.top + 1);
    expect(bounds.overflow).toBeLessThanOrEqual(1);
    const day = await date.getAttribute('min');
    await date.fill(day);
    await form.locator('[data-step="next"]').click();
    await expect(form).toHaveAttribute('data-step', '4');
    await expect(form.locator('[data-event-recap]')).toContainText('à définir');

    // Going back and selecting confirmed hours must still show the usual time picker.
    await form.locator('[data-step="back"]').click();
    await form.locator('[data-step="back"]').click();
    await form.locator('[data-step="back"]').click();
    await form.locator('[name="eventSchedulePending"]').uncheck();
    await form.locator('[data-step="next"]').click();
    await form.locator('[data-step="next"]').click();
    await expect(form.locator('.departure-field.is-tbd')).toHaveCount(0);
    await expect(form.locator('[name="timeHour"]')).toBeVisible();
    await expect(form.locator('[name="timeMinute"]')).toBeVisible();
    await expect(form.locator('.departure-field [name="date"]')).toHaveValue(day);
  });
}
