import { describe, expect, it } from 'vitest'
import { formatMarkdown } from '../../src/format/markdown.js'
import type { Failure, RunResult } from '../../src/types.js'

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

const baseFailure: Failure = {
  testName: 'rejects bad password',
  filePath: 'src/auth.test.ts',
  line: 42,
  column: 14,
  message: 'AssertionError: expected 401 to be 500',
  expected: null,
  received: null,
  topFrame: null,
}

describe('formatMarkdown', () => {
  it('renders an all-pass single-line summary', () => {
    const out = formatMarkdown({
      ...baseResult,
      passed: 5,
      total: 5,
      durationMs: 1280,
    })
    expect(out).toBe('5 tests passed in 1.28s\n')
  })

  it('renders a single failure with topFrame and a frame line', () => {
    const out = formatMarkdown({
      ...baseResult,
      passed: 4,
      failed: 1,
      total: 5,
      durationMs: 1280,
      failures: [
        {
          ...baseFailure,
          topFrame: { filePath: 'src/auth.test.ts', line: 42, column: 14 },
        },
      ],
    })
    expect(out).toContain('1 of 5 tests failed in 1.28s')
    expect(out).toContain('### FAIL src/auth.test.ts:42 - rejects bad password')
    expect(out).toContain('AssertionError: expected 401 to be 500')
    expect(out).toContain('  at src/auth.test.ts:42')
  })

  it('omits the frame line when topFrame is null', () => {
    const out = formatMarkdown({
      ...baseResult,
      passed: 0,
      failed: 1,
      total: 1,
      durationMs: 100,
      failures: [baseFailure],
    })
    expect(out).not.toContain('  at ')
  })

  it('renders an expected/received block when both are populated', () => {
    const out = formatMarkdown({
      ...baseResult,
      passed: 0,
      failed: 1,
      total: 1,
      durationMs: 100,
      failures: [
        {
          ...baseFailure,
          expected: '500',
          received: '401',
        },
      ],
    })
    expect(out).toContain('expected: 500')
    expect(out).toContain('received: 401')
  })

  it('renders the message line when expected/received are null', () => {
    const out = formatMarkdown({
      ...baseResult,
      passed: 0,
      failed: 1,
      total: 1,
      durationMs: 100,
      failures: [baseFailure],
    })
    expect(out).toContain('AssertionError: expected 401 to be 500')
    expect(out).not.toContain('expected:')
    expect(out).not.toContain('received:')
  })

  it('renders multiple failures separated by blank lines', () => {
    const out = formatMarkdown({
      ...baseResult,
      passed: 0,
      failed: 2,
      total: 2,
      durationMs: 100,
      failures: [
        { ...baseFailure, testName: 'first', filePath: 'a.test.ts', line: 1 },
        { ...baseFailure, testName: 'second', filePath: 'b.test.ts', line: 2 },
      ],
    })
    expect(out).toContain('### FAIL a.test.ts:1 - first')
    expect(out).toContain('### FAIL b.test.ts:2 - second')
  })

  it('renders a runner-error header when runnerError is set', () => {
    const out = formatMarkdown({
      ...baseResult,
      runnerError: { kind: 'compile-error', message: 'cannot find name foo' },
    })
    expect(out).toContain('Runner error: cannot find name foo')
  })

  it('renders unknown duration when durationMs is null', () => {
    const out = formatMarkdown({
      ...baseResult,
      passed: 1,
      total: 1,
      durationMs: null,
    })
    expect(out).toContain('unknown duration')
  })

  it('handles a failure with a null filePath gracefully', () => {
    const out = formatMarkdown({
      ...baseResult,
      passed: 0,
      failed: 1,
      total: 1,
      durationMs: 100,
      failures: [{ ...baseFailure, filePath: null, line: null }],
    })
    expect(out).toContain('### FAIL <unknown>:? - rejects bad password')
  })

  it('ends the output with a single trailing newline', () => {
    const out = formatMarkdown({
      ...baseResult,
      passed: 1,
      total: 1,
      durationMs: 100,
    })
    expect(out.endsWith('\n')).toBe(true)
    expect(out.endsWith('\n\n')).toBe(false)
  })
})

describe('formatMarkdown: truncation marker', () => {
  it('emits (truncated: expected, received) when both flags are set', () => {
    const result: RunResult = {
      ...baseResult,
      failed: 1,
      total: 1,
      durationMs: 100,
      failures: [
        {
          ...baseFailure,
          message: 'AssertionError: rejecting',
          expectedTruncated: true,
          receivedTruncated: true,
        },
      ],
    }
    const md = formatMarkdown(result)
    expect(md).toContain('(truncated: expected, received)')
  })

  it('emits (truncated: received) when only received is truncated', () => {
    const result: RunResult = {
      ...baseResult,
      failed: 1,
      total: 1,
      durationMs: 100,
      failures: [
        {
          ...baseFailure,
          expected: '{}',
          received: 'Response { ... }',
          receivedTruncated: true,
        },
      ],
    }
    const md = formatMarkdown(result)
    expect(md).toContain('(truncated: received)')
    expect(md).not.toContain('(truncated: expected,')
    expect(md).not.toContain('(truncated: expected)')
  })

  it('emits (truncated: expected) when only expected is truncated', () => {
    const result: RunResult = {
      ...baseResult,
      failed: 1,
      total: 1,
      durationMs: 100,
      failures: [
        {
          ...baseFailure,
          expected: 'huge',
          received: '{}',
          expectedTruncated: true,
        },
      ],
    }
    const md = formatMarkdown(result)
    expect(md).toContain('(truncated: expected)')
    expect(md).not.toContain('(truncated: received)')
  })

  it('omits the marker when nothing is truncated', () => {
    const result: RunResult = {
      ...baseResult,
      failed: 1,
      total: 1,
      durationMs: 100,
      failures: [{ ...baseFailure, expected: '{}', received: '{}' }],
    }
    const md = formatMarkdown(result)
    expect(md).not.toContain('(truncated:')
  })

  it('places the marker before the at-frame line when topFrame is set', () => {
    const result: RunResult = {
      ...baseResult,
      failed: 1,
      total: 1,
      durationMs: 100,
      failures: [
        {
          ...baseFailure,
          expected: '{}',
          received: '{}',
          receivedTruncated: true,
          topFrame: { filePath: 'a.test.ts', line: 5, column: 10 },
        },
      ],
    }
    const md = formatMarkdown(result)
    const truncatedIdx = md.indexOf('(truncated:')
    const atIdx = md.indexOf('  at a.test.ts:5')
    expect(truncatedIdx).toBeGreaterThan(-1)
    expect(atIdx).toBeGreaterThan(-1)
    expect(truncatedIdx).toBeLessThan(atIdx)
  })
})
