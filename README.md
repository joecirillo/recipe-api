# recipe-api

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
