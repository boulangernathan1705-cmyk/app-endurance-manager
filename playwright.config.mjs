import {defineConfig, devices} from '@playwright/test';

const baseURL = process.env.COMPAT_BASE_URL || 'https://app.endurance-manager.workers.dev';

export default defineConfig({
  testDir: './tests/compat',
  timeout: 30000,
  expect: {timeout: 10000},
  retries: 1,
  reporter: [['list'], ['html', {outputFolder:'playwright-report', open:'never'}]],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    ignoreHTTPSErrors: false
  },
  projects: [
    {name:'chromium-desktop', use:{...devices['Desktop Chrome']}},
    {name:'firefox-desktop', use:{...devices['Desktop Firefox']}},
    {name:'webkit-desktop', use:{...devices['Desktop Safari']}},
    {name:'android-chrome', use:{...devices['Pixel 7']}},
    {name:'iphone-safari', use:{...devices['iPhone 14']}},
    {name:'firefox-mobile-viewport', use:{browserName:'firefox', viewport:{width:390,height:844}}}
  ]
});
