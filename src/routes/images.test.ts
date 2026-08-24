import { Hono } from 'hono'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BadRequestError } from '../errors'
import { authMiddleware } from '../middleware/auth'
import { errorHandler } from '../middleware/error-handler'
import * as imageService from '../services/image-service'
import * as presignService from '../services/presign-service'
import { imageRouter } from './images'

vi.mock('../services/image-service')
vi.mock('../services/presign-service')

type TestBindings = {
  USER_API_KEY: string
  ADMIN_API_KEY: string
  IMAGE_BUCKET: R2Bucket
  R2_PUBLIC_URL: string
  R2_BUCKET_NAME: string
  R2_ACCOUNT_ID: string
  R2_ACCESS_KEY_ID: string
  R2_SECRET_ACCESS_KEY: string
}

const USER_KEY = 'test-user-key'
const ADMIN_KEY = 'test-admin-key'
const TEST_ENV: TestBindings = {
  USER_API_KEY: USER_KEY,
  ADMIN_API_KEY: ADMIN_KEY,
  IMAGE_BUCKET: {} as unknown as R2Bucket,
  R2_PUBLIC_URL: 'https://pub-test.r2.dev',
  R2_BUCKET_NAME: 'recipe-images',
  R2_ACCOUNT_ID: 'test-account',
  R2_ACCESS_KEY_ID: 'test-key-id',
  R2_SECRET_ACCESS_KEY: 'test-secret',
}

const UPLOADED_URL = 'https://pub-test.r2.dev/recipes/abc-123.jpg'

function buildTestApp() {
  const app = new Hono<{ Bindings: TestBindings }>()
  app.onError(errorHandler)
  app.use('*', authMiddleware)
  app.route('/recipes/images', imageRouter)
  return app
}

const app = buildTestApp()

function uploadRequest(formData: FormData, apiKey?: string | null) {
  const headers: Record<string, string> = {}
  if (apiKey != null) headers['X-Api-Key'] = apiKey
  return app.request('/recipes/images', { method: 'POST', body: formData, headers }, TEST_ENV)
}

function deleteRequest(key: string, apiKey?: string | null) {
  const headers: Record<string, string> = {}
  if (apiKey != null) headers['X-Api-Key'] = apiKey
  return app.request(
    `/recipes/images?key=${encodeURIComponent(key)}`,
    { method: 'DELETE', headers },
    TEST_ENV,
  )
}

function presignRequest(body: unknown, apiKey?: string | null) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (apiKey != null) headers['X-Api-Key'] = apiKey
  return app.request(
    '/recipes/images/presign',
    { method: 'POST', body: JSON.stringify(body), headers },
    TEST_ENV,
  )
}

function makeFormData(file: File | null) {
  const form = new FormData()
  if (file) form.append('file', file)
  return form
}

function makeFile(content = 'fake image', name = 'photo.jpg', type = 'image/jpeg', size?: number) {
  if (size !== undefined) {
    return new File([new Uint8Array(size)], name, { type })
  }
  return new File([content], name, { type })
}

afterEach(() => {
  vi.clearAllMocks()
})

describe('POST /recipes/images', () => {
  it('returns 200 with public URL on valid upload', async () => {
    vi.mocked(imageService.uploadImage).mockResolvedValue(UPLOADED_URL)

    const res = await uploadRequest(makeFormData(makeFile()), USER_KEY)
    const body = (await res.json()) as Record<string, any>

    expect(res.status).toBe(200)
    expect(body.message).toBe('Image uploaded')
    expect(body.data).toBe(UPLOADED_URL)
  })

  it('marks the endpoint deprecated in favor of the presign endpoint', async () => {
    vi.mocked(imageService.uploadImage).mockResolvedValue(UPLOADED_URL)

    const res = await uploadRequest(makeFormData(makeFile()), USER_KEY)

    expect(res.headers.get('Deprecation')).toBe('true')
    expect(res.headers.get('Link')).toBe('</recipes/images/presign>; rel="successor-version"')
  })

  it('returns 400 when file field is missing from form', async () => {
    const res = await uploadRequest(makeFormData(null), USER_KEY)
    const body = (await res.json()) as Record<string, any>

    expect(res.status).toBe(400)
    expect(body.message).toBe('File must not be empty')
    expect(vi.mocked(imageService.uploadImage)).not.toHaveBeenCalled()
  })

  it('returns 400 when service rejects file exceeding 25MB', async () => {
    vi.mocked(imageService.uploadImage).mockRejectedValue(
      new BadRequestError('File exceeds 25MB limit'),
    )

    const res = await uploadRequest(makeFormData(makeFile()), USER_KEY)
    const body = (await res.json()) as Record<string, any>

    expect(res.status).toBe(400)
    expect(body.message).toBe('File exceeds 25MB limit')
  })

  it('propagates BadRequestError from service as 400 (error handler integration)', async () => {
    vi.mocked(imageService.uploadImage).mockRejectedValue(
      new BadRequestError('File must not be empty'),
    )

    const res = await uploadRequest(makeFormData(makeFile('')), USER_KEY)
    const body = (await res.json()) as Record<string, any>

    expect(res.status).toBe(400)
    expect(body.message).toBe('File must not be empty')
  })

  it('returns 400 when service rejects unsupported file type', async () => {
    vi.mocked(imageService.uploadImage).mockRejectedValue(
      new BadRequestError('Unsupported file type. Allowed: jpeg, png, webp, gif, heic, heif'),
    )

    const res = await uploadRequest(
      makeFormData(makeFile('pdf', 'doc.pdf', 'application/pdf')),
      USER_KEY,
    )
    const body = (await res.json()) as Record<string, any>

    expect(res.status).toBe(400)
    expect(body.message).toBe('Unsupported file type. Allowed: jpeg, png, webp, gif, heic, heif')
  })

  it('returns 401 when API key is missing', async () => {
    const res = await uploadRequest(makeFormData(makeFile()), null)
    expect(res.status).toBe(401)
  })
})

describe('DELETE /recipes/images', () => {
  it('returns 204 on valid key', async () => {
    vi.mocked(imageService.deleteImage).mockResolvedValue(undefined)

    const res = await deleteRequest('recipes/abc-123.jpg', USER_KEY)
    expect(res.status).toBe(204)
    expect(vi.mocked(imageService.deleteImage)).toHaveBeenCalledOnce()
  })

  it('returns 400 when key is blank', async () => {
    vi.mocked(imageService.deleteImage).mockRejectedValue(
      new BadRequestError('Image key must not be empty'),
    )

    const res = await deleteRequest('', USER_KEY)
    const body = (await res.json()) as Record<string, any>

    expect(res.status).toBe(400)
    expect(body.message).toBe('Image key must not be empty')
  })

  it('returns 400 when key does not start with recipes/', async () => {
    vi.mocked(imageService.deleteImage).mockRejectedValue(new BadRequestError('Invalid image key'))

    const res = await deleteRequest('other/abc-123.jpg', USER_KEY)
    const body = (await res.json()) as Record<string, any>

    expect(res.status).toBe(400)
    expect(body.message).toBe('Invalid image key')
  })

  it('returns 401 when API key is missing', async () => {
    const res = await deleteRequest('recipes/abc-123.jpg', null)
    expect(res.status).toBe(401)
  })

  it('allows delete with user key (not admin-only)', async () => {
    vi.mocked(imageService.deleteImage).mockResolvedValue(undefined)

    const res = await deleteRequest('recipes/abc-123.jpg', USER_KEY)
    expect(res.status).toBe(204)
  })
})

describe('POST /recipes/images/presign', () => {
  const PRESIGNED_RESULT = {
    uploadUrl: 'https://test-account.r2.cloudflarestorage.com/signed',
    key: 'recipes/abc-123.jpg',
    imageUrl: 'https://pub-test.r2.dev/recipes/abc-123.jpg',
  }

  it('returns 200 with the presigned upload payload on a valid request', async () => {
    vi.mocked(presignService.createPresignedUpload).mockResolvedValue(PRESIGNED_RESULT)

    const res = await presignRequest({ contentType: 'image/jpeg', contentLength: 1024 }, USER_KEY)
    const body = (await res.json()) as Record<string, any>

    expect(res.status).toBe(200)
    expect(body.message).toBe('Presigned upload URL created')
    expect(body.data).toEqual(PRESIGNED_RESULT)
    expect(vi.mocked(presignService.createPresignedUpload)).toHaveBeenCalledWith(
      {
        accountId: TEST_ENV.R2_ACCOUNT_ID,
        accessKeyId: TEST_ENV.R2_ACCESS_KEY_ID,
        secretAccessKey: TEST_ENV.R2_SECRET_ACCESS_KEY,
        publicUrl: TEST_ENV.R2_PUBLIC_URL,
      },
      TEST_ENV.R2_BUCKET_NAME,
      'image/jpeg',
      1024,
    )
  })

  it('returns 400 for a missing contentType (validation error)', async () => {
    const res = await presignRequest({ contentLength: 1024 }, USER_KEY)

    expect(res.status).toBe(400)
    expect(vi.mocked(presignService.createPresignedUpload)).not.toHaveBeenCalled()
  })

  it('returns 400 for a non-positive contentLength (validation error)', async () => {
    const res = await presignRequest({ contentType: 'image/jpeg', contentLength: 0 }, USER_KEY)

    expect(res.status).toBe(400)
    expect(vi.mocked(presignService.createPresignedUpload)).not.toHaveBeenCalled()
  })

  it('returns 400 when the service rejects an unsupported file type', async () => {
    vi.mocked(presignService.createPresignedUpload).mockRejectedValue(
      new BadRequestError('Unsupported file type. Allowed: jpeg, png, webp, gif, heic, heif'),
    )

    const res = await presignRequest(
      { contentType: 'application/pdf', contentLength: 1024 },
      USER_KEY,
    )
    const body = (await res.json()) as Record<string, any>

    expect(res.status).toBe(400)
    expect(body.message).toBe('Unsupported file type. Allowed: jpeg, png, webp, gif, heic, heif')
  })

  it('returns 401 when API key is missing', async () => {
    const res = await presignRequest({ contentType: 'image/jpeg', contentLength: 1024 }, null)
    expect(res.status).toBe(401)
  })
})
