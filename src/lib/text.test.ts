import { describe, expect, it } from 'vitest'
import { toTitleCase } from './text'

describe('toTitleCase', () => {
  it('capitalizes the first letter of each word', () => {
    expect(toTitleCase('cast iron skillet')).toBe('Cast Iron Skillet')
  })

  it('lowercases the rest of each word', () => {
    expect(toTitleCase('CAST IRON SKILLET')).toBe('Cast Iron Skillet')
  })

  it('leaves an already title-cased value unchanged', () => {
    expect(toTitleCase('Cast Iron Skillet')).toBe('Cast Iron Skillet')
  })

  it('handles a single word', () => {
    expect(toTitleCase('pasta')).toBe('Pasta')
  })

  it('preserves multiple spaces between words', () => {
    expect(toTitleCase('cast  iron')).toBe('Cast  Iron')
  })

  it('handles an empty string', () => {
    expect(toTitleCase('')).toBe('')
  })

  it('leaves non-letter leading characters unaffected', () => {
    expect(toTitleCase('5-spice powder')).toBe('5-spice Powder')
  })
})
