interface R2Bucket {
  put(
    key: string,
    value: ArrayBuffer | ArrayBufferView | string | Blob | ReadableStream,
    options?: { httpMetadata?: { contentType?: string } },
  ): Promise<unknown>
  delete(keys: string | string[]): Promise<void>
}

interface CloudflareBindings {
  DATABASE_URL: string
  USER_API_KEY: string
  ADMIN_API_KEY: string
  IMAGE_BUCKET: R2Bucket
  R2_PUBLIC_URL: string
  R2_BUCKET_NAME: string
  R2_ACCOUNT_ID: string
  R2_ACCESS_KEY_ID: string
  R2_SECRET_ACCESS_KEY: string
}
