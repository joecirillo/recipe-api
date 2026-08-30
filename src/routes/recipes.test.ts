import { Hono } from 'hono'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { authMiddleware } from '../middleware/auth'
import { errorHandler } from '../middleware/error-handler'
import { NotFoundError } from '../errors'
import * as recipeService from '../services/recipeService'
import { recipeRouter } from './recipes'

vi.mock('../db/client', () => ({ createDb: vi.fn(() => ({})) }))
vi.mock('../services/recipeService')

type TestBindings = {
  USER_API_KEY: string
  ADMIN_API_KEY: string
  HYPERDRIVE: { connectionString: string }
  IMAGE_BUCKET: R2Bucket
  R2_PUBLIC_URL: string
}

const USER_KEY = 'test-user-key'
const ADMIN_KEY = 'test-admin-key'
const TEST_ENV: TestBindings = {
  USER_API_KEY: USER_KEY,
  ADMIN_API_KEY: ADMIN_KEY,
  HYPERDRIVE: { connectionString: 'postgresql://test' },
  IMAGE_BUCKET: {} as unknown as R2Bucket,
  R2_PUBLIC_URL: 'https://pub-test.r2.dev',
}

const SAMPLE_LIST_ITEMS: recipeService.RecipeListItem[] = [
  { id: 1, name: 'Pasta', imageUrl: 'https://example.com/pasta.jpg' },
  { id: 2, name: 'Salad', imageUrl: null },
]

const FULL_RECIPE: recipeService.RecipeResponse = {
  id: 1,
  name: 'Pasta',
  description: 'A simple pasta dish',
  cuisine: { id: 1, name: 'Italian' },
  author: 'Chef Mario',
  calories: 450,
  servings: 2,
  cookingTime: 10,
  preparationTime: 5,
  imageUrl: 'https://example.com/pasta.jpg',
  createdAt: new Date('2024-01-01T00:00:00Z'),
  updatedAt: new Date('2024-01-01T00:00:00Z'),
  ingredients: [
    {
      id: 10,
      name: 'Spaghetti',
      unitId: 1,
      unitName: 'Gram',
      abbreviation: 'g',
      quantity: 200,
      notes: null,
    },
  ],
  tags: [{ recipeTagId: 1, id: 5, name: 'Quick' }],
  steps: [{ stepId: 1, stepNumber: 1, description: 'Boil water', tip: null, imageUrl: null }],
}

const SAVE_BODY = {
  name: 'Pasta',
  description: 'A simple pasta dish',
  calories: 450,
  servings: 2,
  cookingTime: 10,
  preparationTime: 5,
  cuisine: { name: 'Italian' },
  ingredients: [{ name: 'Spaghetti', unitId: 1, quantity: 200 }],
  steps: [{ stepNumber: 1, description: 'Boil water' }],
}

function buildTestApp() {
  const app = new Hono<{ Bindings: TestBindings }>()
  app.onError(errorHandler)
  app.use('*', authMiddleware)
  app.route('/recipes', recipeRouter)
  return app
}

const app = buildTestApp()

function request(
  path: string,
  options: { method?: string; body?: unknown; apiKey?: string | null } = {},
) {
  const { method = 'GET', body, apiKey = USER_KEY } = options
  const headers: Record<string, string> = {}
  if (apiKey != null) headers['X-Api-Key'] = apiKey
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  return app.request(
    path,
    {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    },
    TEST_ENV,
  )
}

describe('GET /recipes', () => {
  beforeEach(() => {
    vi.mocked(recipeService.listRecipes).mockResolvedValue(SAMPLE_LIST_ITEMS)
    vi.mocked(recipeService.searchRecipes).mockResolvedValue(SAMPLE_LIST_ITEMS)
  })

  afterEach(() => vi.clearAllMocks())

  it('returns 200 with paginated slim list', async () => {
    const res = await request('/recipes')
    expect(res.status).toBe(200)
    const body = (await res.json()) as Record<string, any>
    expect(body.status).toBe(200)
    expect(body.message).toBe('Recipes retrieved')
    expect(body.data).toEqual(SAMPLE_LIST_ITEMS)
    expect(vi.mocked(recipeService.listRecipes)).toHaveBeenCalledWith(expect.anything(), 0, 12)
  })

  it('resolves a bare stored key to a full public URL', async () => {
    vi.mocked(recipeService.listRecipes).mockResolvedValue([
      { id: 3, name: 'Tacos', imageUrl: 'recipes/xyz-789.jpg' },
    ])
    const res = await request('/recipes')
    const body = (await res.json()) as Record<string, any>
    expect(body.data[0].imageUrl).toBe(`${TEST_ENV.R2_PUBLIC_URL}/recipes/xyz-789.jpg`)
  })

  it('passes custom page and limit params', async () => {
    const res = await request('/recipes?page=2&limit=5')
    expect(res.status).toBe(200)
    expect(vi.mocked(recipeService.listRecipes)).toHaveBeenCalledWith(expect.anything(), 2, 5)
  })

  it('passes limit to service uncapped', async () => {
    const res = await request('/recipes?limit=999')
    expect(res.status).toBe(200)
    expect(vi.mocked(recipeService.listRecipes)).toHaveBeenCalledWith(expect.anything(), 0, 999)
  })

  it('returns 400 for non-numeric page or limit', async () => {
    const res = await request('/recipes?page=abc')
    expect(res.status).toBe(400)
    expect(vi.mocked(recipeService.listRecipes)).not.toHaveBeenCalled()
  })

  it('returns 400 for non-numeric tagId', async () => {
    const res = await request('/recipes?tagId=abc')
    expect(res.status).toBe(400)
    expect(vi.mocked(recipeService.searchRecipes)).not.toHaveBeenCalled()
  })

  it('returns 400 for non-numeric cuisineId', async () => {
    const res = await request('/recipes?cuisineId=abc')
    expect(res.status).toBe(400)
    expect(vi.mocked(recipeService.searchRecipes)).not.toHaveBeenCalled()
  })

  it('returns 400 for non-numeric ingredientId', async () => {
    const res = await request('/recipes?ingredientId=abc')
    expect(res.status).toBe(400)
    expect(vi.mocked(recipeService.searchRecipes)).not.toHaveBeenCalled()
  })

  it('routes to searchRecipes when filter params are present', async () => {
    const res = await request('/recipes?name=pasta&cuisineId=1')
    expect(res.status).toBe(200)
    const body = (await res.json()) as Record<string, any>
    expect(body.message).toBe('Recipes queried')
    expect(vi.mocked(recipeService.searchRecipes)).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ name: 'pasta', cuisineId: 1 }),
    )
    expect(vi.mocked(recipeService.listRecipes)).not.toHaveBeenCalled()
  })

  it('returns 401 when API key is missing', async () => {
    const res = await request('/recipes', { apiKey: null })
    expect(res.status).toBe(401)
  })

  describe('search mode', () => {
    beforeEach(() => {
      vi.mocked(recipeService.searchRecipes).mockResolvedValue(SAMPLE_LIST_ITEMS)
    })

    it('filters by name', async () => {
      const res = await request('/recipes?name=pasta')
      expect(res.status).toBe(200)
      const body = (await res.json()) as Record<string, any>
      expect(body.message).toBe('Recipes queried')
      expect(vi.mocked(recipeService.searchRecipes)).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ name: 'pasta' }),
      )
      expect(vi.mocked(recipeService.listRecipes)).not.toHaveBeenCalled()
    })

    it('filters by tag (text)', async () => {
      const res = await request('/recipes?tag=quick')
      expect(res.status).toBe(200)
      expect(vi.mocked(recipeService.searchRecipes)).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ tag: 'quick' }),
      )
    })

    it('filters by cuisine (text)', async () => {
      const res = await request('/recipes?cuisine=italian')
      expect(res.status).toBe(200)
      expect(vi.mocked(recipeService.searchRecipes)).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ cuisine: 'italian' }),
      )
    })

    it('filters by ingredient (text)', async () => {
      const res = await request('/recipes?ingredient=garlic')
      expect(res.status).toBe(200)
      expect(vi.mocked(recipeService.searchRecipes)).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ ingredient: 'garlic' }),
      )
    })

    it('filters by cuisineId', async () => {
      const res = await request('/recipes?cuisineId=3')
      expect(res.status).toBe(200)
      expect(vi.mocked(recipeService.searchRecipes)).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ cuisineId: 3 }),
      )
    })

    it('filters by tagId', async () => {
      const res = await request('/recipes?tagId=7')
      expect(res.status).toBe(200)
      expect(vi.mocked(recipeService.searchRecipes)).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ tagId: 7 }),
      )
    })

    it('filters by ingredientId', async () => {
      const res = await request('/recipes?ingredientId=42')
      expect(res.status).toBe(200)
      expect(vi.mocked(recipeService.searchRecipes)).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ ingredientId: 42 }),
      )
    })

    it('ANDs multiple filter params together', async () => {
      const res = await request('/recipes?name=pasta&cuisineId=1&tag=quick')
      expect(res.status).toBe(200)
      expect(vi.mocked(recipeService.searchRecipes)).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ name: 'pasta', cuisineId: 1, tag: 'quick' }),
      )
    })

    it('blank ?name= still triggers search mode (service is responsible for ignoring it)', async () => {
      const res = await request('/recipes?name=')
      expect(res.status).toBe(200)
      const body = (await res.json()) as Record<string, any>
      expect(body.message).toBe('Recipes queried')
      expect(vi.mocked(recipeService.searchRecipes)).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ name: '' }),
      )
      expect(vi.mocked(recipeService.listRecipes)).not.toHaveBeenCalled()
    })

    it('whitespace-only ?name= still triggers search mode', async () => {
      const res = await request('/recipes?name=%20%20%20')
      expect(res.status).toBe(200)
      const body = (await res.json()) as Record<string, any>
      expect(body.message).toBe('Recipes queried')
      expect(vi.mocked(recipeService.searchRecipes)).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ name: '   ' }),
      )
      expect(vi.mocked(recipeService.listRecipes)).not.toHaveBeenCalled()
    })

    it('returns slim { id, name, imageUrl } DTO shape', async () => {
      const res = await request('/recipes?name=pasta')
      const body = (await res.json()) as Record<string, any>
      expect(body.data).toEqual(SAMPLE_LIST_ITEMS)
      expect(body.data[0]).toMatchObject({ id: expect.any(Number), name: expect.any(String) })
      expect(body.data[0]).toHaveProperty('imageUrl')
      expect(body.data[0]).not.toHaveProperty('description')
      expect(body.data[0]).not.toHaveProperty('ingredients')
    })
  })
})

describe('POST /recipes', () => {
  beforeEach(() => {
    vi.mocked(recipeService.createRecipe).mockResolvedValue(FULL_RECIPE)
  })

  afterEach(() => vi.clearAllMocks())

  it('returns 201 with full response and Location header', async () => {
    const res = await request('/recipes', { method: 'POST', body: SAVE_BODY })
    expect(res.status).toBe(201)
    expect(res.headers.get('Location')).toBe('/recipes/1')
    const body = (await res.json()) as Record<string, any>
    expect(body.status).toBe(201)
    expect(body.message).toBe('Recipe saved')
    expect(body.data.id).toBe(1)
    expect(body.data.cuisine).toEqual({ id: 1, name: 'Italian' })
    expect(body.data.ingredients).toHaveLength(1)
    expect(body.data.steps).toHaveLength(1)
  })

  it('strips the public URL prefix before storing a presigned imageUrl', async () => {
    const res = await request('/recipes', {
      method: 'POST',
      body: { ...SAVE_BODY, imageUrl: `${TEST_ENV.R2_PUBLIC_URL}/recipes/xyz-789.jpg` },
    })
    expect(res.status).toBe(201)
    expect(vi.mocked(recipeService.createRecipe)).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ imageUrl: 'recipes/xyz-789.jpg' }),
    )
  })

  it('stores an already-bare imageUrl key unchanged', async () => {
    const res = await request('/recipes', {
      method: 'POST',
      body: { ...SAVE_BODY, imageUrl: 'recipes/xyz-789.jpg' },
    })
    expect(res.status).toBe(201)
    expect(vi.mocked(recipeService.createRecipe)).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ imageUrl: 'recipes/xyz-789.jpg' }),
    )
  })

  it('returns 400 when name is too short', async () => {
    const res = await request('/recipes', {
      method: 'POST',
      body: { ...SAVE_BODY, name: 'A' },
    })
    expect(res.status).toBe(400)
    const body = (await res.json()) as Record<string, any>
    expect(body.message).toBe('Recipe name must be between 2 to 150 characters.')
  })

  it('returns 400 when servings is zero', async () => {
    const res = await request('/recipes', {
      method: 'POST',
      body: { ...SAVE_BODY, servings: 0 },
    })
    expect(res.status).toBe(400)
    const body = (await res.json()) as Record<string, any>
    expect(body.message).toBe('Servings must be a more than zero.')
  })

  it('returns 400 when cookingTime is negative', async () => {
    const res = await request('/recipes', {
      method: 'POST',
      body: { ...SAVE_BODY, cookingTime: -1 },
    })
    expect(res.status).toBe(400)
    const body = (await res.json()) as Record<string, any>
    expect(body.message).toBe('Cooking time cannot be negative.')
  })

  it('returns 400 when preparationTime is zero', async () => {
    const res = await request('/recipes', {
      method: 'POST',
      body: { ...SAVE_BODY, preparationTime: 0 },
    })
    expect(res.status).toBe(400)
    const body = (await res.json()) as Record<string, any>
    expect(body.message).toBe('Preparation time cannot be zero minutes.')
  })

  it('returns 400 when ingredients array is empty', async () => {
    const res = await request('/recipes', {
      method: 'POST',
      body: { ...SAVE_BODY, ingredients: [] },
    })
    expect(res.status).toBe(400)
    const body = (await res.json()) as Record<string, any>
    expect(body.message).toBe('There must be at least one ingredient.')
  })

  it('returns 400 when steps array is empty', async () => {
    const res = await request('/recipes', {
      method: 'POST',
      body: { ...SAVE_BODY, steps: [] },
    })
    expect(res.status).toBe(400)
    const body = (await res.json()) as Record<string, any>
    expect(body.message).toBe('There must be at least one step.')
  })

  it('accepts calories of zero', async () => {
    const res = await request('/recipes', { method: 'POST', body: { ...SAVE_BODY, calories: 0 } })
    expect(res.status).toBe(201)
  })

  it('returns 400 for an explicit null calories', async () => {
    const res = await request('/recipes', {
      method: 'POST',
      body: { ...SAVE_BODY, calories: null },
    })
    expect(res.status).toBe(400)
    const body = (await res.json()) as Record<string, any>
    expect(body.message).toBe('Calories is required and cannot be null.')
    expect(vi.mocked(recipeService.createRecipe)).not.toHaveBeenCalled()
  })

  it('returns 400 when calories is omitted', async () => {
    const bodyWithoutCalories: Record<string, unknown> = { ...SAVE_BODY }
    delete bodyWithoutCalories.calories
    const res = await request('/recipes', { method: 'POST', body: bodyWithoutCalories })
    expect(res.status).toBe(400)
    const body = (await res.json()) as Record<string, any>
    expect(body.message).toBe('Calories is required and cannot be null.')
    expect(vi.mocked(recipeService.createRecipe)).not.toHaveBeenCalled()
  })

  it('accepts a null description', async () => {
    vi.mocked(recipeService.createRecipe).mockResolvedValue(FULL_RECIPE)
    const res = await request('/recipes', {
      method: 'POST',
      body: { ...SAVE_BODY, description: null },
    })
    expect(res.status).toBe(201)
    expect(vi.mocked(recipeService.createRecipe)).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ description: null }),
    )
  })

  it('accepts explicit null id on cuisine, ingredients, and tags', async () => {
    const res = await request('/recipes', {
      method: 'POST',
      body: {
        ...SAVE_BODY,
        cuisine: { id: null, name: 'Italian' },
        ingredients: [{ id: null, name: 'Spaghetti', unitId: 1, quantity: 200 }],
        tags: [{ id: null, name: 'Quick' }],
      },
    })
    expect(res.status).toBe(201)
  })

  it('returns 400 when cuisine has neither id nor name', async () => {
    const res = await request('/recipes', {
      method: 'POST',
      body: { ...SAVE_BODY, cuisine: {} },
    })
    expect(res.status).toBe(400)
    const body = (await res.json()) as Record<string, any>
    expect(body.message).toBe('Cuisine request must have either an ID or a name.')
  })

  it('propagates 404 from service when unit is not found', async () => {
    vi.mocked(recipeService.createRecipe).mockRejectedValue(
      new NotFoundError('Unit ID not found: 999'),
    )
    const res = await request('/recipes', { method: 'POST', body: SAVE_BODY })
    expect(res.status).toBe(404)
    const body = (await res.json()) as Record<string, any>
    expect(body.message).toBe('Unit ID not found: 999')
  })
})

describe('GET /recipes/:id', () => {
  afterEach(() => vi.clearAllMocks())

  it('returns 200 with full recipe response', async () => {
    vi.mocked(recipeService.getRecipe).mockResolvedValue(FULL_RECIPE)
    const res = await request('/recipes/1')
    expect(res.status).toBe(200)
    const body = (await res.json()) as Record<string, any>
    expect(body.status).toBe(200)
    expect(body.message).toBe('Recipe retrieved')
    expect(body.data.id).toBe(1)
    expect(body.data.tags).toEqual([{ recipeTagId: 1, id: 5, name: 'Quick' }])
    expect(body.data.steps[0].stepId).toBe(1)
    expect(body.data.steps[0].imageUrl).toBeNull()
  })

  it('returns 404 when recipe does not exist', async () => {
    vi.mocked(recipeService.getRecipe).mockRejectedValue(
      new NotFoundError('Recipe not found with id: 999'),
    )
    const res = await request('/recipes/999')
    expect(res.status).toBe(404)
    const body = (await res.json()) as Record<string, any>
    expect(body.message).toBe('Recipe not found with id: 999')
  })

  it('returns 400 for non-numeric id', async () => {
    const res = await request('/recipes/abc')
    expect(res.status).toBe(400)
    expect(vi.mocked(recipeService.getRecipe)).not.toHaveBeenCalled()
  })
})

describe('PATCH /recipes/:id', () => {
  afterEach(() => vi.clearAllMocks())

  it('returns 200 with updated full response', async () => {
    const updated = { ...FULL_RECIPE, name: 'Updated Pasta' }
    vi.mocked(recipeService.updateRecipe).mockResolvedValue(updated)
    const res = await request('/recipes/1', { method: 'PATCH', body: { name: 'Updated Pasta' } })
    expect(res.status).toBe(200)
    const body = (await res.json()) as Record<string, any>
    expect(body.message).toBe('Recipe updated')
    expect(body.data.name).toBe('Updated Pasta')
  })

  it('passes only provided fields to service', async () => {
    vi.mocked(recipeService.updateRecipe).mockResolvedValue(FULL_RECIPE)
    await request('/recipes/1', { method: 'PATCH', body: { description: null } })
    expect(vi.mocked(recipeService.updateRecipe)).toHaveBeenCalledWith(
      expect.anything(),
      1,
      expect.objectContaining({ description: null }),
    )
  })

  it('returns 400 for an explicit null calories', async () => {
    const res = await request('/recipes/1', { method: 'PATCH', body: { calories: null } })
    expect(res.status).toBe(400)
    const body = (await res.json()) as Record<string, any>
    expect(body.message).toBe('Calories cannot be null.')
    expect(vi.mocked(recipeService.updateRecipe)).not.toHaveBeenCalled()
  })

  it('strips the public URL prefix before storing a presigned imageUrl', async () => {
    vi.mocked(recipeService.updateRecipe).mockResolvedValue(FULL_RECIPE)
    await request('/recipes/1', {
      method: 'PATCH',
      body: { imageUrl: `${TEST_ENV.R2_PUBLIC_URL}/recipes/xyz-789.jpg` },
    })
    expect(vi.mocked(recipeService.updateRecipe)).toHaveBeenCalledWith(
      expect.anything(),
      1,
      expect.objectContaining({ imageUrl: 'recipes/xyz-789.jpg' }),
    )
  })

  it('leaves an explicit null imageUrl untouched (nullifies the field)', async () => {
    vi.mocked(recipeService.updateRecipe).mockResolvedValue(FULL_RECIPE)
    await request('/recipes/1', { method: 'PATCH', body: { imageUrl: null } })
    expect(vi.mocked(recipeService.updateRecipe)).toHaveBeenCalledWith(
      expect.anything(),
      1,
      expect.objectContaining({ imageUrl: null }),
    )
  })

  it('returns 400 when ingredients is an empty array', async () => {
    const res = await request('/recipes/1', { method: 'PATCH', body: { ingredients: [] } })
    expect(res.status).toBe(400)
    expect(vi.mocked(recipeService.updateRecipe)).not.toHaveBeenCalled()
  })

  it('accepts explicit null id on cuisine, ingredients, and tags', async () => {
    vi.mocked(recipeService.updateRecipe).mockResolvedValue(FULL_RECIPE)
    const res = await request('/recipes/1', {
      method: 'PATCH',
      body: {
        cuisine: { id: null, name: 'Italian' },
        ingredients: [{ id: null, name: 'Spaghetti', unitId: 1, quantity: 200 }],
        tags: [{ id: null, name: 'Quick' }],
      },
    })
    expect(res.status).toBe(200)
  })

  it('returns 400 when steps is an empty array', async () => {
    const res = await request('/recipes/1', { method: 'PATCH', body: { steps: [] } })
    expect(res.status).toBe(400)
    expect(vi.mocked(recipeService.updateRecipe)).not.toHaveBeenCalled()
  })

  it('returns 404 when recipe does not exist', async () => {
    vi.mocked(recipeService.updateRecipe).mockRejectedValue(
      new NotFoundError('Recipe not found with id: 999'),
    )
    const res = await request('/recipes/999', { method: 'PATCH', body: { name: 'New Name' } })
    expect(res.status).toBe(404)
  })

  it('returns 400 for non-numeric id', async () => {
    const res = await request('/recipes/abc', { method: 'PATCH', body: { name: 'x' } })
    expect(res.status).toBe(400)
    expect(vi.mocked(recipeService.updateRecipe)).not.toHaveBeenCalled()
  })
})

describe('DELETE /recipes/:id', () => {
  afterEach(() => vi.clearAllMocks())

  it('returns 204 with admin key', async () => {
    vi.mocked(recipeService.deleteRecipe).mockResolvedValue(undefined)
    const res = await request('/recipes/1', { method: 'DELETE', apiKey: ADMIN_KEY })
    expect(res.status).toBe(204)
    expect(vi.mocked(recipeService.deleteRecipe)).toHaveBeenCalledWith(
      expect.anything(),
      1,
      TEST_ENV.IMAGE_BUCKET,
      TEST_ENV.R2_PUBLIC_URL,
    )
  })

  it('returns 401 without admin key (user key is rejected)', async () => {
    const res = await request('/recipes/1', { method: 'DELETE', apiKey: USER_KEY })
    expect(res.status).toBe(401)
    expect(vi.mocked(recipeService.deleteRecipe)).not.toHaveBeenCalled()
  })

  it('returns 401 when no API key provided', async () => {
    const res = await request('/recipes/1', { method: 'DELETE', apiKey: null })
    expect(res.status).toBe(401)
  })

  it('returns 404 when recipe does not exist', async () => {
    vi.mocked(recipeService.deleteRecipe).mockRejectedValue(
      new NotFoundError('Recipe not found with id: 999'),
    )
    const res = await request('/recipes/999', { method: 'DELETE', apiKey: ADMIN_KEY })
    expect(res.status).toBe(404)
    const body = (await res.json()) as Record<string, any>
    expect(body.message).toBe('Recipe not found with id: 999')
  })

  it('returns 400 for non-numeric id', async () => {
    const res = await request('/recipes/abc', { method: 'DELETE', apiKey: ADMIN_KEY })
    expect(res.status).toBe(400)
    expect(vi.mocked(recipeService.deleteRecipe)).not.toHaveBeenCalled()
  })
})
