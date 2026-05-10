import { describe, expect, it } from 'vitest'

describe('snapshots', () => {
  it('matches an inline snapshot', () => {
    expect({ name: 'changed', value: 99 }).toMatchInlineSnapshot(`
      {
        "name": "original",
        "value": 1,
      }
    `)
  })

  it('matches a stale stored snapshot', () => {
    expect({ key: 'new-value' }).toMatchSnapshot()
  })
})
