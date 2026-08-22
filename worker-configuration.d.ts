interface R2Bucket {
  put(
    key: string,
    value: ArrayBuffer | ArrayBufferView | string | Blob | ReadableStream,
    options?: { httpMetadata?: { contentType?: string } },
  ): Promise<unknown>
  delete(keys: string | string[]): Promise<void>
}

interface Hyperdrive {
  readonly connectionString: string
  readonly host: string
  readonly port: number
  readonly user: string
  readonly password: string
  readonly database: string
}

interface CloudflareBindings {
  DATABASE_URL: string
  USER_API_KEY: string
  ADMIN_API_KEY: string
  IMAGE_BUCKET: R2Bucket
  R2_PUBLIC_URL: string
  HYPERDRIVE: Hyperdrive
}
