import { Hono } from 'hono'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { requestLogger } from './request-logger'

function buildTestApp() {
  const app = new Hono()
  app.use('/ok', requestLogger('widget upload'))
  app.post('/ok', (c) => c.json({ ok: true }, 201))

  app.use('/boom', requestLogger('widget upload'))
  app.post('/boom', () => {
    throw new Error('widget explosion')
  })

  return app
}

describe('requestLogger', () => {
  let app: Hono
  let logSpy: ReturnType<typeof vi.spyOn>
  let errorSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    app = buildTestApp()
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
  })

  afterEach(() => {
    logSpy.mockRestore()
    errorSpy.mockRestore()
  })

  it('logs a structured success entry with method, path, and status', async () => {
    const res = await app.request('/ok', { method: 'POST' })
    expect(res.status).toBe(201)

    expect(logSpy).toHaveBeenCalledTimes(1)
    const entry = JSON.parse(logSpy.mock.calls[0][0] as string)
    expect(entry).toMatchObject({
      message: 'widget upload succeeded',
      method: 'POST',
      path: '/ok',
      status: 201,
    })
    expect(typeof entry.durationMs).toBe('number')
  })

  it('logs a structured failure entry at error severity for non-2xx responses', async () => {
    const res = await app.request('/boom', { method: 'POST' })
    expect(res.status).toBe(500)

    // Hono's own default error handler also logs the raw thrown error ahead of
    // this middleware's entry, since it resolves next() with the 500 response
    // rather than rejecting. Ours is always the last call.
    const lastCall = errorSpy.mock.calls.at(-1)?.[0] as string
    const entry = JSON.parse(lastCall)
    expect(entry).toMatchObject({
      message: 'widget upload failed',
      method: 'POST',
      path: '/boom',
      status: 500,
    })
    expect(logSpy).not.toHaveBeenCalled()
  })
})
