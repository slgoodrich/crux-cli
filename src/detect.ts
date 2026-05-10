import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, normalize } from 'node:path'

import { AdapterAmbiguousError } from './errors.js'
import type { ProjectFiles, RunnerAdapter } from './runners/types.js'
import type { RunnerId } from './types.js'

const CONFIG_EXTS = ['js', 'ts', 'mjs', 'cjs'] as const

export async function loadProjectFiles(cwd: string): Promise<ProjectFiles> {
  const root = findProjectRoot(cwd)
  const pkgDir = root ?? cwd

  return {
    packageJson: await readPackageJson(pkgDir),
    cargoToml: null,
    goMod: null,
    pyprojectToml: null,
    pytestIni: null,
    vitestConfigPresent: anyExtPresent(pkgDir, 'vitest.config', CONFIG_EXTS),
    vitestWorkspacePresent: anyExtPresent(pkgDir, 'vitest.workspace', CONFIG_EXTS),
    jestConfigPresent: anyExtPresent(pkgDir, 'jest.config', CONFIG_EXTS),
  }
}

// Walk up from start looking for the nearest package.json. Stops at the
// filesystem root. Does not walk above the OS temp directory to avoid
// accidentally picking up unrelated packages in test environments.
function findProjectRoot(start: string): string | null {
  const osTmp = normalize(tmpdir())
  let current = normalize(start)
  while (true) {
    if (existsSync(join(current, 'package.json'))) return current
    const parent = normalize(dirname(current))
    if (parent === current) return null
    // Don't walk above the OS temp directory. A path inside tmp has no
    // meaningful project root above it and would find unrelated packages.
    if (current === osTmp) return null
    current = parent
  }
}

async function readPackageJson(dir: string): Promise<unknown | null> {
  try {
    const text = await readFile(join(dir, 'package.json'), 'utf8')
    return JSON.parse(text)
  } catch {
    return null
  }
}

function anyExtPresent(dir: string, base: string, exts: readonly string[]): boolean {
  return exts.some((ext) => existsSync(join(dir, `${base}.${ext}`)))
}

export function detectRunner(
  project: ProjectFiles,
  adapters: readonly RunnerAdapter[],
): RunnerAdapter | null {
  const matches = adapters.filter((a) => a.detect(project))
  if (matches.length === 0) return null
  if (matches.length === 1) return matches[0] ?? null

  const scriptsTest = readScriptsTest(project)
  if (scriptsTest !== null) {
    const byScriptHint = matches.filter((a) =>
      a.scriptHints.some((hint) => scriptsTest.includes(hint)),
    )
    if (byScriptHint.length === 1) return byScriptHint[0] ?? null
  }

  const byActiveConfig = matches.filter((a) => a.hasActiveConfig(project))
  if (byActiveConfig.length === 1) return byActiveConfig[0] ?? null

  const signals: RunnerId[] = matches.map((a) => a.id).sort()
  throw new AdapterAmbiguousError(signals)
}

export function readPackageJsonScript(project: ProjectFiles, scriptName: string): string | null {
  const pkg = project.packageJson
  if (typeof pkg !== 'object' || pkg === null) return null
  // biome-ignore lint/complexity/useLiteralKeys: tsconfig noPropertyAccessFromIndexSignature requires bracket access on Record<string, unknown>
  const scripts = (pkg as Record<string, unknown>)['scripts']
  if (typeof scripts !== 'object' || scripts === null) return null
  const value = (scripts as Record<string, unknown>)[scriptName]
  return typeof value === 'string' ? value : null
}

function readScriptsTest(project: ProjectFiles): string | null {
  return readPackageJsonScript(project, 'test')
}
