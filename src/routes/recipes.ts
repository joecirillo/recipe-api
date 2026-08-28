import { Hono } from 'hono'
import { z } from 'zod'
import { createDb } from '../db/client'
import { buildSuccess } from '../lib/response'
import { BadRequestError } from '../errors'
import { toStorageKey, withPublicImageUrl } from '../lib/image-url'
import { requestLogger } from '../middleware/request-logger'
import {
  createRecipe,
  deleteRecipe,
  getRecipe,
  listRecipes,
  searchRecipes,
  updateRecipe,
} from '../services/recipeService'

export const recipeRouter = new Hono<{ Bindings: CloudflareBindings }>()

const CuisineInputSchema = z
  .object({
    id: z.number().int().positive().nullish(),
    name: z.string().optional(),
  })
  .refine((c) => c.id != null || (c.name?.trim().length ?? 0) > 0, {
    message: 'Cuisine request must have either an ID or a name.',
  })

const IngredientInputSchema = z
  .object({
    id: z.number().int().positive().nullish(),
    name: z.string().optional(),
    unitId: z.number().int().positive(),
    quantity: z.number().positive(),
    notes: z.string().nullish(),
  })
  .refine((i) => i.id != null || (i.name?.trim().length ?? 0) > 0, {
    message: 'Ingredient request must have either an ID or a name.',
  })

const TagInputSchema = z
  .object({
    id: z.number().int().positive().nullish(),
    name: z.string().optional(),
  })
  .refine((t) => t.id != null || (t.name?.trim().length ?? 0) > 0, {
    message: 'Tag request must have either an ID or a name.',
  })

const StepInputSchema = z.object({
  stepNumber: z.number().int().positive(),
  description: z.string().min(1),
  tip: z.string().nullish(),
  // imageUrl is intentionally excluded: step images cannot be set through the Recipe
  // endpoint. The field is readable on GET responses but is managed separately.
})

const RecipeSaveSchema = z.object({
  name: z
    .string()
    .min(2, 'Recipe name must be between 2 to 150 characters.')
    .max(150, 'Recipe name must be between 2 to 150 characters.'),
  description: z.string().nullable().optional(),
  calories: z.number({ error: 'Calories is required and cannot be null.' }).int().min(0).max(32767),
  servings: z.number().int().positive('Servings must be a more than zero.').max(32767),
  cookingTime: z.number().int().min(0, 'Cooking time cannot be negative.').max(32767),
  preparationTime: z.number().int().positive('Preparation time cannot be zero minutes.').max(32767),
  cuisine: CuisineInputSchema,
  ingredients: z.array(IngredientInputSchema).min(1, 'There must be at least one ingredient.'),
  steps: z.array(StepInputSchema).min(1, 'There must be at least one step.'),
  tags: z.array(TagInputSchema).optional().default([]),
  author: z.string().max(255).default(''),
  imageUrl: z.string().max(255).nullable().optional(),
})

const RecipeUpdateSchema = z.object({
  name: z
    .string()
    .min(2, 'Recipe name must be between 2 to 150 characters.')
    .max(150, 'Recipe name must be between 2 to 150 characters.')
    .optional(),
  description: z.string().nullable().optional(),
  calories: z.number({ error: 'Calories cannot be null.' }).int().min(0).max(32767).optional(),
  servings: z.number().int().positive().max(32767).optional(),
  cookingTime: z.number().int().min(0).max(32767).optional(),
  preparationTime: z.number().int().positive().max(32767).optional(),
  cuisine: CuisineInputSchema.optional(),
  author: z.string().max(255).optional(),
  imageUrl: z.string().max(255).nullable().optional(),
  ingredients: z.array(IngredientInputSchema).min(1).optional(),
  tags: z.array(TagInputSchema).optional(),
  steps: z.array(StepInputSchema).min(1).optional(),
})

recipeRouter.get('/', async (c) => {
  const db = createDb(c.env.HYPERDRIVE.connectionString)

  const name = c.req.query('name')
  const tag = c.req.query('tag')
  const cuisine = c.req.query('cuisine')
  const ingredient = c.req.query('ingredient')
  const tagIdRaw = c.req.query('tagId')
  const cuisineIdRaw = c.req.query('cuisineId')
  const ingredientIdRaw = c.req.query('ingredientId')

  if (tagIdRaw !== undefined && isNaN(Number(tagIdRaw))) {
    throw new BadRequestError('Invalid tagId')
  }
  if (cuisineIdRaw !== undefined && isNaN(Number(cuisineIdRaw))) {
    throw new BadRequestError('Invalid cuisineId')
  }
  if (ingredientIdRaw !== undefined && isNaN(Number(ingredientIdRaw))) {
    throw new BadRequestError('Invalid ingredientId')
  }

  const tagId = tagIdRaw !== undefined ? Number(tagIdRaw) : undefined
  const cuisineId = cuisineIdRaw !== undefined ? Number(cuisineIdRaw) : undefined
  const ingredientId = ingredientIdRaw !== undefined ? Number(ingredientIdRaw) : undefined

  // Use !== undefined rather than truthiness: id=0 is valid and falsy,
  // blank text params are handled by searchRecipes itself via .trim().
  const hasFilter =
    name !== undefined ||
    tag !== undefined ||
    cuisine !== undefined ||
    ingredient !== undefined ||
    tagId !== undefined ||
    cuisineId !== undefined ||
    ingredientId !== undefined

  if (hasFilter) {
    const data = await searchRecipes(db, {
      name,
      tag,
      cuisine,
      ingredient,
      tagId,
      cuisineId,
      ingredientId,
    })
    return c.json(
      buildSuccess(
        200,
        'Recipes queried',
        data.map((r) => withPublicImageUrl(r, c.env.R2_PUBLIC_URL)),
      ),
      200,
    )
  }

  const page = Number(c.req.query('page') ?? 0)
  const limit = Number(c.req.query('limit') ?? 12)
  if (isNaN(page) || isNaN(limit)) {
    throw new BadRequestError('Invalid page or limit')
  }
  const data = await listRecipes(db, page, limit)
  return c.json(
    buildSuccess(
      200,
      'Recipes retrieved',
      data.map((r) => withPublicImageUrl(r, c.env.R2_PUBLIC_URL)),
    ),
    200,
  )
})

recipeRouter.post('/', requestLogger('recipe upload'), async (c) => {
  const db = createDb(c.env.HYPERDRIVE.connectionString)
  const body = await c.req.json()
  const input = RecipeSaveSchema.parse(body)
  if (input.imageUrl) input.imageUrl = toStorageKey(input.imageUrl, c.env.R2_PUBLIC_URL)
  const data = await createRecipe(db, input)
  return c.json(
    buildSuccess(201, 'Recipe saved', withPublicImageUrl(data, c.env.R2_PUBLIC_URL)),
    201,
    {
      Location: `/recipes/${data.id}`,
    },
  )
})

recipeRouter.get('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  if (isNaN(id)) throw new BadRequestError('Invalid recipe id')
  const db = createDb(c.env.HYPERDRIVE.connectionString)
  const data = await getRecipe(db, id)
  return c.json(
    buildSuccess(200, 'Recipe retrieved', withPublicImageUrl(data, c.env.R2_PUBLIC_URL)),
    200,
  )
})

recipeRouter.patch('/:id', requestLogger('recipe save'), async (c) => {
  const id = Number(c.req.param('id'))
  if (isNaN(id)) throw new BadRequestError('Invalid recipe id')
  const db = createDb(c.env.HYPERDRIVE.connectionString)
  const body = await c.req.json()
  const input = RecipeUpdateSchema.parse(body)
  if (input.imageUrl) input.imageUrl = toStorageKey(input.imageUrl, c.env.R2_PUBLIC_URL)
  const data = await updateRecipe(db, id, input)
  return c.json(
    buildSuccess(200, 'Recipe updated', withPublicImageUrl(data, c.env.R2_PUBLIC_URL)),
    200,
  )
})

recipeRouter.delete('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  if (isNaN(id)) throw new BadRequestError('Invalid recipe id')
  const db = createDb(c.env.HYPERDRIVE.connectionString)
  await deleteRecipe(db, id)
  return c.body(null, 204)
})
