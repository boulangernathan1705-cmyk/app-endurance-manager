import {defineConfig, devices} from '@playwright/test';

// Visual tests (the « Charte »): each page is compared to its reference capture in tests/visual/__screenshots__.
// A layout that moves without being meant to fails here. When a change is meant, the references are made again
// on GitHub (workflow « Références visuelles »): see DEPLOYMENT.md.
export default defineConfig({
  testDir: './tests/visual',
  snapshotPathTemplate: '{testDir}/__screenshots__/{arg}-{projectName}{ext}',
  timeout: 30000,
  expect: {timeout: 10000, toHaveScreenshot: {animations: 'disabled', caret: 'hide', maxDiffPixelRatio: 0.005}},
  retries: 0,
  reporter: [['list'], ['html', {outputFolder:'playwright-visual-report', open:'never'}]],
  use: {baseURL: process.env.COMPAT_BASE_URL || 'http://localhost:8787', locale: 'fr-FR', timezoneId: 'Europe/Paris', trace: 'retain-on-failure'},
  projects: [
    {name:'desktop', use:{...devices['Desktop Chrome'], viewport:{width:1366, height:900}}},
    {name:'mobile', use:{...devices['Pixel 7']}}
  ]
});
