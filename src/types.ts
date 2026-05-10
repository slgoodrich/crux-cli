export type RunnerId = 'vitest' | 'jest' | 'pytest' | 'cargo-test' | 'go-test'

export type StackFrame = {
  filePath: string
  line: number
  column: number | null
}

export type RunnerError = {
  kind: 'compile-error' | 'config-error' | 'binary-not-found' | 'unknown'
  message: string
}

export type Failure = {
  testName: string
  filePath: string | null
  line: number | null
  column: number | null
  message: string
  expected: string | null
  received: string | null
  topFrame: StackFrame | null
  expectedTruncated?: true
  receivedTruncated?: true
}

export type RunResult = {
  runner: RunnerId
  passed: number
  failed: number
  skipped: number
  total: number
  durationMs: number | null
  failures: Failure[]
  runnerError: RunnerError | null
}
