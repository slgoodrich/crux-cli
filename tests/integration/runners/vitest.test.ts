import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { loadProjectFiles } from '../../../src/detect.js'
import { runTests } from '../../../src/pipeline.js'
import { vitestAdapter } from '../../../src/runners/vitest.js'

const fixtures = resolve(
  fileURLToPath(new URL('.', import.meta.url)),
  '..',
  '..',
  'fixtures',
  'projects',
)

describe('vitestAdapter integration', () => {
  it('detect returns true for vitest-pass fixture', async () => {
    const project = await loadProjectFiles(resolve(fixtures, 'vitest-pass'))
    expect(vitestAdapter.detect(project)).toBe(true)
  })

  it('hasActiveConfig returns true for vitest-pass fixture', async () => {
    const project = await loadProjectFiles(resolve(fixtures, 'vitest-pass'))
    expect(vitestAdapter.hasActiveConfig(project)).toBe(true)
  })

  it('detect returns true for vitest-fail-single fixture', async () => {
    const project = await loadProjectFiles(resolve(fixtures, 'vitest-fail-single'))
    expect(vitestAdapter.detect(project)).toBe(true)
  })

  it('defaultCommand returns the npx form', () => {
    expect(vitestAdapter.defaultCommand()).toEqual(['npx', 'vitest', 'run', '--reporter=default'])
  })

  it('end-to-end parse against vitest-pass yields all-passed RunResult', async () => {
    const result = await runTests({
      format: 'markdown',
      cwd: resolve(fixtures, 'vitest-pass'),
      showHelp: false,
      showVersion: false,
      passthroughCommand: null,
      full: false,
    })
    expect(result.kind).toBe('parsed')
    if (result.kind !== 'parsed') return
    expect(result.result.runner).toBe('vitest')
    expect(result.result.failed).toBe(0)
    expect(result.result.runnerError).toBeNull()
  })

  it('end-to-end parse against vitest-fail-single yields one failure', async () => {
    const result = await runTests({
      format: 'markdown',
      cwd: resolve(fixtures, 'vitest-fail-single'),
      showHelp: false,
      showVersion: false,
      passthroughCommand: null,
      full: false,
    })
    expect(result.kind).toBe('parsed')
    if (result.kind !== 'parsed') return
    expect(result.result.failed).toBe(1)
    expect(result.result.failures[0]?.filePath).toBeTruthy()
  })
})

describe('runTests: rejects-response truncation', () => {
  it('full=false strips Symbol graphs and sets receivedTruncated', async () => {
    // After the broader isPromiseSettlementMarker fix, the multi-line Error
    // object form now triggers the rejects-collapse path, so both expected and
    // received are nulled rather than Symbol-stripped.
    const result = await runTests({
      format: 'json',
      cwd: resolve(fixtures, 'vitest-rejects-response'),
      showHelp: false,
      showVersion: false,
      passthroughCommand: null,
      full: false,
    })
    expect(result.kind).toBe('parsed')
    if (result.kind !== 'parsed') return
    const failure = result.result.failures[0]
    expect(failure).toBeDefined()
    if (failure === undefined) return
    expect(failure.received).toBeNull()
    expect(failure.expected).toBeNull()
    expect(failure.receivedTruncated).toBe(true)
    expect(failure.expectedTruncated).toBe(true)
    expect(failure.message).toContain('rejecting')
  })

  it('full=true preserves the Symbol graph in received', async () => {
    const result = await runTests({
      format: 'json',
      cwd: resolve(fixtures, 'vitest-rejects-response'),
      showHelp: false,
      showVersion: false,
      passthroughCommand: null,
      full: true,
    })
    expect(result.kind).toBe('parsed')
    if (result.kind !== 'parsed') return
    const failure = result.result.failures[0]
    if (failure === undefined) return
    expect(failure.received).toContain('Symbol(')
    expect(failure.receivedTruncated).toBeUndefined()
  })
})
