import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

import { beforeAll, describe, expect, it } from 'vitest'

const execFileAsync = promisify(execFile)

const here = fileURLToPath(new URL('.', import.meta.url))
const root = resolve(here, '..', '..')
const fixtures = resolve(root, 'tests', 'fixtures', 'projects')
const cli = resolve(root, 'dist', 'cli.js')

async function runCrux(
  fixtureName: string,
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const dir = resolve(fixtures, fixtureName)
  try {
    const { stdout, stderr } = await execFileAsync(process.execPath, [cli, '--cwd', dir], {
      env: process.env,
      maxBuffer: 16 * 1024 * 1024,
    })
    return { stdout, stderr, exitCode: 0 }
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; code?: number }
    return {
      stdout: e.stdout ?? '',
      stderr: e.stderr ?? '',
      exitCode: typeof e.code === 'number' ? e.code : 1,
    }
  }
}

describe('e2e smoke', () => {
  beforeAll(() => {
    if (!existsSync(cli)) {
      throw new Error(`built cli not found at ${cli}; run npm run build first`)
    }
    for (const proj of ['vitest-pass', 'vitest-fail-many', 'vitest-compile-error']) {
      const vitestBin = resolve(fixtures, proj, 'node_modules', 'vitest')
      if (!existsSync(vitestBin)) {
        throw new Error(
          `vitest not installed in ${proj}; run "cd tests/fixtures/projects/${proj} && npm install --no-save" first`,
        )
      }
    }
  })

  it('vitest-pass: exit 0, markdown summary with "tests passed"', async () => {
    const { stdout, exitCode } = await runCrux('vitest-pass')
    expect(exitCode).toBe(0)
    expect(stdout).toMatch(/tests passed/)
  })

  it('vitest-fail-many: exit 1, markdown summary with "FAIL"', async () => {
    const { stdout, exitCode } = await runCrux('vitest-fail-many')
    expect(exitCode).toBe(1)
    expect(stdout).toMatch(/### FAIL/)
  })

  it('vitest-compile-error: non-zero exit, runner-error header', async () => {
    const { stdout, exitCode } = await runCrux('vitest-compile-error')
    expect(exitCode).not.toBe(0)
    expect(stdout).toMatch(/Runner error/)
  })
})
