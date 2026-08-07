import { Hono } from 'hono'
import { z } from 'zod'
import { describe, expect, it } from 'vitest'
import { BadRequestError, DuplicateError, NotFoundError } from '../errors'
import { errorHandler } from './errorHandler'

function buildTestApp() {
  const app = new Hono()
  app.onError(errorHandler)

  app.get('/throw/not-found', () => {
    throw new NotFoundError()
  })
  app.get('/throw/not-found-custom', () => {
    throw new NotFoundError('Tag not found')
  })
  app.get('/throw/bad-request', () => {
    throw new BadRequestError()
  })
  app.get('/throw/bad-request-custom', () => {
    throw new BadRequestError('Name is required')
  })
  app.get('/throw/duplicate', () => {
    throw new DuplicateError()
  })
  app.get('/throw/duplicate-custom', () => {
    throw new DuplicateError('Cuisine already exists')
  })
  app.get('/throw/zod', () => {
    z.object({ name: z.string() }).parse({ name: 42 })
    return new Response()
  })
  app.get('/throw/unhandled', () => {
    throw new Error('something broke')
  })

  return app
}

const app = buildTestApp()

const ISO_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/

describe('errorHandler', () => {
  it('maps NotFoundError to 404 with default message', async () => {
    const res = await app.request('/throw/not-found')
    const body = await res.json()

    expect(res.status).toBe(404)
    expect(body.message).toBe('Not found')
    expect(body.path).toBe('/throw/not-found')
  })

  it('maps NotFoundError to 404 with custom message', async () => {
    const res = await app.request('/throw/not-found-custom')
    const body = await res.json()

    expect(res.status).toBe(404)
    expect(body.message).toBe('Tag not found')
  })

  it('maps BadRequestError to 400 with default message', async () => {
    const res = await app.request('/throw/bad-request')
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.message).toBe('Bad request')
  })

  it('maps BadRequestError to 400 with custom message', async () => {
    const res = await app.request('/throw/bad-request-custom')
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.message).toBe('Name is required')
  })

  it('maps DuplicateError to 409 with default message', async () => {
    const res = await app.request('/throw/duplicate')
    const body = await res.json()

    expect(res.status).toBe(409)
    expect(body.message).toBe('Data integrity violation')
  })

  it('maps DuplicateError to 409 with custom message', async () => {
    const res = await app.request('/throw/duplicate-custom')
    const body = await res.json()

    expect(res.status).toBe(409)
    expect(body.message).toBe('Cuisine already exists')
  })

  it('maps ZodError to 400 with first issue message only', async () => {
    const res = await app.request('/throw/zod')
    const body = await res.json()

    // z.object({ name: z.string() }).parse({ name: 42 }) produces a single issue
    // for the `name` field; only that first issue's message is surfaced
    expect(res.status).toBe(400)
    expect(body.message).toBe('Invalid input: expected string, received number')
  })

  it('maps unhandled errors to 500 without leaking details', async () => {
    const res = await app.request('/throw/unhandled')
    const text = await res.text()

    expect(res.status).toBe(500)
    expect(text).not.toContain('something broke')
    expect(text).not.toContain('stack')
  })

  it('includes correct envelope shape on error responses', async () => {
    const res = await app.request('/throw/not-found')
    const body = await res.json()

    expect(ISO_REGEX.test(body.timestamp)).toBe(true)
    expect(typeof body.status).toBe('number')
    expect(body.status).toBe(404)
    expect('data' in body).toBe(false)
    expect('path' in body).toBe(true)
  })
})
