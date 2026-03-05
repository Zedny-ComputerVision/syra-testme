import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { configDefaults } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173
  },
  build: {
    chunkSizeWarningLimit: 1024,
  },
  test: {
    exclude: [...configDefaults.exclude, 'tests/e2e/**'],
  },
})
