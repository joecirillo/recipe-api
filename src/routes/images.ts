import { Hono } from 'hono'
import { z } from 'zod'
import { BadRequestError } from '../errors'
import { buildSuccess } from '../lib/response'
import { requestLogger } from '../middleware/request-logger'
import { deleteImage, uploadImage } from '../services/image-service'
import { createPresignedUpload } from '../services/presign-service'

export const imageRouter = new Hono<{ Bindings: CloudflareBindings }>()

const PresignRequestSchema = z.object({
  contentType: z.string().min(1),
  contentLength: z.number().int().positive(),
})

// Deprecated: server-mediated upload. Use POST /presign instead — the client
// uploads directly to R2 and this endpoint will be removed once callers migrate.
imageRouter.post('/', requestLogger('image upload'), async (c) => {
  const formData = await c.req.formData()
  const file = formData.get('file')

  if (!(file instanceof File)) {
    throw new BadRequestError('File must not be empty')
  }

  const url = await uploadImage(c.env.IMAGE_BUCKET, c.env.R2_PUBLIC_URL, file)
  c.header('Deprecation', 'true')
  c.header('Link', '</recipes/images/presign>; rel="successor-version"')
  return c.json(buildSuccess(200, 'Image uploaded', url), 200)
})

imageRouter.post('/presign', requestLogger('image presign'), async (c) => {
  const body = await c.req.json()
  const { contentType, contentLength } = PresignRequestSchema.parse(body)

  const data = await createPresignedUpload(
    {
      accountId: c.env.R2_ACCOUNT_ID,
      accessKeyId: c.env.R2_ACCESS_KEY_ID,
      secretAccessKey: c.env.R2_SECRET_ACCESS_KEY,
      publicUrl: c.env.R2_PUBLIC_URL,
    },
    c.env.R2_BUCKET_NAME,
    contentType,
    contentLength,
  )

  return c.json(buildSuccess(200, 'Presigned upload URL created', data), 200)
})

imageRouter.delete('/', requestLogger('image delete'), async (c) => {
  const key = c.req.query('key') ?? ''
  await deleteImage(c.env.IMAGE_BUCKET, key)
  return c.body(null, 204)
})
