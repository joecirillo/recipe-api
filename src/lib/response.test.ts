import { describe, expect, it } from 'vitest'
import { buildSuccess } from './response'

describe('buildSuccess', () => {
  it('omits meta when none is given', () => {
    expect(buildSuccess(200, 'OK', [1])).not.toHaveProperty('meta')
  })

  it('puts pagination in meta next to data', () => {
    const body = buildSuccess(200, 'OK', [1], { pagination: { nextCursor: 'abc', limit: 12 } })
    expect(body.data).toEqual([1])
    expect(body.meta).toEqual({ pagination: { nextCursor: 'abc', limit: 12 } })
  })
})
