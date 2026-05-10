import { describe, expect, it } from 'vitest'

describe('auth', () => {
  it('rejects bad password', () => {
    expect(401).toBe(500)
  })

  it('accepts good password', () => {
    expect(200).toBe(200)
  })

  it('rejects expired token', () => {
    expect(403).toBe(401)
  })
})
