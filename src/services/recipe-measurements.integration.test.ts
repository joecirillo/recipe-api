import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { generateDrizzleJson, generateMigration } from 'drizzle-kit/api'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from '../db/schema'
import { createRecipe, getRecipe, updateRecipe } from './recipe-service'

const postgresUrl = process.env.RECIPE_TEST_POSTGRES_URL

describe.skipIf(!postgresUrl)('ingredient measurement database round trips', () => {
  const databaseName = `recipe_measurements_${randomUUID().replaceAll('-', '')}`
  let admin: ReturnType<typeof postgres>
  let client: ReturnType<typeof postgres>
  let db: ReturnType<typeof drizzle<typeof schema>>
  let unitId: number
  let measuredRecipeId: number

  beforeAll(async () => {
    const url = new URL(postgresUrl!)
    if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) {
      throw new Error('RECIPE_TEST_POSTGRES_URL must point to a local disposable PostgreSQL server')
    }
    admin = postgres(url.toString(), { max: 1 })
    await admin.unsafe(`CREATE DATABASE "${databaseName}"`)
    url.pathname = `/${databaseName}`
    client = postgres(url.toString(), { max: 1 })
    db = drizzle(client, { schema })
    await client`CREATE SCHEMA recipeservice`
    const statements = await generateMigration(
      generateDrizzleJson({}),
      generateDrizzleJson(schema, undefined, ['recipeservice']),
    )
    for (const statement of statements) await client.unsafe(statement)
    await client`ALTER TABLE recipeservice.recipe_ingredients ALTER COLUMN quantity SET NOT NULL, ALTER COLUMN unit_id SET NOT NULL`
    const [unit] = await db
      .insert(schema.units)
      .values({ name: 'Gram', abbreviation: 'g' })
      .returning()
    unitId = unit.id
    const recipe = await createRecipe(db, recipeInput(200, unitId))
    measuredRecipeId = recipe.id
    const migration = await readFile(
      new URL('../../migrations/0084-nullable-ingredient-measurements.sql', import.meta.url),
      'utf8',
    )
    await client.unsafe(migration)
    await client.unsafe(migration)
  }, 30_000)

  afterAll(async () => {
    if (client) await client.end()
    if (admin) {
      await admin.unsafe(`DROP DATABASE IF EXISTS "${databaseName}"`)
      await admin.end()
    }
  })

  const recipeInput = (quantity: number | null, measurementUnitId: number | null) => ({
    name: 'Measurement test',
    calories: 100,
    servings: 1,
    cookingTime: 0,
    preparationTime: 1,
    cuisine: { name: 'Test Cuisine' },
    author: '',
    ingredients: [{ name: 'Salt', quantity, unitId: measurementUnitId }],
    steps: [{ stepNumber: 1, description: 'Mix' }],
  })

  it('preserves existing measured ingredients when the migration is applied twice', async () => {
    const recipe = await getRecipe(db, measuredRecipeId)
    expect(recipe.ingredients).toMatchObject([
      { quantity: 200, unitId, unitName: 'Gram', abbreviation: 'g' },
    ])
    const columns =
      await client`SELECT column_name, is_nullable FROM information_schema.columns WHERE table_schema = 'recipeservice' AND table_name = 'recipe_ingredients' AND column_name IN ('quantity', 'unit_id') ORDER BY column_name`
    expect([...columns]).toEqual([
      { column_name: 'quantity', is_nullable: 'YES' },
      { column_name: 'unit_id', is_nullable: 'YES' },
    ])
  })

  it.each([
    { quantity: null, hasUnit: true },
    { quantity: 125.5, hasUnit: false },
    { quantity: null, hasUnit: false },
    { quantity: 125.5, hasUnit: true },
  ])(
    'round-trips quantity $quantity with unit $hasUnit through create, update, and read',
    async ({ quantity, hasUnit }) => {
      const measurementUnitId = hasUnit ? unitId : null
      const input = recipeInput(quantity, measurementUnitId)
      const expected = {
        quantity,
        unitId: measurementUnitId,
        unitName: hasUnit ? 'Gram' : null,
        abbreviation: hasUnit ? 'g' : null,
      }
      const created = await createRecipe(db, input)
      expect(created.ingredients).toMatchObject([expected])
      expect((await getRecipe(db, created.id)).ingredients).toEqual(created.ingredients)

      const bucket = {} as R2Bucket
      await updateRecipe(
        db,
        created.id,
        { ingredients: recipeInput(200, unitId).ingredients },
        bucket,
        '',
      )
      const updated = await updateRecipe(
        db,
        created.id,
        { ingredients: input.ingredients },
        bucket,
        '',
      )
      expect(updated.ingredients).toMatchObject([expected])
      expect((await getRecipe(db, created.id)).ingredients).toEqual(updated.ingredients)
      await updateRecipe(db, created.id, { name: 'Renamed recipe' }, bucket, '')
      expect((await getRecipe(db, created.id)).ingredients).toEqual(updated.ingredients)
    },
  )

  it('preserves separate uses of the same ingredient when both units are null', async () => {
    const base = recipeInput(null, null)
    const input = {
      ...base,
      ingredients: [
        { ...base.ingredients[0], notes: 'for pasta water' },
        { ...base.ingredients[0], notes: 'to taste' },
      ],
    }
    const created = await createRecipe(db, input)
    const read = await getRecipe(db, created.id)
    expect(read.ingredients).toHaveLength(2)
    expect(read.ingredients).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'Salt',
          quantity: null,
          unitId: null,
          notes: 'for pasta water',
        }),
        expect.objectContaining({ name: 'Salt', quantity: null, unitId: null, notes: 'to taste' }),
      ]),
    )
    const updated = await updateRecipe(
      db,
      created.id,
      { ingredients: input.ingredients },
      {} as R2Bucket,
      '',
    )
    expect(updated.ingredients).toHaveLength(2)
    expect(updated.ingredients).toEqual(expect.arrayContaining(read.ingredients))
  })

  it('still rejects duplicate ingredients with the same non-null unit and rolls back', async () => {
    const before = await getRecipe(db, measuredRecipeId)
    const [ingredient] = recipeInput(200, unitId).ingredients
    await expect(
      updateRecipe(
        db,
        measuredRecipeId,
        {
          ingredients: [ingredient, ingredient],
        },
        {} as R2Bucket,
        '',
      ),
    ).rejects.toThrow()
    expect((await getRecipe(db, measuredRecipeId)).ingredients).toEqual(before.ingredients)
  })

  it('rolls back a replacement with an unknown unit and preserves existing measurements', async () => {
    const before = await getRecipe(db, measuredRecipeId)
    await expect(
      updateRecipe(
        db,
        measuredRecipeId,
        {
          ingredients: recipeInput(null, 999999).ingredients,
        },
        {} as R2Bucket,
        '',
      ),
    ).rejects.toThrow('Unit ID not found: 999999')
    expect((await getRecipe(db, measuredRecipeId)).ingredients).toEqual(before.ingredients)
  })
})
