import { CruxError } from './errors.js'

/**
 * Render a fatal error to stderr in the project's standard format:
 *   <prefix>: <message>
 *   fix: <hint>
 *
 * For non-CruxError throwables, falls back to "<prefix>: unexpected error: <stringified>".
 * Sets process.exitCode = 2; never calls process.exit().
 *
 * CRUX_DEBUG=1 appends the full stack trace.
 */
export function writeFatalError(prefix: string, err: unknown): void {
  // biome-ignore lint/complexity/useLiteralKeys: process.env index access consistent with project pattern
  const debug = process.env['CRUX_DEBUG'] === '1'

  if (err instanceof CruxError) {
    process.stderr.write(`${prefix}: ${err.message}\n`)
    process.stderr.write(`fix: ${err.fix()}\n`)
    if (debug && err.stack !== undefined) {
      process.stderr.write(`${err.stack}\n`)
    }
    process.exitCode = 2
    return
  }

  process.stderr.write(`${prefix}: unexpected error: ${String(err)}\n`)
  if (debug && err instanceof Error && err.stack !== undefined) {
    process.stderr.write(`${err.stack}\n`)
  }
  process.exitCode = 2
}
