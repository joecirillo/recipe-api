import { bigint, bigserial, numeric, pgSchema, unique, varchar } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { recipes } from './recipes'
import { ingredients } from './ingredients'
import { units } from './units'

const recipeservice = pgSchema('recipeservice')

export const recipeIngredients = recipeservice.table(
  'recipe_ingredients',
  {
    id: bigserial('recipe_ingredient_id', { mode: 'number' }).primaryKey(),
    recipeId: bigint('recipe_id', { mode: 'number' }).notNull().references(() => recipes.id, { onDelete: 'cascade' }),
    ingredientId: bigint('ingredient_id', { mode: 'number' }).notNull().references(() => ingredients.id),
    unitId: bigint('unit_id', { mode: 'number' }).notNull().references(() => units.id),
    quantity: numeric('quantity', { precision: 8, scale: 2 }).notNull(),
    notes: varchar('notes', { length: 255 }),
  },
  (t) => [unique().on(t.recipeId, t.ingredientId, t.unitId)],
)

export const recipeIngredientsRelations = relations(recipeIngredients, ({ one }) => ({
  recipe: one(recipes, {
    fields: [recipeIngredients.recipeId],
    references: [recipes.id],
  }),
  ingredient: one(ingredients, {
    fields: [recipeIngredients.ingredientId],
    references: [ingredients.id],
  }),
  unit: one(units, {
    fields: [recipeIngredients.unitId],
    references: [units.id],
  }),
}))

export type RecipeIngredient = typeof recipeIngredients.$inferSelect
export type NewRecipeIngredient = typeof recipeIngredients.$inferInsert
