import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'
import { buildError } from './lib/response'

// index.ts wires the real app to Cloudflare bindings (Hyperdrive, R2, secrets), which
// aren't available under vitest, so the notFound handler is verified in isolation
// using the same registration it uses in index.ts rather than importing the app itself.
function buildTestApp() {
  const app = new Hono()
  app.notFound((c) => c.json(buildError(404, 'Route not found', c.req.path), 404))
  return app
}

const app = buildTestApp()

describe('notFound', () => {
  it('returns the standard error envelope for an unmatched route', async () => {
    const res = await app.request('/nope')
    const body = (await res.json()) as Record<string, any>

    expect(res.status).toBe(404)
    expect(body.message).toBe('Route not found')
    expect(body.path).toBe('/nope')
    expect('data' in body).toBe(false)
  })
})
