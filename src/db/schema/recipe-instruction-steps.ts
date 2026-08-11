import { bigint, bigserial, pgSchema, smallint, text, unique, varchar } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { recipes } from './recipes'

const recipeservice = pgSchema('recipeservice')

export const recipeInstructionSteps = recipeservice.table(
  'recipe_instruction_steps',
  {
    id: bigserial('step_id', { mode: 'number' }).primaryKey(),
    recipeId: bigint('recipe_id', { mode: 'number' }).notNull().references(() => recipes.id, { onDelete: 'cascade' }),
    stepNumber: smallint('step_number').notNull(),
    description: text('description').notNull(),
    imageUrl: varchar('image_url', { length: 255 }),
    tip: text('tip'),
  },
  (t) => [unique().on(t.recipeId, t.stepNumber)],
)

export const recipeInstructionStepsRelations = relations(recipeInstructionSteps, ({ one }) => ({
  recipe: one(recipes, {
    fields: [recipeInstructionSteps.recipeId],
    references: [recipes.id],
  }),
}))

export type RecipeInstructionStep = typeof recipeInstructionSteps.$inferSelect
export type NewRecipeInstructionStep = typeof recipeInstructionSteps.$inferInsert
