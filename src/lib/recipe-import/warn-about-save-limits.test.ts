import { describe, expect, it } from 'vitest'
import { mapSchemaOrgRecipe } from './map-schema-org-recipe'
import { warnAboutSaveLimits } from './warn-about-save-limits'

const map = (recipe: Record<string, unknown>) =>
  mapSchemaOrgRecipe({ recipe, recipeCount: 1 }, { sourceUrl: 'https://example.com/recipe' })

describe('preview save limits', () => {
  it.each([
    ['name', 150, 'recipe.name'],
    ['author', 255, 'recipe.author'],
    ['recipeCuisine', 100, 'recipe.cuisine.name'],
  ])('warns beyond the %s limit without truncating the value', (field, limit, path) => {
    expect(map({ [field]: 'a'.repeat(limit) }).warnings).toEqual([])
    const result = map({ [field]: 'a'.repeat(limit + 1) })
    expect(result.warnings).toEqual([
      expect.objectContaining({ code: 'SAVE_LIMIT_EXCEEDED', field: path }),
    ])
    expect(JSON.stringify(result.recipe)).toContain('a'.repeat(limit + 1))
  })

  it('warns about ingredient and tag limits at the mapped row paths', () => {
    const input = {
      recipeIngredient: ['a'.repeat(255), 'b'.repeat(256)],
      keywords: ['a'.repeat(100), 'b'.repeat(101)],
    }
    const result = map(input)
    expect(result.warnings.map(({ field }) => field)).toEqual([
      'recipe.ingredients[1].name',
      'recipe.tags[1].name',
    ])
    expect(result.source.originalIngredientLines).toEqual(input.recipeIngredient)
    expect(result.recipe.ingredients?.[1].name).toHaveLength(256)
    expect(result.recipe.tags?.[1].name).toHaveLength(101)
  })

  it('checks the normalized image URL length', () => {
    const prefix = 'https://example.com/'
    expect(map({ image: prefix + 'a'.repeat(255 - prefix.length) }).warnings).toEqual([])
    const result = map({ image: '/' + 'a'.repeat(250) })
    expect(result.recipe.imageUrl).toBe(prefix + 'a'.repeat(250))
    expect(result.warnings).toEqual([
      expect.objectContaining({ code: 'SAVE_LIMIT_EXCEEDED', field: 'recipe.imageUrl' }),
    ])
  })

  it.each([
    ['recipeYield', 32767, 32768, 'recipe.servings'],
    ['cookTime', 'PT32767M', 'P30D', 'recipe.cookingTime'],
    ['prepTime', 'PT32767M', 'PT32768M', 'recipe.preparationTime'],
  ])(
    'warns about %s numeric overflow while retaining the parsed number',
    (field, valid, oversized, path) => {
      expect(map({ [field]: valid }).warnings).toEqual([])
      const result = map({ [field]: oversized })
      expect(result.warnings).toEqual([
        expect.objectContaining({ code: 'SAVE_LIMIT_EXCEEDED', field: path }),
      ])
      expect(
        Object.values(result.recipe).some((value) => typeof value === 'number' && value > 32767),
      ).toBe(true)
    },
  )

  it('checks step numbers against the database limit', () => {
    expect(
      warnAboutSaveLimits({
        steps: [
          { stepNumber: 32767, description: 'Valid', tip: null },
          { stepNumber: 32768, description: 'Too many', tip: null },
        ],
      }),
    ).toEqual([
      expect.objectContaining({ code: 'SAVE_LIMIT_EXCEEDED', field: 'recipe.steps[1].stepNumber' }),
    ])
  })

  it('does not treat missing values or null measurements as save-limit violations', () => {
    expect(
      warnAboutSaveLimits({
        preparationTime: null,
        ingredients: [{ id: null, name: 'salt', quantity: null, unitId: null, notes: null }],
      }),
    ).toEqual([])
  })

  it('maps array yields and retains their original text', () => {
    expect(map({ recipeYield: ['4', '4 servings'] })).toMatchObject({
      recipe: { servings: 4 },
      source: { originalYield: '4\n4 servings' },
      warnings: [],
    })
  })
})
