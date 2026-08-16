import { Hono } from 'hono'
import { authMiddleware } from './middleware/auth'
import { errorHandler } from './middleware/error-handler'
import { rateLimiterMiddleware } from './middleware/rate-limiter'
import { cuisineRouter } from './routes/cuisines'
import { ingredientRouter } from './routes/ingredients'
import { tagRouter } from './routes/tags'
import { unitRouter } from './routes/units'
import { imageRouter } from './routes/images'
import { recipeRouter } from './routes/recipes'

const app = new Hono<{ Bindings: CloudflareBindings }>()

app.onError(errorHandler)

app.get('/health', (c) => c.json({ status: 'ok' }))

app.use('*', authMiddleware)
app.use('*', rateLimiterMiddleware)

app.route('/cuisines', cuisineRouter)
app.route('/ingredients', ingredientRouter)
app.route('/tags', tagRouter)
app.route('/units', unitRouter)
app.route('/recipes/images', imageRouter)
app.route('/recipes', recipeRouter)

export default app
