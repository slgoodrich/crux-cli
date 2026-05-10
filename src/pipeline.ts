import type { Config } from './config.js'
import { detectRunner, loadProjectFiles, readPackageJsonScript } from './detect.js'
import { AdapterDetectError, ParseError } from './errors.js'
import { spawn } from './run.js'
import { adapters } from './runners/index.js'
import { sanitizeRunResult } from './runners/sanitize.js'
import type { ProjectFiles, RunnerAdapter, SubprocessCapture } from './runners/types.js'
import type { RunResult } from './types.js'

export type PipelineResult =
  | { kind: 'parsed'; result: RunResult; exitCode: number }
  | { kind: 'passthrough'; reason: string; capture: SubprocessCapture }

export type ResolvedCommand =
  | { kind: 'adapter'; command: readonly string[]; adapter: RunnerAdapter }
  | { kind: 'passthrough'; command: readonly string[]; reason: string }

const PACKAGE_MANAGERS = new Set(['npm', 'pnpm', 'yarn'])

export function resolveCommand(
  config: Config,
  project: ProjectFiles,
  available: readonly RunnerAdapter[],
): ResolvedCommand {
  if (config.passthroughCommand === null) {
    const adapter = detectRunner(project, available)
    if (adapter === null) {
      throw new AdapterDetectError()
    }
    return { kind: 'adapter', command: adapter.defaultCommand(), adapter }
  }

  const argv = config.passthroughCommand
  if (argv.length === 0) {
    return { kind: 'passthrough', command: argv, reason: 'empty command after --' }
  }

  const direct = matchAdapterByArgvScan(argv, available)
  if (direct !== null) {
    return { kind: 'adapter', command: argv, adapter: direct }
  }

  const wrapped = resolveWrapperScript(argv, project, available)
  if (wrapped !== null) {
    return { kind: 'adapter', command: argv, adapter: wrapped }
  }

  return {
    kind: 'passthrough',
    command: argv,
    reason: `unknown runner in command: ${argv[0]}`,
  }
}

function matchAdapterByArgvScan(
  argv: readonly string[],
  available: readonly RunnerAdapter[],
): RunnerAdapter | null {
  let i = 0
  if (argv[i] === 'npx') {
    i++
    while (i < argv.length && argv[i]?.startsWith('-') === true) i++
  }
  const token = argv[i]
  if (token === undefined) return null
  for (const adapter of available) {
    if (adapter.scriptHints.includes(token)) return adapter
  }
  return null
}

function resolveWrapperScript(
  argv: readonly string[],
  project: ProjectFiles,
  available: readonly RunnerAdapter[],
): RunnerAdapter | null {
  const first = argv[0]
  if (first === undefined || !PACKAGE_MANAGERS.has(first)) return null

  let scriptName: string | null = null
  if (argv[1] === 'test') {
    scriptName = 'test'
  } else if (argv[1] === 'run' && typeof argv[2] === 'string') {
    scriptName = argv[2]
  }
  if (scriptName === null) return null

  const scriptValue = readPackageJsonScript(project, scriptName)
  if (scriptValue === null) return null

  const tokens = scriptValue.split(/\s+/).filter((s) => s.length > 0)
  const firstToken = tokens[0]
  if (firstToken === undefined) return null

  // Single-level only: if the script value re-invokes a package manager, do
  // not recurse.
  if (PACKAGE_MANAGERS.has(firstToken)) return null

  for (const token of tokens) {
    for (const adapter of available) {
      if (adapter.scriptHints.includes(token)) return adapter
    }
  }
  return null
}

export async function runTests(config: Config): Promise<PipelineResult> {
  const cwd = config.cwd ?? process.cwd()
  const project = await loadProjectFiles(cwd)
  const resolved = resolveCommand(config, project, adapters)

  const capture = await spawn(resolved.command, { cwd })

  if (resolved.kind === 'passthrough') {
    return { kind: 'passthrough', reason: resolved.reason, capture }
  }

  try {
    const parsed = resolved.adapter.parse(capture)
    const result = sanitizeRunResult(parsed, { full: config.full })
    return { kind: 'parsed', result, exitCode: capture.exitCode }
  } catch (err) {
    if (err instanceof ParseError) {
      return {
        kind: 'passthrough',
        reason: `parse failed: ${err.message}`,
        capture,
      }
    }
    throw err
  }
}
