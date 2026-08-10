import type { MiddlewareHandler } from 'hono'
import { buildError } from '../lib/response'

const WINDOW_MS = 60_000
const MAX_REQUESTS = 60

// IMPORTANT: In-memory rate limiting does not work correctly on Cloudflare Workers.
// Each Worker isolate has its own memory — requests are distributed across isolates
// with no shared state, so counts are siloed per instance rather than global per key.
// For production use, replace this store with a Cloudflare Rate Limiting binding
// (wrangler.jsonc: [[rate_limiting]]) or a Durable Object that centralizes state.
const store = new Map<string, { count: number; windowStart: number }>()

export const rateLimiterMiddleware: MiddlewareHandler = async (c, next) => {
  const apiKey = c.req.header('X-Api-Key') ?? 'anonymous'
  const now = Date.now()

  const bucket = store.get(apiKey)

  if (!bucket || now - bucket.windowStart >= WINDOW_MS) {
    store.set(apiKey, { count: 1, windowStart: now })
    return next()
  }

  if (bucket.count >= MAX_REQUESTS) {
    return c.json(buildError(429, 'Rate limit exceeded', c.req.path), 429)
  }

  bucket.count++
  return next()
}
