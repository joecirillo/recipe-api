import { describe, expect, it, vi } from 'vitest'
import { listRecipes, searchRecipes } from './recipeService'

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

// makeSearchDb returns a mock that handles both subquery builder calls (not awaited)
// and the final query call (awaited). The chain is thenable so `await chain` resolves
// to `rows`. Subqueries use the same chain object but are never awaited by the caller,
// so `.then()` is not triggered for them.
function makeSearchDb(rows: { id: number; name: string; imageUrl: string | null }[]) {
  const chain = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    // Makes the chain awaitable: `await chain` calls chain.then(resolve) → resolve(rows)
    then: vi.fn().mockImplementation((resolve: (v: unknown) => unknown) => resolve(rows)),
  }
  const db = {
    select: vi.fn().mockReturnValue(chain),
  } as unknown as Parameters<typeof searchRecipes>[0]
  return { db, chain }
}

describe('searchRecipes', () => {
  // For each text param, blank/whitespace values should be ignored (no conditions added).
  // When no conditions are added, .where() is called with undefined and only the one
  // final select() is made (no subqueries).
  it('ignores blank name param', async () => {
    const { db, chain } = makeSearchDb([])
    await searchRecipes(db, { name: '' })
    expect(db.select).toHaveBeenCalledTimes(1)
    expect(chain.where).toHaveBeenCalledWith(undefined)
  })

  it('ignores whitespace-only name param', async () => {
    const { db, chain } = makeSearchDb([])
    await searchRecipes(db, { name: '   ' })
    expect(db.select).toHaveBeenCalledTimes(1)
    expect(chain.where).toHaveBeenCalledWith(undefined)
  })

  it('ignores blank tag param', async () => {
    const { db, chain } = makeSearchDb([])
    await searchRecipes(db, { tag: '' })
    expect(db.select).toHaveBeenCalledTimes(1)
    expect(chain.where).toHaveBeenCalledWith(undefined)
  })

  it('ignores blank cuisine param', async () => {
    const { db, chain } = makeSearchDb([])
    await searchRecipes(db, { cuisine: '' })
    expect(db.select).toHaveBeenCalledTimes(1)
    expect(chain.where).toHaveBeenCalledWith(undefined)
  })

  it('ignores blank ingredient param', async () => {
    const { db, chain } = makeSearchDb([])
    await searchRecipes(db, { ingredient: '' })
    expect(db.select).toHaveBeenCalledTimes(1)
    expect(chain.where).toHaveBeenCalledWith(undefined)
  })

  // Text filters that use a direct column condition (no subquery)
  it('applies name filter (1 select call, truthy WHERE)', async () => {
    const { db, chain } = makeSearchDb([])
    await searchRecipes(db, { name: 'pasta' })
    expect(db.select).toHaveBeenCalledTimes(1)
    expect(chain.where).toHaveBeenCalledWith(expect.anything())
    expect(chain.where.mock.calls[0][0]).toBeDefined()
  })

  // cuisineId is an exact-match direct condition — no subquery
  it('applies cuisineId filter (1 select call, truthy WHERE)', async () => {
    const { db, chain } = makeSearchDb([])
    await searchRecipes(db, { cuisineId: 5 })
    expect(db.select).toHaveBeenCalledTimes(1)
    expect(chain.where.mock.calls[0][0]).toBeDefined()
  })

  // Cuisine text filter uses 1 subquery (cuisines table) → 2 total selects
  it('applies cuisine text filter (2 select calls)', async () => {
    const { db } = makeSearchDb([])
    await searchRecipes(db, { cuisine: 'italian' })
    expect(db.select).toHaveBeenCalledTimes(2)
  })

  // tagId uses 1 subquery (recipe_tags table) → 2 total selects
  it('applies tagId filter (2 select calls)', async () => {
    const { db } = makeSearchDb([])
    await searchRecipes(db, { tagId: 3 })
    expect(db.select).toHaveBeenCalledTimes(2)
  })

  // ingredientId uses 1 subquery (recipe_ingredients table) → 2 total selects
  it('applies ingredientId filter (2 select calls)', async () => {
    const { db } = makeSearchDb([])
    await searchRecipes(db, { ingredientId: 7 })
    expect(db.select).toHaveBeenCalledTimes(2)
  })

  // Tag text filter uses 2 subqueries (tags → recipe_tags) → 3 total selects
  it('applies tag text filter (3 select calls)', async () => {
    const { db } = makeSearchDb([])
    await searchRecipes(db, { tag: 'quick' })
    expect(db.select).toHaveBeenCalledTimes(3)
  })

  // Ingredient text filter uses 2 subqueries (ingredients → recipe_ingredients) → 3 total selects
  it('applies ingredient text filter (3 select calls)', async () => {
    const { db } = makeSearchDb([])
    await searchRecipes(db, { ingredient: 'garlic' })
    expect(db.select).toHaveBeenCalledTimes(3)
  })

  // Multiple filters AND together: name (0 subqueries) + tagId (1 subquery) = 2 selects
  it('ANDs multiple filters (combined select call count)', async () => {
    const { db } = makeSearchDb([])
    await searchRecipes(db, { name: 'pasta', tagId: 2 })
    expect(db.select).toHaveBeenCalledTimes(2)
  })

  it('maps null imageUrl to null in results', async () => {
    const { db } = makeSearchDb([{ id: 1, name: 'Pasta', imageUrl: null }])
    const result = await searchRecipes(db, {})
    expect(result[0].imageUrl).toBeNull()
  })

  it('maps non-null imageUrl correctly', async () => {
    const { db } = makeSearchDb([{ id: 1, name: 'Pasta', imageUrl: 'https://img.com/1.jpg' }])
    const result = await searchRecipes(db, {})
    expect(result[0].imageUrl).toBe('https://img.com/1.jpg')
  })

  it('returns empty array when no rows match', async () => {
    const { db } = makeSearchDb([])
    const result = await searchRecipes(db, { name: 'nonexistent' })
    expect(result).toEqual([])
  })
})

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
