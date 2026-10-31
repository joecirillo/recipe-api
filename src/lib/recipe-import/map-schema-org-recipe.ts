import { parseDurationMinutes } from '../duration'
import type { RecipeImportPreview, RecipeImportWarning } from '../types'
import type { ExtractedRecipeJsonLd } from './extract-recipe-json-ld'
import { parseRecipeYield } from './parse-recipe-yield'
import { plainText } from './plain-text'

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function hasType(value: Record<string, unknown>, name: string): boolean {
  const types = Array.isArray(value['@type']) ? value['@type'] : [value['@type']]
  return types.some(
    (type) =>
      type === name ||
      type === `https://schema.org/${name}` ||
      type === `http://schema.org/${name}`,
  )
}

function reject(warnings: RecipeImportWarning[], field: string, message: string): void {
  warnings.push({ code: 'INVALID_FIELD', field, message })
}

function readText(
  value: unknown,
  field: string,
  warnings: RecipeImportWarning[],
): string | undefined {
  if (value == null) return undefined
  if (typeof value === 'string') {
    const text = plainText(value)
    if (text) return text
  }
  reject(warnings, field, 'Expected nonempty text. Review and enter this field manually if needed.')
  return undefined
}

function readStrings(value: unknown, field: string, warnings: RecipeImportWarning[]): string[] {
  if (value == null) return []
  if (!Array.isArray(value)) {
    const text = readText(value, field, warnings)
    return text ? [text] : []
  }
  return value.flatMap((entry, index) => {
    const path = `${field}[${index}]`
    if (entry == null) {
      reject(warnings, path, 'Ignored an empty entry. Review the remaining values.')
      return []
    }
    const text = readText(entry, path, warnings)
    return text ? [text] : []
  })
}

function mapIngredients(
  value: unknown,
  warnings: RecipeImportWarning[],
): {
  ingredients: NonNullable<RecipeImportPreview['recipe']['ingredients']>
  originalIngredientLines: string[]
} {
  const originalIngredientLines: string[] = []
  if (value != null && !Array.isArray(value)) {
    reject(
      warnings,
      'recipeIngredient',
      'Expected a list of ingredient lines. Enter ingredients manually.',
    )
  }
  const ingredients = Array.isArray(value)
    ? value.flatMap((line, index) => {
        if (typeof line !== 'string' || !line.trim()) {
          reject(
            warnings,
            `recipeIngredient[${index}]`,
            'Ignored an invalid ingredient line. Review the ingredient list.',
          )
          return []
        }
        originalIngredientLines.push(line)
        return [{ id: null, name: line, quantity: null, unitId: null, notes: null }]
      })
    : []
  return { ingredients, originalIngredientLines }
}

function mapInstructions(
  value: unknown,
  warnings: RecipeImportWarning[],
): NonNullable<RecipeImportPreview['recipe']['steps']> {
  const descriptions: string[] = []
  const pending = value == null ? [] : [{ value, field: 'recipeInstructions' }]
  while (pending.length) {
    const entry = pending.pop()!
    const { value: instruction, field } = entry
    if (Array.isArray(instruction)) {
      for (let index = instruction.length - 1; index >= 0; index--) {
        pending.push({ value: instruction[index], field: `${field}[${index}]` })
      }
    } else if (typeof instruction === 'string') {
      const text = readText(instruction, field, warnings)
      if (text) descriptions.push(text)
    } else if (isObject(instruction) && hasType(instruction, 'HowToSection')) {
      if (Array.isArray(instruction.itemListElement)) {
        pending.push({ value: instruction.itemListElement, field: `${field}.itemListElement` })
      } else {
        reject(
          warnings,
          `${field}.itemListElement`,
          'Expected a list of section steps. Add any missing instructions manually.',
        )
      }
    } else if (isObject(instruction) && hasType(instruction, 'HowToStep')) {
      const text = readText(instruction.text, `${field}.text`, warnings)
      if (text) descriptions.push(text)
      else if (instruction.text == null) {
        reject(
          warnings,
          `${field}.text`,
          'This step has no text. Add the missing instruction manually.',
        )
      }
    } else {
      reject(
        warnings,
        field,
        'Ignored an unsupported instruction. Review the step sequence for missing instructions.',
      )
    }
  }
  return descriptions.map((description, index) => ({
    stepNumber: index + 1,
    description,
    tip: null,
  }))
}

function mapAuthor(value: unknown, warnings: RecipeImportWarning[]): string | undefined {
  if (value == null) return undefined
  const entries = Array.isArray(value) ? value : [value]
  for (const [index, entry] of entries.entries()) {
    const field = Array.isArray(value) ? `author[${index}]` : 'author'
    if (typeof entry === 'string') {
      const name = readText(entry, field, warnings)
      if (name) return name
    } else if (isObject(entry) && (hasType(entry, 'Person') || hasType(entry, 'Organization'))) {
      const name = readText(entry.name, `${field}.name`, warnings)
      if (name) return name
      if (entry.name == null)
        reject(warnings, `${field}.name`, 'The author has no name. Enter attribution if known.')
    } else {
      reject(warnings, field, 'Ignored an unsupported author. Enter the original author if known.')
    }
  }
  return undefined
}

function httpUrl(value: unknown, baseUrl: string): string | undefined {
  if (typeof value !== 'string' || !value.trim()) return undefined
  try {
    const url = new URL(value.trim(), baseUrl)
    if (['https:', 'http:'].includes(url.protocol) && !url.username && !url.password)
      return url.href
  } catch (error) {
    if (!(error instanceof TypeError)) throw error
  }
  return undefined
}

function mapImage(
  value: unknown,
  sourceUrl: string,
  warnings: RecipeImportWarning[],
): string | undefined {
  if (value == null) return undefined
  const entries = Array.isArray(value) ? value : [value]
  for (const [index, entry] of entries.entries()) {
    const field = Array.isArray(value) ? `image[${index}]` : 'image'
    const candidates =
      isObject(entry) && hasType(entry, 'ImageObject')
        ? [
            { value: entry.url, field: `${field}.url` },
            { value: entry.contentUrl, field: `${field}.contentUrl` },
          ].filter((candidate) => candidate.value != null)
        : [{ value: entry, field }]
    if (!candidates.length) candidates.push({ value: undefined, field })
    for (const candidate of candidates) {
      const url = httpUrl(candidate.value, sourceUrl)
      if (url) return url
      warnings.push({
        code: 'INVALID_IMAGE_URL',
        field: candidate.field,
        message:
          'Ignored an unusable image URL. Choose an HTTP(S) image without embedded credentials or leave the image empty.',
      })
    }
  }
  return undefined
}

function mapDuration(
  value: unknown,
  field: string,
  warnings: RecipeImportWarning[],
): number | null {
  const minutes = parseDurationMinutes(value)
  if (value != null && minutes === null) {
    warnings.push({
      code: 'INVALID_DURATION',
      field,
      message: 'Could not read this duration. Enter the time in minutes if known.',
    })
  }
  return minutes
}

function mapTags(
  node: Record<string, unknown>,
  warnings: RecipeImportWarning[],
): { id: null; name: string }[] {
  const keywords = readStrings(node.keywords, 'keywords', warnings).flatMap((text) =>
    text.split(','),
  )
  const categories = readStrings(node.recipeCategory, 'recipeCategory', warnings)
  const names = new Map<string, string>()
  for (const value of [...keywords, ...categories]) {
    const name = value.trim()
    if (name && !names.has(name.toLowerCase())) names.set(name.toLowerCase(), name)
  }
  return [...names.values()].map((name) => ({ id: null, name }))
}

export function mapSchemaOrgRecipe(
  extracted: ExtractedRecipeJsonLd,
  context: { sourceUrl: string },
): RecipeImportPreview {
  const node = extracted.recipe
  const warnings: RecipeImportWarning[] = []
  const recipe: RecipeImportPreview['recipe'] = {}
  if (extracted.recipeCount > 1) {
    warnings.push({
      code: 'MULTIPLE_RECIPES',
      message: `Found ${extracted.recipeCount} recipes. Review the first selected recipe before saving.`,
    })
  }

  const name = readText(node.name, 'name', warnings)
  const description = readText(node.description, 'description', warnings)
  const author = mapAuthor(node.author, warnings)
  const imageUrl = mapImage(node.image, context.sourceUrl, warnings)
  const cuisines = readStrings(node.recipeCuisine, 'recipeCuisine', warnings)
  const yieldResult = parseRecipeYield(node.recipeYield)
  const { ingredients, originalIngredientLines } = mapIngredients(node.recipeIngredient, warnings)
  if (yieldResult.warning) warnings.push(yieldResult.warning)

  if (name !== undefined) recipe.name = name
  if (description !== undefined) recipe.description = description
  if (author !== undefined) recipe.author = author
  if (imageUrl !== undefined) recipe.imageUrl = imageUrl
  if (yieldResult.servings !== undefined) recipe.servings = yieldResult.servings
  if (cuisines.length) recipe.cuisine = { id: null, name: cuisines[0] }
  recipe.cookingTime = mapDuration(node.cookTime, 'cookTime', warnings)
  recipe.preparationTime = mapDuration(node.prepTime, 'prepTime', warnings)
  recipe.ingredients = ingredients
  recipe.steps = mapInstructions(node.recipeInstructions, warnings)
  recipe.tags = mapTags(node, warnings)

  return {
    recipe,
    source: {
      sourceUrl: context.sourceUrl,
      originalAuthor: author ?? null,
      originalIngredientLines,
      originalYield: yieldResult.originalYield,
      recipeCount: extracted.recipeCount,
    },
    warnings,
  }
}
