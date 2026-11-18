import { describe, expect, it } from 'vitest'
import { decodeIdCursor, encodeIdCursor } from './id-cursor'

describe('id cursor', () => {
  it('round-trips an id', () => {
    expect(decodeIdCursor(encodeIdCursor(42))).toBe(42)
  })

  it('produces a URL-safe string with no padding', () => {
    for (const id of [1, 9, 12345, Number.MAX_SAFE_INTEGER]) {
      expect(encodeIdCursor(id)).toMatch(/^[A-Za-z0-9_-]+$/)
    }
  })

  it.each([
    ['empty', ''],
    ['not base64', '!!!'],
    ['a raw id', '13'],
    ['base64 of non-JSON', btoa('hello')],
    ['JSON without an id', btoa('{"x":1}')],
    ['JSON null', btoa('null')],
    ['a zero id', btoa('{"id":0}')],
    ['a negative id', btoa('{"id":-3}')],
    ['a fractional id', btoa('{"id":1.5}')],
    ['a string id', btoa('{"id":"7"}')],
    ['an unsafe id', btoa('{"id":1e30}')],
  ])('rejects %s', (_, cursor) => {
    expect(decodeIdCursor(cursor)).toBeNull()
  })
})
