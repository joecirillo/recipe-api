import { BadRequestError } from '../errors'

const ALLOWED_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/heic',
  'image/heif',
])

const EXTENSION_MAP: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/heic': 'heic',
  'image/heif': 'heif',
}

export async function uploadImage(
  bucket: R2Bucket,
  publicUrl: string,
  file: File,
): Promise<string> {
  if (file.size === 0) {
    throw new BadRequestError('File must not be empty')
  }

  const contentType = file.type
  if (!ALLOWED_TYPES.has(contentType)) {
    throw new BadRequestError('Unsupported file type. Allowed: jpeg, png, webp, gif, heic, heif')
  }

  const ext = EXTENSION_MAP[contentType] ?? 'jpg'
  const key = `recipes/${crypto.randomUUID()}.${ext}`

  await bucket.put(key, await file.arrayBuffer(), { httpMetadata: { contentType } })

  return `${publicUrl.replace(/\/$/, '')}/${key}`
}

export async function deleteImage(bucket: R2Bucket, key: string): Promise<void> {
  if (!key || key.trim().length === 0) {
    throw new BadRequestError('Image key must not be empty')
  }
  if (!key.startsWith('recipes/')) {
    throw new BadRequestError('Invalid image key')
  }

  await bucket.delete(key)
}
