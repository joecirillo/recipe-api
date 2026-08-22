# recipe-api

Hono + Drizzle rewrite of `recipe-service` (Spring Boot), deployed on Cloudflare Workers.

**Production URL:** `https://recipe-api.joecirillo02.workers.dev`

## Rate limiting

Requests are rate limited to **60 per minute per API key**. Exceeding the limit returns a `429` response with the standard error envelope.

> **Note:** The current implementation uses an in-memory fixed window counter. This does not work correctly on Cloudflare Workers — each isolate maintains its own memory with no shared state, so the effective limit per key will be higher than 60 when requests are spread across instances. To enforce the limit globally, replace the in-memory store with a [Cloudflare Rate Limiting binding](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/) or a Durable Object.

## Environment variables

All variables are injected at runtime via Cloudflare secrets (production) or `.dev.vars` (local).

| Variable                | Description                                                     |
| ----------------------- | ---------------------------------------------------------------- |
| `DATABASE_URL`          | Postgres connection string (Supabase)                            |
| `USER_API_KEY`          | API key for standard access (`X-Api-Key` header)                 |
| `ADMIN_API_KEY`         | API key for admin routes (e.g. `DELETE /recipes/:id`)            |
| `R2_ACCOUNT_ID`         | Cloudflare account ID — used to build the R2 S3-compatible endpoint |
| `R2_ACCESS_KEY_ID`      | R2 API token access key ID, scoped to the `recipe-images` bucket |
| `R2_SECRET_ACCESS_KEY`  | R2 API token secret access key                                   |

`R2_PUBLIC_URL`, `R2_BUCKET_NAME`, and `IMAGE_BUCKET` are configured in `wrangler.jsonc` and do not
need to be set as secrets.

### Presigned image uploads

`POST /recipes/images/presign` returns a short-lived, single-use presigned PUT URL so clients
upload images directly to R2 instead of routing the file through this API. Generating it requires
an **R2 API token** (Access Key ID / Secret Access Key), separate from your Cloudflare account
credentials:

1. Cloudflare dashboard → R2 → **Manage API tokens** → Create API token
2. Scope it to **Object Read & Write**, restricted to the `recipe-images` bucket
3. Copy the Access Key ID, Secret Access Key, and your Account ID into the secrets above

The old `POST /recipes/images` (server-mediated multipart upload) is now deprecated — it returns a
`Deprecation` header pointing at the presign endpoint — but stays functional until callers (e.g.
foodies-finds) migrate to the presigned flow.

## Local development

```bash
pnpm install
cp .dev.vars.example .dev.vars  # fill in values
pnpm dev
```

## Deployment

### One-time setup

1. Authenticate with Cloudflare: `pnpm exec wrangler login`
2. Provision secrets (you'll be prompted to paste each value):

```bash
pnpm exec wrangler secret put DATABASE_URL
pnpm exec wrangler secret put USER_API_KEY
pnpm exec wrangler secret put ADMIN_API_KEY
pnpm exec wrangler secret put R2_ACCOUNT_ID
pnpm exec wrangler secret put R2_ACCESS_KEY_ID
pnpm exec wrangler secret put R2_SECRET_ACCESS_KEY
```

3. Verify the `recipe-images` R2 bucket exists in your Cloudflare account. If not: `pnpm exec wrangler r2 bucket create recipe-images`

### Deploy

```bash
pnpm run deploy
```

### Regenerate Worker types after config changes

```bash
pnpm run cf-typegen
```
