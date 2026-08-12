import { and, eq, ilike, inArray, type SQL } from 'drizzle-orm'
import { createDb } from '../db/client'
import {
  cuisines,
  ingredients,
  recipes,
  recipeIngredients,
  recipeInstructionSteps,
  recipeTags,
  tags,
} from '../db/schema'
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
  description: string
  calories?: number | null
  servings: number
  cookingTime: number
  preparationTime: number
  cuisine: CuisineInput
  ingredients: IngredientInput[]
  steps: StepInput[]
  tags?: TagInput[]
  author: string
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

export type RecipeSearchParams = {
  name?: string
  tag?: string
  cuisine?: string
  ingredient?: string
  tagId?: number
  cuisineId?: number
  ingredientId?: number
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

// Deduplicates by resolved entity ID, matching the Java RecipeServiceImpl behaviour.
async function resolveUniqueTags(db: Db, tagInputs: TagInput[]) {
  const seen = new Set<number>()
  const resolved = []
  for (const t of tagInputs) {
    const tag = await resolveTag(db, t.id, t.name)
    if (!seen.has(tag.id)) {
      seen.add(tag.id)
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

export async function searchRecipes(
  db: Db,
  params: RecipeSearchParams,
): Promise<RecipeListItem[]> {
  const conditions: SQL[] = []

  if (params.name) {
    conditions.push(ilike(recipes.name, `%${params.name}%`))
  }
  if (params.cuisineId) {
    conditions.push(eq(recipes.cuisineId, params.cuisineId))
  }
  if (params.cuisine) {
    const cuisineSub = db
      .select({ id: cuisines.id })
      .from(cuisines)
      .where(ilike(cuisines.name, `%${params.cuisine}%`))
    conditions.push(inArray(recipes.cuisineId, cuisineSub))
  }
  if (params.tagId) {
    const tagSub = db
      .select({ recipeId: recipeTags.recipeId })
      .from(recipeTags)
      .where(eq(recipeTags.tagId, params.tagId))
    conditions.push(inArray(recipes.id, tagSub))
  }
  if (params.tag) {
    const matchingTagIds = db
      .select({ id: tags.id })
      .from(tags)
      .where(ilike(tags.name, `%${params.tag}%`))
    const tagSub = db
      .select({ recipeId: recipeTags.recipeId })
      .from(recipeTags)
      .where(inArray(recipeTags.tagId, matchingTagIds))
    conditions.push(inArray(recipes.id, tagSub))
  }
  if (params.ingredientId) {
    const ingSub = db
      .select({ recipeId: recipeIngredients.recipeId })
      .from(recipeIngredients)
      .where(eq(recipeIngredients.ingredientId, params.ingredientId))
    conditions.push(inArray(recipes.id, ingSub))
  }
  if (params.ingredient) {
    const matchingIngIds = db
      .select({ id: ingredients.id })
      .from(ingredients)
      .where(ilike(ingredients.name, `%${params.ingredient}%`))
    const ingSub = db
      .select({ recipeId: recipeIngredients.recipeId })
      .from(recipeIngredients)
      .where(inArray(recipeIngredients.ingredientId, matchingIngIds))
    conditions.push(inArray(recipes.id, ingSub))
  }

  const rows = await db
    .select({ id: recipes.id, name: recipes.name, imageUrl: recipes.imageUrl })
    .from(recipes)
    .where(conditions.length ? and(...conditions) : undefined)

  return rows.map((r) => ({ id: r.id, name: r.name, imageUrl: r.imageUrl ?? null }))
}

export async function getRecipe(db: Db, id: number): Promise<RecipeResponse> {
  return fetchFullRecipe(db, id)
}

export async function createRecipe(db: Db, input: RecipeSaveInput): Promise<RecipeResponse> {
  const recipeId = await db.transaction(async (tx) => {
    // tx is structurally compatible with Db; cast required due to Drizzle's type hierarchy
    const txDb = tx as unknown as Db

    const cuisine = await resolveCuisine(txDb, input.cuisine.id, input.cuisine.name)
    const uniqueTags = await resolveUniqueTags(txDb, input.tags ?? [])

    const now = new Date()
    const [recipe] = await tx
      .insert(recipes)
      .values({
        name: input.name,
        description: input.description,
        cuisineId: cuisine.id,
        author: input.author,
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
      const [ingredient, unit] = await Promise.all([
        resolveIngredient(txDb, ing.id, ing.name),
        resolveUnit(txDb, ing.unitId),
      ])
      await tx.insert(recipeIngredients).values({
        recipeId: recipe.id,
        ingredientId: ingredient.id,
        unitId: unit.id,
        quantity: String(ing.quantity),
        notes: ing.notes,
      })
    }

    for (const tag of uniqueTags) {
      await tx.insert(recipeTags).values({ recipeId: recipe.id, tagId: tag.id })
    }

    for (const step of input.steps) {
      await tx.insert(recipeInstructionSteps).values({
        recipeId: recipe.id,
        stepNumber: step.stepNumber,
        description: step.description,
        tip: step.tip,
      })
    }

    return recipe.id
  })

  return fetchFullRecipe(db, recipeId)
}

export async function updateRecipe(
  db: Db,
  id: number,
  input: RecipeUpdateInput,
): Promise<RecipeResponse> {
  await db.transaction(async (tx) => {
    // tx is structurally compatible with Db; cast required due to Drizzle's type hierarchy
    const txDb = tx as unknown as Db

    const existing = await tx.query.recipes.findFirst({ where: eq(recipes.id, id) })
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
      const cuisine = await resolveCuisine(txDb, input.cuisine.id, input.cuisine.name)
      patch.cuisineId = cuisine.id
    }

    await tx.update(recipes).set(patch).where(eq(recipes.id, id))

    if (input.ingredients !== undefined) {
      await tx.delete(recipeIngredients).where(eq(recipeIngredients.recipeId, id))
      for (const ing of input.ingredients) {
        const [ingredient, unit] = await Promise.all([
          resolveIngredient(txDb, ing.id, ing.name),
          resolveUnit(txDb, ing.unitId),
        ])
        await tx.insert(recipeIngredients).values({
          recipeId: id,
          ingredientId: ingredient.id,
          unitId: unit.id,
          quantity: String(ing.quantity),
          notes: ing.notes,
        })
      }
    }

    if (input.tags !== undefined) {
      await tx.delete(recipeTags).where(eq(recipeTags.recipeId, id))
      const uniqueTags = await resolveUniqueTags(txDb, input.tags)
      for (const tag of uniqueTags) {
        await tx.insert(recipeTags).values({ recipeId: id, tagId: tag.id })
      }
    }

    if (input.steps !== undefined) {
      await tx.delete(recipeInstructionSteps).where(eq(recipeInstructionSteps.recipeId, id))
      for (const step of input.steps) {
        await tx.insert(recipeInstructionSteps).values({
          recipeId: id,
          stepNumber: step.stepNumber,
          description: step.description,
          tip: step.tip,
        })
      }
    }
  })

  return fetchFullRecipe(db, id)
}

export async function deleteRecipe(db: Db, id: number): Promise<void> {
  const existing = await db.query.recipes.findFirst({ where: eq(recipes.id, id) })
  if (!existing) throw new NotFoundError(`Recipe not found with id: ${id}`)
  await db.delete(recipes).where(eq(recipes.id, id))
}
