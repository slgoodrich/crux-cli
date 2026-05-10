import { defineConfig } from 'vitest/config'
import { somethingThatDoesNotExist } from 'this-package-does-not-exist'

export default defineConfig({
  test: {
    setupFiles: [somethingThatDoesNotExist()],
  },
})
