import { bigserial, pgSchema, varchar } from 'drizzle-orm/pg-core'

const recipeservice = pgSchema('recipeservice')

export const ingredients = recipeservice.table('ingredients', {
  id: bigserial('ingredient_id', { mode: 'number' }).primaryKey(),
  // ingredient_name is never updated after creation (mirrors updatable=false in the Java entity)
  name: varchar('ingredient_name', { length: 255 }).notNull().unique(),
})

export type Ingredient = typeof ingredients.$inferSelect
