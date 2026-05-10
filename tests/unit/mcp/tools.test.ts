import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AdapterDetectError } from '../../../src/errors.js'
import { runTestsHandler } from '../../../src/mcp/tools.js'
import type { PipelineResult } from '../../../src/pipeline.js'
import { runTests } from '../../../src/pipeline.js'

vi.mock('../../../src/pipeline.js', () => ({
  runTests: vi.fn(),
}))

const runTestsMock = vi.mocked(runTests)

beforeEach(() => {
  runTestsMock.mockReset()
})

describe('runTestsHandler — passthrough kind branch', () => {
  it('returns isError with passthrough message when pipeline returns passthrough', async () => {
    runTestsMock.mockResolvedValue({
      kind: 'passthrough',
      reason: 'unknown runner in command: mocha',
      capture: { stdout: '', stderr: '', exitCode: 1 },
    } satisfies PipelineResult)

    const result = await runTestsHandler({ command: ['mocha', 'tests/'] })

    expect(result.isError).toBe(true)
    expect(result.structuredContent).toBeUndefined()
    expect(result.content).toHaveLength(1)
    expect(result.content[0]?.text).toContain('passthrough mode')
    expect(result.content[0]?.text).toContain('unknown runner in command: mocha')
    expect(result.content[0]?.text).toContain("'command' input field")
  })
})

describe('runTestsHandler — CruxError branch', () => {
  it('returns isError with crux: <message>\\nfix: <hint> when pipeline throws CruxError', async () => {
    runTestsMock.mockRejectedValue(new AdapterDetectError())

    const result = await runTestsHandler({ cwd: '/some/path' })

    expect(result.isError).toBe(true)
    expect(result.structuredContent).toBeUndefined()
    expect(result.content[0]?.text).toMatch(/^crux:/)
    expect(result.content[0]?.text).toContain('fix:')
  })
})

describe('runTestsHandler — unexpected error branch', () => {
  it('returns isError with unexpected error message when pipeline throws non-CruxError', async () => {
    runTestsMock.mockRejectedValue(new Error('something exploded'))

    const result = await runTestsHandler({})

    expect(result.isError).toBe(true)
    expect(result.content[0]?.text).toContain('crux: unexpected error:')
    expect(result.content[0]?.text).toContain('something exploded')
  })
})
