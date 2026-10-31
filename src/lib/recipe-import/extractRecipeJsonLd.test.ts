import { describe, expect, it } from 'vitest'
import { extractRecipeJsonLd } from './extractRecipeJsonLd'

const script = (data: unknown) =>
  `<script type="application/ld+json">${JSON.stringify(data)}</script>`
const recipe = { '@type': 'Recipe', name: 'Soup' }

describe('extractRecipeJsonLd', () => {
  it.each([
    recipe,
    [null, { '@type': 'WebPage' }, recipe],
    { '@graph': [{ '@type': 'WebPage' }, recipe] },
    { ...recipe, '@type': ['Thing', 'Recipe'] },
    { ...recipe, '@type': 'https://schema.org/Recipe' },
    { mainEntity: recipe },
  ])('extracts supported JSON-LD shapes', (data) => {
    expect(extractRecipeJsonLd(script(data))).toMatchObject({
      recipe: { name: 'Soup' },
      recipeCount: 1,
    })
  })

  it('skips malformed and unrelated scripts before a valid recipe', () => {
    const html =
      '<script type="application/ld+json">{broken</script>' +
      `<script>${JSON.stringify(recipe)}</script>` +
      script({ '@type': 'Person' }) +
      script(recipe)
    expect(extractRecipeJsonLd(html)).toEqual({ recipe, recipeCount: 1 })
  })

  it('selects the first recipe in document and depth-first traversal order', () => {
    const html =
      script([{ '@graph': [recipe, { ...recipe, name: 'Second' }] }]) +
      script({ ...recipe, name: 'Third' })
    expect(extractRecipeJsonLd(html)).toEqual({ recipe, recipeCount: 3 })
  })

  it('retains an incomplete first recipe instead of replacing it', () => {
    expect(extractRecipeJsonLd(script([{ '@type': 'Recipe' }, recipe]))).toEqual({
      recipe: { '@type': 'Recipe' },
      recipeCount: 2,
    })
  })

  it.each([
    '<p>No data</p>',
    script(null),
    script([]),
    script({ '@type': 42 }),
    '<script type="application/json">{"@type":"Recipe"}</script>',
  ])('returns null when absent', (html) => {
    expect(extractRecipeJsonLd(html)).toBeNull()
  })
})
