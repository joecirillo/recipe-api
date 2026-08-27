import { describe, expect, it, vi } from 'vitest'
import { resolveIngredient } from './ingredient-service'

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
  } as unknown as Parameters<typeof resolveIngredient>[0]
  return { db, insertedVals }
}

describe('resolveIngredient', () => {
  it('title-cases the name for a newly inserted ingredient', async () => {
    const { db, insertedVals } = makeDb([])
    const result = await resolveIngredient(db, undefined, 'extra virgin OLIVE oil')
    expect(insertedVals[0].name).toBe('Extra Virgin Olive Oil')
    expect(result.name).toBe('Extra Virgin Olive Oil')
  })

  it('leaves an existing ingredient name untouched (does not retroactively normalize)', async () => {
    const { db } = makeDb([{ id: 1, name: 'olive OIL' }])
    const result = await resolveIngredient(db, undefined, 'Olive Oil')
    expect(result.name).toBe('olive OIL')
  })
})
