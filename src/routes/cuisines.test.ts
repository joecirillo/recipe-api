import { Hono } from 'hono'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { authMiddleware } from '../middleware/auth'
import * as cuisineService from '../services/cuisine-service'
import { cuisineRouter } from './cuisines'

vi.mock('../db/client', () => ({ createDb: vi.fn(() => ({})) }))
vi.mock('../services/cuisine-service')

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

const SAMPLE_CUISINES = [
  { id: 1, name: 'Italian' },
  { id: 2, name: 'Mexican' },
]

function buildTestApp() {
  const app = new Hono<{ Bindings: TestBindings }>()
  app.use('*', authMiddleware)
  app.route('/cuisines', cuisineRouter)
  return app
}

const app = buildTestApp()

function request(path: string, apiKey?: string) {
  const headers: Record<string, string> = {}
  if (apiKey !== undefined) headers['X-Api-Key'] = apiKey
  return app.request(path, { method: 'GET', headers }, TEST_ENV)
}

describe('GET /cuisines', () => {
  beforeEach(() => {
    vi.mocked(cuisineService.listCuisines).mockResolvedValue(SAMPLE_CUISINES)
    vi.mocked(cuisineService.searchCuisines).mockResolvedValue([SAMPLE_CUISINES[0]])
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('returns 200 with all cuisines when no query param', async () => {
    const res = await request('/cuisines', USER_KEY)
    expect(res.status).toBe(200)
    const body = (await res.json()) as Record<string, any>
    expect(body.status).toBe(200)
    expect(body.message).toBe('Cuisines retrieved')
    expect(body.data).toEqual(SAMPLE_CUISINES)
    expect(vi.mocked(cuisineService.listCuisines)).toHaveBeenCalledOnce()
  })

  it('returns all cuisines for empty query string', async () => {
    const res = await request('/cuisines?query=', USER_KEY)
    expect(res.status).toBe(200)
    const body = (await res.json()) as Record<string, any>
    expect(body.message).toBe('Cuisines retrieved')
    expect(vi.mocked(cuisineService.listCuisines)).toHaveBeenCalledOnce()
    expect(vi.mocked(cuisineService.searchCuisines)).not.toHaveBeenCalled()
  })

  it('returns all cuisines for whitespace-only query', async () => {
    const res = await request('/cuisines?query=   ', USER_KEY)
    expect(res.status).toBe(200)
    const body = (await res.json()) as Record<string, any>
    expect(body.message).toBe('Cuisines retrieved')
    expect(vi.mocked(cuisineService.listCuisines)).toHaveBeenCalledOnce()
    expect(vi.mocked(cuisineService.searchCuisines)).not.toHaveBeenCalled()
  })

  it('returns filtered cuisines for non-blank query', async () => {
    vi.mocked(cuisineService.searchCuisines).mockResolvedValue([{ id: 1, name: 'Italian' }])
    const res = await request('/cuisines?query=ital', USER_KEY)
    expect(res.status).toBe(200)
    const body = (await res.json()) as Record<string, any>
    expect(body.message).toBe('Cuisines queried')
    expect(body.data).toEqual([{ id: 1, name: 'Italian' }])
    expect(vi.mocked(cuisineService.searchCuisines)).toHaveBeenCalledWith(expect.anything(), 'ital')
    expect(vi.mocked(cuisineService.listCuisines)).not.toHaveBeenCalled()
  })

  it('returns 200 with empty array when no cuisines match query', async () => {
    vi.mocked(cuisineService.searchCuisines).mockResolvedValue([])
    const res = await request('/cuisines?query=zzz', USER_KEY)
    expect(res.status).toBe(200)
    const body = (await res.json()) as Record<string, any>
    expect(body.message).toBe('Cuisines queried')
    expect(body.data).toEqual([])
  })

  it('returns 401 when API key is missing', async () => {
    const res = await request('/cuisines')
    expect(res.status).toBe(401)
  })
})
