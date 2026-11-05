import type { RecipeImportPreview, RecipeImportWarning } from '../types'

type Bounds = [field: string, value: number | null | undefined, minimum: number, maximum: number]

const MAX_SMALLINT = 32767

function textBounds(recipe: RecipeImportPreview['recipe']): Bounds[] {
  return [
    ['recipe.name', recipe.name?.length, 2, 150],
    ['recipe.author', recipe.author?.length, 0, 255],
    ['recipe.imageUrl', recipe.imageUrl?.length, 0, 255],
    ['recipe.cuisine.name', recipe.cuisine?.name.length, 2, 100],
    ...(recipe.ingredients ?? []).map((ingredient, index): Bounds => [
      `recipe.ingredients[${index}].name`,
      ingredient.name.length,
      2,
      255,
    ]),
    ...(recipe.tags ?? []).map((tag, index): Bounds => [
      `recipe.tags[${index}].name`,
      tag.name.length,
      2,
      100,
    ]),
  ]
}

function numberBounds(recipe: RecipeImportPreview['recipe']): Bounds[] {
  return [
    ['recipe.servings', recipe.servings, 1, MAX_SMALLINT],
    ['recipe.cookingTime', recipe.cookingTime, 0, MAX_SMALLINT],
    ['recipe.preparationTime', recipe.preparationTime, 1, MAX_SMALLINT],
    ...(recipe.steps ?? []).map((step, index): Bounds => [
      `recipe.steps[${index}].stepNumber`,
      step.stepNumber,
      1,
      MAX_SMALLINT,
    ]),
  ]
}

function checkBounds(bounds: Bounds[], unit: string): RecipeImportWarning[] {
  return bounds.flatMap(([field, value, minimum, maximum]): RecipeImportWarning[] => {
    if (value == null) return []
    if (value > maximum) {
      return [
        {
          code: 'SAVE_LIMIT_EXCEEDED',
          field,
          message: `This value exceeds the save limit of ${maximum}${unit}. Review it before saving; the imported value has been preserved.`,
        },
      ]
    }
    if (value < minimum) {
      return [
        {
          code: 'BELOW_SAVE_MINIMUM',
          field,
          message: `This value is below the save minimum of ${minimum}${unit}. Review it before saving; the imported value has been preserved.`,
        },
      ]
    }
    return []
  })
}

export function warnAboutSaveLimits(recipe: RecipeImportPreview['recipe']): RecipeImportWarning[] {
  return [
    ...checkBounds(textBounds(recipe), ' characters'),
    ...checkBounds(numberBounds(recipe), ''),
  ]
}
