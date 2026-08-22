import { afterEach, describe, expect, it, vi } from 'vitest'
import { BadRequestError } from '../errors'

const getSignedUrlMock = vi.fn()

vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: (...args: unknown[]) => getSignedUrlMock(...args),
}))

const { createPresignedUpload } = await import('./presign-service')

const CREDENTIALS = {
  accountId: 'test-account',
  accessKeyId: 'test-key-id',
  secretAccessKey: 'test-secret',
  publicUrl: 'https://pub-test.r2.dev',
}
const BUCKET = 'recipe-images'

afterEach(() => {
  vi.clearAllMocks()
})

describe('createPresignedUpload', () => {
  it('throws BadRequestError for an unsupported MIME type', async () => {
    await expect(
      createPresignedUpload(CREDENTIALS, BUCKET, 'application/pdf', 1024),
    ).rejects.toThrow(
      new BadRequestError('Unsupported file type. Allowed: jpeg, png, webp, gif, heic, heif'),
    )
    expect(getSignedUrlMock).not.toHaveBeenCalled()
  })

  it('throws BadRequestError for a non-positive contentLength', async () => {
    await expect(createPresignedUpload(CREDENTIALS, BUCKET, 'image/jpeg', 0)).rejects.toThrow(
      new BadRequestError('contentLength must be greater than 0'),
    )
    expect(getSignedUrlMock).not.toHaveBeenCalled()
  })

  it('throws BadRequestError for contentLength exceeding 25MB', async () => {
    await expect(
      createPresignedUpload(CREDENTIALS, BUCKET, 'image/jpeg', 25 * 1024 * 1024 + 1),
    ).rejects.toThrow(new BadRequestError('File exceeds 25MB limit'))
    expect(getSignedUrlMock).not.toHaveBeenCalled()
  })

  it('returns a presigned upload URL, key, and public image URL', async () => {
    getSignedUrlMock.mockResolvedValue('https://test-account.r2.cloudflarestorage.com/signed')

    const result = await createPresignedUpload(CREDENTIALS, BUCKET, 'image/png', 1024)

    expect(result.uploadUrl).toBe('https://test-account.r2.cloudflarestorage.com/signed')
    expect(result.key).toMatch(/^recipes\/[\w-]+\.png$/)
    expect(result.imageUrl).toBe(`${CREDENTIALS.publicUrl}/${result.key}`)
  })

  it('strips a trailing slash from publicUrl before building imageUrl', async () => {
    getSignedUrlMock.mockResolvedValue('https://test-account.r2.cloudflarestorage.com/signed')

    const result = await createPresignedUpload(
      { ...CREDENTIALS, publicUrl: 'https://pub-test.r2.dev/' },
      BUCKET,
      'image/jpeg',
      1024,
    )

    expect(result.imageUrl).toMatch(/^https:\/\/pub-test\.r2\.dev\/recipes\/[^/]/)
    expect(result.imageUrl).not.toMatch(/\.dev\/\//)
  })
})
