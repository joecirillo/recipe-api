import { Hono } from 'hono'
import { createDb } from '../db/client'
import { buildSuccess } from '../lib/response'
import { listTags, searchTags } from '../services/tag-service'

export const tagRouter = new Hono<{ Bindings: CloudflareBindings }>()

tagRouter.get('/', async (c) => {
  const db = createDb(c.env.DATABASE_URL)
  const query = c.req.query('query')

  if (!query || !query.trim()) {
    const data = await listTags(db)
    return c.json(buildSuccess(200, 'Tags retrieved', data), 200)
  }

  const data = await searchTags(db, query)
  return c.json(buildSuccess(200, 'Tags queried', data), 200)
})
