# recipe-api

Hono + Drizzle backend for `foodies-finds`, deployed on Cloudflare Workers.
The original implementation was `recipe-service` (Spring Boot). For tasks explicitly
porting remaining legacy behavior, compare the source repo; preserve the current
API contract and documented intentional differences such as PATCH null handling.

## Stack

- Hono (routing/middleware)
- Drizzle ORM + drizzle-kit (schema/migrations)
- Postgres (Supabase)
- Zod (request validation)
- Cloudflare Workers (application runtime), Hyperdrive (database connections), R2 (images)
- Node.js 24 (development tooling and tests)

## Resources

Recipe, Cuisine, Ingredient, Tag, Unit, Image. Recipe is the core entity with
relations to the others. These resources are already implemented; follow existing
routes, services, schemas, and tests when extending them.

## Conventions

- Directory layout: `src/routes/`, `src/db/schema/`, `src/services/`, `src/middleware/`, `src/lib/`
- One Drizzle schema file per resource in `src/db/schema/`
- Success envelope: `{ timestamp: string, status: number, message: string, data: unknown }` (`SuccessResponse` in `src/lib/response.ts`)
- Error envelope: `{ timestamp: string, status: number, message: string, path: string }` (`ErrorResponse` in `src/lib/response.ts`)
- Use `buildSuccess` / `buildError` from `src/lib/response.ts` in all route handlers — never construct the envelope inline
- Auth: API-key middleware, equivalent to the Spring Security filter in the old repo
- Rate limiting: current in-memory middleware is isolate-local on Workers; see README.md for its limitations
- Partial updates (PATCH) ignore undefined fields; explicit null clears nullable fields. This intentionally differs from recipe-service, which ignores null fields.

## Cross-repository API contract

- `foodies-finds` is the Next.js frontend; `recipe-api` is the Hono backend on Cloudflare Workers. Check the sibling repository when changing a shared contract.
- The frontend calls the backend on the server using `API_URL` and `API_KEY`; send the key in `X-Api-Key`. Never expose it through a `NEXT_PUBLIC_` variable. The backend accepts `USER_API_KEY` for ordinary access and requires `ADMIN_API_KEY` for deleting recipes.
- Success envelope: `{ timestamp: string, status: number, message: string, data: unknown }`. Error envelope: `{ timestamp: string, status: number, message: string, path: string }`. Frontend server-side helpers unwrap `data` and propagate useful error messages.
- PATCH leaves omitted fields unchanged. Explicit `null` clears nullable fields only; required fields must still satisfy the route's validation schema.
- Image uploads use `POST /recipes/images/presign`, then a direct PUT to R2. Submit the returned `key` as the recipe's `imageUrl`, not the public URL. Reads resolve stored keys to public URLs; legacy full URLs remain supported.

## Branch naming

- Format: `<type>/<issue-number>-<short-kebab-case-description>`
- Types: feat, fix, chore, refactor
- Example: `feat/142-fastapi-recipe-search`
- Always create branches off the latest `main` unless told otherwise.
- Pull the issue number from the GitHub issue being worked, and link a PR to its issue. For tasks without an issue, use `<type>/<short-kebab-case-description>`; do not invent an issue number.

## Commands

Use Node.js 24 and the pnpm version pinned in `package.json`. See README.md for local secrets and database setup.

- Install: `pnpm install --frozen-lockfile`
- Dev server: `pnpm dev`
- Drizzle commands: `pnpm db:introspect`, `pnpm db:generate`, and `pnpm db:push` explicitly load `.dev.vars`. Generation writes migration files; push applies schema changes directly to the configured database. Confirm the target database before applying changes; these are not validation commands.
- Type check: `pnpm typecheck`
- Regenerate Worker bindings after configuration changes: `pnpm cf-typegen`
- Tests: `pnpm test`
- Lint: `pnpm run lint`
- Format check: `pnpm run format:check` (use `pnpm run format` to auto-fix)

Run lint, formatting checks, tests, and type checking before handing off changes. Report checks that could not run.

## Definition of done for a migrated resource

Apply this checklist when the task is a migration from `recipe-service`.

- [ ] Drizzle schema matches the old entity's fields/types/relations
- [ ] Routes match old controller's HTTP contract (methods, status codes, params)
- [ ] Validation matches old DTO/service validation rules
- [ ] Tests pass and cover the same edge cases the old service handled
- [ ] Manually verified against a running dev server, not just "looks right"
