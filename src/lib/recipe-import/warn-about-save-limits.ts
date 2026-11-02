import type { RecipeImportPreview, RecipeImportWarning } from '../types'

export function warnAboutSaveLimits(recipe: RecipeImportPreview['recipe']): RecipeImportWarning[] {
  const warnings: RecipeImportWarning[] = []
  const textFields: [string, string | undefined, number][] = [
    ['recipe.name', recipe.name, 150],
    ['recipe.author', recipe.author, 255],
    ['recipe.imageUrl', recipe.imageUrl, 255],
    ['recipe.cuisine.name', recipe.cuisine?.name, 100],
    ...(recipe.ingredients ?? []).map((ingredient, index): [string, string, number] => [
      `recipe.ingredients[${index}].name`,
      ingredient.name,
      255,
    ]),
    ...(recipe.tags ?? []).map((tag, index): [string, string, number] => [
      `recipe.tags[${index}].name`,
      tag.name,
      100,
    ]),
  ]
  for (const [field, value, maximum] of textFields) {
    if (value !== undefined && value.length > maximum) {
      warnings.push({
        code: 'SAVE_LIMIT_EXCEEDED',
        field,
        message: `This value exceeds the ${maximum}-character save limit. Shorten it before saving; the imported text has been preserved.`,
      })
    }
  }

  const numberFields: [string, number | null | undefined][] = [
    ['recipe.servings', recipe.servings],
    ['recipe.cookingTime', recipe.cookingTime],
    ['recipe.preparationTime', recipe.preparationTime],
    ...(recipe.steps ?? []).map((step, index): [string, number] => [
      `recipe.steps[${index}].stepNumber`,
      step.stepNumber,
    ]),
  ]
  for (const [field, value] of numberFields) {
    if (value != null && value > 32767) {
      warnings.push({
        code: 'SAVE_LIMIT_EXCEEDED',
        field,
        message:
          'This value exceeds the save limit of 32767. Review it before saving; the imported number has been preserved.',
      })
    }
  }
  return warnings
}
