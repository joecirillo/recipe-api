import { eq } from 'drizzle-orm'
import { createDb } from '../db/client'
import { recipes, recipeIngredients, recipeTags, recipeInstructionSteps } from '../db/schema'
import { NotFoundError } from '../errors'
import { resolveCuisine } from './cuisineService'
import { resolveIngredient } from './ingredientService'
import { resolveTag } from './tagService'
import { resolveUnit } from './unitService'

type Db = ReturnType<typeof createDb>

export type CuisineInput = { id?: number; name?: string }
export type IngredientInput = {
  id?: number
  name?: string
  unitId: number
  quantity: number
  notes?: string | null
}
export type TagInput = { id?: number; name?: string }
export type StepInput = { stepNumber: number; description: string; tip?: string | null }

export type RecipeSaveInput = {
  name: string
  description?: string
  calories?: number | null
  servings: number
  cookingTime: number
  preparationTime: number
  cuisine: CuisineInput
  ingredients: IngredientInput[]
  steps: StepInput[]
  tags?: TagInput[]
  author?: string
  imageUrl?: string | null
}

export type RecipeUpdateInput = {
  name?: string
  description?: string
  calories?: number | null
  servings?: number
  cookingTime?: number
  preparationTime?: number
  cuisine?: CuisineInput
  author?: string
  imageUrl?: string | null
  ingredients?: IngredientInput[]
  tags?: TagInput[]
  steps?: StepInput[]
}

export type RecipeListItem = { id: number; name: string; imageUrl: string | null }

export type RecipeIngredientResponse = {
  id: number
  name: string
  unitId: number
  unitName: string
  abbreviation: string | null
  quantity: number
  notes: string | null
}

export type RecipeTagResponse = {
  recipeTagId: number
  id: number
  name: string
}

export type RecipeStepResponse = {
  stepId: number
  stepNumber: number
  description: string
  tip: string | null
  imageUrl: string | null
}

export type RecipeResponse = {
  id: number
  name: string
  description: string
  cuisine: { id: number; name: string }
  author: string
  calories: number | null
  servings: number
  cookingTime: number
  preparationTime: number
  imageUrl: string | null
  createdAt: Date
  updatedAt: Date
  ingredients: RecipeIngredientResponse[]
  tags: RecipeTagResponse[]
  steps: RecipeStepResponse[]
}

async function resolveUniqueTags(db: Db, tagInputs: TagInput[]) {
  const seen = new Set<string>()
  const resolved = []
  for (const t of tagInputs) {
    const tag = await resolveTag(db, t.id, t.name)
    const key = tag.name.toLowerCase().trim()
    if (!seen.has(key)) {
      seen.add(key)
      resolved.push(tag)
    }
  }
  return resolved
}

async function fetchFullRecipe(db: Db, id: number): Promise<RecipeResponse> {
  const row = await db.query.recipes.findFirst({
    where: eq(recipes.id, id),
    with: {
      cuisine: true,
      ingredients: {
        with: { ingredient: true, unit: true },
      },
      tags: {
        with: { tag: true },
      },
      steps: {
        orderBy: (steps, { asc }) => [asc(steps.stepNumber)],
      },
    },
  })

  if (!row) throw new NotFoundError(`Recipe not found with id: ${id}`)

  return {
    id: row.id,
    name: row.name,
    description: row.description,
    cuisine: { id: row.cuisine.id, name: row.cuisine.name },
    author: row.author,
    calories: row.calories ?? null,
    servings: row.servings,
    cookingTime: row.cookingTime,
    preparationTime: row.preparationTime,
    imageUrl: row.imageUrl ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    ingredients: row.ingredients.map((ri) => ({
      id: ri.ingredient.id,
      name: ri.ingredient.name,
      unitId: ri.unitId,
      unitName: ri.unit.name,
      abbreviation: ri.unit.abbreviation ?? null,
      quantity: parseFloat(ri.quantity),
      notes: ri.notes ?? null,
    })),
    tags: row.tags.map((rt) => ({
      recipeTagId: rt.id,
      id: rt.tag.id,
      name: rt.tag.name,
    })),
    steps: row.steps.map((s) => ({
      stepId: s.id,
      stepNumber: s.stepNumber,
      description: s.description,
      tip: s.tip ?? null,
      imageUrl: s.imageUrl ?? null,
    })),
  }
}

export async function listRecipes(db: Db, page: number, limit: number): Promise<RecipeListItem[]> {
  const rows = await db
    .select({ id: recipes.id, name: recipes.name, imageUrl: recipes.imageUrl })
    .from(recipes)
    .limit(limit)
    .offset(page * limit)
  return rows.map((r) => ({ id: r.id, name: r.name, imageUrl: r.imageUrl ?? null }))
}

export async function getRecipe(db: Db, id: number): Promise<RecipeResponse> {
  return fetchFullRecipe(db, id)
}

export async function createRecipe(db: Db, input: RecipeSaveInput): Promise<RecipeResponse> {
  const cuisine = await resolveCuisine(db, input.cuisine.id, input.cuisine.name)
  const uniqueTags = await resolveUniqueTags(db, input.tags ?? [])

  const now = new Date()
  const [recipe] = await db
    .insert(recipes)
    .values({
      name: input.name,
      description: input.description ?? '',
      cuisineId: cuisine.id,
      author: input.author ?? '',
      calories: input.calories,
      servings: input.servings,
      cookingTime: input.cookingTime,
      preparationTime: input.preparationTime,
      imageUrl: input.imageUrl,
      createdAt: now,
      updatedAt: now,
    })
    .returning()

  for (const ing of input.ingredients) {
    const ingredient = await resolveIngredient(db, ing.id, ing.name)
    const unit = await resolveUnit(db, ing.unitId)
    await db.insert(recipeIngredients).values({
      recipeId: recipe.id,
      ingredientId: ingredient.id,
      unitId: unit.id,
      quantity: String(ing.quantity),
      notes: ing.notes,
    })
  }

  for (const tag of uniqueTags) {
    await db.insert(recipeTags).values({ recipeId: recipe.id, tagId: tag.id })
  }

  for (const step of input.steps) {
    await db.insert(recipeInstructionSteps).values({
      recipeId: recipe.id,
      stepNumber: step.stepNumber,
      description: step.description,
      tip: step.tip,
    })
  }

  return fetchFullRecipe(db, recipe.id)
}

export async function updateRecipe(
  db: Db,
  id: number,
  input: RecipeUpdateInput,
): Promise<RecipeResponse> {
  const existing = await db.query.recipes.findFirst({ where: eq(recipes.id, id) })
  if (!existing) throw new NotFoundError(`Recipe not found with id: ${id}`)

  // updatedAt is always set explicitly on PATCH, as required by the spec.
  // Note: unlike the Java source (which ignores null fields), null here nullifies
  // nullable columns (calories, imageUrl). Non-nullable columns cannot be set to null.
  const patch: Record<string, unknown> = { updatedAt: new Date() }

  if (input.name !== undefined) patch.name = input.name
  if (input.description !== undefined) patch.description = input.description
  if (input.author !== undefined) patch.author = input.author
  if (input.calories !== undefined) patch.calories = input.calories
  if (input.servings !== undefined) patch.servings = input.servings
  if (input.cookingTime !== undefined) patch.cookingTime = input.cookingTime
  if (input.preparationTime !== undefined) patch.preparationTime = input.preparationTime
  if (input.imageUrl !== undefined) patch.imageUrl = input.imageUrl

  if (input.cuisine !== undefined) {
    const cuisine = await resolveCuisine(db, input.cuisine.id, input.cuisine.name)
    patch.cuisineId = cuisine.id
  }

  await db.update(recipes).set(patch).where(eq(recipes.id, id))

  if (input.ingredients !== undefined) {
    await db.delete(recipeIngredients).where(eq(recipeIngredients.recipeId, id))
    for (const ing of input.ingredients) {
      const ingredient = await resolveIngredient(db, ing.id, ing.name)
      const unit = await resolveUnit(db, ing.unitId)
      await db.insert(recipeIngredients).values({
        recipeId: id,
        ingredientId: ingredient.id,
        unitId: unit.id,
        quantity: String(ing.quantity),
        notes: ing.notes,
      })
    }
  }

  if (input.tags !== undefined) {
    await db.delete(recipeTags).where(eq(recipeTags.recipeId, id))
    const uniqueTags = await resolveUniqueTags(db, input.tags)
    for (const tag of uniqueTags) {
      await db.insert(recipeTags).values({ recipeId: id, tagId: tag.id })
    }
  }

  if (input.steps !== undefined) {
    await db.delete(recipeInstructionSteps).where(eq(recipeInstructionSteps.recipeId, id))
    for (const step of input.steps) {
      await db.insert(recipeInstructionSteps).values({
        recipeId: id,
        stepNumber: step.stepNumber,
        description: step.description,
        tip: step.tip,
      })
    }
  }

  return fetchFullRecipe(db, id)
}

export async function deleteRecipe(db: Db, id: number): Promise<void> {
  const existing = await db.query.recipes.findFirst({ where: eq(recipes.id, id) })
  if (!existing) throw new NotFoundError(`Recipe not found with id: ${id}`)
  await db.delete(recipes).where(eq(recipes.id, id))
}
