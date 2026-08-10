import { Hono } from 'hono'
import { authMiddleware } from './middleware/auth'
import { errorHandler } from './middleware/errorHandler'
import { rateLimiterMiddleware } from './middleware/rateLimiter'
import { cuisineRouter } from './routes/cuisines'

const app = new Hono<{ Bindings: CloudflareBindings }>()

app.onError(errorHandler)

app.get('/health', (c) => c.json({ status: 'ok' }))

app.use('*', authMiddleware)
app.use('*', rateLimiterMiddleware)

app.route('/cuisines', cuisineRouter)

export default app
