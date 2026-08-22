import { Hono } from 'hono'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { authMiddleware } from '../middleware/auth'
import * as ingredientService from '../services/ingredient-service'
import { ingredientRouter } from './ingredients'

vi.mock('../db/client', () => ({ createDb: vi.fn(() => ({})) }))
vi.mock('../services/ingredient-service')

type TestBindings = {
  USER_API_KEY: string
  ADMIN_API_KEY: string
  HYPERDRIVE: { connectionString: string }
}

const USER_KEY = 'test-user-key'
const ADMIN_KEY = 'test-admin-key'
const TEST_ENV: TestBindings = {
  USER_API_KEY: USER_KEY,
  ADMIN_API_KEY: ADMIN_KEY,
  HYPERDRIVE: { connectionString: 'postgresql://test' },
}

const SAMPLE_INGREDIENTS = [
  { id: 1, name: 'Garlic' },
  { id: 2, name: 'Onion' },
]

function buildTestApp() {
  const app = new Hono<{ Bindings: TestBindings }>()
  app.use('*', authMiddleware)
  app.route('/ingredients', ingredientRouter)
  return app
}

const app = buildTestApp()

function request(path: string, apiKey?: string) {
  const headers: Record<string, string> = {}
  if (apiKey !== undefined) headers['X-Api-Key'] = apiKey
  return app.request(path, { method: 'GET', headers }, TEST_ENV)
}

describe('GET /ingredients', () => {
  beforeEach(() => {
    vi.mocked(ingredientService.listIngredients).mockResolvedValue(SAMPLE_INGREDIENTS)
    vi.mocked(ingredientService.searchIngredients).mockResolvedValue([SAMPLE_INGREDIENTS[0]])
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('returns 200 with all ingredients when no query param', async () => {
    const res = await request('/ingredients', USER_KEY)
    expect(res.status).toBe(200)
    const body = await res.json() as Record<string, any>
    expect(body.status).toBe(200)
    expect(body.message).toBe('Ingredients retrieved')
    expect(body.data).toEqual(SAMPLE_INGREDIENTS)
    expect(vi.mocked(ingredientService.listIngredients)).toHaveBeenCalledOnce()
  })

  it('returns all ingredients for empty query string', async () => {
    const res = await request('/ingredients?query=', USER_KEY)
    expect(res.status).toBe(200)
    const body = await res.json() as Record<string, any>
    expect(body.message).toBe('Ingredients retrieved')
    expect(vi.mocked(ingredientService.listIngredients)).toHaveBeenCalledOnce()
    expect(vi.mocked(ingredientService.searchIngredients)).not.toHaveBeenCalled()
  })

  it('returns all ingredients for whitespace-only query', async () => {
    const res = await request('/ingredients?query=   ', USER_KEY)
    expect(res.status).toBe(200)
    const body = await res.json() as Record<string, any>
    expect(body.message).toBe('Ingredients retrieved')
    expect(vi.mocked(ingredientService.listIngredients)).toHaveBeenCalledOnce()
    expect(vi.mocked(ingredientService.searchIngredients)).not.toHaveBeenCalled()
  })

  it('returns filtered ingredients for non-blank query', async () => {
    vi.mocked(ingredientService.searchIngredients).mockResolvedValue([{ id: 1, name: 'Garlic' }])
    const res = await request('/ingredients?query=gar', USER_KEY)
    expect(res.status).toBe(200)
    const body = await res.json() as Record<string, any>
    expect(body.message).toBe('Ingredients queried')
    expect(body.data).toEqual([{ id: 1, name: 'Garlic' }])
    expect(vi.mocked(ingredientService.searchIngredients)).toHaveBeenCalledWith(
      expect.anything(),
      'gar',
    )
    expect(vi.mocked(ingredientService.listIngredients)).not.toHaveBeenCalled()
  })

  it('returns 200 with empty array when no ingredients match query', async () => {
    vi.mocked(ingredientService.searchIngredients).mockResolvedValue([])
    const res = await request('/ingredients?query=zzz', USER_KEY)
    expect(res.status).toBe(200)
    const body = await res.json() as Record<string, any>
    expect(body.message).toBe('Ingredients queried')
    expect(body.data).toEqual([])
  })

  it('returns 401 when API key is missing', async () => {
    const res = await request('/ingredients')
    expect(res.status).toBe(401)
  })
})
