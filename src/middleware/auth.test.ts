import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'
import { authMiddleware } from './auth'

type TestBindings = {
  USER_API_KEY: string
  ADMIN_API_KEY: string
}

const USER_KEY = 'test-user-key'
const ADMIN_KEY = 'test-admin-key'
const TEST_ENV: TestBindings = { USER_API_KEY: USER_KEY, ADMIN_API_KEY: ADMIN_KEY }

function buildTestApp() {
  const app = new Hono<{ Bindings: TestBindings }>()
  app.use('*', authMiddleware)
  app.get('/recipes', (c) => c.json({}, 200))
  app.get('/recipes/:id', (c) => c.json({}, 200))
  app.put('/recipes/:id', (c) => c.json({}, 200))
  app.delete('/recipes', (c) => c.json({}, 200))
  app.delete('/recipes/:id', (c) => c.body(null, 204))
  return app
}

const app = buildTestApp()

function request(method: string, path: string, apiKey?: string) {
  const headers: Record<string, string> = {}
  if (apiKey !== undefined) headers['X-Api-Key'] = apiKey
  return app.request(path, { method, headers }, TEST_ENV)
}

describe('authMiddleware', () => {
  describe('missing or invalid key', () => {
    it('returns 401 when X-Api-Key header is absent', async () => {
      const res = await request('GET', '/recipes')
      expect(res.status).toBe(401)
    })

    it('returns 401 with an unrecognized key', async () => {
      const res = await request('GET', '/recipes', 'bad-key')
      expect(res.status).toBe(401)
    })

    it('returns the standard error envelope', async () => {
      const res = await request('GET', '/recipes')
      const body = await res.json() as Record<string, any>
      expect(body.status).toBe(401)
      expect(body.message).toBe('Invalid or missing API key')
      expect(body.path).toBe('/recipes')
      expect(typeof body.timestamp).toBe('string')
    })
  })

  describe('user key on normal routes', () => {
    it('passes through GET /recipes', async () => {
      const res = await request('GET', '/recipes', USER_KEY)
      expect(res.status).toBe(200)
    })

    it('passes through GET /recipes/:id', async () => {
      const res = await request('GET', '/recipes/42', USER_KEY)
      expect(res.status).toBe(200)
    })

    it('passes through PUT /recipes/:id', async () => {
      const res = await request('PUT', '/recipes/42', USER_KEY)
      expect(res.status).toBe(200)
    })

    it('passes through DELETE /recipes (no id — not an admin route)', async () => {
      const res = await request('DELETE', '/recipes', USER_KEY)
      expect(res.status).toBe(200)
    })
  })

  describe('admin key on normal routes', () => {
    it('passes through GET /recipes', async () => {
      const res = await request('GET', '/recipes', ADMIN_KEY)
      expect(res.status).toBe(200)
    })
  })

  describe('DELETE /recipes/:id (admin route)', () => {
    it('returns 401 with user key', async () => {
      const res = await request('DELETE', '/recipes/123', USER_KEY)
      expect(res.status).toBe(401)
    })

    it('returns 401 with no key', async () => {
      const res = await request('DELETE', '/recipes/123')
      expect(res.status).toBe(401)
    })

    it('returns 401 with an unrecognized key', async () => {
      const res = await request('DELETE', '/recipes/123', 'bad-key')
      expect(res.status).toBe(401)
    })

    it('passes through with admin key', async () => {
      const res = await request('DELETE', '/recipes/123', ADMIN_KEY)
      expect(res.status).toBe(204)
    })

    it('returns the standard error envelope when rejecting user key', async () => {
      const res = await request('DELETE', '/recipes/123', USER_KEY)
      const body = await res.json() as Record<string, any>
      expect(body.status).toBe(401)
      expect(body.message).toBe('Invalid or missing API key')
      expect(body.path).toBe('/recipes/123')
      expect(typeof body.timestamp).toBe('string')
    })
  })
})
