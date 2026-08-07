import type { ErrorHandler } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { ZodError } from 'zod'
import { BadRequestError, DuplicateError, NotFoundError } from '../errors'
import { buildError } from '../lib/response'

export const errorHandler: ErrorHandler = (err, c) => {
  const path = c.req.path

  if (err instanceof NotFoundError) {
    return c.json(buildError(404, err.message, path), 404)
  }

  if (err instanceof BadRequestError) {
    return c.json(buildError(400, err.message, path), 400)
  }

  if (err instanceof DuplicateError) {
    return c.json(buildError(409, err.message, path), 409)
  }

  if (err instanceof ZodError) {
    const message = err.issues[0]?.message ?? 'Validation error'
    return c.json(buildError(400, message, path), 400)
  }

  if (err instanceof HTTPException) {
    return c.json(buildError(err.status, err.message, path), err.status)
  }

  console.error(err)
  return c.json(buildError(500, 'Internal server error', path), 500)
}
