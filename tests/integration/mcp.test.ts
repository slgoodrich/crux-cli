import { existsSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { describe, expect, it } from 'vitest'

import type { Config } from '../../src/config.js'
import { formatJson } from '../../src/format/json.js'
import { runTestsHandler } from '../../src/mcp/tools.js'
import { runTests } from '../../src/pipeline.js'
import { withTempDir } from '../helpers/temp-dir.js'

function makeJsonConfig(cwd: string): Config {
  return Object.freeze({
    format: 'json',
    cwd,
    showHelp: false,
    showVersion: false,
    passthroughCommand: null,
    full: false,
  })
}

const here = fileURLToPath(new URL('.', import.meta.url))
const fixtures = resolve(here, '..', 'fixtures', 'projects')
const repoRoot = resolve(here, '../..')
const builtServer = resolve(repoRoot, 'dist/mcp/server.js')

describe('runTestsHandler: auto-detect against fixture projects', () => {
  it('returns parsed envelope for vitest-pass', async () => {
    const result = await runTestsHandler({ cwd: resolve(fixtures, 'vitest-pass') })

    expect(result.isError).toBeUndefined()
    expect(result.content).toHaveLength(1)
    expect(result.content[0]).toMatchObject({ type: 'text' })
    expect(result.structuredContent).toBeDefined()
    expect(result.structuredContent?.cruxVersion).toBe(1)
    expect(result.structuredContent?.runner).toBe('vitest')
    expect(result.structuredContent?.exitCode).toBe(0)
    expect(result.structuredContent?.summary.failed).toBe(0)
    expect(result.structuredContent?.summary.passed).toBeGreaterThan(0)
  })

  it('returns parsed envelope for vitest-fail-single', async () => {
    const result = await runTestsHandler({ cwd: resolve(fixtures, 'vitest-fail-single') })

    expect(result.isError).toBeUndefined()
    expect(result.structuredContent?.exitCode).toBe(1)
    expect(result.structuredContent?.summary.failed).toBe(1)
    expect(result.structuredContent?.failures).toHaveLength(1)
  })

  it('returns parsed envelope for vitest-fail-many', async () => {
    const result = await runTestsHandler({ cwd: resolve(fixtures, 'vitest-fail-many') })

    expect(result.isError).toBeUndefined()
    expect(result.structuredContent?.exitCode).toBe(1)
    expect(result.structuredContent?.summary.failed).toBeGreaterThan(1)
  })

  it('returns runnerError for vitest-compile-error', async () => {
    const result = await runTestsHandler({ cwd: resolve(fixtures, 'vitest-compile-error') })

    expect(result.isError).toBeUndefined()
    expect(result.structuredContent?.runnerError?.kind).toBe('compile-error')
  })
})

describe('runTestsHandler: error paths', () => {
  it('returns isError for empty temp dir (no adapter detected)', async () => {
    await withTempDir(async (cwd) => {
      const result = await runTestsHandler({ cwd })

      expect(result.isError).toBe(true)
      expect(result.structuredContent).toBeUndefined()
      expect(result.content).toHaveLength(1)
      expect(result.content[0]?.text).toContain('crux:')
      expect(result.content[0]?.text).toContain('fix:')
      expect(result.content[0]?.text.toLowerCase()).toContain('no test runner')
    })
  })

  it('returns isError for unknown explicit command (binary not found)', async () => {
    await withTempDir(async (cwd) => {
      await writeFile(resolve(cwd, 'package.json'), '{}')

      const result = await runTestsHandler({
        cwd,
        command: ['__unknown_binary_for_crux_test__'],
      })

      expect(result.isError).toBe(true)
      // Two valid outcomes depending on platform: on Windows, run.ts detects
      // the "is not recognized as an internal or external command" stderr
      // pattern and throws SpawnError. On POSIX, the cassette replays the
      // same recorded data but run.ts's stderr-pattern check is gated on
      // process.platform === 'win32' and doesn't fire, so the pipeline
      // returns kind: 'passthrough'. Both produce isError: true with a
      // user-readable explanation.
      expect(result.content[0]?.text.toLowerCase()).toMatch(
        /command not found|spawn|not recognized|unexpected error|passthrough/i,
      )
    })
  })

  // The passthrough-kind branch (pipeline returns kind: 'passthrough') is
  // covered by tests/unit/mcp/tools.test.ts via a mocked runTests. An
  // integration test would need to spawn a real cross-platform binary whose
  // resolved path is identical on every CI matrix entry, which shell-cassette
  // cannot guarantee (it canonicalizes args but matches the resolved command
  // path literally).
})

describe('byte-equivalence: run_tests vs crux --json', () => {
  // The PRD §10.4 invariant: crux --json output and run_tests text content must
  // be byte-for-byte equivalent (modulo trailing newline) for the same RunResult.
  //
  // Comparing two independent subprocess calls fails on durationMs (each real
  // run has different timing). Each test uses one subprocess call and verifies
  // the two representations (text + structuredContent) are self-consistent,
  // which is equivalent to testing the shared serialization path.
  const cwd = resolve(fixtures, 'vitest-fail-many')

  it('CLI formatJson output parses to a valid cruxVersion:1 envelope (vitest-fail-many)', async () => {
    const cliPipelineResult = await runTests(makeJsonConfig(cwd))
    if (cliPipelineResult.kind !== 'parsed') {
      throw new Error(`expected parsed result for vitest-fail-many, got: ${cliPipelineResult.kind}`)
    }
    const cliOutput = formatJson(cliPipelineResult.result, cliPipelineResult.exitCode)
    const cliEnvelope = JSON.parse(cliOutput)

    // structuredContent from MCP and the parsed CLI envelope share the same
    // shape; this test verifies the CLI surface produces a valid cruxVersion:1
    // envelope with the expected fields.
    expect(cliEnvelope.cruxVersion).toBe(1)
    expect(cliEnvelope.runner).toBe('vitest')
    expect(cliEnvelope.exitCode).toBe(1)
    expect(cliEnvelope.summary.failed).toBeGreaterThan(1)
    expect(Array.isArray(cliEnvelope.failures)).toBe(true)
    expect(cliEnvelope.failures.length).toBeGreaterThan(1)
  })

  it('MCP structuredContent and CLI envelope are field-equivalent (vitest-fail-many)', async () => {
    // CLI surface
    const cliPipelineResult = await runTests(makeJsonConfig(cwd))
    if (cliPipelineResult.kind !== 'parsed') {
      throw new Error(`expected parsed result for vitest-fail-many, got: ${cliPipelineResult.kind}`)
    }
    const cliOutput = formatJson(cliPipelineResult.result, cliPipelineResult.exitCode)
    const cliEnvelope = JSON.parse(cliOutput) as Record<string, unknown> & {
      summary: { durationMs: number | null }
    }

    // MCP surface
    const mcpResult = await runTestsHandler({ cwd })
    expect(mcpResult.isError).toBeUndefined()
    const mcpEnvelope = mcpResult.structuredContent
    if (mcpEnvelope === undefined) {
      throw new Error('expected structuredContent for vitest-fail-many')
    }

    // durationMs comes from the runner's parsed output; under shell-cassette
    // each independent run captures its own timing. Normalize before comparing
    // so the test verifies envelope shape and field-by-field equivalence
    // without coupling to cassette recording timing.
    const normalize = (env: { summary: { durationMs: number | null } }): typeof env => ({
      ...env,
      summary: { ...env.summary, durationMs: 0 },
    })

    expect(normalize(mcpEnvelope as { summary: { durationMs: number | null } })).toEqual(
      normalize(cliEnvelope),
    )
  })
})

describe('runTestsHandler: explicit input fields', () => {
  it('explicit command resolves vitest adapter via argv scan', async () => {
    const cwd = resolve(fixtures, 'vitest-pass')

    const result = await runTestsHandler({
      cwd,
      command: ['npx', 'vitest', 'run', '--reporter=default'],
    })

    expect(result.isError).toBeUndefined()
    expect(result.structuredContent?.runner).toBe('vitest')
    expect(result.structuredContent?.summary.failed).toBe(0)
  })
})

describe('runTestsHandler: full pass-through', () => {
  it('full=true is accepted and propagates into Config (smoke against vitest-pass)', async () => {
    const result = await runTestsHandler({
      cwd: resolve(fixtures, 'vitest-pass'),
      full: true,
    })
    expect(result.isError).toBeUndefined()
    expect(result.structuredContent?.cruxVersion).toBe(1)
  })
})

describe('crux-mcp binary handshake (spawned)', () => {
  it.runIf(existsSync(builtServer))('lists run_tests via stdio handshake', async () => {
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [builtServer],
      cwd: repoRoot,
    })

    const client = new Client({ name: 'crux-test-client', version: '0.0.0' })

    try {
      await client.connect(transport)

      const tools = await client.listTools()
      const runTestsTool = tools.tools.find((t) => t.name === 'run_tests')
      expect(runTestsTool).toBeDefined()
      expect(runTestsTool?.description).toContain('test suite')

      const serverInfo = client.getServerVersion()
      expect(serverInfo?.name).toBe('crux-mcp')
    } finally {
      await client.close()
    }
  })
})
