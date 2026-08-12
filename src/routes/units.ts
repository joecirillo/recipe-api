import { Hono } from 'hono'
import { createDb } from '../db/client'
import { buildSuccess } from '../lib/response'
import { listUnits } from '../services/unit-service'

export const unitRouter = new Hono<{ Bindings: CloudflareBindings }>()

unitRouter.get('/', async (c) => {
  const db = createDb(c.env.DATABASE_URL)
  const data = await listUnits(db)
  return c.json(buildSuccess(200, 'Units retrieved', data), 200)
})
