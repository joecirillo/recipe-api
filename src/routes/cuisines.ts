import { Hono } from 'hono'
import { createDb } from '../db/client'
import { buildSuccess } from '../lib/response'
import { listCuisines, searchCuisines } from '../services/cuisineService'

export const cuisineRouter = new Hono<{ Bindings: CloudflareBindings }>()

cuisineRouter.get('/', async (c) => {
  const db = createDb(c.env.DATABASE_URL)
  const query = c.req.query('query')

  if (!query || !query.trim()) {
    const data = await listCuisines(db)
    return c.json(buildSuccess(200, 'Cuisines retrieved', data), 200)
  }

  const data = await searchCuisines(db, query)
  return c.json(buildSuccess(200, 'Cuisines queried', data), 200)
})
