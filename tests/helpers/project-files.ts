import type { ProjectFiles } from '../../src/runners/types.js'

const EMPTY: ProjectFiles = {
  packageJson: null,
  cargoToml: null,
  goMod: null,
  pyprojectToml: null,
  pytestIni: null,
  vitestConfigPresent: false,
  vitestWorkspacePresent: false,
  jestConfigPresent: false,
}

export function makeProjectFiles(overrides: Partial<ProjectFiles> = {}): ProjectFiles {
  return { ...EMPTY, ...overrides }
}
