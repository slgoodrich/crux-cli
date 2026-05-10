#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { type Config, parseArgs } from './config.js'
import { detectRunner, loadProjectFiles } from './detect.js'
import { writeFatalError } from './error-output.js'
import { assertNodeVersion, CruxError } from './errors.js'
import { formatJson } from './format/json.js'
import { formatMarkdown } from './format/markdown.js'
import { type PipelineResult, resolveCommand, runTests } from './pipeline.js'
import { spawn } from './run.js'
import { adapters } from './runners/index.js'

const here = dirname(fileURLToPath(import.meta.url))
const pkg = JSON.parse(readFileSync(resolve(here, '../package.json'), 'utf8')) as {
  version: string
}

const HELP_TEXT = `crux v${pkg.version}

Usage:
  crux [--json | --raw] [--full] [--cwd <dir>] [-- <command> [args...]]
  crux --help
  crux --version

Without --, crux auto-detects the project's test runner from cwd.
Anything after -- is forwarded verbatim to the spawned subprocess.

Flags:
  --json          emit machine-readable JSON (locked schema, cruxVersion: 1)
  --raw           skip parsing; pass child stdout/stderr through verbatim
  --full          disable smart truncation of expected/received fields
  --cwd <dir>     override cwd for detection and the subprocess
  --help          this help text and exit 0
  --version       crux version + detected runner for cwd, exit 0

Env:
  CRUX_FULL=1     equivalent to --full
`

export function applyEnvOverrides(config: Config, env: NodeJS.ProcessEnv): Config {
  if (config.full) return config
  // biome-ignore lint/complexity/useLiteralKeys: noPropertyAccessFromIndexSignature requires bracket notation
  if (env['CRUX_FULL'] === '1') return Object.freeze({ ...config, full: true })
  return config
}

main()

async function main(): Promise<void> {
  try {
    assertNodeVersion()
    const parsedConfig = parseArgs(process.argv.slice(2))
    const config = applyEnvOverrides(parsedConfig, process.env)

    if (config.showHelp) {
      process.stdout.write(HELP_TEXT)
      process.exitCode = 0
      return
    }
    if (config.showVersion) {
      await printVersion(config.cwd ?? process.cwd())
      process.exitCode = 0
      return
    }

    if (config.format === 'raw') {
      await runRaw(config)
      return
    }

    const result = await runTests(config)
    handlePipelineResult(result, config.format)
  } catch (err) {
    writeFatalError('crux', err)
  }
}

async function printVersion(cwd: string): Promise<void> {
  let detected = 'none'
  try {
    const project = await loadProjectFiles(cwd)
    const adapter = detectRunner(project, adapters)
    detected = adapter?.id ?? 'none'
  } catch (err) {
    if (err instanceof CruxError) throw err
    // I/O failure reading project files is not fatal for --version; report "none".
  }
  process.stdout.write(`crux v${pkg.version}\ndetected runner for ${cwd}: ${detected}\n`)
}

async function runRaw(config: Config): Promise<void> {
  const cwd = config.cwd ?? process.cwd()
  const project = await loadProjectFiles(cwd)
  const resolved = resolveCommand(config, project, adapters)
  const capture = await spawn(resolved.command, { cwd })
  process.stdout.write(capture.stdout)
  process.stderr.write(capture.stderr)
  process.exitCode = capture.exitCode
}

function handlePipelineResult(result: PipelineResult, format: 'markdown' | 'json'): void {
  if (result.kind === 'passthrough') {
    process.stderr.write(`crux: passthrough mode (${result.reason})\n`)
    process.stdout.write(result.capture.stdout)
    process.stderr.write(result.capture.stderr)
    process.exitCode = result.capture.exitCode
    return
  }

  const rendered =
    format === 'json' ? formatJson(result.result, result.exitCode) : formatMarkdown(result.result)
  process.stdout.write(rendered)
  process.exitCode = result.exitCode
}
