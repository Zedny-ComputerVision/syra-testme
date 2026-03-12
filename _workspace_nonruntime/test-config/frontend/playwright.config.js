// @ts-check
import { defineConfig, devices } from '@playwright/test'

const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:5173'
const apiBaseURL = process.env.API_BASE_URL || 'http://127.0.0.1:8000/api/'
const testDir = process.env.PLAYWRIGHT_TEST_DIR || '../../tests/frontend/tests/e2e'

export default defineConfig({
  testDir,
  timeout: 90_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [['html', { open: 'never' }], ['list']],
  use: {
    baseURL,
    trace: 'on-first-retry',
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
  webServer: [
    {
      command: 'python -m uvicorn src.app.main:app --host 127.0.0.1 --port 8000',
      cwd: '../../../backend',
      url: 'http://127.0.0.1:8000/api/health',
      reuseExistingServer: true,
      timeout: 180_000,
      env: {
        ...process.env,
        AUTO_APPLY_MIGRATIONS: process.env.AUTO_APPLY_MIGRATIONS || 'true',
        BACKEND_BASE_URL: process.env.BACKEND_BASE_URL || 'http://127.0.0.1:8000',
        FRONTEND_BASE_URL: process.env.FRONTEND_BASE_URL || 'http://127.0.0.1:5173',
        E2E_SEED_ENABLED: process.env.E2E_SEED_ENABLED || 'true',
        MEDIA_STORAGE_PROVIDER: process.env.MEDIA_STORAGE_PROVIDER || 'local',
        PROCTORING_VIDEO_STORAGE_PROVIDER: process.env.PROCTORING_VIDEO_STORAGE_PROVIDER || 'cloudflare',
      },
    },
    {
      command: 'npm run dev -- --host 127.0.0.1 --port 5173',
      cwd: '../../../frontend',
      url: baseURL,
      reuseExistingServer: true,
      timeout: 180_000,
      env: {
        ...process.env,
        VITE_API_BASE_URL: apiBaseURL,
      },
    },
  ],
})
