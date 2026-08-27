import { eq, ilike } from 'drizzle-orm'
import { createDb } from '../db/client'
import { ingredients, type Ingredient } from '../db/schema/ingredients'
import { BadRequestError, NotFoundError } from '../errors'
import { toTitleCase } from '../lib/text'
import type { NamedEntityResponse } from '../lib/types'

type Db = ReturnType<typeof createDb>

function toResponse(row: Ingredient): NamedEntityResponse {
  return { id: row.id, name: row.name }
}

export async function listIngredients(db: Db): Promise<NamedEntityResponse[]> {
  const rows = await db.select().from(ingredients)
  return rows.map(toResponse)
}

export async function searchIngredients(db: Db, query: string): Promise<NamedEntityResponse[]> {
  const rows = await db
    .select()
    .from(ingredients)
    .where(ilike(ingredients.name, `%${query}%`))
  return rows.map(toResponse)
}

export async function resolveIngredient(
  db: Db,
  id?: number | null,
  name?: string,
): Promise<Ingredient> {
  if (id == null && !name?.trim()) {
    throw new BadRequestError('Ingredient request must have either an ID or a name.')
  }

  if (id != null) {
    const [row] = await db.select().from(ingredients).where(eq(ingredients.id, id))
    if (!row) throw new NotFoundError(`Ingredient ID not found: ${id}`)
    return row
  }

  const [existing] = await db.select().from(ingredients).where(ilike(ingredients.name, name!))
  if (existing) return existing

  // ingredient_name is never updated after insertion — this is the only place it is written
  const [inserted] = await db
    .insert(ingredients)
    .values({ name: toTitleCase(name!) })
    .onConflictDoNothing({ target: ingredients.name })
    .returning()
  if (inserted) return inserted

  // Race condition: another request inserted the same name between our SELECT and INSERT.
  // Re-fetch to get the row that won the conflict.
  const [refetched] = await db.select().from(ingredients).where(ilike(ingredients.name, name!))
  return refetched!
}
