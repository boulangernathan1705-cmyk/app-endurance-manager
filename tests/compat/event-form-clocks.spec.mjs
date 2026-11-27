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
