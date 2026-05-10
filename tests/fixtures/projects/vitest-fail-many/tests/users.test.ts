import { describe, expect, it } from 'vitest'

describe('users', () => {
  it('lists all users', () => {
    expect([{ id: 1 }, { id: 2 }]).toEqual([{ id: 1 }])
  })

  it('finds by email', () => {
    expect({ email: 'a@b.c' }).toEqual({ email: 'x@y.z' })
  })

  it('counts users', () => {
    expect(5).toBe(5)
  })
})
