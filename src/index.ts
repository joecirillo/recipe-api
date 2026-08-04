import { Hono } from 'hono'

const app = new Hono()

app.get('/health', (c) => c.json({ data: { status: 'ok' }, error: null }))

// Future routes mount here:
// app.route('/api/v1/recipes', recipesRouter)

export default app
