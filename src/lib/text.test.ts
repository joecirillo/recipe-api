import { describe, expect, it } from 'vitest'
import { toTitleCase } from './text'

describe('toTitleCase', () => {
  it('capitalizes the first letter of each word', () => {
    expect(toTitleCase('chicken parmesan')).toBe('Chicken Parmesan')
  })

  it('lowercases already-uppercase input', () => {
    expect(toTitleCase('CHICKEN PARMESAN')).toBe('Chicken Parmesan')
  })

  it('normalizes mixed-case input', () => {
    expect(toTitleCase('cHiCkEn ParMESan')).toBe('Chicken Parmesan')
  })

  it('capitalizes after a hyphen', () => {
    expect(toTitleCase('stir-fry noodles')).toBe('Stir-Fry Noodles')
  })

  it('trims leading and trailing whitespace', () => {
    expect(toTitleCase('  olive oil  ')).toBe('Olive Oil')
  })

  it('collapses no internal whitespace, only trims edges', () => {
    expect(toTitleCase('extra  virgin')).toBe('Extra  Virgin')
  })

  it('handles a single word', () => {
    expect(toTitleCase('italian')).toBe('Italian')
  })

  it('does not capitalize after an apostrophe', () => {
    expect(toTitleCase("shepherd's pie")).toBe("Shepherd's Pie")
  })

  it('capitalizes accented letters correctly', () => {
    expect(toTitleCase('crème brûlée')).toBe('Crème Brûlée')
    expect(toTitleCase('jalapeño')).toBe('Jalapeño')
  })
})
