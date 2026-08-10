import { Hono } from 'hono'
import { authMiddleware } from './middleware/auth'
import { errorHandler } from './middleware/errorHandler'

const app = new Hono<{ Bindings: CloudflareBindings }>()

app.onError(errorHandler)

app.get('/health', (c) => c.json({ status: 'ok' }))

app.use('*', authMiddleware)

// Future routes mount here:
// app.route('/api/v1/recipes', recipesRouter)

export default app
