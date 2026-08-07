# recipe-api

Hono + Drizzle rewrite of `recipe-service` (Spring Boot). This is a **port**, not a
redesign — when in doubt about behavior, defer to the source repo, not intuition.

## Stack

- Hono (routing/middleware)
- Drizzle ORM + drizzle-kit (schema/migrations)
- Postgres (Supabase)
- Zod (request validation)
- Node.js (runtime)

## Source of truth for migration

The old service lives at `../recipe-service` (Spring Boot). When implementing or
reviewing any resource, read the equivalent files there first:

- `controller/` → route definitions and HTTP contract (status codes, params)
- `entity/` → Drizzle schema fields, types, relations
- `dto/` + `mapper/` → request/response shape, what's included/excluded on partial updates
- `service/` → business logic, edge cases
- `specification/` → dynamic filtering — port to Drizzle's query builder, don't reinvent it
- `repository/` → query patterns worth preserving

Do not guess at validation rules or edge cases that exist in the Java code — read them.

## Resources (from recipe-service controllers)

Recipe, Cuisine, Ingredient, Tag, Unit, Image. Recipe is the core entity with
relations to the others; Cuisine/Ingredient/Tag/Unit are simpler reference tables —
build those first to establish conventions before tackling Recipe.

## Conventions

- Directory layout: `src/routes/`, `src/db/schema/`, `src/services/`, `src/middleware/`, `src/lib/`
- One Drizzle schema file per resource in `src/db/schema/`
- Success envelope: `{ timestamp: string, status: number, message: string, data: unknown }` (`SuccessResponse` in `src/lib/response.ts`)
- Error envelope: `{ timestamp: string, status: number, message: string, path: string }` (`ErrorResponse` in `src/lib/response.ts`)
- Use `buildSuccess` / `buildError` from `src/lib/response.ts` in all route handlers — never construct the envelope inline
- Auth: API-key middleware, equivalent to the Spring Security filter in the old repo
- Rate limiting: middleware equivalent to the old Bucket4j setup
- Partial updates (PATCH) should ignore undefined fields, but null should nullify them. Null fields are ignored
  in recipe-service, null fields in recipe-api should clear the field

## Branch naming

- Format: `<type>/<issue-number>-<short-kebab-case-description>`
- Types: feat, fix, chore, refactor
- Example: `feat/142-fastapi-recipe-search`
- Always create branches off the latest `main` unless told otherwise.
- Pull the issue number from the GitHub issue being worked, and link a PR to its issue

## Commands

- Dev server: `pnpm dev`
- Introspect (bootstrap schema from existing DB): `pnpm exec drizzle-kit introspect`
- Migrations: `pnpm exec drizzle-kit generate` then `pnpm exec drizzle-kit push`
- Tests: `pnpm test`
- Lint: `pnpm run lint`
- Format check: `pnpm run format:check` (use `pnpm run format` to auto-fix)

## Definition of done for a migrated resource

- [ ] Drizzle schema matches the old entity's fields/types/relations
- [ ] Routes match old controller's HTTP contract (methods, status codes, params)
- [ ] Validation matches old DTO/service validation rules
- [ ] Tests pass and cover the same edge cases the old service handled
- [ ] Manually verified against a running dev server, not just "looks right"
