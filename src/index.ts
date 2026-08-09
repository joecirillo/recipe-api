import { Hono } from 'hono'
import { errorHandler } from './middleware/errorHandler'
import { buildSuccess } from './lib/response'

const app = new Hono<{ Bindings: CloudflareBindings }>()

app.onError(errorHandler)

app.get('/health', (c) => c.json({ status: 'ok' }))

// Future routes mount here:
// app.route('/api/v1/recipes', recipesRouter)

export default app
