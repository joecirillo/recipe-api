import { eq, ilike } from 'drizzle-orm'
import { createDb } from '../db/client'
import { cuisines, type Cuisine } from '../db/schema/cuisines'
import { BadRequestError, NotFoundError } from '../errors'

type Db = ReturnType<typeof createDb>

export type CuisineResponse = { id: number; name: string }

function toResponse(row: Cuisine): CuisineResponse {
  return { id: row.id, name: row.name }
}

export async function listCuisines(db: Db): Promise<CuisineResponse[]> {
  const rows = await db.select().from(cuisines)
  return rows.map(toResponse)
}

export async function searchCuisines(db: Db, query: string): Promise<CuisineResponse[]> {
  const rows = await db.select().from(cuisines).where(ilike(cuisines.name, `%${query}%`))
  return rows.map(toResponse)
}

export async function resolveCuisine(db: Db, id?: number, name?: string): Promise<Cuisine> {
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
