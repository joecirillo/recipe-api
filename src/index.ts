import { Hono } from 'hono'

const app = new Hono()

app.get('/health', (c) => c.json({ status: 'ok' }))

// Future routes mount here:
// app.route('/api/v1/recipes', recipesRouter)

export default app
