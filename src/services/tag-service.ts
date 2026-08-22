import { eq, ilike } from 'drizzle-orm'
import { createDb } from '../db/client'
import { tags, type Tag } from '../db/schema/tags'
import { BadRequestError, NotFoundError } from '../errors'
import type { NamedEntityResponse } from '../lib/types'

type Db = ReturnType<typeof createDb>

function toResponse(row: Tag): NamedEntityResponse {
  return { id: row.id, name: row.name }
}

export async function listTags(db: Db): Promise<NamedEntityResponse[]> {
  const rows = await db.select().from(tags)
  return rows.map(toResponse)
}

export async function searchTags(db: Db, query: string): Promise<NamedEntityResponse[]> {
  const rows = await db
    .select()
    .from(tags)
    .where(ilike(tags.name, `%${query}%`))
  return rows.map(toResponse)
}

export async function resolveTag(db: Db, id?: number | null, name?: string): Promise<Tag> {
  if (id == null && !name?.trim()) {
    throw new BadRequestError('Tag request must have either an ID or a name.')
  }

  if (id != null) {
    const [row] = await db.select().from(tags).where(eq(tags.id, id))
    if (!row) throw new NotFoundError(`Tag ID not found: ${id}`)
    return row
  }

  const [existing] = await db.select().from(tags).where(ilike(tags.name, name!))
  if (existing) return existing

  const [inserted] = await db
    .insert(tags)
    .values({ name: name! })
    .onConflictDoNothing({ target: tags.name })
    .returning()
  if (inserted) return inserted

  // Race condition: another request inserted the same name between our SELECT and INSERT.
  // Re-fetch to get the row that won the conflict.
  const [refetched] = await db.select().from(tags).where(ilike(tags.name, name!))
  return refetched!
}
