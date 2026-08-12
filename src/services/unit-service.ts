import { eq } from 'drizzle-orm'
import { createDb } from '../db/client'
import { units, type Unit } from '../db/schema/units'
import { NotFoundError } from '../errors'

type Db = ReturnType<typeof createDb>

export type UnitResponse = { id: number; name: string; abbreviation: string | null }

function toResponse(row: Unit): UnitResponse {
  return { id: row.id, name: row.name, abbreviation: row.abbreviation ?? null }
}

export async function listUnits(db: Db): Promise<UnitResponse[]> {
  const rows = await db.select().from(units)
  return rows.map(toResponse)
}

export async function resolveUnit(db: Db, id: number): Promise<Unit> {
  const [row] = await db.select().from(units).where(eq(units.id, id))
  if (!row) throw new NotFoundError(`Unit ID not found: ${id}`)
  return row
}
