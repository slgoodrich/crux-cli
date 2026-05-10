import type { RunnerId } from './types.js'

export abstract class CruxError extends Error {
  static code: string
  abstract fix(): string
}

export class AdapterDetectError extends CruxError {
  static code: 'CRUX_ADAPTER_DETECT' = 'CRUX_ADAPTER_DETECT'

  constructor() {
    super('no test runner detected for this project')
  }

  fix(): string {
    return 'pass an explicit command: crux -- <your test command>'
  }
}

export class AdapterAmbiguousError extends CruxError {
  static code: 'CRUX_ADAPTER_AMBIGUOUS' = 'CRUX_ADAPTER_AMBIGUOUS'

  constructor(public readonly signals: readonly RunnerId[]) {
    super(`multiple runner signals present: ${signals.join(', ')}`)
  }

  fix(): string {
    return 'pass an explicit command: crux -- <your test command>'
  }
}

export class ParseError extends CruxError {
  static code: 'CRUX_PARSE' = 'CRUX_PARSE'

  constructor(
    message: string,
    public readonly context: { runner: RunnerId; capturedLines: number },
  ) {
    super(message)
  }

  fix(): string {
    return 'rerun with --raw to inspect raw output'
  }
}

export class SpawnError extends CruxError {
  static code: 'CRUX_SPAWN' = 'CRUX_SPAWN'

  fix(): string {
    return 'check the runner is installed and the command is correct'
  }
}

export class UnsupportedNodeVersionError extends CruxError {
  static code: 'CRUX_NODE_VERSION' = 'CRUX_NODE_VERSION'

  constructor(public readonly actual: string) {
    super(`crux requires Node 20+, found ${actual}`)
  }

  fix(): string {
    return 'install Node 20 or newer'
  }
}

export class InvalidArgError extends CruxError {
  static code: 'CRUX_INVALID_ARG' = 'CRUX_INVALID_ARG'

  constructor(
    message: string,
    public readonly arg: string,
  ) {
    super(message)
  }

  fix(): string {
    return 'see crux --help'
  }
}

export function assertNodeVersion(): void {
  const major = Number.parseInt(process.versions.node.split('.')[0] ?? '0', 10)
  if (major < 20) {
    throw new UnsupportedNodeVersionError(process.versions.node)
  }
}
