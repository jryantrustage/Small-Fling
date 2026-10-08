import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30 * 1000,
  expect: {
    timeout: 5000
  },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }]
  ],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:5173',
    trace: 'retain-on-failure',
    screenshot: 'on',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'Web UI - Desktop',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 }
      },
      testMatch: /.*(web-ui|project-delete|pin-qualifier)\.spec\.ts/
    },
    {
      name: 'Mobile UI - Mirror Viewport',
      use: {
        ...devices['Pixel 7'],
        viewport: { width: 412, height: 915 },
        isMobile: true
      },
      testMatch: /.*mobile-ui\.spec\.ts/
    }
  ]
});
