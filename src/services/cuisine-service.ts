import { eq, ilike } from 'drizzle-orm'
import { createDb } from '../db/client'
import { cuisines, type Cuisine } from '../db/schema/cuisines'
import { BadRequestError, NotFoundError } from '../errors'
import type { NamedEntityResponse } from '../lib/types'

type Db = ReturnType<typeof createDb>

function toResponse(row: Cuisine): NamedEntityResponse {
  return { id: row.id, name: row.name }
}

export async function listCuisines(db: Db): Promise<NamedEntityResponse[]> {
  const rows = await db.select().from(cuisines)
  return rows.map(toResponse)
}

export async function searchCuisines(db: Db, query: string): Promise<NamedEntityResponse[]> {
  const rows = await db
    .select()
    .from(cuisines)
    .where(ilike(cuisines.name, `%${query}%`))
  return rows.map(toResponse)
}

export async function resolveCuisine(db: Db, id?: number | null, name?: string): Promise<Cuisine> {
  if (id == null && !name?.trim()) {
    throw new BadRequestError('Cuisine request must have either an ID or a name.')
  }

  if (id != null) {
    const [row] = await db.select().from(cuisines).where(eq(cuisines.id, id))
    if (!row) throw new NotFoundError(`Cuisine ID not found: ${id}`)
    return row
  }

  const [existing] = await db.select().from(cuisines).where(ilike(cuisines.name, name!))
  if (existing) return existing

  const [inserted] = await db
    .insert(cuisines)
    .values({ name: name! })
    .onConflictDoNothing({ target: cuisines.name })
    .returning()
  if (inserted) return inserted

  // Race condition: another request inserted the same name between our SELECT and INSERT.
  // Re-fetch to get the row that won the conflict.
  const [refetched] = await db.select().from(cuisines).where(ilike(cuisines.name, name!))
  return refetched!
}
