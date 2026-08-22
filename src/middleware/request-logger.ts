import type { MiddlewareHandler } from 'hono'

// Relies on downstream errors resolving `next()` with a response rather than
// rejecting (true for every thrown type in this app, since app.onError only
// intercepts `instanceof Error`). A non-Error throw would reject past this
// middleware and skip logging for that request.
export const requestLogger =
  (action: string): MiddlewareHandler =>
  async (c, next) => {
    const start = Date.now()
    await next()

    const entry = {
      message: `${action} ${c.res.status >= 400 ? 'failed' : 'succeeded'}`,
      method: c.req.method,
      path: c.req.path,
      status: c.res.status,
      durationMs: Date.now() - start,
    }

    if (c.res.status >= 400) {
      console.error(JSON.stringify(entry))
    } else {
      console.log(JSON.stringify(entry))
    }
  }
