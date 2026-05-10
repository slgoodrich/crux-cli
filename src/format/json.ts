import type { Failure, RunnerError, RunnerId, RunResult } from '../types.js'

export type CruxJsonEnvelope = {
  cruxVersion: 1
  runner: RunnerId
  exitCode: number
  summary: Pick<RunResult, 'passed' | 'failed' | 'skipped' | 'total' | 'durationMs'>
  failures: readonly Failure[]
  runnerError: RunnerError | null
}

export function buildJsonEnvelope(result: RunResult, exitCode: number): CruxJsonEnvelope {
  return {
    cruxVersion: 1,
    runner: result.runner,
    exitCode,
    summary: {
      passed: result.passed,
      failed: result.failed,
      skipped: result.skipped,
      total: result.total,
      durationMs: result.durationMs,
    },
    failures: result.failures,
    runnerError: result.runnerError,
  }
}

export function serializeEnvelope(envelope: CruxJsonEnvelope): string {
  return JSON.stringify(envelope, null, 2)
}

export function formatJson(result: RunResult, exitCode: number): string {
  return `${serializeEnvelope(buildJsonEnvelope(result, exitCode))}\n`
}
