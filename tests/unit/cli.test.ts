import { describe, expect, it } from 'vitest'
import { applyEnvOverrides } from '../../src/cli.js'
import type { Config } from '../../src/config.js'

function makeConfig(overrides: Partial<Config> = {}): Config {
  return Object.freeze({
    format: 'markdown',
    cwd: null,
    showHelp: false,
    showVersion: false,
    passthroughCommand: null,
    full: false,
    ...overrides,
  })
}

describe('applyEnvOverrides', () => {
  it('returns the same config when CRUX_FULL is not set', () => {
    const config = makeConfig()
    const out = applyEnvOverrides(config, {})
    expect(out).toBe(config)
  })

  it('returns the same config when CRUX_FULL is set to a non-1 value', () => {
    const config = makeConfig()
    const env: NodeJS.ProcessEnv = {}
    // biome-ignore lint/complexity/useLiteralKeys: noPropertyAccessFromIndexSignature requires bracket notation
    env['CRUX_FULL'] = '0'
    const out = applyEnvOverrides(config, env)
    expect(out).toBe(config)
  })

  it('sets full=true when CRUX_FULL=1', () => {
    const config = makeConfig()
    const env: NodeJS.ProcessEnv = {}
    // biome-ignore lint/complexity/useLiteralKeys: noPropertyAccessFromIndexSignature requires bracket notation
    env['CRUX_FULL'] = '1'
    const out = applyEnvOverrides(config, env)
    expect(out.full).toBe(true)
    // Other fields preserved.
    expect(out.format).toBe(config.format)
    expect(out.cwd).toBe(config.cwd)
  })

  it('returns the same config when CRUX_FULL=1 but config.full is already true', () => {
    const config = makeConfig({ full: true })
    const env: NodeJS.ProcessEnv = {}
    // biome-ignore lint/complexity/useLiteralKeys: noPropertyAccessFromIndexSignature requires bracket notation
    env['CRUX_FULL'] = '1'
    const out = applyEnvOverrides(config, env)
    expect(out).toBe(config)
  })
})
