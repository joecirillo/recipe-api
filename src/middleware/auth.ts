import type { MiddlewareHandler } from 'hono'
import { buildError } from '../lib/response'

// Mirrors the Java regex "/recipes/\\d+" — tied to the flat mount path.
// Update this if routes move under a prefix (e.g. /api/v1/recipes/:id).
const ADMIN_ROUTE_REGEX = /^\/recipes\/\d+$/

export const authMiddleware: MiddlewareHandler<{ Bindings: CloudflareBindings }> = async (
  c,
  next,
) => {
  const apiKey = c.req.header('X-Api-Key')
  const userKey = c.env.USER_API_KEY
  const adminKey = c.env.ADMIN_API_KEY

  const isAdminRoute = c.req.method === 'DELETE' && ADMIN_ROUTE_REGEX.test(c.req.path)

  if (apiKey) {
    if (isAdminRoute && apiKey === adminKey) {
      return next()
    }
    if (!isAdminRoute && (apiKey === userKey || apiKey === adminKey)) {
      return next()
    }
  }

  return c.json(buildError(401, 'Invalid or missing API key', c.req.path), 401)
}
