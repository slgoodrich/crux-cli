import { describe, expect, it } from 'vitest'
import {
  AdapterAmbiguousError,
  AdapterDetectError,
  CruxError,
  InvalidArgError,
  ParseError,
  SpawnError,
  UnsupportedNodeVersionError,
} from '../../src/errors.js'

describe('CruxError hierarchy', () => {
  const concrete = [
    AdapterDetectError,
    AdapterAmbiguousError,
    ParseError,
    SpawnError,
    UnsupportedNodeVersionError,
    InvalidArgError,
  ] as const

  it('every concrete subclass extends CruxError', () => {
    for (const Ctor of concrete) {
      expect(Ctor.prototype).toBeInstanceOf(CruxError)
    }
  })

  it('every concrete subclass declares a unique static code starting with CRUX_', () => {
    const codes = concrete.map((C) => (C as unknown as { code: string }).code)
    for (const code of codes) {
      expect(code).toMatch(/^CRUX_/)
    }
    expect(new Set(codes).size).toBe(codes.length)
  })
})

describe('AdapterDetectError', () => {
  it('is an instance of CruxError and AdapterDetectError', () => {
    const err = new AdapterDetectError()
    expect(err).toBeInstanceOf(CruxError)
    expect(err).toBeInstanceOf(AdapterDetectError)
  })

  it('has static code CRUX_ADAPTER_DETECT', () => {
    expect(AdapterDetectError.code).toBe('CRUX_ADAPTER_DETECT')
  })

  it('carries a non-empty message', () => {
    const err = new AdapterDetectError()
    expect(err.message).not.toBe('')
  })

  it('fix() returns a non-empty hint', () => {
    expect(new AdapterDetectError().fix()).not.toBe('')
  })
})

describe('AdapterAmbiguousError', () => {
  it('is an instance of CruxError and AdapterAmbiguousError', () => {
    const err = new AdapterAmbiguousError(['vitest', 'jest'])
    expect(err).toBeInstanceOf(CruxError)
    expect(err).toBeInstanceOf(AdapterAmbiguousError)
  })

  it('has static code CRUX_ADAPTER_AMBIGUOUS', () => {
    expect(AdapterAmbiguousError.code).toBe('CRUX_ADAPTER_AMBIGUOUS')
  })

  it('preserves the signals payload as a readable field', () => {
    const err = new AdapterAmbiguousError(['vitest', 'jest'])
    expect(err.signals).toEqual(['vitest', 'jest'])
  })

  it('includes the signals in the message', () => {
    const err = new AdapterAmbiguousError(['vitest', 'jest'])
    expect(err.message).toContain('vitest')
    expect(err.message).toContain('jest')
  })

  it('fix() returns a non-empty hint', () => {
    expect(new AdapterAmbiguousError(['vitest']).fix()).not.toBe('')
  })
})

describe('ParseError', () => {
  it('is an instance of CruxError and ParseError', () => {
    const err = new ParseError('parse failed', { runner: 'vitest', capturedLines: 42 })
    expect(err).toBeInstanceOf(CruxError)
    expect(err).toBeInstanceOf(ParseError)
  })

  it('has static code CRUX_PARSE', () => {
    expect(ParseError.code).toBe('CRUX_PARSE')
  })

  it('preserves the context payload', () => {
    const err = new ParseError('parse failed', { runner: 'vitest', capturedLines: 42 })
    expect(err.context).toEqual({ runner: 'vitest', capturedLines: 42 })
  })

  it('uses the provided message verbatim', () => {
    const err = new ParseError('something specific', { runner: 'vitest', capturedLines: 0 })
    expect(err.message).toBe('something specific')
  })

  it('fix() returns a non-empty hint', () => {
    const err = new ParseError('x', { runner: 'vitest', capturedLines: 0 })
    expect(err.fix()).not.toBe('')
  })
})

describe('SpawnError', () => {
  it('is an instance of CruxError and SpawnError', () => {
    const err = new SpawnError('spawn failed')
    expect(err).toBeInstanceOf(CruxError)
    expect(err).toBeInstanceOf(SpawnError)
  })

  it('has static code CRUX_SPAWN', () => {
    expect(SpawnError.code).toBe('CRUX_SPAWN')
  })

  it('preserves the cause when one is provided', () => {
    const cause = new Error('underlying enoent')
    const err = new SpawnError('spawn failed', { cause })
    expect(err.cause).toBe(cause)
  })

  it('fix() returns a non-empty hint', () => {
    expect(new SpawnError('x').fix()).not.toBe('')
  })
})

describe('UnsupportedNodeVersionError', () => {
  it('is an instance of CruxError and UnsupportedNodeVersionError', () => {
    const err = new UnsupportedNodeVersionError('v18.20.0')
    expect(err).toBeInstanceOf(CruxError)
    expect(err).toBeInstanceOf(UnsupportedNodeVersionError)
  })

  it('has static code CRUX_NODE_VERSION', () => {
    expect(UnsupportedNodeVersionError.code).toBe('CRUX_NODE_VERSION')
  })

  it('preserves the actual version field', () => {
    const err = new UnsupportedNodeVersionError('v18.20.0')
    expect(err.actual).toBe('v18.20.0')
  })

  it('includes the actual version in the message', () => {
    const err = new UnsupportedNodeVersionError('v18.20.0')
    expect(err.message).toContain('v18.20.0')
  })

  it('fix() returns a non-empty hint', () => {
    expect(new UnsupportedNodeVersionError('v18.0.0').fix()).not.toBe('')
  })
})

describe('InvalidArgError', () => {
  it('is an instance of CruxError and InvalidArgError', () => {
    const err = new InvalidArgError('unknown flag', '--bogus')
    expect(err).toBeInstanceOf(CruxError)
    expect(err).toBeInstanceOf(InvalidArgError)
  })

  it('has static code CRUX_INVALID_ARG', () => {
    expect(InvalidArgError.code).toBe('CRUX_INVALID_ARG')
  })

  it('preserves the offending arg as a separate field', () => {
    const err = new InvalidArgError('unknown flag', '--bogus')
    expect(err.arg).toBe('--bogus')
  })

  it('uses the provided message verbatim', () => {
    const err = new InvalidArgError('unknown flag: --bogus', '--bogus')
    expect(err.message).toBe('unknown flag: --bogus')
  })

  it('fix() returns a non-empty hint', () => {
    expect(new InvalidArgError('x', '--bogus').fix()).not.toBe('')
  })
})
