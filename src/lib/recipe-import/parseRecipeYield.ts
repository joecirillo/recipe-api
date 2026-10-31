import type { RecipeImportWarning } from '../types'
import { plainText } from './plainText'

type ParsedYield = {
  originalYield: string | null
  servings?: number
  warning?: RecipeImportWarning
}

function positiveInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0
}

export function parseRecipeYield(value: unknown): ParsedYield {
  if (value == null) return { originalYield: null }

  const originalYield =
    typeof value === 'string'
      ? value
      : typeof value === 'number' && Number.isFinite(value)
        ? String(value)
        : null
  const text = originalYield === null ? '' : plainText(originalYield).trim()
  const count =
    /^(?:(?:serves|servings?)\s*:?\s*)?(\d+)(?:\s*(?:servings?|people|persons?))?$/i.exec(text)
  if (count && positiveInteger(Number(count[1]))) {
    return { originalYield, servings: Number(count[1]) }
  }

  const range =
    /^(?:(?:serves|servings?)\s*:?\s*)?(\d+)\s*(?:[-–—]|to)\s*(\d+)(?:\s*(?:servings?|people|persons?))?$/i.exec(
      text,
    )
  if (range) {
    const lower = Number(range[1])
    const upper = Number(range[2])
    if (positiveInteger(lower) && positiveInteger(upper) && lower <= upper) {
      return {
        originalYield,
        servings: lower,
        warning: {
          code: 'AMBIGUOUS_YIELD',
          field: 'recipeYield',
          message: `The source gives a range of ${lower}–${upper} servings. Review the selected lower value.`,
        },
      }
    }
  }

  return {
    originalYield,
    warning: {
      code: 'UNSUPPORTED_YIELD',
      field: 'recipeYield',
      message:
        'The source yield is not a positive serving count. Review the original yield and enter servings if known.',
    },
  }
}
