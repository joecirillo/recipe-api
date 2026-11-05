import { deepStrictEqual, equal, ok } from 'node:assert/strict'
import { extractRecipeJsonLd } from '../src/lib/recipe-import/extract-recipe-json-ld'
import { mapSchemaOrgRecipe } from '../src/lib/recipe-import/map-schema-org-recipe'

export default {
  fetch(): Response {
    const html =
      '<script type="application/ld+json">broken</script>' +
      '<script type="application/ld+json">' +
      JSON.stringify({
        '@graph': [
          {
            '@type': ['Thing', 'Recipe'],
            name: 'Soup &amp; bread',
            recipeIngredient: ['Salt to taste'],
            recipeYield: ['4', '4 servings'],
            cookTime: 'PT1H30M',
            prepTime: 'PT1S',
            recipeInstructions: [
              {
                '@type': 'HowToSection',
                itemListElement: [
                  { '@type': 'HowToStep', text: '<p>Mix &amp; stir.</p><p>Serve.</p>' },
                ],
              },
            ],
            image: ['javascript:bad()', '/soup.jpg'],
          },
          { '@type': 'Recipe', name: 'Second' },
        ],
      }) +
      '</script>'
    const extracted = extractRecipeJsonLd(html)
    ok(extracted)
    const preview = mapSchemaOrgRecipe(extracted, { sourceUrl: 'https://example.com/recipes/soup' })
    equal(preview.recipe.name, 'Soup & bread')
    equal(preview.recipe.servings, 4)
    equal(preview.recipe.cookingTime, 90)
    equal(preview.recipe.preparationTime, 1)
    equal(preview.recipe.imageUrl, 'https://example.com/soup.jpg')
    deepStrictEqual(preview.recipe.ingredients, [
      { id: null, name: 'Salt to taste', quantity: null, unitId: null, notes: null },
    ])
    deepStrictEqual(preview.recipe.steps, [
      { stepNumber: 1, description: 'Mix & stir.\nServe.', tip: null },
    ])
    equal(preview.source.originalYield, '4\n4 servings')
    equal(preview.source.recipeCount, 2)
    deepStrictEqual(
      preview.warnings.map(({ code }) => code),
      ['MULTIPLE_RECIPES', 'INVALID_IMAGE_URL'],
    )
    equal(extractRecipeJsonLd('<p>No recipe</p>'), null)

    const oversized = mapSchemaOrgRecipe(
      { recipe: { cookTime: 'P30D', name: 'x'.repeat(151) }, recipeCount: 1 },
      { sourceUrl: 'https://example.com/recipe' },
    )
    equal(oversized.recipe.cookingTime, 43200)
    deepStrictEqual(
      oversized.warnings.map(({ field }) => field),
      ['recipe.name', 'recipe.cookingTime'],
    )
    return Response.json({
      passed: true,
      runtime: 'workerd',
      scenarios: ['extraction-and-mapping', 'absent-recipe', 'save-limit-warnings'],
    })
  },
}
