import { bigserial, pgSchema, varchar } from 'drizzle-orm/pg-core'

const recipeservice = pgSchema('recipeservice')

export const tags = recipeservice.table('tags', {
  id: bigserial('tag_id', { mode: 'number' }).primaryKey(),
  name: varchar('tag_name', { length: 100 }).notNull().unique(),
})

export type Tag = typeof tags.$inferSelect
