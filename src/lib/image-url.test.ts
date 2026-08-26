import { describe, expect, it } from 'vitest'
import { toPublicUrl, toStorageKey, withPublicImageUrl } from './image-url'

const PUBLIC_URL = 'https://cdn.foodiesfinds.com'

describe('toStorageKey', () => {
  it('strips a matching public URL prefix', () => {
    expect(toStorageKey(`${PUBLIC_URL}/recipes/abc-123.jpg`, PUBLIC_URL)).toBe(
      'recipes/abc-123.jpg',
    )
  })

  it('strips the prefix even if publicUrl has a trailing slash', () => {
    expect(toStorageKey(`${PUBLIC_URL}/recipes/abc-123.jpg`, `${PUBLIC_URL}/`)).toBe(
      'recipes/abc-123.jpg',
    )
  })

  it('leaves an already-bare key untouched', () => {
    expect(toStorageKey('recipes/abc-123.jpg', PUBLIC_URL)).toBe('recipes/abc-123.jpg')
  })

  it('leaves a URL from a different host untouched', () => {
    const other = 'https://pub-017886dc539b41789e7c76de04239c5d.r2.dev/recipes/abc-123.jpg'
    expect(toStorageKey(other, PUBLIC_URL)).toBe(other)
  })
})

describe('toPublicUrl', () => {
  it('returns null for a null stored value', () => {
    expect(toPublicUrl(null, PUBLIC_URL)).toBeNull()
  })

  it('prefixes a bare key with the public URL', () => {
    expect(toPublicUrl('recipes/abc-123.jpg', PUBLIC_URL)).toBe(`${PUBLIC_URL}/recipes/abc-123.jpg`)
  })

  it('strips a trailing slash from publicUrl before prefixing', () => {
    expect(toPublicUrl('recipes/abc-123.jpg', `${PUBLIC_URL}/`)).toBe(
      `${PUBLIC_URL}/recipes/abc-123.jpg`,
    )
  })

  it('leaves an already-absolute stored value untouched (pre-migration rows)', () => {
    const legacy = 'https://pub-017886dc539b41789e7c76de04239c5d.r2.dev/recipes/abc-123.jpg'
    expect(toPublicUrl(legacy, PUBLIC_URL)).toBe(legacy)
  })
})

describe('withPublicImageUrl', () => {
  it('resolves imageUrl on the given item without mutating the input', () => {
    const item = { id: 1, name: 'Pasta', imageUrl: 'recipes/abc-123.jpg' }

    const result = withPublicImageUrl(item, PUBLIC_URL)

    expect(result).toEqual({ id: 1, name: 'Pasta', imageUrl: `${PUBLIC_URL}/recipes/abc-123.jpg` })
    expect(item.imageUrl).toBe('recipes/abc-123.jpg')
  })

  it('passes through a null imageUrl', () => {
    const item = { id: 1, name: 'Pasta', imageUrl: null }
    expect(withPublicImageUrl(item, PUBLIC_URL).imageUrl).toBeNull()
  })
})
