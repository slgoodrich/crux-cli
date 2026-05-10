import { describe, expect, it } from 'vitest'
import { sanitizeRunResult } from '../../../src/runners/sanitize.js'
import type { Failure, RunResult } from '../../../src/types.js'

describe('Failure type', () => {
  it('accepts expectedTruncated: true and receivedTruncated: true', () => {
    const f: Failure = {
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
    }
    expect(f.expectedTruncated).toBe(true)
    expect(f.receivedTruncated).toBe(true)
  })

  it('accepts a Failure without truncation flags (defaults to undefined)', () => {
    const f: Failure = {
      testName: 't',
      filePath: null,
      line: null,
      column: null,
      message: 'm',
      expected: null,
      received: null,
      topFrame: null,
    }
    expect(f.expectedTruncated).toBeUndefined()
    expect(f.receivedTruncated).toBeUndefined()
  })
})

function makeResult(failures: Failure[]): RunResult {
  return {
    runner: 'vitest',
    passed: 0,
    failed: failures.length,
    skipped: 0,
    total: failures.length,
    durationMs: null,
    failures,
    runnerError: null,
  }
}

function makeFailure(overrides: Partial<Failure> = {}): Failure {
  return {
    testName: 'test',
    filePath: null,
    line: null,
    column: null,
    message: '',
    expected: null,
    received: null,
    topFrame: null,
    ...overrides,
  }
}

describe('sanitizeRunResult: full=true bypass', () => {
  it('returns the input unchanged when full=true', () => {
    const huge = 'x'.repeat(10_000)
    const input = makeResult([makeFailure({ expected: huge, received: huge })])
    const output = sanitizeRunResult(input, { full: true })
    expect(output).toBe(input)
  })

  it('returns input unchanged when failures array is empty', () => {
    const input = makeResult([])
    const output = sanitizeRunResult(input, { full: false })
    expect(output).toBe(input)
  })

  it('returns input unchanged when runnerError is non-null', () => {
    const input: RunResult = {
      ...makeResult([]),
      runnerError: { kind: 'compile-error', message: 'boom' },
    }
    const output = sanitizeRunResult(input, { full: false })
    expect(output).toBe(input)
  })
})

describe('sanitizeRunResult: rejects/resolves classification', () => {
  it('drops both fields when expected is the rejected-promise marker', () => {
    const input = makeResult([
      makeFailure({
        expected: '[Error: rejected promise]',
        received: 'Response {\n  Symbol(state): { status: 200 }\n}',
        message: 'AssertionError: promise resolved "Response {...}" instead of rejecting',
      }),
    ])
    const out = sanitizeRunResult(input, { full: false })
    const f = out.failures[0]
    expect(f).toBeDefined()
    if (f === undefined) return
    expect(f.expected).toBeNull()
    expect(f.received).toBeNull()
    expect(f.expectedTruncated).toBe(true)
    expect(f.receivedTruncated).toBe(true)
    expect(f.message).toBe(input.failures[0]?.message)
  })

  it('drops both fields for the resolved-promise marker (resolves matcher)', () => {
    const input = makeResult([
      makeFailure({
        expected: '[Error: resolved promise]',
        received: 'Response { ... }',
      }),
    ])
    const out = sanitizeRunResult(input, { full: false })
    expect(out.failures[0]?.expected).toBeNull()
    expect(out.failures[0]?.received).toBeNull()
    expect(out.failures[0]?.expectedTruncated).toBe(true)
    expect(out.failures[0]?.receivedTruncated).toBe(true)
  })

  it('full=true preserves the rejects diff verbatim', () => {
    const input = makeResult([
      makeFailure({
        expected: '[Error: rejected promise]',
        received: 'Response { ... }',
      }),
    ])
    const out = sanitizeRunResult(input, { full: true })
    expect(out.failures[0]?.expected).toBe('[Error: rejected promise]')
    expect(out.failures[0]?.received).toBe('Response { ... }')
    expect(out.failures[0]?.expectedTruncated).toBeUndefined()
  })

  it('does not classify normal toEqual diffs as rejects', () => {
    const input = makeResult([
      makeFailure({
        expected: '{\n  "a": 1\n}',
        received: '{\n  "a": 2\n}',
      }),
    ])
    const out = sanitizeRunResult(input, { full: false })
    expect(out.failures[0]?.expected).toBe(input.failures[0]?.expected)
    expect(out.failures[0]?.received).toBe(input.failures[0]?.received)
    expect(out.failures[0]?.expectedTruncated).toBeUndefined()
    expect(out.failures[0]?.receivedTruncated).toBeUndefined()
  })
})

describe('sanitizeRunResult: Symbol-keyed line removal', () => {
  it('removes a single Symbol(...) line and sets receivedTruncated', () => {
    const input = makeResult([
      makeFailure({
        expected: '{ "a": 1 }',
        received: 'Response {\n  Symbol(state): "internal",\n  ok: true\n}',
      }),
    ])
    const out = sanitizeRunResult(input, { full: false })
    const f = out.failures[0]
    if (f === undefined) throw new Error('no failure')
    expect(f.received).not.toContain('Symbol(')
    expect(f.received).toContain('ok: true')
    expect(f.receivedTruncated).toBe(true)
    expect(f.expectedTruncated).toBeUndefined()
  })

  it('removes a Symbol block whose value spans multiple indented lines', () => {
    const received = [
      'Response {',
      '  Symbol(state): {',
      '    "internal-1": "x",',
      '    "internal-2": "y",',
      '  },',
      '  url: "http://x",',
      '}',
    ].join('\n')
    const input = makeResult([makeFailure({ received })])
    const out = sanitizeRunResult(input, { full: false })
    const f = out.failures[0]
    if (f === undefined) throw new Error('no failure')
    expect(f.received).not.toContain('Symbol(')
    expect(f.received).not.toContain('internal-1')
    expect(f.received).not.toContain('internal-2')
    expect(f.received).toContain('url: "http://x"')
    expect(f.receivedTruncated).toBe(true)
  })

  it('handles nested Symbol blocks (drops nested + outer)', () => {
    const received = [
      'Response {',
      '  Symbol(state): {',
      '    "k": {',
      '      Symbol(nested): "inner",',
      '      "v": 1,',
      '    },',
      '  },',
      '  ok: true,',
      '}',
    ].join('\n')
    const input = makeResult([makeFailure({ received })])
    const out = sanitizeRunResult(input, { full: false })
    expect(out.failures[0]?.received).not.toContain('Symbol(')
    expect(out.failures[0]?.received).toContain('ok: true')
  })

  it('leaves received unchanged when no Symbol(...) lines are present', () => {
    const received = '{\n  "a": 1,\n  "b": 2\n}'
    const input = makeResult([makeFailure({ received })])
    const out = sanitizeRunResult(input, { full: false })
    expect(out.failures[0]?.received).toBe(received)
    expect(out.failures[0]?.receivedTruncated).toBeUndefined()
  })

  it('strips Symbol(...) lines from expected too and sets expectedTruncated', () => {
    const expected = 'Response {\n  Symbol(s): "x",\n  ok: true\n}'
    const input = makeResult([makeFailure({ expected, received: '{}' })])
    const out = sanitizeRunResult(input, { full: false })
    expect(out.failures[0]?.expected).not.toContain('Symbol(')
    expect(out.failures[0]?.expectedTruncated).toBe(true)
  })
})

describe('sanitizeRunResult: multi-line settlement marker', () => {
  it('drops both fields when expected is the multi-line Error rejected variant', () => {
    const input = makeResult([
      makeFailure({
        expected: 'Error {\n  "message": "rejected promise",\n}',
        received: 'Response { ... }',
      }),
    ])
    const out = sanitizeRunResult(input, { full: false })
    expect(out.failures[0]?.expected).toBeNull()
    expect(out.failures[0]?.received).toBeNull()
    expect(out.failures[0]?.expectedTruncated).toBe(true)
    expect(out.failures[0]?.receivedTruncated).toBe(true)
  })

  it('drops both fields for the multi-line Error resolved variant', () => {
    const input = makeResult([
      makeFailure({
        expected: 'Error {\n  "message": "resolved promise",\n}',
        received: 'Response { ... }',
      }),
    ])
    const out = sanitizeRunResult(input, { full: false })
    expect(out.failures[0]?.expected).toBeNull()
    expect(out.failures[0]?.received).toBeNull()
  })

  it('matches the single-line object variant without a trailing comma', () => {
    const input = makeResult([
      makeFailure({
        expected: 'Error { "message": "rejected promise" }',
        received: 'Response { ... }',
      }),
    ])
    const out = sanitizeRunResult(input, { full: false })
    expect(out.failures[0]?.expected).toBeNull()
    expect(out.failures[0]?.received).toBeNull()
  })

  it('does not match Error objects with different messages', () => {
    const input = makeResult([
      makeFailure({
        expected: 'Error {\n  "message": "boom",\n}',
        received: '{}',
      }),
    ])
    const out = sanitizeRunResult(input, { full: false })
    expect(out.failures[0]?.expected).toBe('Error {\n  "message": "boom",\n}')
    expect(out.failures[0]?.expectedTruncated).toBeUndefined()
  })

  it('does not match strings that merely contain the marker text', () => {
    const input = makeResult([
      makeFailure({
        expected: 'rejected promise after timeout',
        received: '{}',
      }),
    ])
    const out = sanitizeRunResult(input, { full: false })
    expect(out.failures[0]?.expected).toBe('rejected promise after timeout')
    expect(out.failures[0]?.expectedTruncated).toBeUndefined()
  })
})

const MAX_FIELD_LENGTH = 2048

describe('sanitizeRunResult: hard length cap', () => {
  it('caps received at MAX_FIELD_LENGTH and sets receivedTruncated', () => {
    const huge = 'x'.repeat(5000)
    const input = makeResult([makeFailure({ expected: '{}', received: huge })])
    const out = sanitizeRunResult(input, { full: false })
    const f = out.failures[0]
    if (f === undefined) throw new Error('no failure')
    expect(f.received?.length).toBeLessThanOrEqual(MAX_FIELD_LENGTH + 64)
    expect(f.received).toContain('[truncated]')
    expect(f.receivedTruncated).toBe(true)
  })

  it('does not truncate fields under the threshold', () => {
    const small = 'x'.repeat(MAX_FIELD_LENGTH - 1)
    const input = makeResult([makeFailure({ expected: '{}', received: small })])
    const out = sanitizeRunResult(input, { full: false })
    expect(out.failures[0]?.received).toBe(small)
    expect(out.failures[0]?.receivedTruncated).toBeUndefined()
  })

  it('caps expected too', () => {
    const huge = 'y'.repeat(5000)
    const input = makeResult([makeFailure({ expected: huge, received: '{}' })])
    const out = sanitizeRunResult(input, { full: false })
    expect(out.failures[0]?.expected?.length).toBeLessThanOrEqual(MAX_FIELD_LENGTH + 64)
    expect(out.failures[0]?.expectedTruncated).toBe(true)
  })

  it('full=true bypasses the cap', () => {
    const huge = 'z'.repeat(5000)
    const input = makeResult([makeFailure({ expected: huge, received: huge })])
    const out = sanitizeRunResult(input, { full: true })
    expect(out.failures[0]?.expected?.length).toBe(5000)
    expect(out.failures[0]?.received?.length).toBe(5000)
  })
})
