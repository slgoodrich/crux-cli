import { describe, expect, it } from 'vitest'

describe('sample', () => {
  it('passes a sanity check', () => {
    expect(1).toBe(1)
  })

  it('fails one expectation', () => {
    expect(1).toBe(2)
  })

  it('passes another sanity check', () => {
    expect('hi').toBe('hi')
  })
})
