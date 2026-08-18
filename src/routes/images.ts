import { Hono } from 'hono'
import { BadRequestError } from '../errors'
import { buildSuccess } from '../lib/response'
import { deleteImage, uploadImage } from '../services/image-service'

export const imageRouter = new Hono<{ Bindings: CloudflareBindings }>()

imageRouter.post('/', async (c) => {
  const formData = await c.req.formData()
  const file = formData.get('file')

  if (!(file instanceof File)) {
    throw new BadRequestError('File must not be empty')
  }

  const url = await uploadImage(c.env.IMAGE_BUCKET, c.env.R2_PUBLIC_URL, file)
  return c.json(buildSuccess(200, 'Image uploaded', url), 200)
})

imageRouter.delete('/', async (c) => {
  const key = c.req.query('key') ?? ''
  await deleteImage(c.env.IMAGE_BUCKET, key)
  return c.body(null, 204)
})
