import { describe, expect, it, vi } from 'vitest'
import { resolveCuisine } from './cuisine-service'

function makeDb(existingRows: { id: number; name: string }[]) {
  const insertedVals: Record<string, unknown>[] = []
  const db = {
    select: vi.fn(() => ({
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue(existingRows),
    })),
    insert: vi.fn(() => ({
      values: vi.fn((vals: Record<string, unknown>) => {
        insertedVals.push(vals)
        return {
          onConflictDoNothing: vi.fn(() => ({
            returning: vi.fn().mockResolvedValue([{ id: 99, ...vals }]),
          })),
        }
      }),
    })),
  } as unknown as Parameters<typeof resolveCuisine>[0]
  return { db, insertedVals }
}

describe('resolveCuisine', () => {
  it('title-cases the name for a newly inserted cuisine', async () => {
    const { db, insertedVals } = makeDb([])
    const result = await resolveCuisine(db, undefined, 'ITALIAN')
    expect(insertedVals[0].name).toBe('Italian')
    expect(result.name).toBe('Italian')
  })

  it('leaves an existing cuisine name untouched (does not retroactively normalize)', async () => {
    const { db } = makeDb([{ id: 1, name: 'iTALIAN' }])
    const result = await resolveCuisine(db, undefined, 'Italian')
    expect(result.name).toBe('iTALIAN')
  })
})
