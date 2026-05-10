import type { Failure, RunResult } from '../types.js'

export function formatMarkdown(result: RunResult): string {
  const lines: string[] = []
  const duration = formatDuration(result.durationMs)

  if (result.runnerError !== null) {
    lines.push(`Runner error: ${result.runnerError.message}`)
  } else if (result.failures.length === 0 && result.passed > 0) {
    lines.push(`${result.passed} tests passed in ${duration}`)
  } else {
    lines.push(`${result.failed} of ${result.total} tests failed in ${duration}`)
  }

  for (const failure of result.failures) {
    lines.push('')
    const headerPath = failure.filePath ?? '<unknown>'
    const headerLine = failure.line === null ? '?' : String(failure.line)
    lines.push(`### FAIL ${headerPath}:${headerLine} - ${failure.testName}`)

    if (failure.expected !== null && failure.received !== null) {
      lines.push(`expected: ${failure.expected}`)
      lines.push(`received: ${failure.received}`)
    } else {
      lines.push(failure.message)
    }

    const truncatedLine = formatTruncationMarker(failure)
    if (truncatedLine !== null) {
      lines.push(truncatedLine)
    }

    if (failure.topFrame !== null) {
      lines.push(`  at ${failure.topFrame.filePath}:${failure.topFrame.line}`)
    }
  }

  return `${lines.join('\n')}\n`
}

function formatTruncationMarker(failure: Failure): string | null {
  if (!failure.expectedTruncated && !failure.receivedTruncated) return null
  const parts: string[] = []
  if (failure.expectedTruncated) parts.push('expected')
  if (failure.receivedTruncated) parts.push('received')
  return `(truncated: ${parts.join(', ')})`
}

function formatDuration(ms: number | null): string {
  if (ms === null) return 'unknown duration'
  return `${(ms / 1000).toFixed(2)}s`
}
