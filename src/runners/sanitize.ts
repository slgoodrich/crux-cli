import type { Failure, RunResult } from '../types.js'

export type SanitizeOptions = { full: boolean }

// vitest's .rejects/.resolves matcher emits a placeholder Error for the
// expected value when the promise settles the wrong way. The renderer
// chooses one of two formats depending on context; both are semantically
// the same "you said this should reject/resolve and it didn't" marker.
const PROMISE_SETTLEMENT_OBJECT_FORM = /^Error \{ "message": "(rejected|resolved) promise",? \}$/

function isPromiseSettlementMarker(value: string): boolean {
  if (value === '[Error: rejected promise]' || value === '[Error: resolved promise]') {
    return true
  }
  const compact = value.replace(/\s+/g, ' ').trim()
  return PROMISE_SETTLEMENT_OBJECT_FORM.test(compact)
}

const MAX_FIELD_LENGTH = 2048
const TRUNCATION_SUFFIX = '\n... [truncated]'

export function sanitizeRunResult(result: RunResult, options: SanitizeOptions): RunResult {
  if (options.full) return result
  if (result.failures.length === 0) return result
  if (result.runnerError !== null) return result

  const sanitized: Failure[] = result.failures.map(sanitizeFailure)
  return { ...result, failures: sanitized }
}

function sanitizeFailure(failure: Failure): Failure {
  if (failure.expected !== null && isPromiseSettlementMarker(failure.expected)) {
    return {
      ...failure,
      expected: null,
      received: null,
      expectedTruncated: true,
      receivedTruncated: true,
    }
  }

  const stripped = {
    expected: stripSymbolLines(failure.expected),
    received: stripSymbolLines(failure.received),
  }
  const capped = {
    expected: capLength(stripped.expected.value),
    received: capLength(stripped.received.value),
  }

  const expectedTruncated = stripped.expected.changed || capped.expected.changed
  const receivedTruncated = stripped.received.changed || capped.received.changed

  return {
    ...failure,
    expected: capped.expected.value,
    received: capped.received.value,
    ...(expectedTruncated ? { expectedTruncated: true as const } : {}),
    ...(receivedTruncated ? { receivedTruncated: true as const } : {}),
  }
}

type StripResult = { value: string | null; changed: boolean }

function capLength(input: string | null): StripResult {
  if (input === null) return { value: null, changed: false }
  if (input.length <= MAX_FIELD_LENGTH) return { value: input, changed: false }
  return { value: input.slice(0, MAX_FIELD_LENGTH) + TRUNCATION_SUFFIX, changed: true }
}

function stripSymbolLines(input: string | null): StripResult {
  if (input === null) return { value: null, changed: false }
  if (!input.includes('Symbol(')) return { value: input, changed: false }

  const lines = input.split('\n')
  const out: string[] = []
  let changed = false

  let skipBelowIndent: number | null = null
  for (const line of lines) {
    const indent = leadingSpaces(line)

    if (skipBelowIndent !== null) {
      if (indent > skipBelowIndent) {
        changed = true
        continue
      }
      // Exit skip mode at the sibling level. The closing brace/bracket
      // of the dropped Symbol block (e.g., the `},` line at the same
      // indent as `Symbol(state): {`) is kept intentionally; properly
      // pairing it with the opener would require tracking bracket depth
      // across lines, which isn't worth the complexity for an internal
      // dump format the LLM consumer can still read past.
      skipBelowIndent = null
    }

    const trimmed = line.trimStart()
    if (trimmed.startsWith('Symbol(')) {
      changed = true
      skipBelowIndent = indent
      continue
    }

    out.push(line)
  }

  return { value: out.join('\n'), changed }
}

function leadingSpaces(line: string): number {
  let n = 0
  while (n < line.length && line[n] === ' ') n++
  return n
}
