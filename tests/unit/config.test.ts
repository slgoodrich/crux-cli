import { describe, expect, it } from 'vitest'
import { parseArgs } from '../../src/config.js'
import { InvalidArgError } from '../../src/errors.js'

describe('parseArgs', () => {
  it('returns defaults for empty argv', () => {
    const config = parseArgs([])
    expect(config).toEqual({
      format: 'markdown',
      cwd: null,
      showHelp: false,
      showVersion: false,
      passthroughCommand: null,
      full: false,
    })
  })

  it('parses --json into format json', () => {
    expect(parseArgs(['--json']).format).toBe('json')
  })

  it('parses --raw into format raw', () => {
    expect(parseArgs(['--raw']).format).toBe('raw')
  })

  it('parses --help into showHelp true', () => {
    expect(parseArgs(['--help']).showHelp).toBe(true)
  })

  it('parses --version into showVersion true', () => {
    expect(parseArgs(['--version']).showVersion).toBe(true)
  })

  it('parses --cwd <dir> into cwd', () => {
    expect(parseArgs(['--cwd', '/tmp/proj']).cwd).toBe('/tmp/proj')
  })

  it('throws InvalidArgError when --cwd has no value', () => {
    try {
      parseArgs(['--cwd'])
      throw new Error('should have thrown')
    } catch (err) {
      expect(err).toBeInstanceOf(InvalidArgError)
      expect((err as InvalidArgError).arg).toBe('--cwd')
    }
  })

  it('throws InvalidArgError when --json and --raw are both passed (json first)', () => {
    try {
      parseArgs(['--json', '--raw'])
      throw new Error('should have thrown')
    } catch (err) {
      expect(err).toBeInstanceOf(InvalidArgError)
    }
  })

  it('throws InvalidArgError when --json and --raw are both passed (raw first)', () => {
    try {
      parseArgs(['--raw', '--json'])
      throw new Error('should have thrown')
    } catch (err) {
      expect(err).toBeInstanceOf(InvalidArgError)
    }
  })

  it('throws InvalidArgError on unknown flag', () => {
    try {
      parseArgs(['--bogus'])
      throw new Error('should have thrown')
    } catch (err) {
      expect(err).toBeInstanceOf(InvalidArgError)
      expect((err as InvalidArgError).arg).toBe('--bogus')
    }
  })

  it('treats bare -- with nothing after as empty passthroughCommand', () => {
    const config = parseArgs(['--'])
    expect(config.passthroughCommand).toEqual([])
  })

  it('captures everything after -- verbatim into passthroughCommand', () => {
    const config = parseArgs(['--', 'vitest', 'run'])
    expect(config.passthroughCommand).toEqual(['vitest', 'run'])
  })

  it('preserves passthrough flags that look like crux flags', () => {
    const config = parseArgs(['--json', '--', 'vitest', '--json'])
    expect(config.format).toBe('json')
    expect(config.passthroughCommand).toEqual(['vitest', '--json'])
  })

  it('rejects unknown positional args before -- with InvalidArgError', () => {
    try {
      parseArgs(['vitest', '--json'])
      throw new Error('should have thrown')
    } catch (err) {
      expect(err).toBeInstanceOf(InvalidArgError)
    }
  })

  it('combines --json + --cwd + passthrough command correctly', () => {
    const config = parseArgs(['--json', '--cwd', '/tmp', '--', 'pytest', 'tests/'])
    expect(config.format).toBe('json')
    expect(config.cwd).toBe('/tmp')
    expect(config.passthroughCommand).toEqual(['pytest', 'tests/'])
  })

  it('returns a frozen Config object', () => {
    const config = parseArgs([])
    expect(Object.isFrozen(config)).toBe(true)
  })
})

describe('parseArgs: --full flag', () => {
  it('defaults full to false', () => {
    const config = parseArgs([])
    expect(config.full).toBe(false)
  })

  it('parses --full as full=true', () => {
    const config = parseArgs(['--full'])
    expect(config.full).toBe(true)
  })

  it('combines --full with --json', () => {
    const config = parseArgs(['--json', '--full'])
    expect(config.full).toBe(true)
    expect(config.format).toBe('json')
  })

  it('treats unknown flags as InvalidArgError (sanity)', () => {
    expect(() => parseArgs(['--nope'])).toThrow()
  })
})
