import type { RunnerId, RunResult } from '../types.js'

export type ProjectFiles = {
  packageJson: unknown | null
  cargoToml: string | null
  goMod: string | null
  pyprojectToml: string | null
  pytestIni: string | null
  vitestConfigPresent: boolean
  vitestWorkspacePresent: boolean
  jestConfigPresent: boolean
}

export type SubprocessCapture = {
  stdout: string
  stderr: string
  exitCode: number
}

export type RunnerAdapter = {
  id: RunnerId
  detect: (project: ProjectFiles) => boolean
  hasActiveConfig: (project: ProjectFiles) => boolean
  scriptHints: readonly string[]
  internalPathPatterns: readonly RegExp[]
  defaultCommand: () => readonly string[]
  parse: (capture: SubprocessCapture) => RunResult
}
