import { describe, expect, it } from 'vitest'

describe('broken', () => {
  it('intentional syntax error', () => {
    const x = {
    expect(x).toBe({})
  })
})
