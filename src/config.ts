import { InvalidArgError } from './errors.js'

export type Config = {
  format: 'markdown' | 'json' | 'raw'
  cwd: string | null
  showHelp: boolean
  showVersion: boolean
  passthroughCommand: readonly string[] | null
  full: boolean
}

export function parseArgs(argv: readonly string[]): Config {
  let format: Config['format'] = 'markdown'
  let cwd: string | null = null
  let showHelp = false
  let showVersion = false
  let full = false
  let passthroughCommand: readonly string[] | null = null

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]

    if (arg === '--') {
      passthroughCommand = argv.slice(i + 1)
      break
    }

    switch (arg) {
      case '--help': {
        showHelp = true
        break
      }
      case '--version': {
        showVersion = true
        break
      }
      case '--full': {
        full = true
        break
      }
      case '--json': {
        if (format === 'raw') {
          throw new InvalidArgError('--json and --raw are mutually exclusive', arg)
        }
        format = 'json'
        break
      }
      case '--raw': {
        if (format === 'json') {
          throw new InvalidArgError('--json and --raw are mutually exclusive', arg)
        }
        format = 'raw'
        break
      }
      case '--cwd': {
        const next = argv[i + 1]
        if (next === undefined) {
          throw new InvalidArgError('--cwd requires a value', '--cwd')
        }
        cwd = next
        i++
        break
      }
      default: {
        if (arg === undefined) break
        if (arg.startsWith('-')) {
          throw new InvalidArgError(`unknown flag: ${arg}`, arg)
        }
        throw new InvalidArgError(
          `unexpected positional argument: ${arg} (use -- to pass commands through)`,
          arg,
        )
      }
    }
  }

  return Object.freeze({
    format,
    cwd,
    showHelp,
    showVersion,
    passthroughCommand,
    full,
  })
}
