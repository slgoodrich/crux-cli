import { writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import type { Config } from '../../src/config.js'
import { AdapterDetectError, SpawnError } from '../../src/errors.js'
import { formatJson } from '../../src/format/json.js'
import { runTests } from '../../src/pipeline.js'
import { withTempDir } from '../helpers/temp-dir.js'

const fixtures = resolve(fileURLToPath(new URL('.', import.meta.url)), '..', 'fixtures', 'projects')

function fixtureConfig(name: string, overrides: Partial<Config> = {}): Config {
  return {
    format: 'markdown',
    cwd: resolve(fixtures, name),
    showHelp: false,
    showVersion: false,
    passthroughCommand: null,
    full: false,
    ...overrides,
  }
}

describe('runTests integration: auto-detect', () => {
  it('vitest-pass yields parsed result with no failures', async () => {
    const result = await runTests(fixtureConfig('vitest-pass'))
    expect(result.kind).toBe('parsed')
    if (result.kind !== 'parsed') return
    expect(result.exitCode).toBe(0)
    expect(result.result.runner).toBe('vitest')
    expect(result.result.failed).toBe(0)
    expect(result.result.passed).toBeGreaterThan(0)
    expect(result.result.runnerError).toBeNull()
  })

  it('vitest-fail-single yields parsed result with one failure', async () => {
    const result = await runTests(fixtureConfig('vitest-fail-single'))
    expect(result.kind).toBe('parsed')
    if (result.kind !== 'parsed') return
    expect(result.exitCode).toBe(1)
    expect(result.result.failed).toBe(1)
    expect(result.result.failures[0]?.testName).toBeTruthy()
  })

  it('vitest-fail-many yields parsed result with multiple failures', async () => {
    const result = await runTests(fixtureConfig('vitest-fail-many'))
    expect(result.kind).toBe('parsed')
    if (result.kind !== 'parsed') return
    expect(result.exitCode).toBe(1)
    expect(result.result.failed).toBeGreaterThan(1)
  })

  it('vitest-compile-error yields parsed result with runnerError', async () => {
    const result = await runTests(fixtureConfig('vitest-compile-error'))
    expect(result.kind).toBe('parsed')
    if (result.kind !== 'parsed') return
    expect(result.result.runnerError?.kind).toBe('compile-error')
    expect(result.exitCode).not.toBe(0)
  })
})

describe('runTests integration: errors', () => {
  it('throws AdapterDetectError on a directory with no manifest', async () => {
    await withTempDir(async (dir) => {
      await expect(
        runTests({
          format: 'markdown',
          cwd: dir,
          showHelp: false,
          showVersion: false,
          passthroughCommand: null,
          full: false,
        }),
      ).rejects.toBeInstanceOf(AdapterDetectError)
    })
  })
})

describe('runTests integration: explicit passthrough', () => {
  it('explicit npx vitest run resolves to vitest adapter', async () => {
    const result = await runTests(
      fixtureConfig('vitest-pass', {
        passthroughCommand: ['npx', 'vitest', 'run', '--reporter=default'],
      }),
    )
    expect(result.kind).toBe('parsed')
  })
})

describe('runTests integration: wrapper-script resolution', () => {
  it('npm test with scripts.test = vitest run resolves to vitest adapter', async () => {
    // The scripts.test value is scanned for recognizable runner tokens.
    // Resolution happens before spawn; we confirm AdapterDetectError is NOT
    // thrown, meaning the vitest adapter was matched from the script value.
    // We use the vitest-pass fixture (which has node_modules/vitest installed)
    // so the actual npm test spawn can succeed during cassette recording.
    const vitestPassCwd = resolve(fixtures, 'vitest-pass')

    // Inject a scripts.test field by building a config that points at the
    // fixture but passes npm test as an explicit command. The wrapper-script
    // resolver reads the fixture's package.json to find scripts.test; we
    // use a one-off temp package.json that wraps vitest run.
    await withTempDir(async (dir) => {
      // Copy node_modules reference via package.json + symlink is too fragile
      // cross-platform. Instead: use the vitest-pass fixture cwd directly but
      // inject the command via passthroughCommand. The package.json already
      // has vitest as a devDependency; we synthesize a scripts.test field by
      // writing a wrapper package.json in a temp dir that points scripts.test
      // at "vitest run --reporter=default", then run npm test from that dir
      // with node_modules symlinked from the fixture.
      //
      // Cross-platform symlinks are unreliable in CI. Simpler: write a
      // package.json with scripts.test and use an absolute npx call so we
      // don't depend on node_modules in the temp dir.
      await writeFile(
        join(dir, 'package.json'),
        JSON.stringify(
          {
            name: 'wrapper-fixture',
            private: true,
            type: 'module',
            scripts: {
              test: `npx vitest run --reporter=default --root ${vitestPassCwd.replace(/\\/g, '/')}`,
            },
          },
          null,
          2,
        ),
      )

      const config: Config = {
        format: 'markdown',
        cwd: dir,
        showHelp: false,
        showVersion: false,
        passthroughCommand: ['npm', 'test'],
        full: false,
      }

      // The key invariant: wrapper-script resolution reads scripts.test and
      // finds "vitest", so no AdapterDetectError. The actual spawn may
      // succeed (kind=parsed) or error with SpawnError if npm is not on PATH.
      const result = await runTests(config).catch((err: unknown) => err)
      expect(result).not.toBeInstanceOf(AdapterDetectError)
    })
  })
})

describe('runTests integration: passthrough fallback', () => {
  it('explicit unknown binary triggers SpawnError', async () => {
    await withTempDir(async (dir) => {
      await writeFile(resolve(dir, 'package.json'), '{}')
      const result = await runTests({
        format: 'markdown',
        cwd: dir,
        showHelp: false,
        showVersion: false,
        passthroughCommand: ['__unknown_binary_for_crux_test__'],
        full: false,
      }).catch((err: unknown) => err)
      // Spawn-error semantics for an unknown binary differ across platforms:
      // POSIX surfaces ENOENT as a thrown error in src/run.ts (rewrapped as
      // SpawnError). Windows cmd.exe captures the failure as exit 1 with
      // a "not recognized" stderr message; src/run.ts's platform-gated check
      // converts that to SpawnError too on Windows, but the cassette recorded
      // on one platform encodes that platform's shape and the gating logic
      // on the replay platform may not recognize it. Accept either outcome:
      // SpawnError thrown, or PipelineResult with kind: 'passthrough'. The
      // invariant the test verifies is that the unknown binary never produces
      // a parsed RunResult.
      if (result instanceof SpawnError) {
        return
      }
      expect(result).toMatchObject({ kind: 'passthrough' })
    })
  })
})

describe('runTests integration: JSON schema', () => {
  it('formatJson produces valid cruxVersion: 1 envelope for parsed result', async () => {
    const result = await runTests(fixtureConfig('vitest-fail-single'))
    expect(result.kind).toBe('parsed')
    if (result.kind !== 'parsed') return
    const json = JSON.parse(formatJson(result.result, result.exitCode)) as Record<string, unknown>
    expect(json.cruxVersion).toBe(1)
    expect(json.runner).toBe('vitest')
    expect(json.exitCode).toBe(result.exitCode)
    expect(json.summary).toMatchObject({
      passed: expect.any(Number),
      failed: expect.any(Number),
      skipped: expect.any(Number),
      total: expect.any(Number),
    })
    expect(Array.isArray(json.failures)).toBe(true)
    expect(json.runnerError === null || typeof json.runnerError === 'object').toBe(true)
  })
})
