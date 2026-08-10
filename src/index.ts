import { Hono } from 'hono'
import { authMiddleware } from './middleware/auth'
import { errorHandler } from './middleware/errorHandler'
import { rateLimiterMiddleware } from './middleware/rateLimiter'

const app = new Hono<{ Bindings: CloudflareBindings }>()

app.onError(errorHandler)

app.get('/health', (c) => c.json({ status: 'ok' }))

app.use('*', authMiddleware)
app.use('*', rateLimiterMiddleware)

// Future routes mount here:
// app.route('/api/v1/recipes', recipesRouter)

export default app
