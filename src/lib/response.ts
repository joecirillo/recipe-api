export interface ApiSuccessResponse<T> {
  timestamp: string
  status: number
  message: string
  data: T
}

export interface ApiErrorResponse {
  timestamp: string
  status: number
  message: string
  path: string
}

export function buildSuccess<T>(status: number, message: string, data: T): ApiSuccessResponse<T> {
  return { timestamp: new Date().toISOString(), status, message, data }
}

export function buildError(status: number, message: string, path: string): ApiErrorResponse {
  return { timestamp: new Date().toISOString(), status, message, path }
}
