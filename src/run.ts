import { execa } from 'execa'

import { SpawnError } from './errors.js'
import type { SubprocessCapture } from './runners/types.js'

export type SpawnOptions = {
  cwd: string
  env?: NodeJS.ProcessEnv
}

export async function spawn(
  command: readonly string[],
  options: SpawnOptions,
): Promise<SubprocessCapture> {
  const [bin, ...args] = command
  if (bin === undefined) {
    throw new SpawnError('empty command')
  }

  const subprocess = execa(bin, args, {
    cwd: options.cwd,
    // NodeJS.ProcessEnv values may be undefined; execa's env type is
    // Readonly<Partial<Record<string, string>>>. The shapes are compatible at
    // runtime; the cast bridges the exactOptionalPropertyTypes difference.
    ...(options.env !== undefined && {
      env: options.env as Readonly<Partial<Record<string, string>>>,
    }),
    stdin: 'ignore',
    reject: false,
    cleanup: true,
    encoding: 'utf8',
  })

  const onSignal = (sig: NodeJS.Signals) => {
    if (!subprocess.killed) {
      subprocess.kill(sig)
    }
  }

  process.once('SIGINT', onSignal)
  process.once('SIGTERM', onSignal)

  try {
    const result = await subprocess

    // On POSIX, a missing binary surfaces as result.code === 'ENOENT' (execa
    // promotes the underlying spawn error's code to the top-level result).
    const errorCode = (result as { code?: string }).code
    if (errorCode === 'ENOENT') {
      throw new SpawnError(`command not found: ${bin}`, {
        cause: result.cause as Error | undefined,
      })
    }

    const stderr = typeof result.stderr === 'string' ? result.stderr : ''

    // On Windows, cmd.exe handles binary lookup itself and returns exit code 1
    // with "is not recognized as an internal or external command" in stderr.
    // This is platform-specific; gate on process.platform to avoid false
    // positives from runner output that legitimately contains POSIX ENOENT
    // messages.
    if (
      process.platform === 'win32' &&
      result.failed &&
      stderr.includes('is not recognized as an internal or external command')
    ) {
      throw new SpawnError(`command not found: ${bin}`, {
        cause: result.cause as Error | undefined,
      })
    }

    return {
      stdout: typeof result.stdout === 'string' ? result.stdout : '',
      stderr,
      exitCode: result.exitCode ?? 0,
    }
  } finally {
    process.removeListener('SIGINT', onSignal)
    process.removeListener('SIGTERM', onSignal)
  }
}
