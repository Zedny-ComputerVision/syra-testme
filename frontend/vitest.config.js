import path from 'node:path'
import { fileURLToPath } from 'node:url'

import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

const frontendRoot = fileURLToPath(new URL('./', import.meta.url))

export default defineConfig({
  root: path.join(frontendRoot, '.generated-tests', 'unit'),
  plugins: [react()],
  server: {
    fs: {
      allow: [frontendRoot],
    },
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{js,jsx,ts,tsx}'],
    exclude: ['tests/e2e/**'],
  },
})
