import { pgSchema, smallserial, varchar } from 'drizzle-orm/pg-core'

const recipeservice = pgSchema('recipeservice')

export const cuisines = recipeservice.table('cuisines', {
  id: smallserial('cuisine_id').primaryKey(),
  name: varchar('cuisine', { length: 100 }).notNull().unique(),
})

export type Cuisine = typeof cuisines.$inferSelect
