export type ImportErrorCode =
  | 'INVALID_URL'
  | 'SOURCE_NOT_ALLOWED'
  | 'FETCH_FAILED'
  | 'SOURCE_HTTP_ERROR'
  | 'FETCH_TIMEOUT'
  | 'SOURCE_BLOCKED'
  | 'RESPONSE_TOO_LARGE'
  | 'UNSUPPORTED_CONTENT_TYPE'
  | 'NO_RECIPE_FOUND'

// Messages are deliberately generic: they never carry upstream bodies, resolved
// addresses, or exception text.
export class ImportError extends Error {
  constructor(
    readonly code: ImportErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'ImportError'
  }
}
