import { describe, expect, it } from 'vitest'

describe('rejects-against-response', () => {
  it('expects a rejected promise but receives a resolved Response', async () => {
    await expect(Promise.resolve(new Response('hello world'))).rejects.toThrow()
  })
})
