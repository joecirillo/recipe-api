import { bigserial, pgSchema, varchar } from 'drizzle-orm/pg-core'

const recipeservice = pgSchema('recipeservice')

export const units = recipeservice.table('units', {
  id: bigserial('unit_id', { mode: 'number' }).primaryKey(),
  name: varchar('unit_name', { length: 50 }).notNull().unique(),
  abbreviation: varchar('abbreviation', { length: 10 }),
})

export type Unit = typeof units.$inferSelect
