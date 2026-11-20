export interface CursorPagination {
  nextCursor: string | null
  limit: number
}

export interface ResponseMeta {
  pagination?: CursorPagination
}

export interface ApiSuccessResponse<T> {
  timestamp: string
  status: number
  message: string
  data: T
  meta?: ResponseMeta
}

export interface ApiErrorResponse {
  timestamp: string
  status: number
  message: string
  path: string
  code?: string
}

export function buildSuccess<T>(
  status: number,
  message: string,
  data: T,
  meta?: ResponseMeta,
): ApiSuccessResponse<T> {
  const base = { timestamp: new Date().toISOString(), status, message, data }
  return meta ? { ...base, meta } : base
}

export function buildError(
  status: number,
  message: string,
  path: string,
  code?: string,
): ApiErrorResponse {
  const base = { timestamp: new Date().toISOString(), status, message, path }
  return code ? { ...base, code } : base
}
