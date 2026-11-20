import { describe, expect, it } from 'vitest'
import { extractRecipeJsonLd } from './extract-recipe-json-ld'

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
    expect(extractRecipeJsonLd(html)).toEqual({ recipe, recipeCount: 1, nodesById: new Map() })
  })

  it('selects the first recipe in document and depth-first traversal order', () => {
    const html =
      script([{ '@graph': [recipe, { ...recipe, name: 'Second' }] }]) +
      script({ ...recipe, name: 'Third' })
    expect(extractRecipeJsonLd(html)).toEqual({ recipe, recipeCount: 3, nodesById: new Map() })
  })

  it.each(['isPartOf', 'hasPart', 'mainEntityOfPage'])(
    'does not count a recipe nested under a matched recipe via %s',
    (property) => {
      const outer = { ...recipe, [property]: { ...recipe, name: 'Nested' } }
      expect(extractRecipeJsonLd(script(outer))).toEqual({
        recipe: outer,
        recipeCount: 1,
        nodesById: new Map(),
      })
    },
  )

  it('still finds recipes wrapped in non-recipe nodes', () => {
    const html = script({ '@type': 'WebPage', mainEntity: recipe, hasPart: [recipe] })
    expect(extractRecipeJsonLd(html)).toEqual({ recipe, recipeCount: 2, nodesById: new Map() })
  })

  it('retains an incomplete first recipe instead of replacing it', () => {
    expect(extractRecipeJsonLd(script([{ '@type': 'Recipe' }, recipe]))).toEqual({
      recipe: { '@type': 'Recipe' },
      recipeCount: 2,
      nodesById: new Map(),
    })
  })

  it('indexes graph nodes by @id so references can be resolved', () => {
    const person = { '@type': 'Person', '@id': 'https://example.com/#/person/1', name: 'Jane' }
    const graphRecipe = { ...recipe, author: { '@id': person['@id'] } }
    const html = script({ '@graph': [graphRecipe, person] })
    expect(extractRecipeJsonLd(html)?.nodesById.get(person['@id'])).toEqual(person)
  })

  it('indexes nodes from every JSON-LD script on the page', () => {
    const person = { '@type': 'Person', '@id': '#author', name: 'Jane' }
    const html = script(recipe) + script({ '@graph': [person] })
    expect(extractRecipeJsonLd(html)?.nodesById.get('#author')).toEqual(person)
  })

  it('keeps the first described node and ignores reference-only nodes for an @id', () => {
    const first = { '@id': '#author', '@type': 'Person', name: 'First' }
    const html = script({
      '@graph': [{ '@id': '#author' }, first, { '@id': '#author', name: 'Second' }, recipe],
    })
    expect(extractRecipeJsonLd(html)?.nodesById.get('#author')).toEqual(first)
  })

  it('indexes nested nodes and ignores non-string @id values', () => {
    const publisher = { '@type': 'Organization', '@id': '#org', name: 'Kitchen' }
    const html = script({
      '@graph': [{ '@type': 'WebPage', '@id': 7, publisher }, recipe],
    })
    const extracted = extractRecipeJsonLd(html)
    expect(extracted?.nodesById.get('#org')).toEqual(publisher)
    expect([...(extracted?.nodesById.keys() ?? [])]).toEqual(['#org'])
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
