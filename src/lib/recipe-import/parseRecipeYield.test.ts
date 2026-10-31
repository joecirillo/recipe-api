import { describe, expect, it } from 'vitest'
import { parseRecipeYield } from './parseRecipeYield'

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
    ['4 servings'],
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
