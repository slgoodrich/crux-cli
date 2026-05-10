import { describe, expect, it } from 'vitest'

import { SpawnError } from '../../src/errors.js'
import { spawn } from '../../src/run.js'
import { withTempDir } from '../helpers/temp-dir.js'

describe('spawn', () => {
  it('throws SpawnError on empty command', async () => {
    await expect(spawn([], { cwd: process.cwd() })).rejects.toBeInstanceOf(SpawnError)
  })

  it('throws SpawnError with ENOENT marker for unknown binary', async () => {
    await withTempDir(async (dir) => {
      try {
        await spawn(['__definitely_not_a_real_binary_12345__'], { cwd: dir })
        throw new Error('should have thrown')
      } catch (err) {
        expect(err).toBeInstanceOf(SpawnError)
        expect((err as SpawnError).message).toContain('__definitely_not_a_real_binary_12345__')
      }
    })
  })

  it('captures stdout, stderr, and exitCode for a successful command', async () => {
    // Use Node itself as the binary; portable across Linux/macOS/Windows.
    const result = await spawn(
      ['node', '-e', 'process.stdout.write("out"); process.stderr.write("err"); process.exit(0)'],
      { cwd: process.cwd() },
    )
    expect(result.stdout).toBe('out')
    expect(result.stderr).toBe('err')
    expect(result.exitCode).toBe(0)
  })

  it('captures non-zero exitCode without throwing', async () => {
    const result = await spawn(['node', '-e', 'process.exit(42)'], { cwd: process.cwd() })
    expect(result.exitCode).toBe(42)
  })

  it('forwards env when provided', async () => {
    const result = await spawn(
      ['node', '-e', 'process.stdout.write(process.env.CRUX_TEST_VAR ?? "")'],
      // biome-ignore lint/style/useNamingConvention: env var names use SCREAMING_SNAKE_CASE by convention
      { cwd: process.cwd(), env: { ...process.env, CRUX_TEST_VAR: 'hello' } },
    )
    expect(result.stdout).toBe('hello')
  })
})
