export class NotFoundError extends Error {
  readonly statusCode = 404

  constructor(message = 'Not found') {
    super(message)
    this.name = 'NotFoundError'
  }
}

export class BadRequestError extends Error {
  readonly statusCode = 400

  constructor(message = 'Bad request') {
    super(message)
    this.name = 'BadRequestError'
  }
}

export class DuplicateError extends Error {
  readonly statusCode = 409

  constructor(message = 'Data integrity violation') {
    super(message)
    this.name = 'DuplicateError'
  }
}
