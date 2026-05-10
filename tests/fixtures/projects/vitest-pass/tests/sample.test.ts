import { describe, expect, it } from 'vitest'

describe('sample', () => {
  it('adds numbers', () => {
    expect(1 + 1).toBe(2)
  })

  it('subtracts numbers', () => {
    expect(5 - 3).toBe(2)
  })

  it('multiplies numbers', () => {
    expect(2 * 3).toBe(6)
  })

  it.skip('skipped for the pass-with-skips capture', () => {
    expect(true).toBe(false)
  })
})
