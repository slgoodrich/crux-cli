import { describe, expect, it, vi } from 'vitest'

import type { Config } from '../../src/config.js'
import { AdapterDetectError } from '../../src/errors.js'
import { resolveCommand, runTests } from '../../src/pipeline.js'
import type { RunnerAdapter, SubprocessCapture } from '../../src/runners/types.js'
import { vitestAdapter } from '../../src/runners/vitest.js'
import { makeProjectFiles } from '../helpers/project-files.js'

vi.mock('../../src/detect.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/detect.js')>()
  return { ...actual, loadProjectFiles: vi.fn() }
})

vi.mock('../../src/run.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/run.js')>()
  return { ...actual, spawn: vi.fn() }
})

// Imported after vi.mock so the resolved value is the mocked function.
const { loadProjectFiles } = await import('../../src/detect.js')
const { spawn } = await import('../../src/run.js')

const fakeJestAdapter: RunnerAdapter = {
  id: 'jest',
  detect: () => false,
  hasActiveConfig: () => false,
  scriptHints: ['jest'],
  internalPathPatterns: [],
  defaultCommand: () => ['npx', 'jest'],
  parse: () => {
    throw new Error('not implemented')
  },
}

const ADAPTERS = [vitestAdapter, fakeJestAdapter] as const

function makeConfig(overrides: Partial<Config> = {}): Config {
  return {
    format: 'markdown',
    cwd: null,
    showHelp: false,
    showVersion: false,
    passthroughCommand: null,
    full: false,
    ...overrides,
  }
}

describe('resolveCommand: auto-detect mode (passthroughCommand === null)', () => {
  it('throws AdapterDetectError when no adapter matches', () => {
    const project = makeProjectFiles()
    const config = makeConfig()
    expect(() => resolveCommand(config, project, ADAPTERS)).toThrow(AdapterDetectError)
  })

  it('returns the matched adapter and its defaultCommand', () => {
    const project = makeProjectFiles({ vitestConfigPresent: true })
    const config = makeConfig()
    const resolved = resolveCommand(config, project, ADAPTERS)
    expect(resolved.kind).toBe('adapter')
    if (resolved.kind !== 'adapter') return
    expect(resolved.adapter).toBe(vitestAdapter)
    expect(resolved.command).toEqual(vitestAdapter.defaultCommand())
  })
})

describe('resolveCommand: explicit pass-through (token recognition)', () => {
  it('recognizes a direct binary name as the adapter', () => {
    const project = makeProjectFiles()
    const config = makeConfig({ passthroughCommand: ['vitest', 'run'] })
    const resolved = resolveCommand(config, project, ADAPTERS)
    expect(resolved.kind).toBe('adapter')
    if (resolved.kind !== 'adapter') return
    expect(resolved.adapter).toBe(vitestAdapter)
    expect(resolved.command).toEqual(['vitest', 'run'])
  })

  it('recognizes npx <bin> as the adapter', () => {
    const project = makeProjectFiles()
    const config = makeConfig({ passthroughCommand: ['npx', 'vitest', 'run'] })
    const resolved = resolveCommand(config, project, ADAPTERS)
    expect(resolved.kind).toBe('adapter')
    if (resolved.kind !== 'adapter') return
    expect(resolved.adapter).toBe(vitestAdapter)
    expect(resolved.command).toEqual(['npx', 'vitest', 'run'])
  })

  it('recognizes npx <flags> <bin> as the adapter', () => {
    const project = makeProjectFiles()
    const config = makeConfig({
      passthroughCommand: ['npx', '-y', '--package=vitest', 'vitest', 'run'],
    })
    const resolved = resolveCommand(config, project, ADAPTERS)
    expect(resolved.kind).toBe('adapter')
    if (resolved.kind !== 'adapter') return
    expect(resolved.adapter).toBe(vitestAdapter)
  })

  it('returns passthrough on unknown binary', () => {
    const project = makeProjectFiles()
    const config = makeConfig({ passthroughCommand: ['mocha', 'tests/'] })
    const resolved = resolveCommand(config, project, ADAPTERS)
    expect(resolved.kind).toBe('passthrough')
    if (resolved.kind !== 'passthrough') return
    expect(resolved.reason).toContain('mocha')
  })

  it('returns passthrough on empty passthrough command', () => {
    const project = makeProjectFiles()
    const config = makeConfig({ passthroughCommand: [] })
    const resolved = resolveCommand(config, project, ADAPTERS)
    expect(resolved.kind).toBe('passthrough')
    expect(resolved.command).toEqual([])
  })
})

describe('resolveCommand: wrapper-script resolution', () => {
  it('resolves npm test via package.json scripts.test', () => {
    const project = makeProjectFiles({
      packageJson: { scripts: { test: 'vitest run' } },
    })
    const config = makeConfig({ passthroughCommand: ['npm', 'test'] })
    const resolved = resolveCommand(config, project, ADAPTERS)
    expect(resolved.kind).toBe('adapter')
    if (resolved.kind !== 'adapter') return
    expect(resolved.adapter).toBe(vitestAdapter)
    expect(resolved.command).toEqual(['npm', 'test'])
  })

  it('resolves pnpm test via package.json scripts.test', () => {
    const project = makeProjectFiles({
      packageJson: { scripts: { test: 'vitest run' } },
    })
    const config = makeConfig({ passthroughCommand: ['pnpm', 'test'] })
    const resolved = resolveCommand(config, project, ADAPTERS)
    expect(resolved.kind).toBe('adapter')
    if (resolved.kind !== 'adapter') return
    expect(resolved.adapter).toBe(vitestAdapter)
  })

  it('resolves yarn test via package.json scripts.test', () => {
    const project = makeProjectFiles({
      packageJson: { scripts: { test: 'vitest run' } },
    })
    const config = makeConfig({ passthroughCommand: ['yarn', 'test'] })
    const resolved = resolveCommand(config, project, ADAPTERS)
    expect(resolved.kind).toBe('adapter')
    if (resolved.kind !== 'adapter') return
    expect(resolved.adapter).toBe(vitestAdapter)
  })

  it('resolves npm run <name> via package.json scripts.<name>', () => {
    const project = makeProjectFiles({
      packageJson: { scripts: { 'test:unit': 'vitest run --testNamePattern unit' } },
    })
    const config = makeConfig({ passthroughCommand: ['npm', 'run', 'test:unit'] })
    const resolved = resolveCommand(config, project, ADAPTERS)
    expect(resolved.kind).toBe('adapter')
    if (resolved.kind !== 'adapter') return
    expect(resolved.adapter).toBe(vitestAdapter)
  })

  it('falls through when scripts.test contains no recognized token', () => {
    const project = makeProjectFiles({
      packageJson: { scripts: { test: 'echo no runner' } },
    })
    const config = makeConfig({ passthroughCommand: ['npm', 'test'] })
    const resolved = resolveCommand(config, project, ADAPTERS)
    expect(resolved.kind).toBe('passthrough')
  })

  it('falls through when scripts.test is missing', () => {
    const project = makeProjectFiles({ packageJson: { scripts: {} } })
    const config = makeConfig({ passthroughCommand: ['npm', 'test'] })
    const resolved = resolveCommand(config, project, ADAPTERS)
    expect(resolved.kind).toBe('passthrough')
  })

  it('falls through when scripts.<name> resolves to another wrapper (no recursion)', () => {
    const project = makeProjectFiles({
      packageJson: { scripts: { test: 'npm run test:unit' } },
    })
    const config = makeConfig({ passthroughCommand: ['npm', 'test'] })
    const resolved = resolveCommand(config, project, ADAPTERS)
    expect(resolved.kind).toBe('passthrough')
  })

  it('falls through when packageJson is null', () => {
    const project = makeProjectFiles()
    const config = makeConfig({ passthroughCommand: ['npm', 'test'] })
    const resolved = resolveCommand(config, project, ADAPTERS)
    expect(resolved.kind).toBe('passthrough')
  })
})

// ---- runTests unit tests ----
// loadProjectFiles and spawn are vi.mocked above; these tests verify the
// async pipeline orchestration in runTests without real filesystem or
// subprocess I/O.

const mockLoadProjectFiles = vi.mocked(loadProjectFiles)
const mockSpawn = vi.mocked(spawn)

const PASS_CAPTURE: SubprocessCapture = { stdout: 'ok', stderr: '', exitCode: 0 }

function makeRunTestsConfig(overrides: Partial<Config> = {}): Config {
  return {
    format: 'markdown',
    cwd: '/fake/cwd',
    showHelp: false,
    showVersion: false,
    passthroughCommand: null,
    full: false,
    ...overrides,
  }
}

describe('runTests', () => {
  it('returns a parsed result when the adapter matches and parse succeeds', async () => {
    mockLoadProjectFiles.mockResolvedValue(makeProjectFiles())
    // Use a passthrough command that names vitest directly so vitestAdapter is
    // selected via token recognition, then provide a capture that parses cleanly.
    const config = makeRunTestsConfig({ passthroughCommand: ['vitest', 'run'] })

    // Provide capture that produces a valid vitest run result (all tests pass).
    const vitestCapture: SubprocessCapture = {
      stdout: [
        ' ✓ src/foo.test.ts (1 test)',
        '',
        ' Test Files  1 passed (1)',
        ' Tests  1 passed (1)',
        ' Duration  100ms',
      ].join('\n'),
      stderr: '',
      exitCode: 0,
    }
    mockSpawn.mockResolvedValue(vitestCapture)

    const result = await runTests(config)
    expect(result.kind).toBe('parsed')
    if (result.kind === 'parsed') {
      expect(result.exitCode).toBe(0)
    }
  })

  it('returns passthrough when adapter is null (unknown runner)', async () => {
    mockLoadProjectFiles.mockResolvedValue(makeProjectFiles())
    mockSpawn.mockResolvedValue(PASS_CAPTURE)

    const config = makeRunTestsConfig({ passthroughCommand: ['mocha', 'tests/'] })
    const result = await runTests(config)

    expect(result.kind).toBe('passthrough')
    if (result.kind === 'passthrough') {
      expect(result.capture).toBe(PASS_CAPTURE)
      expect(result.reason).toMatch(/mocha/)
    }
  })

  it('returns passthrough with parse-failed reason when adapter.parse throws ParseError', async () => {
    // vitest is selected via the command token; parse will receive a capture
    // that does not look like vitest output, triggering ParseError internally.
    mockLoadProjectFiles.mockResolvedValue(makeProjectFiles())
    const badCapture: SubprocessCapture = { stdout: 'garbage', stderr: '', exitCode: 1 }
    mockSpawn.mockResolvedValue(badCapture)

    const config = makeRunTestsConfig({ passthroughCommand: ['vitest', 'run'] })
    const result = await runTests(config)

    // vitestAdapter.parse throws ParseError on unrecognised input.
    expect(result.kind).toBe('passthrough')
    if (result.kind === 'passthrough') {
      expect(result.reason).toMatch(/parse failed/)
    }
  })

  it('re-throws non-ParseError exceptions from adapter.parse', async () => {
    mockLoadProjectFiles.mockResolvedValue(makeProjectFiles())
    mockSpawn.mockResolvedValue(PASS_CAPTURE)

    // Build a config that routes to a mock adapter whose parse always throws a
    // plain Error (not a ParseError). We can only do this by using passthrough
    // command token recognition, which currently only recognises known adapters.
    // The simplest path: mock the vitest module's parse function for this test.
    const unexpected = new Error('unexpected internal error')
    const parseSpy = vi.spyOn(vitestAdapter, 'parse').mockImplementation(() => {
      throw unexpected
    })

    const config = makeRunTestsConfig({ passthroughCommand: ['vitest', 'run'] })

    await expect(runTests(config)).rejects.toThrow(unexpected)
    parseSpy.mockRestore()
  })

  it('uses process.cwd() when config.cwd is null', async () => {
    mockLoadProjectFiles.mockResolvedValue(makeProjectFiles())
    mockSpawn.mockResolvedValue(PASS_CAPTURE)

    const config = makeRunTestsConfig({ cwd: null, passthroughCommand: ['mocha', 'tests/'] })
    const result = await runTests(config)

    // Verify loadProjectFiles was called with the process cwd (not null).
    expect(mockLoadProjectFiles).toHaveBeenCalledWith(process.cwd())
    expect(result.kind).toBe('passthrough')
  })
})
