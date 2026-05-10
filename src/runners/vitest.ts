import { ParseError } from '../errors.js'
import type { Failure, RunnerError, RunResult, StackFrame } from '../types.js'
import type { ProjectFiles, RunnerAdapter, SubprocessCapture } from './types.js'

export const internalPathPatterns: readonly RegExp[] = [
  /vitest\/dist\//,
  /vite\/dist\//,
  /tinypool\//,
]

// biome-ignore lint/suspicious/noControlCharactersInRegex: ESC is required to match ANSI escape sequences
const ANSI_REGEX = /\x1b\[[0-9;]*m/g

const ANCHOR_REGEX = /^\s*Test Files\s+/m

export function parseVitest(capture: SubprocessCapture): RunResult {
  const stdout = capture.stdout.replace(ANSI_REGEX, '')
  const stderr = capture.stderr.replace(ANSI_REGEX, '')
  const combined = `${stdout}\n${stderr}`

  const runnerError = detectRunnerError(combined)
  if (runnerError !== null) {
    return {
      runner: 'vitest',
      passed: 0,
      failed: 0,
      skipped: 0,
      total: 0,
      durationMs: null,
      failures: [],
      runnerError,
    }
  }

  if (!ANCHOR_REGEX.test(combined)) {
    throw new ParseError('vitest output missing summary anchor', {
      runner: 'vitest',
      capturedLines: combined.split('\n').length,
    })
  }

  const summary = parseSummary(combined)
  const duration = parseDuration(combined)
  const failures = parseFailures(combined)

  return {
    runner: 'vitest',
    passed: summary.passed,
    failed: summary.failed,
    skipped: summary.skipped,
    total: summary.total,
    durationMs: duration,
    failures,
    runnerError: null,
  }
}

type Summary = { passed: number; failed: number; skipped: number; total: number }

function parseSummary(combined: string): Summary {
  const summary: Summary = { passed: 0, failed: 0, skipped: 0, total: 0 }

  const testsLineMatch = combined.match(/^\s*Tests\s+(.+?)\s+\((\d+)\)\s*$/m)
  if (testsLineMatch !== null) {
    const segments = testsLineMatch[1] ?? ''
    summary.total = Number.parseInt(testsLineMatch[2] ?? '0', 10)
    for (const part of segments.split('|')) {
      const piece = part.trim()
      const [countStr, label] = piece.split(/\s+/)
      const count = Number.parseInt(countStr ?? '0', 10)
      if (Number.isNaN(count)) continue
      if (label === 'passed') summary.passed = count
      else if (label === 'failed') summary.failed = count
      else if (label === 'skipped' || label === 'todo') summary.skipped += count
    }
  }

  return summary
}

function parseDuration(combined: string): number | null {
  const durationMatch = combined.match(/^\s*Duration\s+(.+?)\s*$/m)
  if (durationMatch === null) return null
  const value = (durationMatch[1] ?? '').trim()

  const msMatch = value.match(/^(\d+(?:\.\d+)?)ms\b/)
  if (msMatch !== null) return Math.round(Number.parseFloat(msMatch[1] ?? '0'))

  const sMatch = value.match(/^(\d+(?:\.\d+)?)s\b/)
  if (sMatch !== null) return Math.round(Number.parseFloat(sMatch[1] ?? '0') * 1000)

  return null
}

// Matches the ` FAIL  ` prefix that starts each failure block header line.
// Single space before FAIL, two spaces after.
const FAIL_BLOCK_SPLITTER = /^ FAIL {2}/m

// Matches ` ❯ <file>:<line>` stack frame lines. The ❯ is U+276F.
// Requires at least `:line` after the path; file-listing lines (which also use ❯)
// don't have a colon-number suffix, so they fall through.
const FRAME_REGEX = /^\s*❯\s+([^\s:]+):(\d+)(?::(\d+))?/

function parseFailures(combined: string): Failure[] {
  const failedTestsMatch = combined.match(/Failed Tests\s+\d+/)
  if (failedTestsMatch === null || failedTestsMatch.index === undefined) {
    return []
  }

  const start = failedTestsMatch.index + failedTestsMatch[0].length
  const tail = combined.slice(start)

  const summaryStart = tail.search(/^\s*Test Files\s+/m)
  const failureRegion = summaryStart === -1 ? tail : tail.slice(0, summaryStart)

  const blocks = failureRegion.split(FAIL_BLOCK_SPLITTER).slice(1)

  const failures: Failure[] = []
  for (const rawBlock of blocks) {
    const failure = parseFailureBlock(rawBlock)
    if (failure !== null) failures.push(failure)
  }
  return failures
}

function parseDiffBlock(blockLines: readonly string[]): {
  expected: string | null
  received: string | null
} {
  const expectedHeader = blockLines.findIndex((l) => l.trimStart().startsWith('- Expected'))
  if (expectedHeader === -1) return { expected: null, received: null }

  let receivedHeader = -1
  for (let j = expectedHeader + 1; j < blockLines.length; j++) {
    if ((blockLines[j] ?? '').trimStart().startsWith('+ Received')) {
      receivedHeader = j
      break
    }
  }
  if (receivedHeader === -1) return { expected: null, received: null }

  let i = receivedHeader + 1
  while (i < blockLines.length && (blockLines[i] ?? '').trim() === '') i++

  const expectedLines: string[] = []
  const receivedLines: string[] = []

  while (i < blockLines.length) {
    const line = blockLines[i] ?? ''
    if (line.startsWith('- ')) {
      expectedLines.push(line.slice(2))
    } else if (line.startsWith('+ ')) {
      receivedLines.push(line.slice(2))
    } else if (line.startsWith('  ')) {
      expectedLines.push(line.slice(2))
      receivedLines.push(line.slice(2))
    } else {
      break
    }
    i++
  }

  if (expectedLines.length === 0 && receivedLines.length === 0) {
    return { expected: null, received: null }
  }

  return {
    expected: expectedLines.length === 0 ? null : expectedLines.join('\n'),
    received: receivedLines.length === 0 ? null : receivedLines.join('\n'),
  }
}

function parseFailureBlock(block: string): Failure | null {
  const lines = block.split('\n')
  const headerLine = lines[0] ?? ''
  if (headerLine === '') return null

  const headerParts = headerLine.split(' > ')
  // Vitest may prefix the file path with an environment-pool tag
  // ('node', 'jsdom', 'happy-dom') separated by whitespace when running
  // in a non-default pool. The file path itself contains no whitespace,
  // so the last whitespace-separated token of the pre-' > ' segment is
  // the path; anything before it is the env tag.
  const filePath = extractFilePath(headerParts[0])
  const testName = headerParts.slice(1).join(' > ').trim()
  if (testName === '') return null

  const messageLine = (lines[1] ?? '').trim()

  const frames: StackFrame[] = []
  for (const line of lines) {
    const match = FRAME_REGEX.exec(line)
    if (match === null) continue
    const framePath = match[1]
    const frameLine = match[2]
    if (framePath === undefined || frameLine === undefined) continue
    frames.push({
      filePath: framePath,
      line: Number.parseInt(frameLine, 10),
      column: match[3] === undefined ? null : Number.parseInt(match[3], 10),
    })
  }

  const firstFrame = frames[0] ?? null
  const topFrame = pickTopFrame(frames)
  const diff = parseDiffBlock(lines)

  return {
    testName,
    filePath,
    line: firstFrame === null ? null : firstFrame.line,
    column: firstFrame === null ? null : firstFrame.column,
    message: messageLine,
    expected: diff.expected,
    received: diff.received,
    topFrame,
  }
}

function extractFilePath(headerSegment: string | undefined): string | null {
  const trimmed = (headerSegment ?? '').trim()
  if (trimmed === '') return null
  return trimmed.split(/\s+/).pop() ?? null
}

function pickTopFrame(frames: readonly StackFrame[]): StackFrame | null {
  for (const frame of frames) {
    if (frame.filePath.includes('node_modules/')) continue
    if (frame.filePath.startsWith('node:')) continue
    if (internalPathPatterns.some((re) => re.test(frame.filePath))) continue
    return frame
  }
  return null
}

// Each line regex captures the whole line containing the marker via `^.*…*$/m`.
// One match per branch replaces a separate test+extract pair and removes
// the unreachable fallback that an external helper required.
const BINARY_NOT_FOUND_LINE =
  /^.*(?:command not found:\s*vitest|could not determine executable to run).*$/im
const CONFIG_ERROR_LINE =
  /^.*(?:failed to load config|Could not resolve.*vitest\.config|Startup Error).*$/im
const COMPILE_ERROR_LINE =
  /^.*(?:Transform failed|Cannot find module|SyntaxError|\[PARSE_ERROR\]|Failed Suites).*$/im

// `Failed Suites N` is vitest's distinct phrase for suite-level failure
// (could not parse or import the test file), separate from `Failed Tests N`
// which is per-test assertion failure. Used to gate the compile-error branch
// so a real test failure that mentions "SyntaxError" in its message doesn't
// get misclassified.
const FAILED_SUITES_GATE = /Failed Suites\s+\d+/

function detectRunnerError(combined: string): RunnerError | null {
  const binaryLine = combined.match(BINARY_NOT_FOUND_LINE)
  if (binaryLine !== null) {
    return { kind: 'binary-not-found', message: binaryLine[0].trim() }
  }

  const configLine = combined.match(CONFIG_ERROR_LINE)
  if (configLine !== null) {
    return { kind: 'config-error', message: configLine[0].trim() }
  }

  if (FAILED_SUITES_GATE.test(combined)) {
    const compileLine = combined.match(COMPILE_ERROR_LINE)
    return {
      kind: 'compile-error',
      message: compileLine !== null ? compileLine[0].trim() : 'compile error',
    }
  }

  return null
}

const PACKAGE_JSON_DEP_KEYS = [
  'dependencies',
  'devDependencies',
  'peerDependencies',
  'optionalDependencies',
] as const

function packageJsonHasVitest(project: ProjectFiles): boolean {
  const pkg = project.packageJson
  if (typeof pkg !== 'object' || pkg === null) return false
  for (const key of PACKAGE_JSON_DEP_KEYS) {
    const deps = (pkg as Record<string, unknown>)[key]
    if (typeof deps === 'object' && deps !== null && 'vitest' in deps) {
      return true
    }
  }
  return false
}

export const vitestAdapter: RunnerAdapter = {
  id: 'vitest',
  detect: (project) =>
    packageJsonHasVitest(project) || project.vitestConfigPresent || project.vitestWorkspacePresent,
  hasActiveConfig: (project) => project.vitestConfigPresent || project.vitestWorkspacePresent,
  scriptHints: ['vitest'],
  internalPathPatterns,
  defaultCommand: () => ['npx', 'vitest', 'run', '--reporter=default'],
  parse: parseVitest,
}
