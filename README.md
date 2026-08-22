# recipe-api

Hono + Drizzle rewrite of `recipe-service` (Spring Boot), deployed on Cloudflare Workers.

**Production URL:** `https://recipe-api.joecirillo02.workers.dev`

## Rate limiting

Requests are rate limited to **60 per minute per API key**. Exceeding the limit returns a `429` response with the standard error envelope.

> **Note:** The current implementation uses an in-memory fixed window counter. This does not work correctly on Cloudflare Workers — each isolate maintains its own memory with no shared state, so the effective limit per key will be higher than 60 when requests are spread across instances. To enforce the limit globally, replace the in-memory store with a [Cloudflare Rate Limiting binding](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/) or a Durable Object.

## Environment variables

All variables are injected at runtime via Cloudflare secrets (production) or `.dev.vars` (local).

| Variable        | Description                                          |
| --------------- | ---------------------------------------------------- |
| `DATABASE_URL`  | Postgres connection string (Supabase)                |
| `USER_API_KEY`  | API key for standard access (`X-Api-Key` header)     |
| `ADMIN_API_KEY` | API key for admin routes (e.g. `DELETE /recipes/:id`) |

`R2_PUBLIC_URL` and `IMAGE_BUCKET` are configured in `wrangler.jsonc` and do not need to be set as secrets.

`R2_PUBLIC_URL` points at a custom domain (`cdn.foodiesfinds.com`) connected to the `recipe-images`
R2 bucket. Connecting a custom domain to an R2 bucket is a Cloudflare dashboard-only step (R2 →
`recipe-images` → Settings → Custom Domains) and isn't something `wrangler.jsonc` can provision —
if you're setting this up fresh, connect the domain there before deploying, otherwise requests to
`R2_PUBLIC_URL` will 404.

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
