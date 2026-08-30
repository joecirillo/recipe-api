import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { BadRequestError } from '../errors'
import { ALLOWED_IMAGE_TYPES, MAX_IMAGE_SIZE, buildImageKey } from '../lib/image-constraints'

// Single-use in practice: each call mints a fresh, randomly-keyed object, so a
// leaked URL only ever grants a PUT to that one key, not an update to an existing image.
const PRESIGN_EXPIRY_SECONDS = 300

export interface R2Credentials {
  accountId: string
  accessKeyId: string
  secretAccessKey: string
  publicUrl: string
}

export interface PresignedUpload {
  uploadUrl: string
  key: string
  imageUrl: string
}

export async function createPresignedUpload(
  credentials: R2Credentials,
  bucketName: string,
  contentType: string,
  contentLength: number,
): Promise<PresignedUpload> {
  if (!ALLOWED_IMAGE_TYPES.has(contentType)) {
    throw new BadRequestError('Unsupported file type. Allowed: jpeg, png, webp, gif, heic, heif')
  }
  if (contentLength <= 0) {
    throw new BadRequestError('contentLength must be greater than 0')
  }
  if (contentLength > MAX_IMAGE_SIZE) {
    throw new BadRequestError('File exceeds 5MB limit')
  }

  const key = buildImageKey(contentType)

  const client = new S3Client({
    region: 'auto',
    endpoint: `https://${credentials.accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
    },
  })

  // ContentType is part of the signed request, so the client's PUT must send an
  // identical Content-Type header or R2 will reject the upload with a signature
  // mismatch. contentLength is intentionally NOT bound into the signature — S3-style
  // presigned PUTs don't reliably enforce an exact body size, so it's only used above
  // as an upfront sanity check, not a guarantee the uploaded object matches it.
  const uploadUrl = await getSignedUrl(
    client,
    new PutObjectCommand({ Bucket: bucketName, Key: key, ContentType: contentType }),
    { expiresIn: PRESIGN_EXPIRY_SECONDS },
  )

  return {
    uploadUrl,
    key,
    imageUrl: `${credentials.publicUrl.replace(/\/$/, '')}/${key}`,
  }
}
