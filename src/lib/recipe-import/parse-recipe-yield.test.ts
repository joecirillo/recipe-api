import { describe, expect, it } from 'vitest'
import { parseRecipeYield } from './parse-recipe-yield'

describe('parseRecipeYield', () => {
  it.each([4, '4', '4 servings', 'Serves 4', 'servings: 4', '4 people'])(
    'maps serving count %j',
    (value) => {
      expect(parseRecipeYield(value)).toEqual({ servings: 4, originalYield: String(value) })
    },
  )

  it.each(['4–6', '4-6 servings', 'Serves 4 to 6', '4—6 people'])(
    'selects the lower bound of %j with a warning',
    (value) => {
      expect(parseRecipeYield(value)).toEqual({
        originalYield: value,
        servings: 4,
        warning: expect.objectContaining({ code: 'AMBIGUOUS_YIELD', field: 'recipeYield' }),
      })
    },
  )

  it.each([
    '24 cookies',
    '2 loaves',
    '4–6 cookies',
    'many',
    '',
    0,
    -1,
    1.5,
    '6–4',
    '0–4',
    '999999999999999999',
    {},
    true,
    Infinity,
    NaN,
  ])('does not infer servings from %j', (value) => {
    const result = parseRecipeYield(value)
    expect(result.servings).toBeUndefined()
    expect(result.warning).toMatchObject({ code: 'UNSUPPORTED_YIELD', field: 'recipeYield' })
  })

  it.each([null, undefined])('leaves missing yields empty without warning', (value) => {
    expect(parseRecipeYield(value)).toEqual({ originalYield: null })
  })

  it('preserves the original text while reading markup', () => {
    expect(parseRecipeYield(' <b>4</b> servings ')).toEqual({
      originalYield: ' <b>4</b> servings ',
      servings: 4,
    })
  })
})

describe('recipeYield arrays', () => {
  it.each([
    [['4', '4 servings'], '4\n4 servings'],
    [[4, '4 servings'], '4\n4 servings'],
    [[' <b>4</b> servings '], ' <b>4</b> servings '],
  ])('accepts matching counts and preserves source text', (value, originalYield) => {
    expect(parseRecipeYield(value)).toEqual({ servings: 4, originalYield })
  })

  it('retains unsupported text and selects the first usable count', () => {
    expect(parseRecipeYield([{}, '24 cookies', '4 servings', null])).toEqual({
      originalYield: '24 cookies\n4 servings',
      servings: 4,
      warning: expect.objectContaining({ code: 'UNSUPPORTED_YIELD' }),
    })
  })

  it.each([
    ['4', '6'],
    ['4–6', '4'],
    ['4', '4–6'],
  ])('warns about conflicting or ranged counts', (...values) => {
    expect(parseRecipeYield(values)).toMatchObject({
      servings: 4,
      warning: { code: 'AMBIGUOUS_YIELD', field: 'recipeYield' },
    })
  })

  it('preserves item yields without inventing servings', () => {
    expect(parseRecipeYield(['24 cookies', '2 loaves'])).toEqual({
      originalYield: '24 cookies\n2 loaves',
      warning: expect.objectContaining({ code: 'UNSUPPORTED_YIELD' }),
    })
  })

  it('handles empty arrays and rejects invalid entries without coercion', () => {
    expect(parseRecipeYield([])).toEqual({ originalYield: null })
    expect(parseRecipeYield([null, {}, ['4']])).toEqual({
      originalYield: null,
      warning: expect.objectContaining({ code: 'UNSUPPORTED_YIELD' }),
    })
  })
})
