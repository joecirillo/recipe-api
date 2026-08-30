export const MAX_IMAGE_SIZE = 5 * 1024 * 1024 // 5 MB

export const ALLOWED_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/heic',
  'image/heif',
])

const EXTENSION_BY_TYPE: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/heic': 'heic',
  'image/heif': 'heif',
}

export function buildImageKey(contentType: string): string {
  const ext = EXTENSION_BY_TYPE[contentType] ?? 'jpg'
  return `recipes/${crypto.randomUUID()}.${ext}`
}
