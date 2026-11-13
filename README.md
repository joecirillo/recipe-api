# recipe-api

Hono + Drizzle rewrite of `recipe-service` (Spring Boot), deployed on Cloudflare Workers.

**Production URL:** `https://recipe-api.joecirillo02.workers.dev`

## Rate limiting

Requests are rate limited to **60 per minute per API key**. Exceeding the limit returns a `429` response with the standard error envelope.

> **Note:** The current implementation uses an in-memory fixed window counter. This does not work correctly on Cloudflare Workers — each isolate maintains its own memory with no shared state, so the effective limit per key will be higher than 60 when requests are spread across instances. To enforce the limit globally, replace the in-memory store with a [Cloudflare Rate Limiting binding](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/) or a Durable Object.

## Recipe import preview

`POST /recipes/import-preview` with `{ "url": "https://…" }` fetches a recipe page, extracts schema.org
Recipe JSON-LD and returns an editable preview (`buildSuccess(200, 'Recipe parsed', preview)`). It never
writes to the database; provenance (`sourceUrl`, plus the reviewed `author`) is persisted only when the
client saves through `POST /recipes`, which accepts an optional `sourceUrl` (absolute HTTPS, ≤ 2048 chars)
and returns it on every read. `sourceUrl` is set at creation only; `PATCH /recipes/:id` does not accept it yet.

**Deploy order: run `migrations/0080-recipe-source-url.sql` first, then deploy the API.** Reads now select `source_url`, so deploying the API before the column exists makes every recipe read fail. The migration is idempotent and adds a nullable column, so existing rows are untouched. Migrations are not applied automatically by the deployment workflow.

**Auth and rate limiting.** The route sits behind the same app-level `X-Api-Key` middleware as every other
route (`USER_API_KEY` or `ADMIN_API_KEY`), and both middlewares run before the handler, so rejected callers
trigger no outbound request. The rate limit key is the **API key** (an API client, not a user or IP). The
foodies-finds server actions all call with one server-side key, so every end user shares one 60/min bucket
(per isolate; see the rate limiting note above).

**Error codes.** Failures return the standard error envelope plus a stable `code`, all with HTTP 400:
`INVALID_URL`, `SOURCE_NOT_ALLOWED`, `FETCH_FAILED`, `SOURCE_HTTP_ERROR`, `FETCH_TIMEOUT`, `SOURCE_BLOCKED`,
`RESPONSE_TOO_LARGE`, `UNSUPPORTED_CONTENT_TYPE`, `NO_RECIPE_FOUND`. Messages never include upstream bodies,
resolved addresses or exception text. 401/429 keep the existing conventions.

**Safe outbound fetching: design and its limits.**

- HTTPS only, port 443 only, no credentials, no literal IPs, no single-label/`localhost` hosts.
- **Supported-source allowlist** (`IMPORT_ALLOWED_HOSTS` var in `wrangler.jsonc`, subdomains included;
  default: foodnetwork.com, seriouseats.com, simplehomeedit.com, allrecipes.com). This is a deliberate
  narrowing: Workers has no `dns.lookup` and no way to pin the TCP connection to a validated address, so
  arbitrary-domain fetching cannot be made DNS-rebinding-proof here, and this API does not claim it is.
  Only list publishers you trust: subdomains are included, and a broad entry weakens this guarantee. An
  explicitly empty value allows nothing (import disabled); leaving it unset uses the defaults.
- Defence in depth on top of the allowlist: before each hop the hostname is resolved over DNS-over-HTTPS
  and the request is refused if **any** A/AAAA answer is non-public (loopback, private, link-local, CGNAT,
  reserved/multicast, documentation, IPv4-mapped IPv6, NAT64, 6to4, Teredo). This check and the connection
  are still two separate lookups; the allowlist is what bounds that check-to-fetch gap.
- Redirects are never followed automatically: at most 3 are followed manually, each re-validated with the
  same URL, allowlist and DNS policy.
- One 10 s deadline covers DNS, redirects and body consumption; the body is streamed with a 5 MiB cap
  (Content-Length is ignored) and cancelled on overflow or timeout. Only `text/html` /
  `application/xhtml+xml` is accepted.
- Requests carry only `User-Agent: foodies-finds-recipe-import/1.0` and `Accept`; the API key and any
  cookies are never forwarded. Auth challenges and paywalls are reported as `SOURCE_BLOCKED`, not bypassed:
  upstream 401, 402 (Payment Required, used by pay-per-crawl paywalls), 403 and 429, plus Cloudflare
  `cf-mitigated: challenge` responses.

## Environment variables

Worker secrets are injected at runtime via Cloudflare secrets (production) or `.dev.vars` (local). Drizzle runs outside the Worker; the `db:*` scripts explicitly load `.dev.vars` into its process environment.

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

Use Node.js 24 (`nvm use`) and pnpm 10.33.2, pinned in `package.json`.
With Corepack installed, run `corepack enable` so `pnpm` uses that version.

```bash
pnpm install --frozen-lockfile
cp .dev.vars.example .dev.vars  # fill in development values
pnpm dev
```

The Worker listens at <http://localhost:8787>. Match the frontend's server-side
`API_KEY` to this backend's `USER_API_KEY`. The example keys are local placeholders,
not production credentials. Use a development database and R2 credentials for manual
endpoint checks; never commit `.dev.vars`.

`.dev.vars` needs both `DATABASE_URL` (for `drizzle-kit`) and
`CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE` (read by `wrangler dev` in place of the
real Hyperdrive binding) pointed at Supabase's direct connection.

## Validation and database tooling

```bash
pnpm lint
pnpm format:check
pnpm test
pnpm typecheck
```

These checks do not require production credentials. Pull requests and pushes to
`main` run them in GitHub Actions. Use `pnpm exec prettier --write <files>` to format
changed files. Worker bindings are declared in `worker-configuration.d.ts`; run
`pnpm cf-typegen` and review the generated changes when changing Worker configuration.

Drizzle does not automatically load Wrangler's `.dev.vars`. Use the wrappers below,
which run Node with `--env-file=.dev.vars` and read `DATABASE_URL` from it:

```bash
pnpm db:introspect  # inspect the configured DB and write schema files
pnpm db:generate    # generate migration files from schema changes
pnpm db:push        # apply schema changes directly to the configured DB
```

An existing shell `DATABASE_URL` takes precedence over the env file. Confirm that the
target is the intended development database before introspection or schema changes.
`db:push` applies a schema diff directly; it does not execute the SQL migration files
created by `db:generate`. Do not run these commands as part of routine validation.

## Coding agents

`AGENTS.md` is the shared instruction source for Codex and Claude Code; `CLAUDE.md`
imports it. Both agents use the same commands and API conventions. Existing Claude
skills, subagents, and GitHub workflows remain Claude-specific and unchanged.
When changing a shared API contract, inspect the sibling `foodies-finds` repository.

## Deployment

Pushes to `main` run `.github/workflows/deploy.yml`: install, `pnpm lint`, `pnpm format:check`,
`pnpm test`, `pnpm typecheck`, then `wrangler deploy`. The deploy step only runs if all checks pass.

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

### PostgreSQL integration tests

PostgreSQL integration tests are opt-in locally and do not run in CI. To run them,
set `RECIPE_TEST_POSTGRES_URL` to a disposable localhost PostgreSQL 17 server with a
role permitted to create databases, then run `pnpm test`. Do not use production
credentials.
The suite creates a uniquely named database, generates tables from the Drizzle
schema, recreates the old NOT NULL constraints, seeds a measured recipe, applies the
migration twice, and checks create/read, update/read, explicit clearing, omitted
PATCH ingredients, rollback after an invalid unit, and duplicate-ingredient
behavior. It drops only its own database when finished. Without this variable, the PostgreSQL integration suite is skipped;
the ordinary unit and route tests still run.
