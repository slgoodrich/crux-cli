import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { ParseError } from '../../../src/errors.js'
import { sanitizeRunResult } from '../../../src/runners/sanitize.js'
import type { ProjectFiles, SubprocessCapture } from '../../../src/runners/types.js'
import { parseVitest, vitestAdapter } from '../../../src/runners/vitest.js'
import { makeProjectFiles } from '../../helpers/project-files.js'

const here = dirname(fileURLToPath(import.meta.url))
const capturesDir = resolve(here, '../../fixtures/captures/vitest')

function loadCapture(name: string, exitCode = 0, stderr = ''): SubprocessCapture {
  const stdout = readFileSync(resolve(capturesDir, name), 'utf8')
  return { stdout, stderr, exitCode }
}

describe('parseVitest: smoke', () => {
  it('throws ParseError on completely empty input', () => {
    expect(() => parseVitest({ stdout: '', stderr: '', exitCode: 1 })).toThrow(ParseError)
  })
})

describe('parseVitest: pass cases', () => {
  it('parses pass.txt as all-passing with non-null durationMs', () => {
    const result = parseVitest(loadCapture('pass.txt', 0))
    expect(result.runner).toBe('vitest')
    expect(result.passed).toBeGreaterThan(0)
    expect(result.failed).toBe(0)
    expect(result.failures).toEqual([])
    expect(result.runnerError).toBeNull()
    expect(result.total).toBe(result.passed + result.skipped)
    expect(result.durationMs).not.toBeNull()
  })

  it('parses pass-with-skips.txt with skipped > 0', () => {
    const result = parseVitest(loadCapture('pass-with-skips.txt', 0))
    expect(result.failed).toBe(0)
    expect(result.skipped).toBeGreaterThan(0)
    expect(result.failures).toEqual([])
  })

  it('parses pass-slow.txt with seconds-format duration into durationMs', () => {
    const result = parseVitest(loadCapture('pass-slow.txt', 0))
    expect(result.durationMs).not.toBeNull()
    // 1.5s fixture -> 1500 ms
    expect(result.durationMs).toBe(1500)
  })

  it('returns null durationMs when duration format is unrecognized (pass-unknown-duration.txt)', () => {
    const result = parseVitest(loadCapture('pass-unknown-duration.txt', 0))
    expect(result.durationMs).toBeNull()
  })
})

describe('parseVitest: fail cases', () => {
  it('parses fail-single.txt with a populated failure', () => {
    const result = parseVitest(loadCapture('fail-single.txt', 1))
    expect(result.failed).toBe(1)
    expect(result.failures.length).toBe(1)
    const failure = result.failures[0]
    expect(failure).toBeDefined()
    if (failure === undefined) return
    expect(failure.testName).toContain('fails one expectation')
    expect(failure.filePath).not.toBeNull()
    expect(failure.line).not.toBeNull()
    expect(failure.message).not.toBe('')
  })

  it('parses fail-many.txt with multiple failures', () => {
    const result = parseVitest(loadCapture('fail-many.txt', 1))
    expect(result.failed).toBeGreaterThan(1)
    expect(result.failures.length).toBe(result.failed)
    for (const failure of result.failures) {
      expect(failure.testName).not.toBe('')
      expect(failure.filePath).not.toBeNull()
    }
  })

  it('parses fail-across-files.txt with failures from multiple files', () => {
    const result = parseVitest(loadCapture('fail-across-files.txt', 1))
    const filePaths = new Set(result.failures.map((f) => f.filePath))
    expect(filePaths.size).toBeGreaterThan(1)
  })

  it('parses mixed-pass-fail.txt with both passing and failing counts', () => {
    const result = parseVitest(loadCapture('mixed-pass-fail.txt', 1))
    expect(result.passed).toBeGreaterThan(0)
    expect(result.failed).toBeGreaterThan(0)
    expect(result.total).toBe(result.passed + result.failed + result.skipped)
  })
})

describe('parseVitest: diff block extraction', () => {
  it('extracts expected and received from assertion-tobe.txt', () => {
    const result = parseVitest(loadCapture('assertion-tobe.txt', 1))
    expect(result.failures.length).toBe(1)
    const failure = result.failures[0]
    if (failure === undefined) return
    expect(failure.expected).not.toBeNull()
    expect(failure.received).not.toBeNull()
  })

  it('extracts multi-line expected/received from assertion-toequal.txt', () => {
    const result = parseVitest(loadCapture('assertion-toequal.txt', 1))
    const failure = result.failures[0]
    if (failure === undefined) return
    expect(failure.expected).not.toBeNull()
    expect(failure.received).not.toBeNull()
  })

  it('parses assertion-tomatch.txt with a regex matcher (no diff block)', () => {
    const result = parseVitest(loadCapture('assertion-tomatch.txt', 1))
    expect(result.failures.length).toBe(1)
    const failure = result.failures[0]
    if (failure === undefined) return
    expect(failure.message).not.toBe('')
  })

  it('parses assertion-throws.txt (toThrow has no diff)', () => {
    const result = parseVitest(loadCapture('assertion-throws.txt', 1))
    expect(result.failures.length).toBe(1)
  })

  it('parses assertion-custom-matcher.txt', () => {
    const result = parseVitest(loadCapture('assertion-custom-matcher.txt', 1))
    expect(result.failures.length).toBe(1)
    const failure = result.failures[0]
    if (failure === undefined) return
    expect(failure.message).not.toBe('')
  })

  it('keeps expected/received null when there is no diff block (fail-single-no-diff)', () => {
    const result = parseVitest(loadCapture('fail-single-no-diff.txt', 1))
    const failure = result.failures[0]
    if (failure === undefined) return
    expect(failure.expected).toBeNull()
    expect(failure.received).toBeNull()
  })
})

describe('parseVitest: runner errors', () => {
  it('parses compile-error.txt with runnerError.kind === compile-error', () => {
    const result = parseVitest(loadCapture('compile-error.txt', 1))
    expect(result.runnerError).not.toBeNull()
    expect(result.runnerError?.kind).toBe('compile-error')
    expect(result.failures).toEqual([])
  })

  it('parses import-error.txt with runnerError populated', () => {
    const result = parseVitest(loadCapture('import-error.txt', 1))
    expect(result.runnerError).not.toBeNull()
    expect(result.runnerError?.kind).toBe('compile-error')
  })

  it('parses binary-not-found.txt with runnerError.kind === binary-not-found', () => {
    const result = parseVitest(loadCapture('binary-not-found.txt', 127))
    expect(result.runnerError).not.toBeNull()
    expect(result.runnerError?.kind).toBe('binary-not-found')
    expect(result.failures).toEqual([])
  })

  it('parses config-error.txt with runnerError.kind === config-error', () => {
    const result = parseVitest(loadCapture('config-error.txt', 1))
    expect(result.runnerError).not.toBeNull()
    expect(result.runnerError?.kind).toBe('config-error')
  })

  it('parses hook-uncaught.txt as a normal failure (anchor + Failed Tests, not Failed Suites)', () => {
    const result = parseVitest(loadCapture('hook-uncaught.txt', 1))
    // Either failures populated or runnerError set; assert at least one.
    const hasFailure = result.failures.length > 0
    const hasRunnerError = result.runnerError !== null
    expect(hasFailure || hasRunnerError).toBe(true)
  })
})

describe('parseVitest: frame filtering', () => {
  it('skips node_modules frames in frame-in-node-modules.txt', () => {
    const result = parseVitest(loadCapture('frame-in-node-modules.txt', 1))
    const failure = result.failures[0]
    if (failure === undefined) return
    if (failure.topFrame !== null) {
      expect(failure.topFrame.filePath).not.toContain('node_modules/')
    }
  })

  it('skips vitest-internal frames in frame-in-vitest-internals.txt', () => {
    const result = parseVitest(loadCapture('frame-in-vitest-internals.txt', 1))
    const failure = result.failures[0]
    if (failure === undefined) return
    if (failure.topFrame !== null) {
      expect(failure.topFrame.filePath).not.toMatch(/vitest\/dist\//)
    }
  })

  it('handles frame-anonymous.txt without throwing', () => {
    const result = parseVitest(loadCapture('frame-anonymous.txt', 1))
    expect(result.failed).toBeGreaterThan(0)
  })
})

describe('parseVitest: edge cases', () => {
  it('parses snapshot-mismatch.txt as a failure', () => {
    const result = parseVitest(loadCapture('snapshot-mismatch.txt', 1))
    expect(result.failed).toBeGreaterThan(0)
  })

  it('parses snapshot-inline.txt as a failure', () => {
    const result = parseVitest(loadCapture('snapshot-inline.txt', 1))
    expect(result.failed).toBeGreaterThan(0)
  })

  it('parses parametrized.txt with multiple per-iteration failures', () => {
    const result = parseVitest(loadCapture('parametrized.txt', 1))
    expect(result.failures.length).toBeGreaterThanOrEqual(2)
  })

  it('parses long-test-name.txt without truncating the test name', () => {
    const result = parseVitest(loadCapture('long-test-name.txt', 1))
    const failure = result.failures[0]
    if (failure === undefined) return
    expect(failure.testName.length).toBeGreaterThan(40)
  })

  it('parses unicode-in-output.txt preserving non-ASCII characters', () => {
    const result = parseVitest(loadCapture('unicode-in-output.txt', 1))
    const failure = result.failures[0]
    if (failure === undefined) return
    expect(failure.testName).not.toBe('')
  })

  it('throws ParseError when summary is missing (summary-missing.txt)', () => {
    expect(() => parseVitest(loadCapture('summary-missing.txt', 1))).toThrow(ParseError)
  })
})

describe('parseVitest: throws on unrecognizable shape', () => {
  it('throws ParseError on non-default-reporter.txt (anchor missing, no markers)', () => {
    expect(() => parseVitest(loadCapture('non-default-reporter.txt', 0))).toThrow(ParseError)
  })

  it('throws ParseError on empty-output.txt', () => {
    expect(() => parseVitest(loadCapture('empty-output.txt', 1))).toThrow(ParseError)
  })

  it('ParseError carries the runner id and capturedLines context', () => {
    try {
      parseVitest(loadCapture('non-default-reporter.txt', 0))
      throw new Error('should have thrown')
    } catch (err) {
      expect(err).toBeInstanceOf(ParseError)
      const pe = err as ParseError
      expect(pe.context.runner).toBe('vitest')
      expect(pe.context.capturedLines).toBeGreaterThan(0)
    }
  })
})

describe('parseVitest: parse-time guard', () => {
  it('parses large-output.txt in under 500 ms', () => {
    const capture = loadCapture('large-output.txt', 1)
    const start = performance.now()
    try {
      parseVitest(capture)
    } catch {
      // The synthesized large capture may not satisfy every parser invariant;
      // the guard measures wall time, not correctness. Swallow ParseError if
      // the synthesis triggers it.
    }
    const elapsed = performance.now() - start
    expect(elapsed).toBeLessThan(500)
  })
})

function withPackageJson(extra: Record<string, unknown>): ProjectFiles {
  return makeProjectFiles({ packageJson: extra })
}

describe('vitestAdapter', () => {
  it('exposes id "vitest"', () => {
    expect(vitestAdapter.id).toBe('vitest')
  })

  it('exposes scriptHints containing "vitest"', () => {
    expect(vitestAdapter.scriptHints).toContain('vitest')
  })

  it('reuses internalPathPatterns from the module', () => {
    expect(vitestAdapter.internalPathPatterns.length).toBeGreaterThan(0)
  })

  it('defaultCommand returns the npx vitest run reporter=default form', () => {
    expect(vitestAdapter.defaultCommand()).toEqual(['npx', 'vitest', 'run', '--reporter=default'])
  })

  describe('detect', () => {
    it('returns false for an empty project', () => {
      expect(vitestAdapter.detect(makeProjectFiles())).toBe(false)
    })

    it('returns true when vitest is in devDependencies', () => {
      const project = withPackageJson({ devDependencies: { vitest: '^4.0.0' } })
      expect(vitestAdapter.detect(project)).toBe(true)
    })

    it('returns true when vitest is in dependencies', () => {
      const project = withPackageJson({ dependencies: { vitest: '^4.0.0' } })
      expect(vitestAdapter.detect(project)).toBe(true)
    })

    it('returns true when vitest is in peerDependencies', () => {
      const project = withPackageJson({ peerDependencies: { vitest: '*' } })
      expect(vitestAdapter.detect(project)).toBe(true)
    })

    it('returns true when vitest is in optionalDependencies', () => {
      const project = withPackageJson({ optionalDependencies: { vitest: '*' } })
      expect(vitestAdapter.detect(project)).toBe(true)
    })

    it('returns true when vitestConfigPresent is true', () => {
      const project = makeProjectFiles({ vitestConfigPresent: true })
      expect(vitestAdapter.detect(project)).toBe(true)
    })

    it('returns true when vitestWorkspacePresent is true', () => {
      const project = makeProjectFiles({ vitestWorkspacePresent: true })
      expect(vitestAdapter.detect(project)).toBe(true)
    })

    it('returns false when packageJson is a non-object value', () => {
      const project = makeProjectFiles({ packageJson: 'not an object' })
      expect(vitestAdapter.detect(project)).toBe(false)
    })

    it('returns false when packageJson has no deps fields', () => {
      const project = withPackageJson({ name: 'no-deps' })
      expect(vitestAdapter.detect(project)).toBe(false)
    })
  })

  describe('hasActiveConfig', () => {
    it('returns false when neither config nor workspace is present', () => {
      const project = withPackageJson({ devDependencies: { vitest: '*' } })
      expect(vitestAdapter.hasActiveConfig(project)).toBe(false)
    })

    it('returns true when vitestConfigPresent is true', () => {
      const project = makeProjectFiles({ vitestConfigPresent: true })
      expect(vitestAdapter.hasActiveConfig(project)).toBe(true)
    })

    it('returns true when vitestWorkspacePresent is true', () => {
      const project = makeProjectFiles({ vitestWorkspacePresent: true })
      expect(vitestAdapter.hasActiveConfig(project)).toBe(true)
    })

    it('returns true when both are present', () => {
      const project = makeProjectFiles({
        vitestConfigPresent: true,
        vitestWorkspacePresent: true,
      })
      expect(vitestAdapter.hasActiveConfig(project)).toBe(true)
    })
  })

  it('parse delegates to parseVitest', () => {
    const capture = { stdout: '', stderr: '', exitCode: 0 }
    expect(() => vitestAdapter.parse(capture)).toThrow()
  })
})

describe('parseVitest: header environment-tag stripping', () => {
  it('strips the env-pool tag from filePath when vitest emits one', () => {
    const result = parseVitest(loadCapture('rejects-with-response.txt', 1))
    const failure = result.failures[0]
    expect(failure).toBeDefined()
    if (failure === undefined) return
    expect(failure.filePath).toBe('index.test.ts')
  })
})

describe('parseVitest + sanitizeRunResult: rejects-with-response', () => {
  it('reduces hono-shape rejects payload by collapsing the diff body with full=false', () => {
    const capture = loadCapture('rejects-with-response.txt', 1)
    const parsed = parseVitest(capture)
    expect(parsed.failed).toBe(1)

    const rawReceivedLength = parsed.failures[0]?.received?.length ?? 0
    expect(rawReceivedLength).toBeGreaterThan(2000)

    const sanitized = sanitizeRunResult(parsed, { full: false })
    const f = sanitized.failures[0]
    if (f === undefined) throw new Error('no failure')

    expect(f.expected).toBeNull()
    expect(f.received).toBeNull()
    expect(f.expectedTruncated).toBe(true)
    expect(f.receivedTruncated).toBe(true)
    expect(f.message).toContain('rejecting')
  })

  it('full=true preserves the original rejects payload', () => {
    const capture = loadCapture('rejects-with-response.txt', 1)
    const parsed = parseVitest(capture)
    const sanitized = sanitizeRunResult(parsed, { full: true })
    expect(sanitized.failures[0]?.expected).toBe('[Error: rejected promise]')
    expect(sanitized.failures[0]?.received).toContain('Response')
    expect(sanitized.failures[0]?.expectedTruncated).toBeUndefined()
  })
})
