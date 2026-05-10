import { shellCassetteAlias } from 'shell-cassette/vite-plugin'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [shellCassetteAlias({ adapters: ['execa'] })],
  test: {
    setupFiles: ['./tests/sc-setup.ts'],
    include: ['tests/integration/**/*.test.ts'],
    exclude: ['**/node_modules/**', 'tests/fixtures/**'],
    deps: {
      inline: ['shell-cassette'],
    },
    testTimeout: 30000,
  },
})
