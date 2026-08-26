import { Hono } from 'hono'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { authMiddleware } from '../middleware/auth'
import * as unitService from '../services/unit-service'
import { unitRouter } from './units'

vi.mock('../db/client', () => ({ createDb: vi.fn(() => ({})) }))
vi.mock('../services/unit-service')

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

const SAMPLE_UNITS = [
  { id: 1, name: 'Cup', abbreviation: 'c' },
  { id: 2, name: 'Tablespoon', abbreviation: 'tbsp' },
  { id: 3, name: 'Piece', abbreviation: null },
]

function buildTestApp() {
  const app = new Hono<{ Bindings: TestBindings }>()
  app.use('*', authMiddleware)
  app.route('/units', unitRouter)
  return app
}

const app = buildTestApp()

function request(path: string, apiKey?: string) {
  const headers: Record<string, string> = {}
  if (apiKey !== undefined) headers['X-Api-Key'] = apiKey
  return app.request(path, { method: 'GET', headers }, TEST_ENV)
}

describe('GET /units', () => {
  beforeEach(() => {
    vi.mocked(unitService.listUnits).mockResolvedValue(SAMPLE_UNITS)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('returns 200 with all units', async () => {
    const res = await request('/units', USER_KEY)
    expect(res.status).toBe(200)
    const body = (await res.json()) as Record<string, any>
    expect(body.status).toBe(200)
    expect(body.message).toBe('Units retrieved')
    expect(body.data).toEqual(SAMPLE_UNITS)
    expect(vi.mocked(unitService.listUnits)).toHaveBeenCalledOnce()
  })

  it('includes null abbreviation in response', async () => {
    const res = await request('/units', USER_KEY)
    const body = (await res.json()) as Record<string, any>
    const piece = body.data.find((u: { id: number }) => u.id === 3)
    expect(piece.abbreviation).toBeNull()
  })

  it('returns 401 when API key is missing', async () => {
    const res = await request('/units')
    expect(res.status).toBe(401)
  })
})
