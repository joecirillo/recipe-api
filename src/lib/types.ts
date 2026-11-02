export type NamedEntityResponse = { id: number; name: string }

export type RecipeImportWarning = {
  code:
    | 'INVALID_FIELD'
    | 'INVALID_DURATION'
    | 'AMBIGUOUS_YIELD'
    | 'UNSUPPORTED_YIELD'
    | 'INVALID_IMAGE_URL'
    | 'MULTIPLE_RECIPES'
    | 'SAVE_LIMIT_EXCEEDED'
  field?: string
  message: string
}

export type RecipeImportPreview = {
  recipe: {
    name?: string
    description?: string
    cookingTime?: number | null
    preparationTime?: number | null
    servings?: number
    cuisine?: { id: null; name: string }
    tags?: { id: null; name: string }[]
    author?: string
    imageUrl?: string
    ingredients?: {
      id: null
      name: string
      quantity: number | null
      unitId: number | null
      notes: string | null
    }[]
    steps?: { stepNumber: number; description: string; tip: string | null }[]
  }
  source: {
    sourceUrl: string
    originalAuthor: string | null
    originalIngredientLines: string[]
    originalYield: string | null
    recipeCount: number
  }
  warnings: RecipeImportWarning[]
}
