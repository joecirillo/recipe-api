import { Hono } from 'hono'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { authMiddleware } from '../middleware/auth'
import * as tagService from '../services/tag-service'
import { tagRouter } from './tags'

vi.mock('../db/client', () => ({ createDb: vi.fn(() => ({})) }))
vi.mock('../services/tag-service')

type TestBindings = {
  USER_API_KEY: string
  ADMIN_API_KEY: string
  DATABASE_URL: string
}

const USER_KEY = 'test-user-key'
const ADMIN_KEY = 'test-admin-key'
const TEST_ENV: TestBindings = {
  USER_API_KEY: USER_KEY,
  ADMIN_API_KEY: ADMIN_KEY,
  DATABASE_URL: 'postgresql://test',
}

const SAMPLE_TAGS = [
  { id: 1, name: 'Vegan' },
  { id: 2, name: 'Gluten-Free' },
]

function buildTestApp() {
  const app = new Hono<{ Bindings: TestBindings }>()
  app.use('*', authMiddleware)
  app.route('/tags', tagRouter)
  return app
}

const app = buildTestApp()

function request(path: string, apiKey?: string) {
  const headers: Record<string, string> = {}
  if (apiKey !== undefined) headers['X-Api-Key'] = apiKey
  return app.request(path, { method: 'GET', headers }, TEST_ENV)
}

describe('GET /tags', () => {
  beforeEach(() => {
    vi.mocked(tagService.listTags).mockResolvedValue(SAMPLE_TAGS)
    vi.mocked(tagService.searchTags).mockResolvedValue([SAMPLE_TAGS[0]])
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('returns 200 with all tags when no query param', async () => {
    const res = await request('/tags', USER_KEY)
    expect(res.status).toBe(200)
    const body = await res.json() as Record<string, any>
    expect(body.status).toBe(200)
    expect(body.message).toBe('Tags retrieved')
    expect(body.data).toEqual(SAMPLE_TAGS)
    expect(vi.mocked(tagService.listTags)).toHaveBeenCalledOnce()
  })

  it('returns all tags for empty query string', async () => {
    const res = await request('/tags?query=', USER_KEY)
    expect(res.status).toBe(200)
    const body = await res.json() as Record<string, any>
    expect(body.message).toBe('Tags retrieved')
    expect(vi.mocked(tagService.listTags)).toHaveBeenCalledOnce()
    expect(vi.mocked(tagService.searchTags)).not.toHaveBeenCalled()
  })

  it('returns all tags for whitespace-only query', async () => {
    const res = await request('/tags?query=   ', USER_KEY)
    expect(res.status).toBe(200)
    const body = await res.json() as Record<string, any>
    expect(body.message).toBe('Tags retrieved')
    expect(vi.mocked(tagService.listTags)).toHaveBeenCalledOnce()
    expect(vi.mocked(tagService.searchTags)).not.toHaveBeenCalled()
  })

  it('returns filtered tags for non-blank query', async () => {
    vi.mocked(tagService.searchTags).mockResolvedValue([{ id: 1, name: 'Vegan' }])
    const res = await request('/tags?query=veg', USER_KEY)
    expect(res.status).toBe(200)
    const body = await res.json() as Record<string, any>
    expect(body.message).toBe('Tags queried')
    expect(body.data).toEqual([{ id: 1, name: 'Vegan' }])
    expect(vi.mocked(tagService.searchTags)).toHaveBeenCalledWith(expect.anything(), 'veg')
    expect(vi.mocked(tagService.listTags)).not.toHaveBeenCalled()
  })

  it('returns 200 with empty array when no tags match query', async () => {
    vi.mocked(tagService.searchTags).mockResolvedValue([])
    const res = await request('/tags?query=zzz', USER_KEY)
    expect(res.status).toBe(200)
    const body = await res.json() as Record<string, any>
    expect(body.message).toBe('Tags queried')
    expect(body.data).toEqual([])
  })

  it('returns 401 when API key is missing', async () => {
    const res = await request('/tags')
    expect(res.status).toBe(401)
  })
})
