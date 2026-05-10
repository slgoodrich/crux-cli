import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const here = dirname(fileURLToPath(import.meta.url))
const pkgPath = resolve(here, '../../package.json')
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))

describe('scaffolding', () => {
  it('package.json has the expected name and a valid semver version', () => {
    expect(pkg.name).toBe('crux-cli')
    expect(pkg.version).toMatch(/^\d+\.\d+\.\d+(-[\w.]+)?$/)
  })

  it('package.json declares both bin entries pointing under dist/', () => {
    expect(pkg.bin).toEqual({
      crux: 'dist/cli.js',
      'crux-mcp': 'dist/mcp/server.js',
    })
  })

  it('package.json constrains node engine to >=20', () => {
    expect(pkg.engines?.node).toMatch(/^>=20/)
  })
})
