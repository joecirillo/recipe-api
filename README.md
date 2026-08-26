# recipe-api

Hono + Drizzle rewrite of `recipe-service` (Spring Boot), deployed on Cloudflare Workers.

**Production URL:** `https://recipe-api.joecirillo02.workers.dev`

## Rate limiting

Requests are rate limited to **60 per minute per API key**. Exceeding the limit returns a `429` response with the standard error envelope.

> **Note:** The current implementation uses an in-memory fixed window counter. This does not work correctly on Cloudflare Workers — each isolate maintains its own memory with no shared state, so the effective limit per key will be higher than 60 when requests are spread across instances. To enforce the limit globally, replace the in-memory store with a [Cloudflare Rate Limiting binding](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/) or a Durable Object.

## Environment variables

All variables are injected at runtime via Cloudflare secrets (production) or `.dev.vars` (local).

| Variable               | Description                                                                                                                                                              |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `DATABASE_URL`         | Postgres **direct** connection string (Supabase, port 5432) — used only by `drizzle-kit` migrations, which run outside the Worker and can't use the `HYPERDRIVE` binding |
| `USER_API_KEY`         | API key for standard access (`X-Api-Key` header)                                                                                                                         |
| `ADMIN_API_KEY`        | API key for admin routes (e.g. `DELETE /recipes/:id`)                                                                                                                    |
| `R2_ACCOUNT_ID`        | Cloudflare account ID — used to build the R2 S3-compatible endpoint                                                                                                      |
| `R2_ACCESS_KEY_ID`     | R2 API token access key ID, scoped to the `recipe-images` bucket                                                                                                         |
| `R2_SECRET_ACCESS_KEY` | R2 API token secret access key                                                                                                                                           |

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

### Image URL storage

`recipes.imageUrl` stores the R2 **key** (e.g. `recipes/<uuid>.jpg`), not a full URL — clients
should submit the presign response's `key` (not its `imageUrl`) as the recipe's `imageUrl` field.
`R2_PUBLIC_URL` is prepended on every read (`GET /recipes`, `GET /recipes/:id`, search, and the
`POST`/`PATCH` responses), so a future domain change (see #41) never requires rewriting existing
rows. Rows written before this change still hold a full URL and are returned unchanged — no
migration is required, though existing rows can optionally be backfilled to bare keys for
consistency.

`R2_PUBLIC_URL` points at a custom domain (`cdn.foodiesfinds.com`) connected to the `recipe-images`
R2 bucket. Connecting a custom domain to an R2 bucket is a Cloudflare dashboard-only step (R2 →
`recipe-images` → Settings → Custom Domains) and isn't something `wrangler.jsonc` can provision —
if you're setting this up fresh, connect the domain there before deploying, otherwise requests to
`R2_PUBLIC_URL` will 404.

### Database connection (Hyperdrive)

The Worker itself queries Postgres through a [Hyperdrive](https://developers.cloudflare.com/hyperdrive/)
binding (`HYPERDRIVE`), not `DATABASE_URL` directly — Hyperdrive keeps a warm connection pool near
Supabase so requests don't pay a full TCP+TLS+auth handshake on every invocation.

Both `DATABASE_URL` and the Hyperdrive config must point at Supabase's **direct connection (port 5432)**, not the Supavisor pooler (port 6543). Supavisor runs in transaction-pooling mode, which
doesn't support prepared statements — routing Hyperdrive through it would reintroduce that
constraint on top of Hyperdrive's own pooling. Supabase's direct connection defaults to IPv6; if
Hyperdrive's egress can't reach it, Supabase's IPv4 add-on (Pro plan+) provides a static IPv4
address for the direct connection.

One-time setup (see also the Deployment section below):

```bash
pnpm exec wrangler hyperdrive create recipe-api-db \
  --connection-string="postgresql://user:password@host:5432/dbname"
```

Copy the printed `id` into the `hyperdrive` binding's `id` field in `wrangler.jsonc`, replacing
`<HYPERDRIVE_ID>`.

## Local development

```bash
pnpm install
cp .dev.vars.example .dev.vars  # fill in values
pnpm dev
```

`.dev.vars` needs both `DATABASE_URL` (for `drizzle-kit`) and
`CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE` (read by `wrangler dev` in place of the
real Hyperdrive binding) pointed at Supabase's direct connection.

## Deployment

Pushes to `main` run `.github/workflows/deploy.yml`: install, `pnpm lint`, `pnpm format:check`,
`pnpm test`, then `wrangler deploy`. The deploy step only runs if lint/format/test all pass.

### CI/CD secrets

Set these as [GitHub Actions repository secrets](https://github.com/settings/secrets), not in
`wrangler.jsonc` — the account ID is treated as sensitive alongside the API token.

| Secret                  | Description                                                          |
| ----------------------- | -------------------------------------------------------------------- |
| `CLOUDFLARE_API_TOKEN`  | Token with `Workers Scripts:Edit` permission, scoped to this account |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare account ID the Worker deploys to                          |

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
4. Create the Hyperdrive config (see [Database connection](#database-connection-hyperdrive) above)
   and update the `id` in `wrangler.jsonc`'s `hyperdrive` binding.

### Deploy

```bash
pnpm run deploy
```

### Regenerate Worker types after config changes

```bash
pnpm run cf-typegen
```
