import { defineConfig, devices } from '@playwright/test'

const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'https://testme.zedny.ai'
const apiBaseURL = process.env.API_BASE_URL || 'https://testme.zedny.ai/api/'
const testDir = process.env.PLAYWRIGHT_TEST_DIR || '../_workspace_nonruntime/tests/frontend/tests/e2e'

export default defineConfig({
  testDir,
  timeout: 600_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
    screenshot: 'only-on-failure',
    locale: 'en-US',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  metadata: {
    apiBaseURL,
  },
})
