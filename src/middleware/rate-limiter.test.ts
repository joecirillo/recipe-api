import { Hono } from 'hono'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { rateLimiterMiddleware } from './rate-limiter'

type TestBindings = {
  USER_API_KEY: string
}

const USER_KEY = 'test-user-key'
const TEST_ENV: TestBindings = { USER_API_KEY: USER_KEY }

function buildTestApp() {
  const app = new Hono<{ Bindings: TestBindings }>()
  app.use('*', rateLimiterMiddleware)
  app.get('/recipes', (c) => c.json({}, 200))
  return app
}

function request(app: Hono<{ Bindings: TestBindings }>, apiKey: string, path = '/recipes') {
  return app.request(path, { method: 'GET', headers: { 'X-Api-Key': apiKey } }, TEST_ENV)
}

describe('rateLimiterMiddleware', () => {
  let app: Hono<{ Bindings: TestBindings }>

  beforeEach(() => {
    vi.useFakeTimers()
    app = buildTestApp()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('allows requests under the limit', async () => {
    for (let i = 0; i < 60; i++) {
      const res = await request(app, USER_KEY)
      expect(res.status).toBe(200)
    }
  })

  it('returns 429 on the 61st request within the window', async () => {
    for (let i = 0; i < 60; i++) {
      await request(app, USER_KEY)
    }
    const res = await request(app, USER_KEY)
    expect(res.status).toBe(429)
  })

  it('returns the standard error envelope on 429', async () => {
    for (let i = 0; i < 60; i++) {
      await request(app, USER_KEY)
    }
    const res = await request(app, USER_KEY)
    const body = await res.json()
    expect(body.status).toBe(429)
    expect(body.message).toBe('Rate limit exceeded')
    expect(body.path).toBe('/recipes')
    expect(typeof body.timestamp).toBe('string')
  })

  it('tracks limits independently per API key', async () => {
    for (let i = 0; i < 60; i++) {
      await request(app, USER_KEY)
    }
    const res = await request(app, 'other-key')
    expect(res.status).toBe(200)
  })

  it('resets the count after the window expires', async () => {
    for (let i = 0; i < 60; i++) {
      await request(app, USER_KEY)
    }
    expect((await request(app, USER_KEY)).status).toBe(429)

    vi.advanceTimersByTime(60_000)

    const res = await request(app, USER_KEY)
    expect(res.status).toBe(200)
  })
})
