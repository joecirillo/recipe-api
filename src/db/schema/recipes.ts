import { bigserial, pgSchema, smallint, text, timestamp, varchar } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { cuisines } from './cuisines'
import { recipeIngredients } from './recipe-ingredients'
import { recipeTags } from './recipe-tags'
import { recipeInstructionSteps } from './recipe-instruction-steps'

const recipeservice = pgSchema('recipeservice')

export const recipes = recipeservice.table('recipes', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  name: varchar('recipe_name', { length: 255 }).notNull(),
  description: text('description').notNull(),
  cuisineId: smallint('cuisine_id').notNull().references(() => cuisines.id),
  author: varchar('author', { length: 255 }).notNull(),
  // Nullable intentionally: DB column is nullable despite Java entity using a primitive short.
  // The issue spec and actual DB state take precedence over the Java source here.
  calories: smallint('calories'),
  servings: smallint('servings').notNull(),
  cookingTime: smallint('cooking_time').notNull(),
  preparationTime: smallint('preparation_time').notNull(),
  imageUrl: varchar('image_url', { length: 255 }),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull(),
})

export const recipesRelations = relations(recipes, ({ one, many }) => ({
  cuisine: one(cuisines, {
    fields: [recipes.cuisineId],
    references: [cuisines.id],
  }),
  ingredients: many(recipeIngredients),
  tags: many(recipeTags),
  steps: many(recipeInstructionSteps),
}))

export type Recipe = typeof recipes.$inferSelect
export type NewRecipe = typeof recipes.$inferInsert
