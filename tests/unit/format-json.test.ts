import { describe, expect, it } from 'vitest'
import type { CruxJsonEnvelope } from '../../src/format/json.js'
import { buildJsonEnvelope, formatJson, serializeEnvelope } from '../../src/format/json.js'
import type { Failure, RunnerError, RunResult } from '../../src/types.js'

function makeRunResult(overrides: {
  passed?: number
  failed?: number
  skipped?: number
  total?: number
  durationMs?: number | null
  failures?: Failure[]
  runnerError?: RunnerError | null
}): RunResult {
  return {
    runner: 'vitest',
    passed: overrides.passed ?? 0,
    failed: overrides.failed ?? 0,
    skipped: overrides.skipped ?? 0,
    total: overrides.total ?? 0,
    durationMs: overrides.durationMs ?? null,
    failures: overrides.failures ?? [],
    runnerError: overrides.runnerError ?? null,
  }
}

const baseResult: RunResult = {
  runner: 'vitest',
  passed: 0,
  failed: 0,
  skipped: 0,
  total: 0,
  durationMs: null,
  failures: [],
  runnerError: null,
}

describe('formatJson', () => {
  it('round-trips through JSON.parse to the expected envelope', () => {
    const out = formatJson(baseResult, 0)
    const parsed = JSON.parse(out)
    expect(parsed).toEqual({
      cruxVersion: 1,
      runner: 'vitest',
      exitCode: 0,
      summary: {
        passed: 0,
        failed: 0,
        skipped: 0,
        total: 0,
        durationMs: null,
      },
      failures: [],
      runnerError: null,
    })
  })

  it('always sets cruxVersion to 1', () => {
    const parsed = JSON.parse(formatJson(baseResult, 0))
    expect(parsed.cruxVersion).toBe(1)
  })

  it('uses exitCode from the second argument, not from anywhere on RunResult', () => {
    const parsed = JSON.parse(formatJson(baseResult, 137))
    expect(parsed.exitCode).toBe(137)
  })

  it('groups passed, failed, skipped, total, durationMs under summary', () => {
    const result: RunResult = {
      ...baseResult,
      passed: 3,
      failed: 1,
      skipped: 2,
      total: 6,
      durationMs: 1280,
    }
    const parsed = JSON.parse(formatJson(result, 1))
    expect(parsed.summary).toEqual({
      passed: 3,
      failed: 1,
      skipped: 2,
      total: 6,
      durationMs: 1280,
    })
  })

  it('copies failures, runner, and runnerError through unchanged', () => {
    const result: RunResult = {
      ...baseResult,
      runner: 'vitest',
      failures: [
        {
          testName: 'foo > bar',
          filePath: 'src/x.test.ts',
          line: 12,
          column: 4,
          message: 'expected 1 to be 2',
          expected: '2',
          received: '1',
          topFrame: { filePath: 'src/x.test.ts', line: 12, column: 4 },
        },
      ],
      runnerError: { kind: 'compile-error', message: 'cannot find name foo' },
    }
    const parsed = JSON.parse(formatJson(result, 1))
    expect(parsed.failures).toEqual(result.failures)
    expect(parsed.runner).toBe('vitest')
    expect(parsed.runnerError).toEqual(result.runnerError)
  })

  it('ends the output with a single trailing newline', () => {
    const out = formatJson(baseResult, 0)
    expect(out.endsWith('\n')).toBe(true)
    expect(out.endsWith('\n\n')).toBe(false)
  })

  it('serializes empty failures as [] not omitted', () => {
    const parsed = JSON.parse(formatJson(baseResult, 0))
    expect(Array.isArray(parsed.failures)).toBe(true)
    expect(parsed.failures.length).toBe(0)
  })

  it('serializes null fields as null not omitted', () => {
    const parsed = JSON.parse(formatJson(baseResult, 0))
    expect(parsed.summary.durationMs).toBeNull()
    expect(parsed.runnerError).toBeNull()
  })

  it('matches a hand-written full-shape reference envelope', () => {
    const result: RunResult = {
      runner: 'vitest',
      passed: 1,
      failed: 1,
      skipped: 0,
      total: 2,
      durationMs: 234,
      failures: [
        {
          testName: 'src/auth.test.ts > rejects bad password',
          filePath: 'src/auth.test.ts',
          line: 42,
          column: 14,
          message: 'AssertionError: expected 401 to be 500',
          expected: '500',
          received: '401',
          topFrame: { filePath: 'src/auth.test.ts', line: 42, column: 14 },
        },
      ],
      runnerError: null,
    }
    const parsed = JSON.parse(formatJson(result, 1))
    const reference = {
      cruxVersion: 1,
      runner: 'vitest',
      exitCode: 1,
      summary: { passed: 1, failed: 1, skipped: 0, total: 2, durationMs: 234 },
      failures: result.failures,
      runnerError: null,
    }
    expect(parsed).toEqual(reference)
  })
})

describe('buildJsonEnvelope', () => {
  it('produces the locked v1 envelope shape', () => {
    const result = makeRunResult({})
    const envelope: CruxJsonEnvelope = buildJsonEnvelope(result, 0)
    expect(envelope.cruxVersion).toBe(1)
    expect(envelope.runner).toBe('vitest')
    expect(envelope.exitCode).toBe(0)
    expect(envelope.summary).toEqual({
      passed: 0,
      failed: 0,
      skipped: 0,
      total: 0,
      durationMs: null,
    })
    expect(envelope.failures).toEqual([])
    expect(envelope.runnerError).toBeNull()
  })

  it('threads exitCode separately from RunResult', () => {
    const result = makeRunResult({ passed: 3, total: 3 })
    const envelope = buildJsonEnvelope(result, 1)
    expect(envelope.exitCode).toBe(1)
  })

  it('preserves failures verbatim', () => {
    const failure: Failure = {
      testName: 'auth > rejects bad token',
      filePath: 'src/auth.test.ts',
      line: 12,
      column: 4,
      message: 'expected 401 to be 403',
      expected: '403',
      received: '401',
      topFrame: { filePath: 'src/auth.test.ts', line: 12, column: 4 },
    }
    const result = makeRunResult({ failed: 1, total: 1, failures: [failure] })
    const envelope = buildJsonEnvelope(result, 1)
    expect(envelope.failures).toHaveLength(1)
    expect(envelope.failures[0]).toEqual(failure)
  })

  it('preserves runnerError verbatim when present', () => {
    const runnerError: RunnerError = { kind: 'compile-error', message: 'syntax error' }
    const result = makeRunResult({ runnerError })
    const envelope = buildJsonEnvelope(result, 2)
    expect(envelope.runnerError).toEqual(runnerError)
  })

  it('round-trips: JSON.parse(formatJson()) equals buildJsonEnvelope()', () => {
    const result = makeRunResult({
      passed: 2,
      failed: 1,
      skipped: 0,
      total: 3,
      durationMs: 500,
      failures: [
        {
          testName: 'x > y',
          filePath: 'src/x.test.ts',
          line: 5,
          column: 1,
          message: 'expected true to be false',
          expected: 'false',
          received: 'true',
          topFrame: { filePath: 'src/x.test.ts', line: 5, column: 1 },
        },
      ],
    })
    const envelope = buildJsonEnvelope(result, 1)
    const parsed = JSON.parse(formatJson(result, 1))
    expect(parsed).toEqual(envelope)
  })
})

describe('JSON envelope: truncation flags', () => {
  it('omits expectedTruncated/receivedTruncated when not set', () => {
    const result: RunResult = {
      runner: 'vitest',
      passed: 0,
      failed: 1,
      skipped: 0,
      total: 1,
      durationMs: null,
      runnerError: null,
      failures: [
        {
          testName: 't',
          filePath: null,
          line: null,
          column: null,
          message: 'm',
          expected: '{}',
          received: '{}',
          topFrame: null,
        },
      ],
    }
    const out = serializeEnvelope(buildJsonEnvelope(result, 1))
    expect(out).not.toContain('expectedTruncated')
    expect(out).not.toContain('receivedTruncated')
  })

  it('includes the flags when set to true', () => {
    const result: RunResult = {
      runner: 'vitest',
      passed: 0,
      failed: 1,
      skipped: 0,
      total: 1,
      durationMs: null,
      runnerError: null,
      failures: [
        {
          testName: 't',
          filePath: null,
          line: null,
          column: null,
          message: 'm',
          expected: null,
          received: null,
          topFrame: null,
          expectedTruncated: true,
          receivedTruncated: true,
        },
      ],
    }
    const out = serializeEnvelope(buildJsonEnvelope(result, 1))
    expect(out).toContain('"expectedTruncated": true')
    expect(out).toContain('"receivedTruncated": true')
  })
})
