import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { detectRunner, loadProjectFiles } from '../../src/detect.js'
import { AdapterAmbiguousError } from '../../src/errors.js'
import type { RunnerAdapter } from '../../src/runners/types.js'
import { vitestAdapter } from '../../src/runners/vitest.js'
import { makeProjectFiles } from '../helpers/project-files.js'
import { withTempDir } from '../helpers/temp-dir.js'

// A test-only fake matching the seven-field RunnerAdapter contract. Used to
// drive multi-adapter conflict paths in detectRunner since v0.1 only ships the
// vitest adapter. Never imported into src/.
const fakeJestAdapter: RunnerAdapter = {
  id: 'jest',
  detect: (project) => {
    const pkg = project.packageJson
    if (typeof pkg !== 'object' || pkg === null) return project.jestConfigPresent
    // biome-ignore lint/complexity/useLiteralKeys: tsconfig noPropertyAccessFromIndexSignature requires bracket access on Record<string, unknown>
    const deps = (pkg as Record<string, unknown>)['devDependencies']
    if (typeof deps === 'object' && deps !== null && 'jest' in deps) return true
    return project.jestConfigPresent
  },
  hasActiveConfig: (project) => project.jestConfigPresent,
  scriptHints: ['jest'],
  internalPathPatterns: [],
  defaultCommand: () => ['npx', 'jest', '--no-coverage'],
  parse: () => {
    throw new Error('fakeJestAdapter.parse not implemented')
  },
}

describe('detectRunner', () => {
  const both = [vitestAdapter, fakeJestAdapter] as const

  it('returns null on no-match', () => {
    expect(detectRunner(makeProjectFiles(), [vitestAdapter])).toBeNull()
  })

  it('returns the single matching adapter', () => {
    const project = makeProjectFiles({ vitestConfigPresent: true })
    expect(detectRunner(project, [vitestAdapter])).toBe(vitestAdapter)
  })

  it('returns the matching adapter when only one of many matches', () => {
    const project = makeProjectFiles({ vitestConfigPresent: true })
    expect(detectRunner(project, both)).toBe(vitestAdapter)
  })

  it('uses scripts.test substring match (vitest wins)', () => {
    const project = makeProjectFiles({
      packageJson: {
        devDependencies: { vitest: '*', jest: '*' },
        scripts: { test: 'vitest run' },
      },
    })
    expect(detectRunner(project, both)).toBe(vitestAdapter)
  })

  it('uses scripts.test substring match (jest wins)', () => {
    const project = makeProjectFiles({
      packageJson: {
        devDependencies: { vitest: '*', jest: '*' },
        scripts: { test: 'jest --bail' },
      },
    })
    expect(detectRunner(project, both)).toBe(fakeJestAdapter)
  })

  it('falls through to active-config when scripts.test matches neither', () => {
    const project = makeProjectFiles({
      packageJson: {
        devDependencies: { vitest: '*', jest: '*' },
        scripts: { test: 'echo no-runner' },
      },
      vitestConfigPresent: true,
    })
    expect(detectRunner(project, both)).toBe(vitestAdapter)
  })

  it('falls through to active-config when scripts.test matches both', () => {
    // pathological: scripts.test = "vitest && jest". Both match step 1; both
    // remain conflicting; step 2 picks the one with hasActiveConfig.
    const project = makeProjectFiles({
      packageJson: {
        devDependencies: { vitest: '*', jest: '*' },
        scripts: { test: 'vitest run && jest' },
      },
      jestConfigPresent: true,
    })
    expect(detectRunner(project, both)).toBe(fakeJestAdapter)
  })

  it('throws AdapterAmbiguousError when no tiebreaker resolves', () => {
    const project = makeProjectFiles({
      packageJson: {
        devDependencies: { vitest: '*', jest: '*' },
      },
    })
    expect(() => detectRunner(project, both)).toThrow(AdapterAmbiguousError)
  })

  it('AdapterAmbiguousError carries signals sorted alphabetically', () => {
    const project = makeProjectFiles({
      packageJson: {
        devDependencies: { vitest: '*', jest: '*' },
      },
    })
    try {
      detectRunner(project, both)
      throw new Error('should have thrown')
    } catch (err) {
      expect(err).toBeInstanceOf(AdapterAmbiguousError)
      expect((err as AdapterAmbiguousError).signals).toEqual(['jest', 'vitest'])
    }
  })

  it('does not throw when only one adapter matches even with conflict-prone fields', () => {
    const project = makeProjectFiles({
      packageJson: { devDependencies: { vitest: '*' } },
      jestConfigPresent: false,
    })
    expect(detectRunner(project, both)).toBe(vitestAdapter)
  })
})

describe('loadProjectFiles', () => {
  it('returns all-null fields for an empty directory', async () => {
    await withTempDir(async (dir) => {
      const project = await loadProjectFiles(dir)
      expect(project.packageJson).toBeNull()
      expect(project.vitestConfigPresent).toBe(false)
      expect(project.vitestWorkspacePresent).toBe(false)
      expect(project.jestConfigPresent).toBe(false)
    })
  })

  it('parses package.json when present', async () => {
    await withTempDir(async (dir) => {
      await writeFile(
        join(dir, 'package.json'),
        JSON.stringify({ name: 'test', devDependencies: { vitest: '^4.0.0' } }),
      )
      const project = await loadProjectFiles(dir)
      expect(project.packageJson).toMatchObject({
        name: 'test',
        devDependencies: { vitest: '^4.0.0' },
      })
    })
  })

  it('detects vitest.config.ts presence', async () => {
    await withTempDir(async (dir) => {
      await writeFile(join(dir, 'package.json'), '{}')
      await writeFile(join(dir, 'vitest.config.ts'), 'export default {}')
      const project = await loadProjectFiles(dir)
      expect(project.vitestConfigPresent).toBe(true)
    })
  })

  it('detects vitest.workspace.ts presence', async () => {
    await withTempDir(async (dir) => {
      await writeFile(join(dir, 'package.json'), '{}')
      await writeFile(join(dir, 'vitest.workspace.ts'), 'export default []')
      const project = await loadProjectFiles(dir)
      expect(project.vitestWorkspacePresent).toBe(true)
    })
  })

  it('detects jest.config.js presence', async () => {
    await withTempDir(async (dir) => {
      await writeFile(join(dir, 'package.json'), '{}')
      await writeFile(join(dir, 'jest.config.js'), 'module.exports = {}')
      const project = await loadProjectFiles(dir)
      expect(project.jestConfigPresent).toBe(true)
    })
  })

  it('walks up to find the nearest package.json', async () => {
    await withTempDir(async (dir) => {
      const sub = join(dir, 'packages', 'inner')
      await mkdir(sub, { recursive: true })
      await writeFile(join(dir, 'package.json'), JSON.stringify({ name: 'monorepo-root' }))
      const project = await loadProjectFiles(sub)
      expect(project.packageJson).toMatchObject({ name: 'monorepo-root' })
    })
  })

  it('stops at the nearest package.json (does not climb past)', async () => {
    await withTempDir(async (dir) => {
      const sub = join(dir, 'packages', 'inner')
      await mkdir(sub, { recursive: true })
      await writeFile(join(dir, 'package.json'), JSON.stringify({ name: 'outer' }))
      await writeFile(join(sub, 'package.json'), JSON.stringify({ name: 'inner' }))
      const project = await loadProjectFiles(sub)
      expect(project.packageJson).toMatchObject({ name: 'inner' })
    })
  })

  it('returns packageJson null on malformed JSON without throwing', async () => {
    await withTempDir(async (dir) => {
      await writeFile(join(dir, 'package.json'), '{ this is not json')
      const project = await loadProjectFiles(dir)
      expect(project.packageJson).toBeNull()
    })
  })

  it('any of .js, .ts, .mjs, .cjs config extensions counts as present', async () => {
    for (const ext of ['js', 'ts', 'mjs', 'cjs']) {
      await withTempDir(async (dir) => {
        await writeFile(join(dir, 'package.json'), '{}')
        await writeFile(join(dir, `vitest.config.${ext}`), '')
        const project = await loadProjectFiles(dir)
        expect(project.vitestConfigPresent).toBe(true)
      })
    }
  })
})
