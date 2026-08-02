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

- Directory layout: `src/routes/`, `src/db/schema/`, `src/services/`, `src/middleware/`
- One Drizzle schema file per resource in `src/db/schema/`
- Response envelope: `{ data, error }` (mirrors the old response envelope pattern —
  update this line once the exact shape is finalized)
- Auth: API-key middleware, equivalent to the Spring Security filter in the old repo
- Rate limiting: middleware equivalent to the old Bucket4j setup
- Partial updates (PATCH) should ignore undefined fields, but null should nullify them. Null fields are ignored
  in recipe-service, null fields in recipe-api should clear the field

## Commands

- Dev server: `pnpm dev`
- Migrations: `npx drizzle-kit generate` then `npx drizzle-kit push`
- Tests: `pnpm test`
- Lint: `pnpm run lint`

## Definition of done for a migrated resource

- [ ] Drizzle schema matches the old entity's fields/types/relations
- [ ] Routes match old controller's HTTP contract (methods, status codes, params)
- [ ] Validation matches old DTO/service validation rules
- [ ] Tests pass and cover the same edge cases the old service handled
- [ ] Manually verified against a running dev server, not just "looks right"
