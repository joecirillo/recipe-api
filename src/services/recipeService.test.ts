import { describe, expect, it, vi } from 'vitest'
import { listRecipes } from './recipeService'

function makeDb(rows: { id: number; name: string; imageUrl: string | null }[]) {
  const chain = {
    from: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    offset: vi.fn().mockResolvedValue(rows),
  }
  return {
    db: { select: vi.fn().mockReturnValue(chain) } as unknown as Parameters<typeof listRecipes>[0],
    chain,
  }
}

describe('listRecipes', () => {
  it('caps limit at 100', async () => {
    const { db, chain } = makeDb([])
    await listRecipes(db, 0, 999)
    expect(chain.limit).toHaveBeenCalledWith(100)
    expect(chain.offset).toHaveBeenCalledWith(0)
  })

  it('passes limit through when under 100', async () => {
    const { db, chain } = makeDb([])
    await listRecipes(db, 0, 12)
    expect(chain.limit).toHaveBeenCalledWith(12)
  })

  it('applies cap to offset calculation', async () => {
    const { db, chain } = makeDb([])
    await listRecipes(db, 2, 999)
    expect(chain.limit).toHaveBeenCalledWith(100)
    expect(chain.offset).toHaveBeenCalledWith(200)
  })
})
