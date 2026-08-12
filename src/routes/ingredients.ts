import { Hono } from 'hono'
import { createDb } from '../db/client'
import { buildSuccess } from '../lib/response'
import { listIngredients, searchIngredients } from '../services/ingredient-service'

export const ingredientRouter = new Hono<{ Bindings: CloudflareBindings }>()

ingredientRouter.get('/', async (c) => {
  const db = createDb(c.env.DATABASE_URL)
  const query = c.req.query('query')

  if (!query || !query.trim()) {
    const data = await listIngredients(db)
    return c.json(buildSuccess(200, 'Ingredients retrieved', data), 200)
  }

  const data = await searchIngredients(db, query)
  return c.json(buildSuccess(200, 'Ingredients queried', data), 200)
})
