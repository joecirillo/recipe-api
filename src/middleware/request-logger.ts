import type { MiddlewareHandler } from 'hono'

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
