import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createRecipe,
  deleteRecipe,
  listRecipes,
  searchRecipes,
  updateRecipe,
} from './recipeService'
import { recipeIngredients, recipeInstructionSteps, recipes } from '../db/schema'
import { NotFoundError } from '../errors'
import { deleteImage } from './image-service'

vi.mock('./cuisine-service', () => ({
  resolveCuisine: vi.fn().mockResolvedValue({ id: 1, name: 'Italian' }),
}))
vi.mock('./ingredient-service', () => ({
  resolveIngredient: vi.fn().mockResolvedValue({ id: 10, name: 'Spaghetti' }),
}))
vi.mock('./unit-service', () => ({
  resolveUnit: vi.fn().mockResolvedValue({ id: 1, name: 'Gram', abbreviation: 'g' }),
}))
vi.mock('./tag-service', () => ({
  resolveTag: vi.fn().mockResolvedValue({ id: 5, name: 'Quick' }),
}))
vi.mock('./image-service', () => ({
  deleteImage: vi.fn(),
}))

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

// The real postgres driver throws on `undefined` bind params (only `null` is a valid SQL
// NULL). rejectUndefined below simulates that so any insert/update `.values()`/`.set()`
// call touching an omitted optional field fails the test the same way it would in
// production, rather than silently passing like a plain mock would.
function rejectUndefined(vals: Record<string, unknown>) {
  for (const [key, value] of Object.entries(vals)) {
    if (value === undefined) {
      throw new Error(`Undefined values are not allowed (column "${key}")`)
    }
  }
}

function makeRecipeDb(finalRow: { id: number; [key: string]: unknown }) {
  const insertedValues: { table: unknown; vals: Record<string, unknown> }[] = []
  const updatedValues: Record<string, unknown>[] = []
  const tx = {
    insert: vi.fn((table: unknown) => ({
      values: vi.fn((vals: Record<string, unknown>) => {
        rejectUndefined(vals)
        insertedValues.push({ table, vals })
        if (table === recipes) {
          return { returning: vi.fn().mockResolvedValue([{ id: finalRow.id }]) }
        }
        return Promise.resolve(undefined)
      }),
    })),
    update: vi.fn(() => ({
      set: vi.fn((vals: Record<string, unknown>) => {
        rejectUndefined(vals)
        updatedValues.push(vals)
        return { where: vi.fn().mockResolvedValue(undefined) }
      }),
    })),
    delete: vi.fn(() => ({ where: vi.fn().mockResolvedValue(undefined) })),
    query: { recipes: { findFirst: vi.fn().mockResolvedValue(finalRow) } },
  }
  const db = {
    transaction: vi.fn((cb: (tx: unknown) => Promise<unknown>) => cb(tx)),
    query: { recipes: { findFirst: vi.fn().mockResolvedValue(finalRow) } },
  } as unknown as Parameters<typeof createRecipe>[0] & Parameters<typeof updateRecipe>[1]
  return { db, insertedValues, updatedValues }
}

function valuesFor(
  insertedValues: { table: unknown; vals: Record<string, unknown> }[],
  table: unknown,
) {
  return insertedValues.filter((v) => v.table === table).map((v) => v.vals)
}

const RECIPE_ROW = {
  id: 1,
  name: 'Pasta',
  description: '',
  author: '',
  calories: null,
  servings: 2,
  cookingTime: 10,
  preparationTime: 5,
  imageUrl: null,
  createdAt: new Date('2024-01-01T00:00:00Z'),
  updatedAt: new Date('2024-01-01T00:00:00Z'),
  cuisine: { id: 1, name: 'Italian' },
  ingredients: [],
  tags: [],
  steps: [],
}

const CREATE_RECIPE_INPUT: Parameters<typeof createRecipe>[1] = {
  name: 'Pasta',
  description: '',
  calories: 450,
  servings: 2,
  cookingTime: 10,
  preparationTime: 5,
  cuisine: { name: 'Italian' },
  ingredients: [{ name: 'Spaghetti', unitId: 1, quantity: 200 }],
  steps: [{ stepNumber: 1, description: 'Boil water' }],
  author: '',
}

describe('createRecipe', () => {
  it('inserts null, not undefined, when imageUrl is omitted', async () => {
    const { db, insertedValues } = makeRecipeDb(RECIPE_ROW)
    await createRecipe(db, CREATE_RECIPE_INPUT)
    const [recipeValues] = valuesFor(insertedValues, recipes)
    expect(recipeValues.calories).toBe(CREATE_RECIPE_INPUT.calories)
    expect(recipeValues.imageUrl).toBeNull()
  })

  it('passes explicit calories and imageUrl through unchanged', async () => {
    const { db, insertedValues } = makeRecipeDb(RECIPE_ROW)
    await createRecipe(db, { ...CREATE_RECIPE_INPUT, calories: 450, imageUrl: 'recipes/1.jpg' })
    const [recipeValues] = valuesFor(insertedValues, recipes)
    expect(recipeValues.calories).toBe(450)
    expect(recipeValues.imageUrl).toBe('recipes/1.jpg')
  })

  it('inserts null, not undefined, when ingredient notes and step tip are omitted', async () => {
    const { db, insertedValues } = makeRecipeDb(RECIPE_ROW)
    await createRecipe(db, CREATE_RECIPE_INPUT)
    const [ingredientValues] = valuesFor(insertedValues, recipeIngredients)
    const [stepValues] = valuesFor(insertedValues, recipeInstructionSteps)
    expect(ingredientValues.notes).toBeNull()
    expect(stepValues.tip).toBeNull()
  })

  it('normalizes the recipe name to title case', async () => {
    const { db, insertedValues } = makeRecipeDb(RECIPE_ROW)
    await createRecipe(db, { ...CREATE_RECIPE_INPUT, name: 'creamy TOMATO soup' })
    const [recipeValues] = valuesFor(insertedValues, recipes)
    expect(recipeValues.name).toBe('Creamy Tomato Soup')
  })

  it('inserts empty string, not null, when description is null', async () => {
    const { db, insertedValues } = makeRecipeDb(RECIPE_ROW)
    await createRecipe(db, { ...CREATE_RECIPE_INPUT, description: null })
    const [recipeValues] = valuesFor(insertedValues, recipes)
    expect(recipeValues.description).toBe('')
  })
})

describe('updateRecipe', () => {
  beforeEach(() => {
    vi.mocked(deleteImage).mockReset()
  })

  it('inserts null, not undefined, when ingredient notes and step tip are omitted', async () => {
    const { db, insertedValues } = makeRecipeDb(RECIPE_ROW)
    await updateRecipe(
      db,
      1,
      {
        ingredients: [{ name: 'Spaghetti', unitId: 1, quantity: 200 }],
        steps: [{ stepNumber: 1, description: 'Boil water' }],
      },
      makeBucket(),
      PUBLIC_URL,
    )
    const [ingredientValues] = valuesFor(insertedValues, recipeIngredients)
    const [stepValues] = valuesFor(insertedValues, recipeInstructionSteps)
    expect(ingredientValues.notes).toBeNull()
    expect(stepValues.tip).toBeNull()
  })

  it('normalizes the recipe name to title case when present', async () => {
    const { db, updatedValues } = makeRecipeDb(RECIPE_ROW)
    await updateRecipe(db, 1, { name: 'creamy TOMATO soup' }, makeBucket(), PUBLIC_URL)
    expect(updatedValues[0].name).toBe('Creamy Tomato Soup')
  })

  it('clears description to empty string, not null, when set to null', async () => {
    const { db, updatedValues } = makeRecipeDb(RECIPE_ROW)
    await updateRecipe(db, 1, { description: null }, makeBucket(), PUBLIC_URL)
    expect(updatedValues[0].description).toBe('')
  })

  it('does not delete an image when imageUrl is omitted', async () => {
    const { db } = makeRecipeDb({ ...RECIPE_ROW, imageUrl: 'recipes/old.jpg' })
    await updateRecipe(db, 1, { name: 'New Name' }, makeBucket(), PUBLIC_URL)
    expect(vi.mocked(deleteImage)).not.toHaveBeenCalled()
  })

  it('does not delete the old image when imageUrl is cleared to null', async () => {
    const { db } = makeRecipeDb({ ...RECIPE_ROW, imageUrl: 'recipes/old.jpg' })
    await updateRecipe(db, 1, { imageUrl: null }, makeBucket(), PUBLIC_URL)
    expect(vi.mocked(deleteImage)).not.toHaveBeenCalled()
  })

  it('does not delete anything when there was no previous image', async () => {
    const { db } = makeRecipeDb({ ...RECIPE_ROW, imageUrl: null })
    await updateRecipe(db, 1, { imageUrl: 'recipes/new.jpg' }, makeBucket(), PUBLIC_URL)
    expect(vi.mocked(deleteImage)).not.toHaveBeenCalled()
  })

  it('does not delete the old image when the new imageUrl is unchanged', async () => {
    const { db } = makeRecipeDb({ ...RECIPE_ROW, imageUrl: 'recipes/same.jpg' })
    await updateRecipe(db, 1, { imageUrl: 'recipes/same.jpg' }, makeBucket(), PUBLIC_URL)
    expect(vi.mocked(deleteImage)).not.toHaveBeenCalled()
  })

  it('deletes the old R2 object when imageUrl is replaced with a new key', async () => {
    const { db } = makeRecipeDb({ ...RECIPE_ROW, imageUrl: 'recipes/old.jpg' })
    vi.mocked(deleteImage).mockResolvedValue(undefined)
    const bucket = makeBucket()

    await updateRecipe(db, 1, { imageUrl: 'recipes/new.jpg' }, bucket, PUBLIC_URL)

    expect(vi.mocked(deleteImage)).toHaveBeenCalledWith(bucket, 'recipes/old.jpg')
  })

  it('resolves a legacy full-URL previous imageUrl to a storage key before deleting', async () => {
    const { db } = makeRecipeDb({
      ...RECIPE_ROW,
      imageUrl: `${PUBLIC_URL}/recipes/legacy.jpg`,
    })
    vi.mocked(deleteImage).mockResolvedValue(undefined)

    await updateRecipe(db, 1, { imageUrl: 'recipes/new.jpg' }, makeBucket(), PUBLIC_URL)

    expect(vi.mocked(deleteImage)).toHaveBeenCalledWith(expect.anything(), 'recipes/legacy.jpg')
  })

  it('does not delete the old image when the DB update fails', async () => {
    const { db } = makeRecipeDb({ ...RECIPE_ROW, imageUrl: 'recipes/old.jpg' })
    vi.mocked(db.transaction).mockRejectedValueOnce(new Error('db error'))

    await expect(
      updateRecipe(db, 1, { imageUrl: 'recipes/new.jpg' }, makeBucket(), PUBLIC_URL),
    ).rejects.toThrow('db error')

    expect(vi.mocked(deleteImage)).not.toHaveBeenCalled()
  })

  it('retries a failed old-image delete and gives up after 3 attempts without failing the update', async () => {
    vi.useFakeTimers()
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { db } = makeRecipeDb({ ...RECIPE_ROW, imageUrl: 'recipes/old.jpg' })
    vi.mocked(deleteImage).mockRejectedValue(new Error('R2 unavailable'))

    const promise = updateRecipe(db, 1, { imageUrl: 'recipes/new.jpg' }, makeBucket(), PUBLIC_URL)
    await vi.runAllTimersAsync()
    await expect(promise).resolves.toBeDefined()

    expect(vi.mocked(deleteImage)).toHaveBeenCalledTimes(3)
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('"imageKey":"recipes/old.jpg"'))

    errorSpy.mockRestore()
    vi.useRealTimers()
  })
})

const PUBLIC_URL = 'https://pub-test.r2.dev'

function makeBucket() {
  return {} as unknown as R2Bucket
}

function makeDeleteDb(row: { id: number; imageUrl: string | null } | undefined) {
  return {
    delete: vi.fn(() => ({
      where: vi.fn(() => ({
        returning: vi.fn().mockResolvedValue(row ? [row] : []),
      })),
    })),
  } as unknown as Parameters<typeof deleteRecipe>[0]
}

describe('deleteRecipe', () => {
  beforeEach(() => {
    vi.mocked(deleteImage).mockReset()
  })

  it('throws NotFoundError when no row is deleted', async () => {
    const db = makeDeleteDb(undefined)

    await expect(deleteRecipe(db, 999, makeBucket(), PUBLIC_URL)).rejects.toThrow(
      new NotFoundError('Recipe not found with id: 999'),
    )
    expect(vi.mocked(deleteImage)).not.toHaveBeenCalled()
  })

  it('skips image deletion when the recipe has no imageUrl', async () => {
    const db = makeDeleteDb({ id: 1, imageUrl: null })

    await deleteRecipe(db, 1, makeBucket(), PUBLIC_URL)

    expect(vi.mocked(deleteImage)).not.toHaveBeenCalled()
  })

  it('deletes the R2 object using the stored key', async () => {
    const db = makeDeleteDb({ id: 1, imageUrl: 'recipes/abc-123.jpg' })
    vi.mocked(deleteImage).mockResolvedValue(undefined)
    const bucket = makeBucket()

    await deleteRecipe(db, 1, bucket, PUBLIC_URL)

    expect(vi.mocked(deleteImage)).toHaveBeenCalledWith(bucket, 'recipes/abc-123.jpg')
  })

  it('resolves a legacy full-URL imageUrl to a storage key before deleting', async () => {
    const db = makeDeleteDb({ id: 1, imageUrl: `${PUBLIC_URL}/recipes/legacy.jpg` })
    vi.mocked(deleteImage).mockResolvedValue(undefined)

    await deleteRecipe(db, 1, makeBucket(), PUBLIC_URL)

    expect(vi.mocked(deleteImage)).toHaveBeenCalledWith(expect.anything(), 'recipes/legacy.jpg')
  })

  it('retries a failed R2 delete and succeeds without throwing', async () => {
    vi.useFakeTimers()
    const db = makeDeleteDb({ id: 1, imageUrl: 'recipes/abc-123.jpg' })
    vi.mocked(deleteImage)
      .mockRejectedValueOnce(new Error('R2 unavailable'))
      .mockRejectedValueOnce(new Error('R2 unavailable'))
      .mockResolvedValueOnce(undefined)

    const promise = deleteRecipe(db, 1, makeBucket(), PUBLIC_URL)
    await vi.runAllTimersAsync()
    await promise

    expect(vi.mocked(deleteImage)).toHaveBeenCalledTimes(3)
    vi.useRealTimers()
  })

  it('gives up after 3 attempts, logs the orphaned key, and does not fail the delete', async () => {
    vi.useFakeTimers()
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const db = makeDeleteDb({ id: 1, imageUrl: 'recipes/abc-123.jpg' })
    vi.mocked(deleteImage).mockRejectedValue(new Error('R2 unavailable'))

    const promise = deleteRecipe(db, 1, makeBucket(), PUBLIC_URL)
    await vi.runAllTimersAsync()
    await expect(promise).resolves.toBeUndefined()

    expect(vi.mocked(deleteImage)).toHaveBeenCalledTimes(3)
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('"recipeId":1'))
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('"imageKey":"recipes/abc-123.jpg"'),
    )

    errorSpy.mockRestore()
    vi.useRealTimers()
  })
})
