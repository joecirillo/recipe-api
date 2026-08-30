import { afterEach, describe, expect, it, vi } from 'vitest'
import { BadRequestError } from '../errors'
import { deleteImage, uploadImage } from './image-service'

const PUBLIC_URL = 'https://pub-test.r2.dev'

function makeBucket() {
  return {
    put: vi.fn().mockResolvedValue({}),
    delete: vi.fn().mockResolvedValue(undefined),
  } as unknown as R2Bucket
}

function makeFile(content: string | Uint8Array, name: string, type: string) {
  return new File([content], name, { type })
}

afterEach(() => {
  vi.clearAllMocks()
})

describe('uploadImage', () => {
  it('throws BadRequestError for a zero-byte file', async () => {
    const bucket = makeBucket()
    const file = makeFile(new Uint8Array(0), 'empty.jpg', 'image/jpeg')

    await expect(uploadImage(bucket, PUBLIC_URL, file)).rejects.toThrow(
      new BadRequestError('File must not be empty'),
    )
    expect(vi.mocked(bucket.put)).not.toHaveBeenCalled()
  })

  it('throws BadRequestError for a file exceeding 5MB', async () => {
    const bucket = makeBucket()
    // Use a mock object so we don't allocate 5MB in the test
    const file = { size: 5 * 1024 * 1024 + 1, type: 'image/jpeg' } as unknown as File

    await expect(uploadImage(bucket, PUBLIC_URL, file)).rejects.toThrow(
      new BadRequestError('File exceeds 5MB limit'),
    )
    expect(vi.mocked(bucket.put)).not.toHaveBeenCalled()
  })

  it('throws BadRequestError for an unsupported MIME type', async () => {
    const bucket = makeBucket()
    const file = makeFile('data', 'doc.pdf', 'application/pdf')

    await expect(uploadImage(bucket, PUBLIC_URL, file)).rejects.toThrow(
      new BadRequestError('Unsupported file type. Allowed: jpeg, png, webp, gif, heic, heif'),
    )
    expect(vi.mocked(bucket.put)).not.toHaveBeenCalled()
  })

  it.each([
    ['image/jpeg', 'jpg'],
    ['image/png', 'png'],
    ['image/webp', 'webp'],
    ['image/gif', 'gif'],
    ['image/heic', 'heic'],
    ['image/heif', 'heif'],
  ])('uploads %s and returns URL with .%s extension', async (mimeType, ext) => {
    const bucket = makeBucket()
    const file = makeFile('data', `photo.${ext}`, mimeType)

    const url = await uploadImage(bucket, PUBLIC_URL, file)

    expect(vi.mocked(bucket.put)).toHaveBeenCalledOnce()
    const [key, , opts] = vi.mocked(bucket.put).mock.calls[0]
    expect(key).toMatch(new RegExp(`^recipes/[\\w-]+\\.${ext}$`))
    expect(opts).toEqual({ httpMetadata: { contentType: mimeType } })
    expect(url).toBe(`${PUBLIC_URL}/${key}`)
  })

  it('strips trailing slash from publicUrl before building the URL', async () => {
    const bucket = makeBucket()
    const file = makeFile('data', 'photo.jpg', 'image/jpeg')

    const url = await uploadImage(bucket, 'https://pub-test.r2.dev/', file)

    expect(url).toMatch(/^https:\/\/pub-test\.r2\.dev\/recipes\/[^/]/)
    expect(url).not.toMatch(/\.dev\/\//)
  })
})

describe('deleteImage', () => {
  it('throws BadRequestError for a blank key', async () => {
    const bucket = makeBucket()

    await expect(deleteImage(bucket, '')).rejects.toThrow(
      new BadRequestError('Image key must not be empty'),
    )
    expect(vi.mocked(bucket.delete)).not.toHaveBeenCalled()
  })

  it('throws BadRequestError for a whitespace-only key', async () => {
    const bucket = makeBucket()

    await expect(deleteImage(bucket, '   ')).rejects.toThrow(
      new BadRequestError('Image key must not be empty'),
    )
    expect(vi.mocked(bucket.delete)).not.toHaveBeenCalled()
  })

  it('throws BadRequestError when key does not start with recipes/', async () => {
    const bucket = makeBucket()

    await expect(deleteImage(bucket, 'uploads/photo.jpg')).rejects.toThrow(
      new BadRequestError('Invalid image key'),
    )
    expect(vi.mocked(bucket.delete)).not.toHaveBeenCalled()
  })

  it('calls bucket.delete with the key on a valid prefixed key', async () => {
    const bucket = makeBucket()

    await deleteImage(bucket, 'recipes/abc-123.jpg')

    expect(vi.mocked(bucket.delete)).toHaveBeenCalledWith('recipes/abc-123.jpg')
  })
})
