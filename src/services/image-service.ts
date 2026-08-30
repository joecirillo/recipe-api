import { BadRequestError } from '../errors'
import { ALLOWED_IMAGE_TYPES, MAX_IMAGE_SIZE, buildImageKey } from '../lib/image-constraints'

export async function uploadImage(
  bucket: R2Bucket,
  publicUrl: string,
  file: File,
): Promise<string> {
  if (file.size === 0) {
    throw new BadRequestError('File must not be empty')
  }

  if (file.size > MAX_IMAGE_SIZE) {
    throw new BadRequestError('File exceeds 5MB limit')
  }

  const contentType = file.type
  if (!ALLOWED_IMAGE_TYPES.has(contentType)) {
    throw new BadRequestError('Unsupported file type. Allowed: jpeg, png, webp, gif, heic, heif')
  }

  const key = buildImageKey(contentType)

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
