export interface SuccessResponse {
  timestamp: string
  status: number
  message: string
  data: unknown
}

export interface ErrorResponse {
  timestamp: string
  status: number
  message: string
  path: string
}

export function buildSuccess(status: number, message: string, data: unknown): SuccessResponse {
  return { timestamp: new Date().toISOString(), status, message, data }
}

export function buildError(status: number, message: string, path: string): ErrorResponse {
  return { timestamp: new Date().toISOString(), status, message, path }
}
