import { Hono } from 'hono'
import { z } from 'zod'
import { createDb } from '../db/client'
import { buildSuccess } from '../lib/response'
import {
  createRecipe,
  deleteRecipe,
  getRecipe,
  listRecipes,
  updateRecipe,
} from '../services/recipeService'

export const recipeRouter = new Hono<{ Bindings: CloudflareBindings }>()

const CuisineInputSchema = z.object({
  id: z.number().int().positive().optional(),
  name: z.string().optional(),
})

const IngredientInputSchema = z.object({
  id: z.number().int().positive().optional(),
  name: z.string().optional(),
  unitId: z.number().int().positive(),
  quantity: z.number().positive(),
  notes: z.string().nullish(),
})

const TagInputSchema = z.object({
  id: z.number().int().positive().optional(),
  name: z.string().optional(),
})

const StepInputSchema = z.object({
  stepNumber: z.number().int().positive(),
  description: z.string().min(1),
  tip: z.string().nullish(),
})

const RecipeSaveSchema = z.object({
  name: z
    .string()
    .min(2, 'Recipe name must be between 2 to 150 characters.')
    .max(150, 'Recipe name must be between 2 to 150 characters.'),
  description: z.string().optional(),
  calories: z.number().int().positive().nullable().optional(),
  servings: z.number().int().positive('Servings must be a more than zero.'),
  cookingTime: z.number().int().min(0, 'Cooking time cannot be negative.'),
  preparationTime: z.number().int().positive('Preparation time cannot be zero minutes.'),
  cuisine: CuisineInputSchema,
  ingredients: z.array(IngredientInputSchema).min(1, 'There must be at least one ingredient.'),
  steps: z.array(StepInputSchema).min(1, 'There must be at least one step.'),
  tags: z.array(TagInputSchema).optional().default([]),
  author: z.string().optional(),
  imageUrl: z.string().nullable().optional(),
})

const RecipeUpdateSchema = z.object({
  name: z.string().min(2).max(150).optional(),
  description: z.string().optional(),
  calories: z.number().int().positive().nullable().optional(),
  servings: z.number().int().positive().optional(),
  cookingTime: z.number().int().min(0).optional(),
  preparationTime: z.number().int().positive().optional(),
  cuisine: CuisineInputSchema.optional(),
  author: z.string().optional(),
  imageUrl: z.string().nullable().optional(),
  ingredients: z.array(IngredientInputSchema).optional(),
  tags: z.array(TagInputSchema).optional(),
  steps: z.array(StepInputSchema).optional(),
})

recipeRouter.get('/', async (c) => {
  const db = createDb(c.env.DATABASE_URL)
  const page = Number(c.req.query('page') ?? 0)
  const limit = Number(c.req.query('limit') ?? 12)
  const data = await listRecipes(db, page, limit)
  return c.json(buildSuccess(200, 'Recipes retrieved', data), 200)
})

recipeRouter.post('/', async (c) => {
  const db = createDb(c.env.DATABASE_URL)
  const body = await c.req.json()
  const input = RecipeSaveSchema.parse(body)
  const data = await createRecipe(db, input)
  return c.json(buildSuccess(201, 'Recipe saved', data), 201, {
    Location: `/recipes/${data.id}`,
  })
})

recipeRouter.get('/:id', async (c) => {
  const db = createDb(c.env.DATABASE_URL)
  const id = Number(c.req.param('id'))
  const data = await getRecipe(db, id)
  return c.json(buildSuccess(200, 'Recipe retrieved', data), 200)
})

recipeRouter.patch('/:id', async (c) => {
  const db = createDb(c.env.DATABASE_URL)
  const id = Number(c.req.param('id'))
  const body = await c.req.json()
  const input = RecipeUpdateSchema.parse(body)
  const data = await updateRecipe(db, id, input)
  return c.json(buildSuccess(200, 'Recipe updated', data), 200)
})

recipeRouter.delete('/:id', async (c) => {
  const db = createDb(c.env.DATABASE_URL)
  const id = Number(c.req.param('id'))
  await deleteRecipe(db, id)
  return c.body(null, 204)
})
