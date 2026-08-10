# recipe-api

## Rate limiting

Requests are rate limited to **60 per minute per API key**. Exceeding the limit returns a `429` response with the standard error envelope.

> **Note:** The current implementation uses an in-memory fixed window counter. This does not work correctly on Cloudflare Workers — each isolate maintains its own memory with no shared state, so the effective limit per key will be higher than 60 when requests are spread across instances. To enforce the limit globally, replace the in-memory store with a [Cloudflare Rate Limiting binding](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/) or a Durable Object.

## Environment variables

| Variable       | Description                                               |
| -------------- | --------------------------------------------------------- |
| `DATABASE_URL` | Postgres connection string for the Supabase/Neon database |

For local development, copy `.dev.vars.example` to `.dev.vars` and fill in the values. Wrangler reads `.dev.vars` automatically when running `pnpm dev`. In production, add `DATABASE_URL` as a Cloudflare Worker secret via `wrangler secret put DATABASE_URL`.

## Getting started

```txt
npm install
npm run dev
```

```txt
npm run deploy
```

[For generating/synchronizing types based on your Worker configuration run](https://developers.cloudflare.com/workers/wrangler/commands/#types):

```txt
npm run cf-typegen
```

Pass the `CloudflareBindings` as generics when instantiating `Hono`:

```ts
// src/index.ts
const app = new Hono<{ Bindings: CloudflareBindings }>()
```
